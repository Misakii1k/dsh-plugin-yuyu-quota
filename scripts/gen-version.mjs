/**
 * 生成 public/version.json（供 Cloudflare 静态兜底使用）。
 *
 * 首选数据源是 Functions 的 `/version.json`（它每次实时问 GitHub，
 * 永远不会与附件漂移）。这个静态文件只是「Functions 不可用时的后备」，
 * 因此脚本只写它能**确证**的字段：安装包体积与 sha256 都从实际 tgz 读取，
 * 读不到就省略，绝不编造数字。
 *
 * 用法：
 *   node scripts/gen-version.mjs              # 用 package.json 版本 + 现状 tgz
 *   node scripts/gen-version.mjs --release    # 发版时额外要求 tgz 必须存在
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireTgz = process.argv.includes('--release');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '').trim();
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`[gen-version] package.json 版本号非法: ${JSON.stringify(pkg.version)}`);
  process.exit(1);
}

const tgzName = `dsh-plugin-yuyu-quota-${version}.tgz`;
const tgzPath = path.join(root, tgzName);

if (!fs.existsSync(tgzPath)) {
  const message = `[gen-version] 未找到安装包 ${tgzName}`;
  if (requireTgz) {
    console.error(message + '（--release 要求先打包）');
    process.exit(1);
  }
  console.warn(message + '，将只写入版本号与下载地址');
}

const manifest = {
  version,
  releaseDate: new Date().toISOString().slice(0, 10),
  downloadUrl: `/api/download?tag=v${version}`
};

if (fs.existsSync(tgzPath)) {
  const buffer = fs.readFileSync(tgzPath);
  manifest.fileSize = buffer.length;
  manifest.sha256 = createHash('sha256').update(buffer).digest('hex');
}

// 发布说明：优先取 docs/releases/<version>.md
const notesPath = path.join(root, 'docs', 'releases', `${version}.md`);
if (fs.existsSync(notesPath)) {
  const notes = fs.readFileSync(notesPath, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim()
    .slice(0, 1500);
  if (notes) manifest.releaseNotes = notes;
}

const outDir = path.join(root, 'public');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'version.json');
fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log(`[gen-version] 已写入 ${path.relative(root, outFile)}`);
console.log(JSON.stringify(manifest, null, 2));
