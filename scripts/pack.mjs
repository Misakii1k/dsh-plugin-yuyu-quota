/**
 * 打包脚本：构建 → 产出 tgz → 打印体积与 sha256。
 *
 * 与 `npm pack` 的区别：这里显式校验产物里必须包含 lib/client.js 与
 * lib/index.js，避免「前端忘记同步」或「files 字段漏配」导致装上去的插件
 * 缺文件。校验不过直接退出非零。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const tgzName = `dsh-plugin-yuyu-quota-${version}.tgz`;

function run(command, args) {
  return execFileSync(command, args, { cwd: root, encoding: 'utf8' });
}

console.log('[pack] 1/4 构建');
execFileSync(process.execPath, [path.join(root, 'scripts', 'build.mjs')], { cwd: root, stdio: 'inherit' });

console.log('[pack] 2/4 校验必需产物');
const required = ['lib/index.js', 'lib/index.d.ts', 'lib/client.js', 'cordis.patch.yml', 'package.json'];
for (const rel of required) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    console.error(`[pack] 缺少必需文件: ${rel}`);
    process.exit(1);
  }
}
// 前端同步校验：源与产物必须逐字节一致
const srcClient = fs.readFileSync(path.join(root, 'src', 'client.js'), 'utf8');
const libClient = fs.readFileSync(path.join(root, 'lib', 'client.js'), 'utf8');
if (srcClient !== libClient) {
  console.error('[pack] src/client.js 与 lib/client.js 不一致，请先运行 npm run build');
  process.exit(1);
}

console.log('[pack] 3/4 生成 tgz');
// Windows 上 npm 是可执行批处理（npm.cmd），Node 不能直接 spawn，
// 必须走 shell；Unix 下直接调用即可。
if (process.platform === 'win32') {
  execFileSync('npm pack --silent', { cwd: root, stdio: 'inherit', shell: true });
} else {
  execFileSync('npm', ['pack', '--silent'], { cwd: root, stdio: 'inherit' });
}

const tgzPath = path.join(root, tgzName);
if (!fs.existsSync(tgzPath)) {
  console.error(`[pack] 未生成 ${tgzName}`);
  process.exit(1);
}

console.log('[pack] 4/4 汇总');
const buffer = fs.readFileSync(tgzPath);
const sha256 = createHash('sha256').update(buffer).digest('hex');
console.log(`  文件: ${tgzName}`);
console.log(`  体积: ${buffer.length} 字节`);
console.log(`  sha256: ${sha256}`);
