/**
 * 统一构建脚本：编译 TypeScript，并把 src/client.js 同步到 lib/client.js。
 *
 * 为什么需要它：`src/client.js` 是纯 JS（不走 tsc），历史上靠手工复制到
 * `lib/client.js`，一旦忘记复制，打包出来的插件就会带着旧前端 —— 这类漂移
 * 很难在测试里发现。现在 `npm run build` 一条命令保证两者一致。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function log(message) {
  console.log(`[build] ${message}`);
}

// 1) TypeScript → lib/
log('编译 TypeScript (tsc)...');
try {
  execFileSync(process.execPath, [path.join(root, 'node_modules', 'typescript', 'bin', 'tsc')], {
    cwd: root,
    stdio: 'inherit'
  });
} catch (err) {
  console.error('[build] tsc 失败');
  process.exit(1);
}

// 2) src/client.js → lib/client.js
const clientSrc = path.join(root, 'src', 'client.js');
const clientLib = path.join(root, 'lib', 'client.js');
if (!fs.existsSync(clientSrc)) {
  console.error('[build] 找不到 src/client.js');
  process.exit(1);
}
const before = fs.existsSync(clientLib) ? fs.readFileSync(clientLib, 'utf8') : '';
const after = fs.readFileSync(clientSrc, 'utf8');
if (before === after) {
  log('lib/client.js 已是最新');
} else {
  fs.mkdirSync(path.dirname(clientLib), { recursive: true });
  fs.writeFileSync(clientLib, after, 'utf8');
  log('已同步 src/client.js → lib/client.js');
}

// 3) 语法自检：确保浏览器端脚本没有语法错误（Node 只做解析，不执行 DOM 逻辑）
try {
  execFileSync(process.execPath, ['--check', clientLib], { stdio: 'inherit' });
  log('lib/client.js 语法检查通过');
} catch {
  console.error('[build] lib/client.js 语法检查失败');
  process.exit(1);
}

log('完成');
