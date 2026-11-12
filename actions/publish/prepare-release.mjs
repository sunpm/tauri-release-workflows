import { createHash } from 'node:crypto'
import { createReadStream, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const tag = process.env.RELEASE_TAG
const repository = process.env.GH_REPO
const dist = process.env.DIST_DIRECTORY
const expectedPlatforms = JSON.parse(process.env.RELEASE_PLATFORMS)
const notes = readFileSync(join(dist, 'release-changes.md'), 'utf8').trim()
if (!notes) throw new Error('缺少当前版本更新说明。')
const introductionPath = process.env.RELEASE_INTRODUCTION_PATH
const introduction = introductionPath ? readFileSync(introductionPath, 'utf8').trim() : ''

function readManifest(platform) {
  const entry = JSON.parse(readFileSync(join(dist, `release-assets-${platform}.json`), 'utf8'))
  if (!entry || entry.platform !== platform || entry.version !== tag.slice(1) || typeof entry.update !== 'string'
    || !Array.isArray(entry.assets) || !entry.assets.every(asset => typeof asset === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(asset))
    || !entry.assets.includes(entry.update) || !entry.assets.includes(`${entry.update}.sig`)) {
    throw new Error(`${platform} 的版本、附件或更新签名清单无效。`)
  }
  for (const asset of entry.assets) {
    const file = statSync(join(dist, asset))
    if (!file.isFile() || file.size === 0) throw new Error(`${platform} 的附件 ${asset} 为空或不是文件。`)
  }
  return entry
}

const platforms = {}
const assets = []
for (const platform of expectedPlatforms) {
  const entry = readManifest(platform)
  const signature = readFileSync(join(dist, `${entry.update}.sig`), 'utf8').trim()
  if (!signature) throw new Error(`${platform} 的签名为空。`)
  platforms[platform] = { url: `https://github.com/${repository}/releases/download/${tag}/${entry.update}`, signature }
  assets.push(...entry.assets)
}
if (new Set(assets).size !== assets.length) throw new Error('不同平台的发布附件不能重名。')
writeFileSync(join(dist, 'latest.json'), JSON.stringify({ version: tag.slice(1), notes, pub_date: new Date().toISOString(), platforms }, null, 2) + '\n')
assets.push('latest.json')
const sums = []
for (const asset of assets.sort()) {
  const hash = createHash('sha256')
  for await (const data of createReadStream(join(dist, asset))) hash.update(data)
  sums.push(`${hash.digest('hex')}  ${asset}`)
}
writeFileSync(join(dist, 'SHA256SUMS.txt'), sums.join('\n') + '\n')
writeFileSync(join(dist, 'release-notes.md'), [introduction, notes].filter(Boolean).join('\n\n') + '\n')
writeFileSync(join(dist, 'release-files.txt'), [...assets, 'SHA256SUMS.txt'].map(asset => join(dist, asset)).join('\n') + '\n')
console.log(`已准备 ${assets.length} 个发布附件及 SHA256SUMS.txt。`)
