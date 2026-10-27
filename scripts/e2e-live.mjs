/**
 * 端到端实测：直接以「独立进程」启动插件的 HTTP 服务，模拟前端真实调用。
 *
 * 验证链路：
 * 1. bridge 服务能起来
 * 2. /snapshot 能从（当前机器的）浏览器凭据拿到真实余额
 * 3. 凭据健康度字段正确（可自动续期 / 剩余时长）
 * 4. 非白名单 Origin 被 403 拒绝，白名单 Origin 正常
 * 5. /assets/ 目录穿越与空文件名不会打崩服务（进程存活）
 *
 * 运行：node scripts/e2e-live.mjs
 * 说明：会用本机已登录的凭据访问线上接口，跑完即退出，不写任何文件。
 */
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import { createYuyuService } from '../lib/index.js';

const pkgVersion = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) { passed += 1; console.log(`  ok   ${name}`); }
  else { failed += 1; console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`); }
}

function request(port, path, options = {}) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port, path, method: options.method || 'GET', headers: options.headers || {} },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8')
        }));
      }
    );
    req.on('error', (err) => resolve({ status: 0, error: err.message }));
    if (options.body) req.write(options.body);
    req.end();
  });
}

const logger = { info: () => {}, warn: () => {}, error: () => {} };
const service = createYuyuService({}, logger);

const server = http.createServer((req, res) => {
  service.handleHttpRequest(req, res).catch(() => {
    try { res.writeHead(500); res.end(); } catch {}
  });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
console.log(`[e2e] 服务已启动: 127.0.0.1:${port}\n`);

console.log('[e2e] 1) 安全边界');
{
  const evil = await request(port, '/yuyu-quota/api/settings', {
    headers: { origin: 'https://evil.example.com' }
  });
  check('非白名单 Origin 被拒绝', evil.status === 403, `status=${evil.status}`);

  const evilPost = await request(port, '/yuyu-quota/api/settings', {
    method: 'POST',
    headers: { origin: 'https://evil.example.com', 'content-type': 'application/json' },
    body: JSON.stringify({ preferences: { updateFeedUrl: 'https://evil.example.com' } })
  });
  check('非白名单 Origin 无法改偏好', evilPost.status === 403, `status=${evilPost.status}`);

  const good = await request(port, '/yuyu-quota/api/settings', {
    headers: { origin: 'http://127.0.0.1:60913' }
  });
  check('本机 Origin 放行', good.status === 200, `status=${good.status}`);
  const acao = good.headers['access-control-allow-origin'];
  check('CORS 回显具体 Origin 而非 *', acao === 'http://127.0.0.1:60913', `ACAO=${acao}`);
}

console.log('\n[e2e] 2) 崩溃防护（这些请求曾经能打崩进程）');
{
  const emptyAsset = await request(port, '/yuyu-quota/api/assets/');
  check('空资产名返回 400 而不是崩溃', emptyAsset.status === 400, `status=${emptyAsset.status}`);

  const traversal = await request(port, '/yuyu-quota/api/assets/..%2f..%2fpackage.json');
  check('路径穿越被挡住', traversal.status === 404 || traversal.status === 400, `status=${traversal.status}`);

  const dirAsAsset = await request(port, '/yuyu-quota/api/assets/%2e');
  check('目录当资产请求被挡住', dirAsAsset.status === 400 || dirAsAsset.status === 404, `status=${dirAsAsset.status}`);

  // 畸形请求行直接打到 socket，验证不会产生未捕获异常
  await new Promise((resolve) => {
    const socket = new net.Socket();
    socket.connect(port, '127.0.0.1', () => {
      socket.write('GET //[::1 HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n');
      setTimeout(() => { socket.destroy(); resolve(); }, 300);
    });
    socket.on('error', () => resolve());
  });
  const stillAlive = await request(port, '/yuyu-quota/api/settings');
  check('畸形请求行后服务仍存活', stillAlive.status === 200, `status=${stillAlive.status}`);
}

console.log('\n[e2e] 3) 真实数据链路');
{
  const sync = await request(port, '/yuyu-quota/api/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({})
  });
  let payload = {};
  try { payload = JSON.parse(sync.body); } catch {}
  const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
  check('同步接口返回账号列表', accounts.length > 0, `accounts=${accounts.length}`);

  if (accounts.length > 0) {
    const withRt = accounts.filter((a) => a.hasRefreshToken);
    console.log(`       账号: ${accounts.map((a) => a.email).join(', ')}`);
    console.log(`       带 refresh token 的账号: ${withRt.length}/${accounts.length}`);

    const snap = payload.snapshot;
    if (snap && snap.success) {
      console.log(`       余额: $${Number(snap.balance).toFixed(2)} (${snap.email})`);
      check('拿到了真实余额", ', typeof snap.balance === 'number' && snap.balance >= 0);
    } else {
      console.log('       （本次未取到余额，可能凭据已过期——这本身也应被正确报告）');
      check('失败时给出可读错误而不是崩溃', typeof (snap && snap.error) === 'string');
    }

    const cred = payload.credential;
    check('返回凭据健康度', Boolean(cred) && typeof cred.mode === 'string', JSON.stringify(cred));
    if (cred) {
      console.log(`       凭据模式: ${cred.mode}, 剩余: ${
        typeof cred.msUntilExpiry === 'number' ? (cred.msUntilExpiry / 3600000).toFixed(1) + 'h' : '未知'
      }`);
      check('凭据模式合法', cred.mode === 'auto' || cred.mode === 'manual');
    }
  }
}

console.log('\n[e2e] 4) 目录与只读接口');
{
  const settings = await request(port, '/yuyu-quota/api/settings');
  const sBody = JSON.parse(settings.body || '{}');
  check('/settings 返回 preferences', Boolean(sBody.preferences));
  check('/settings 返回版本号', sBody.version === pkgVersion, `version=${sBody.version}`);

  const lastTurn = await request(port, '/yuyu-quota/api/last-turn');
  check('/last-turn 可访问', lastTurn.status === 200);

  const unknown = await request(port, '/yuyu-quota/api/nope');
  check('未知路由返回 404', unknown.status === 404, `status=${unknown.status}`);
}

console.log(`\n[e2e] 结果: ${passed} 通过 / ${failed} 失败`);
server.close();
setTimeout(() => process.exit(failed > 0 ? 1 : 0), 200);
