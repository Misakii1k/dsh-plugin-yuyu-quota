<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="鱼鱼额度：在 DeepSeek-Harness 状态栏常驻显示鱼鱼 API 余额，支持多账号与自动续期">
</p>

<p align="center">
  <a href="https://github.com/Misakii1k/dsh-plugin-yuyu-quota/releases"><img src="https://img.shields.io/github/v/release/Misakii1k/dsh-plugin-yuyu-quota?color=22d3ee&label=%E7%89%88%E6%9C%AC" alt="版本"></a>
  <a href="#安装"><img src="https://img.shields.io/badge/DeepSeek--Harness-%E6%8F%92%E4%BB%B6-0891b2" alt="DSH 插件"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/%E8%AE%B8%E5%8F%AF-MIT-34d399" alt="MIT"></a>
</p>

余额不用再开网页查一次。

**鱼鱼额度**把 [鱼鱼 API](https://sub.anzhiyu.com) 的可用余额、今日消耗和密钥状态搬到 [DeepSeek-Harness](https://github.com/deepseek-ai/deepseek-harness) 的状态栏上。点一下胶囊看详情，问一句「我还有多少钱」让模型自己查。凭据会自己续期，所以不必每隔一两天重新登录一次。

---

## 它解决什么

| 以前 | 现在 |
| :--- | :--- |
| 开浏览器、登录、翻到用量页 | 余额常驻状态栏，一眼可见 |
| JWT 约 24 小时过期，重登很烦 | 到期前 5 分钟自动续期，401 兜底再试一次 |
| 多个账号来回切换查 | 多账号并存，卡片里直接切 |
| 忘了余额，一轮对话烧完才发现 | 低于阈值亮矢量警示图标；每轮结束弹通知报用量 |

---

## 界面

三段交互，都长在同一条数据链路上：

```text
胶囊 / 小鲸鱼挂件  →  详情卡片  →  设置面板
   余额一眼可见        用量与密钥      刷新频率、音效、外观
```

- **挂件**：小鲸鱼立绘或极简胶囊，可拖到任意位置，松手自动吸附最近边缘，位置跨刷新记住。
- **详情卡**：账号邮箱、今日消耗、今日 Token、已绑定密钥、上次同步时间，底部带凭据状态条与「立即续期」。
- **对话工具**：注册 `get_yuyu_api_balance`，在对话里问「我还有多少余额」，模型自主调用并用中文汇报。

---

## 安装

### 方式一：一键脚本（Windows）

双击仓库根目录的 `一键安装到DSH.bat`，脚本会把插件装进当前 DSH 环境并完成首次凭据同步。

### 方式二：手动加载

```bash
dsh plugin --profile desktop add "./dsh-plugin-yuyu-quota-1.2.4.tgz"
```

### 首次同步凭据

插件需要鱼鱼 API 网页端的登录态。两种方式任选：

1. **Windows 双击** `一键配置.bat` —— 自动扫描正在运行的 Chrome / Edge / Brave，从已登录标签页取出 `auth_token`，校验余额后写入配置。
2. **在 DSH 界面点击**「一键从浏览器同步登录凭据」—— 后台同样完成探测、抓取、保存与刷新。

> 两者都不需要你开 F12 手动复制那串 300 多位的 Token。

---

## 配置项

| 配置项 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `token` | string（密文） | *自动加载* | 鱼鱼 API 网页登录 Auth Token，一键配置后自动注入 |
| `refreshInterval` | enum | `30s` | 刷新频率：`1s` / `5s` / `30s` / `1m` / `5m` |
| `alertThreshold` | number | `2.0` | 低额预警金额（USD），低于此值显示矢量警示图标 |
| `baseUrl` | string | `https://sub.anzhiyu.com` | API 根地址，支持国内直连 |
| `notifyMode` | enum | `both` | `both` 系统 + 应用内 / `windows` / `inapp` / `off` |
| `notifySound` | string | `Notification.Reminder` | 通知音效名，或 `none` |
| `notifySubagentMute` | boolean | `true` | 子智能体完成时不打扰（用量照常记账） |
| `reportOnComplete` | boolean | `true` | 每轮结束在浮窗汇报本轮 Token 与实扣额度 |
| `theme` | enum | `system` | `system` / `light` / `dark` |
| `widgetStyle` | enum | `whale` | `whale` 小鲸鱼立绘 / `pill` 极简胶囊 |
| `whaleModel` | enum | `DSniang1` | 立绘形象：`DSniang1` / `DSniang02` / `DSH2` |
| `updateCheck` | boolean | `true` | 启动后检查插件更新 |
| `updateFeedUrl` | string | `https://dsh-plugin-yuyu-quota-update.pages.dev` | Cloudflare 边缘更新源（留空则只查 GitHub） |
| `githubRepo` | string | `Misakii1k/dsh-plugin-yuyu-quota` | 更新来源仓库 |

偏好写在 `~/.dsh/yuyu-accounts.json` 的 `preferences` 段，HTTP 写入走白名单校验。
账号凭据（`token` / `refreshToken` / 过期时间）也在同一文件，采用「先写临时文件再 rename」的原子写入。

---

## 开发

```bash
npm run typecheck           # tsc --noEmit
npm test                    # build + 全套自检（75 项）
npm run test:smoke          # 后端逻辑 21 项
npm run test:credentials    # 凭据续期 12 项（不联网）
npm run test:browser        # 浏览器扫描 11 项（合成 LevelDB）
npm run test:ui             # 前端 DOM 行为 21 项（jsdom）
npm run test:cf             # Cloudflare 函数 10 项
npm run pack               # 打包 tgz 并打印 sha256
```

`test:ui` 把 `src/client.js` 真挂到 DOM 上模拟点击，能抓到「切换形态后卡片点不开」这类纯语法检查发现不了的问题。

---

## 实现约束

以下几条是本插件踩过坑的地方，改动前请先读。

### 余额字段的真相

- 权威字段是 `/api/v1/user/profile` 的 `balance`，单位 **USD**，不是人民币。
- 服务端的 `updated_at` / `last_active_at` 每次请求都会刷新，**不能**用来判断余额是否新鲜。
- 充值到账后 `total_recharged` 同步增加，插件据此记录 `balanceChangedAt`。

### 「刷新了但余额不动」

后端从未启动时，前端会退回 localStorage 里的旧快照继续渲染。历史版本在这种情况下仍会把「已同步」时间改成当前时刻——造成刷新成功的假象。当前版本：

- 只有真正从服务端拿到数据才更新「已同步」时间；
- 请求失败时保留上次真实成功时间，状态改为 `离线 · 数据显示 HH:mm:ss`（琥珀色），不再伪装成绿色「本地直连」；
- 凭据过期时状态直接显示 `登录已过期 · 需重新同步`。

### Token 为什么会失效（三条硬约束）

`auth_token` 是 JWT，有效期约 24 小时；网页端另存 `refresh_token`（`rt_` + 64 hex），可换取新的 `{ access_token, refresh_token, expires_in }`。而 **refresh token 是一次性的**，同一枚用第二次返回 `401 REFRESH_TOKEN_INVALID`。因此：

1. 续期必须**串行**——同账号共享同一个 in-flight Promise，并发会互相作废；
2. 续期成功后**立即原子写盘**，绝不降级为直接覆盖（写到一半崩溃就永久丢凭据）；
3. refresh token 与账号的**配对不能靠猜**——旧实现把第一个 `rt_` 塞给所有账号，结果用 A 的凭据换出 token 写进 B。现在按「同 profile + 同文件偏移最近」配对，配不上就留空，让用户点一次「从浏览器同步」。

### 读不到 Edge 的数据

旧实现有三处会让 Edge 整段失效：只认 `LOCALAPPDATA/Microsoft/Edge` 一个固定路径（环境变量缺失就直接跳过）；只认 `Microsoft/Edge`，不认 `Edge Beta` / `Dev` / `SxS`；profile 只认 `Default` 与 `Profile N`，而 Edge WebView2 的数据在 `EdgeWebView/User Data/EBWebView/Default/...`，多一层嵌套就扫不到。

现在枚举全部 Chromium 内核浏览器与全部 profile 变体，并递归下钻 `EBWebView`。扫描失败时返回诊断（`profiles` / `files` / `unreadable`），能直接看出是「没装浏览器」「文件被占用」还是「确实没登录」。

### 卡片点不开（已修复，勿回退）

`#yuyu-pill-btn` 上曾绑了**两次** `click`，两处各自 `isOpen = !isOpen`——同一次点击先开后关，卡片永远打不开。同期还有第二个 bug：拖动把手在挂载时写死成 `whale ? whaleRoot : pill`，切到胶囊后既拖不动也收不到 pointer 事件。

现在的约束：

1. 卡片开关只走 `setCardIsOpen(next)` 一个入口，任何新交互必须复用它；
2. 拖动把手由 `applyWidgetStyle()` 调 `draggable.setHandle()` 同步切换，不允许挂载时写死；
3. 回归测试在 `scripts/ui-test.mjs`，改完前端务必跑 `npm run test:ui`。

### Cordis 服务必须写进 `inject`

`export const inject = []` **不是**安全写法。服务只能通过 `inject` 声明后以属性访问（`ctx.webServer` / `ctx.tools`），未声明的属性访问会抛 `cannot get property "x" without inject`。`ctx.get()` 不是 Cordis 公开 API，只存在于内部 `ReflectService`，不要依赖。

本插件声明 `inject = ['webServer', 'tools']`，同时在 `apply()` 内对每个服务做能力探测并全部包裹 `try/catch`——单个能力缺失只降级对应功能，不拖垮余额主链路。

### 三个数据通道

| 通道 | 地址 | 用途 |
| :--- | :--- | :--- |
| 本地 bridge | `http://127.0.0.1:53788/yuyu-quota/api/*` | 前端主通道，免重启 |
| DSH 同源路由 | `<DSH_WEB_URL>/yuyu-quota/api/*` | bridge 端口被占用时的回退 |
| Agent Tool | `get_yuyu_api_balance` | 对话中提问余额 |

### 桥接端口的安全边界

`127.0.0.1:53788` 对所有本机程序可达，所以**不是**「只有 DSH 能访问」：

- **Origin 白名单**：只放行无 Origin（同源/命令行）、`127.0.0.1` / `localhost` / `[::1]` 任意端口，以及 `dsh://`。非白名单来源直接 `403`，CORS 头也不再无条件写 `*`。否则用户随便打开一个网页就能 `fetch` 到这里改偏好、触发下载安装。
- **更新安装必须带 sha256**：没有校验值就拒绝自动安装，避免更新源被篡改后写入任意代码。
- **解压前做 Zip-Slip 校验**：包内出现 `../`、绝对路径或盘符路径一律拒装，且必须包含 `package.json` 才认作插件包。
- **请求体上限 256KB**，防止恶意大包撑爆内存。
- **URL 解析与流式响应都有兜底 catch**：畸形请求行（如 `GET //[::1`）或读到目录（`EISDIR`）只影响当前请求，不打崩 DSH 主进程。

更新链路是 **GitHub Releases + Cloudflare 边缘代理**，详见 [`docs/CLOUDFLARE-部署指南.md`](docs/CLOUDFLARE-部署指南.md)。

---

## 许可证

[MIT](./LICENSE)
