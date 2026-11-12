import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const supported = new Map([
  ['aarch64-apple-darwin', { runner: 'macos-15', platform: 'darwin-aarch64' }],
  ['x86_64-apple-darwin', { runner: 'macos-15-intel', platform: 'darwin-x86_64' }],
  ['x86_64-pc-windows-msvc', { runner: 'windows-latest', platform: 'windows-x86_64' }],
])
const targets = JSON.parse(process.env.RELEASE_TARGETS)
if (!Array.isArray(targets) || targets.length === 0 || targets.some(target => !supported.has(target)) || new Set(targets).size !== targets.length) {
  throw new Error('targets 必须是非空、不重复的受支持 Rust target 数组。')
}
const matrix = targets.map(target => ({ target, ...supported.get(target) }))
const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
const pnpmVersion = manifest.engines?.pnpm
if (typeof pnpmVersion !== 'string' || !pnpmVersion.trim() || /[\r\n]/.test(pnpmVersion)) throw new Error('package.json 必须配置 engines.pnpm。')

if (process.env.RELEASE_PUBLISH === 'true') {
  const tag = process.env.RELEASE_TAG
  if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-(beta|rc)\.(0|[1-9]\d*))?$/.test(tag ?? '') || tag !== `v${manifest.version}`) {
    throw new Error('发布必须来自与 package.json 版本一致的 vX.Y.Z[-beta.N|-rc.N] 标签。')
  }
  const changelog = readFileSync(process.env.CHANGELOG_PATH, 'utf8')
  const sections = [...changelog.matchAll(/^## \[([^\]]+)\]\([^\n]+\).*$/gm)]
  const index = sections.findIndex(section => section[1] === manifest.version)
  if (index === -1) throw new Error(`CHANGELOG 缺少 ${manifest.version} 的变更说明。`)
  const section = sections[index]
  const notes = changelog.slice(section.index + section[0].length, sections[index + 1]?.index).trim()
  if (!notes) throw new Error(`${manifest.version} 的变更说明不能为空。`)
  mkdirSync('work', { recursive: true })
  writeFileSync('work/release-changes.md', notes + '\n')
  console.log(`已提取 ${manifest.version} 的变更说明。`)
}

appendFileSync(process.env.GITHUB_OUTPUT, [
  `matrix=${JSON.stringify({ include: matrix })}`,
  `platforms=${JSON.stringify(matrix.map(entry => entry.platform))}`,
  `pnpm-version=${pnpmVersion}`,
  '',
].join('\n'))
