# Tauri Release Workflows

供 Tauri 2 桌面项目复用的 GitHub Actions 发布流程，由 [Codex Quota](https://github.com/sunpm/codex-quota) 抽出。使用 Node.js 标准库和 GitHub CLI，没有额外 JavaScript 依赖。

各应用保留源码、版本号、CHANGELOG、构建脚本、签名密钥和 GitHub Releases。本仓库维护平台编排、说明提取、完整更新清单与 Release 发布。

## 支持范围

- GitHub.com 托管 runner，Node.js 22、pnpm、Rust stable、Tauri 2。
- 项目位于仓库根目录；`package.json` 提供 `version` 和 `engines.pnpm`，提交 `pnpm-lock.yaml`。
- macOS Apple Silicon、macOS Intel、Windows x64，可选择其中部分平台。
- 标签格式为 `vX.Y.Z`、`vX.Y.Z-beta.N` 或 `vX.Y.Z-rc.N`。
- 本地版本准备命令由各项目维护；不处理 Linux、移动端、npm 包或 Web 部署。

通过 GitHub 的 [`$/` 同仓库引用](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsuses)，辅助 action 与工作流固定在同一提交。要求 runner 2.336.0+，不支持 GitHub Enterprise Server。

## 接入

在应用仓库添加 `.github/workflows/release.yml`，将 `FULL_COMMIT_SHA` 替换为本仓库经过审查的完整提交 SHA：

```yaml
name: Release

on:
  workflow_dispatch:
  push:
    tags: ['v[0-9]*.[0-9]*.[0-9]*']

permissions:
  contents: read

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

jobs:
  release:
    permissions:
      contents: write
    uses: sunpm/tauri-release-workflows/.github/workflows/tauri-release.yml@FULL_COMMIT_SHA
    with:
      publish: ${{ github.event_name == 'push' }}
      build-command: 'node scripts/build.mjs --target "$TAURI_BUILD_TARGET"'
      artifact-paths: |
        dist/MyApp-*
        dist/release-assets-*.json
      release-introduction-path: docs/release-notes.md
      updater-public-key: ${{ vars.TAURI_UPDATER_PUBLIC_KEY }}
    secrets:
      TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
```

应用仓库配置公钥 variable、签名私钥 secret 和可选密码 secret。各应用使用自己的密钥；共享仓库不保存应用密钥。`GITHUB_TOKEN` 用于调用方仓库，无需跨仓库写入 token。

只有发布 job 使用 `contents: write`，准备和构建 job 均为只读。调用方必须允许所调用流程的最大权限，因此示例在调用 job 声明写权限。

## 输入

| 输入 | 默认值 / 作用 |
| --- | --- |
| `publish` | `false`；只构建 artifacts，不注入签名密钥，不创建 Release |
| `targets` | 下表三平台 Rust target 的 JSON 数组 |
| `build-command` | `node scripts/build.mjs --target "$TAURI_BUILD_TARGET"`，在项目根目录的 Bash 中执行 |
| `artifact-paths` | `dist/*`；包含平台清单及其全部附件，建议像示例一样收窄，避免上传本地 `.app` 副本 |
| `dist-directory` | `dist`；发布 job 下载 artifacts 的目录，不改变项目构建脚本的输出目录 |
| `changelog-path` | `CHANGELOG.md` |
| `release-introduction-path` | 空；可选的 Release 固定安装提示，不写进 `latest.json` |
| `updater-public-key` | 空；发布时必须传入应用公钥 |

| Rust target | Runner | Updater 平台键 |
| --- | --- | --- |
| `aarch64-apple-darwin` | `macos-15` | `darwin-aarch64` |
| `x86_64-apple-darwin` | `macos-15-intel` | `darwin-x86_64` |
| `x86_64-pc-windows-msvc` | `windows-latest` | `windows-x86_64` |

例如只构建 Mac：`targets: '["aarch64-apple-darwin","x86_64-apple-darwin"]'`。target 不能重复或为空。

## 项目构建契约

流程安装锁定的 pnpm 依赖和对应 Rust target，再调用项目构建命令。命令负责调用项目锁定的 Tauri CLI，并完成产品配置、许可证收集、平台签名或公证、产物命名等项目工作。流程不预先重复执行前端或 Rust 构建。

| 环境变量 | 内容 |
| --- | --- |
| `TAURI_BUILD_TARGET` | 当前 Rust target |
| `RELEASE_TAG` | 发布时的版本标签；只打包时为空 |
| `RELEASE_NOTES_FILE` | 发布时提取的 Markdown 说明的绝对路径；只打包时为空 |
| `TAURI_UPDATER_PUBLIC_KEY` | 发布时的应用公钥；只打包时为空 |
| `TAURI_SIGNING_PRIVATE_KEY` | 仅发布构建步骤获得的私钥 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 仅发布构建步骤获得的可选私钥密码 |

项目校验自己的 package/Cargo/Tauri 版本一致；使用公钥构建应用，由 Tauri CLI 生成更新包及 `.sig`。无签名的手动打包也必须成功。附件放在同一层目录，每个平台输出 `release-assets-<平台键>.json`：

```json
{
  "version": "1.2.3",
  "platform": "darwin-aarch64",
  "assets": [
    "MyApp-macOS-AppleSilicon.dmg",
    "MyApp-macOS-AppleSilicon.app.tar.gz",
    "MyApp-macOS-AppleSilicon.app.tar.gz.sig"
  ],
  "update": "MyApp-macOS-AppleSilicon.app.tar.gz"
}
```

`assets` 是实际发布的文件名，首字符为英文字母或数字，其余可用字母、数字、点、下划线和连字符，不能包含路径；各平台文件名必须唯一。签名发布必须包含 `update` 和 `${update}.sig`，文件不能缺失或为空。无签名打包可省略 `update`。内部清单不上传到 GitHub Release。

CHANGELOG 使用 `## [1.2.3](版本链接)` 二级标题。发布标签必须与 `package.json` 版本相同，并有非空版本段落。该段落保存为唯一的 `release-changes` artifact，供各平台构建和 `latest.json` 共用；不会在 CI 再次生成说明。

## 发布行为

1. 准备平台矩阵；发布时校验标签并提取 CHANGELOG。
2. 并行构建所选平台，保存 `release-<target>` artifacts，保留 7 天。
3. 全部构建成功且 `publish: true` 时，核对所有预期平台的清单、版本和签名附件。
4. 生成包含固定标签下载链接的 `latest.json`、`SHA256SUMS.txt` 和 Release 正文。
5. 将附件上传到 draft Release，成功后才公开；预发布设置 `latest=false`。

调用方沿用 `https://github.com/<owner>/<app>/releases/latest/download/latest.json` 作为更新源。一次 workflow run 仅调用本流程一次，避免 artifact 同名。中断留下的 draft 由维护者检查处理后再重试，不自动删除或覆盖已有 Release、不重写标签。

## 维护与验证

各应用通过更新完整 SHA 显式升级。辅助 action 是内部实现，不是独立公共接口。首次接入先执行调用方的 `workflow_dispatch` 检查各平台产物，再按应用已有授权流程发版；无签名打包通过不代表验签或真实升级已验收。

语法检查使用 Node.js 和 Ruby：

```sh
node --check actions/prepare/prepare.mjs
node --check actions/publish/prepare-release.mjs
ruby -ryaml -e 'ARGV.each { |path| YAML.parse_file(path); puts path }' .github/workflows/tauri-release.yml actions/prepare/action.yml actions/publish/action.yml
```

保留集中汇总的依据：[tauri-action 并行修改 latest.json 的问题](https://github.com/tauri-apps/tauri-action/issues/1270)。沿用原项目实现，未复制上游代码或增加重试机制。工作流复用见 [GitHub 官方文档](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows)。

## 许可

MIT，见 [LICENSE](LICENSE)。
