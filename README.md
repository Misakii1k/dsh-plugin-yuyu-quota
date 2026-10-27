# dsh-plugin-yuyu-quota (鱼鱼API 实时余额与额度追踪插件)

为 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 打造的鱼鱼API ([sub.anzhiyu.com](https://sub.anzhiyu.com)) 账户余额与额度监控插件。

---

## 零门槛超简配置（推荐）

为了彻底省去打开 F12、查找 LocalStorage 和手动复制 300 多位 Token 的繁琐操作，插件提供两种**全自动极简配置**方式：

### 方式一：Windows 双击一键配置（免开网页、免输命令）

在插件根目录下，直接双击运行：
👉 **`一键配置.bat`**

**执行过程（全自动 5 秒完成）：**
1. 自动全盘扫描当前运行中的 **Chrome、Edge、Brave** 等浏览器；
2. 发现已登录的鱼鱼API标签页，全自动提取 `auth_token`；
3. 若未打开浏览器，会自动调起登录窗口，登录后即刻捕获；
4. 自动校验真实余额并写入配置文件 `yuyu-config.json`，即开即用！

---

### 方式二：在 DeepSeek Harness 界面点击一键同步

1. 打开 DeepSeek Harness 界面；
2. 状态栏或插件弹窗中包含 **`[一键从浏览器同步登录凭据]`** 原生按钮；
3. 点击按钮，后台全自动完成探测、抓取、保存与刷新，界面立刻更新呈现当前最新余额！

---

## 核心功能

1. **混合模式支持**：
   - **Web UI 状态栏胶囊**：常驻显示当前可用余额（搭配原生制作的 SVG 矢量钱包图标，格式如 `[钱包图标] 鱼鱼: $7.02`）。
   - **交互详情卡片**：点击胶囊弹出详情，展示账号邮箱、今日消耗金额、今日 Token 计数、已绑定密钥列表与上次同步时间。
   - **DeepSeek Agent Tool**：注册 `get_yuyu_api_balance` 原生工具。在与 DeepSeek 对话时，随时询问*“我还有多少余额？”*、*“今天花了多少钱？”*，模型将自主调用并以自然中文汇报。
2. **凭据自动续期（不再需要 1~2 天重新登录）**：
   - 鱼鱼API 的 `auth_token` 是 JWT，约 **24 小时**过期；过期后所有接口返回 401。
   - 插件会同时保存网页端的 **`refresh_token`**，在 token 到期前 **5 分钟自动续期**，401 时再兜底续期重试一次。
   - refresh token 是**一次性**的（用过即轮换），所以每次续期后立即**原子写盘**（先写临时文件再 rename），中途崩溃也不会丢掉唯一凭据。
   - 卡片底部新增「登录凭据」状态条：显示「可自动续期 · 剩余 X 小时」或「需重新登录」，并提供「立即续期」按钮。
   - 续期彻底失败时会自动回落到「重新扫描浏览器」，拿到网页端刚写入的新凭据。
3. **多浏览器智能适配**：
   - 覆盖 **Edge（含 Beta / Dev / Canary / WebView2）**、Chrome（含 Beta / Dev / Canary）、Brave、Vivaldi、Opera；
   - 自动递归识别 `Default` / `Profile N` / `EBWebView` 等 profile 布局；
   - 未检测到活动会话时，支持自动调起独立捕获窗口；
   - 扫描失败时会返回诊断信息（扫了几个 profile、读了几个文件、几个被占用）。
4. **原生矢量警示徽标**：
   - 当账户余额低于设定阈值（默认 **$2.00 USD**）时，胶囊旁自动呈现原生制作的高对比度感叹号矢量图标（不使用系统 Emoji）。
5. **预设定时刷新**：
   - 提供 5 档定时轮询间隔：`1秒`、`5秒`、`30秒`、`1分钟`、`5分钟`，详情卡片内置原生 SVG 刷新按钮；
   - 修改频率会**同时重建后端定时器**，前后端节拍一致；
   - 卡片收起时自动降频到 30 秒，减少无谓请求。
6. **国内网络直连优化**：
   - 经实测验证，虽然鱼鱼API网页登录界面因第三方 OAuth / 验证码原因在纯国内网络可能受阻，但**其底层数据接口 (`/api/v1/user/profile` 等) 完全由 Cloudflare CDN 承载，国内网络可直接毫秒级直连请求，无需开启任何代理或外网环境！**
7. **任务完成通知（Windows 原生）**：
   - 每轮对话结束自动弹出系统通知，播放 **Windows 官方提醒音**（`ms-winsoundevent:Notification.*`）；
   - 标题带会话名，正文直接给出「本轮 Tokens · 实扣额度」「会话累计」与当前余额；
   - 子智能体完成默认不打扰（用量照常记账），失败/中断有独立标题；
   - **点击通知即可把 DSH 窗口唤到前台**（走 `dsh://open` 协议）；
   - 音效可选 Windows 提醒 / 默认 / 即时消息 / 邮件 / 短信 / 静音，设置面板内置「测试通知」与「试听系统音」。
8. **本轮用量汇报**：
   - 浮窗新增「本轮用量」区块：本轮 Tokens、实扣额度、会话累计；
   - 卡片收起时胶囊亮起角标，展开即可查看；
   - 额度取**今日消耗差额**，拿不到时明确标注「待同步」，绝不用估算值冒充真实值。
9. **可拖动浮窗 + 自动贴边**：
   - 按住胶囊或小鲸鱼拖到任意位置，松手自动吸附最近的边缘；
   - 位置跨刷新记住；贴左侧时弹窗自动朝右展开，不会跑出屏幕；窗口变小时自动钳制回可视区；
   - **切换小鲸鱼/胶囊形态时拖动把手会同步切换**，切换后仍可拖动与点击。
10. **云端版本推送**：
    - 启动后自动检查更新，发现新版胶囊亮红点，设置面板显示版本号、更新说明与下载入口；
    - 下载后自动校验**字节数与 SHA-256**，不符即删除；
    - **没有 sha256 的更新源会被拒绝自动安装**（防止更新源被篡改后写入任意代码）；
    - 解压前做 **Zip-Slip 路径校验**，含 `../` 或绝对路径的包直接拒装；
    - 采用 **GitHub Releases + Cloudflare 边缘代理** 三层架构，仓库私有也可用 —— 详见 [`docs/CLOUDFLARE-部署指南.md`](docs/CLOUDFLARE-部署指南.md)。

---

## 插件安装

```bash
# 进入 DeepSeek Harness 环境加载本地插件
dsh plugin --profile desktop add "./dsh-plugin-yuyu-quota-1.1.0.tgz"
```

---

## 插件配置项

| 配置项 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `token` | string (密文字段) | *自动加载* | 鱼鱼API 网页登录 Auth Token（运行一键配置后自动注入） |
| `refreshInterval` | enum | `30s` | 定时刷新频率，可选 `1s` / `5s` / `30s` / `1m` / `5m` |
| `alertThreshold` | number | `2.0` | 低额预警金额（**单位：USD $**），低于此金额在胶囊旁显示原生矢量警示图标 |
| `baseUrl` | string | `https://sub.anzhiyu.com` | API 服务端根地址（支持国内直连） |
| `notifyMode` | enum | `both` | 通知模式：`both` 系统+应用内 / `windows` 仅系统 / `inapp` 仅应用内 / `off` 关闭 |
| `notifyOnComplete` | boolean | `true` | 任务完成后弹 Windows 原生通知（由 `notifyMode` 派生） |
| `notifySound` | string | `Notification.Reminder` | 通知音效名，或 `none` 静音 |
| `notifySubagentMute` | boolean | `true` | 子智能体完成时不提示 |
| `notifyOnFailure` | boolean | `true` | 失败/中断的轮次也提示 |
| `reportOnComplete` | boolean | `true` | 浮窗内汇报本轮 Token 与额度 |
| `theme` | enum | `system` | 外观主题：`system` 跟随系统 / `light` / `dark` |
| `widgetStyle` | enum | `whale` | 挂件形态：`whale` 小鲸鱼立绘 / `pill` 极简胶囊 |
| `whaleModel` | enum | `DSniang1` | 立绘形象：`DSniang1` / `DSniang02` / `DSH2` |
| `soundEffect` | string | `task-end-a` | 任务完成音效 |
| `pressSound` | string | `duck` | 按压 Q 弹音效 |
| `soundVolume` | number | `80` | 提示音量 0–100 |
| `updateCheck` | boolean | `true` | 启动后自动检查插件更新 |
| `updateFeedUrl` | string | `https://dsh-plugin-yuyu-quota-update.pages.dev` | Cloudflare 边缘更新源根地址（留空则只查 GitHub） |
| `githubRepo` | string | `Misakii1k/dsh-plugin-yuyu-quota` | 更新来源仓库 |
| `updateCheckIntervalHours` | number | `6` | 自动检查间隔（小时） |

> 以上偏好均可在浮窗设置面板里修改，写入 `~/.dsh/yuyu-accounts.json` 的
> `preferences` 段；HTTP 写入走白名单校验，非法字段会被丢弃。
>
> **账号凭据**（`token` / `refreshToken` / 过期时间）同样存在该文件中，
> 采用「先写临时文件再 rename」的原子写入，避免 refresh token 一次性失效后丢失。

---

## 开发与自检

```bash
npm run typecheck   # tsc --noEmit
npm test            # build + 全套自检（75 项）
npm run test:smoke        # 后端逻辑 21 项
npm run test:credentials  # 凭据续期 12 项（不联网）
npm run test:browser      # 浏览器扫描 11 项（合成 LevelDB）
npm run test:ui           # 前端 DOM 行为 21 项（jsdom）
npm run test:cf           # Cloudflare 函数 10 项
npm run pack              # 打包 tgz 并打印 sha256
```

> `test:ui` 依赖 `jsdom`（已列入 devDependencies）。它会把 `src/client.js`
> 真正挂到 DOM 上模拟点击，能抓到「切换形态后卡片点不开」这类纯语法检查发现不了的问题。

---

## 对话工具 (Agent Tool) 调用效果

在 DeepSeek 对话窗口中问：
> **你**：*帮我看一下我现在的鱼鱼API还剩多少钱？*

> **DeepSeek**（自主触发 `get_yuyu_api_balance` 工具）：
> 
> [正常] 鱼鱼API 账户状态  
> - 账号邮箱: user@example.com  
> - 当前可用余额: $10.50  
> - 冻结金额: $0.00  
> - 累计充值: $20.00  
> - 今日已消耗: $0.0000 (共消耗 0 Tokens，请求 0 次)  
> - 关联密钥 (2个):  
>   • [Default] 绑定分组: 基础模型 (deepseek) - 状态: 正常  
>   • [Coding] 绑定分组: 编程专线 (openai) - 状态: 正常  
> 
> *您的账户当前余额充裕（$10.50），今日暂无额外消费，所有模型密钥均处于正常可用状态。*

---

## 故障排查与实现约束（维护者必读）

### 为什么“刷新了但余额不动”

插件后端从未启动时，前端会退回到浏览器 localStorage 里的旧快照继续渲染。历史版本在这种情况下仍会把底部的“已同步”时间改成当前时刻，造成“刷新成功”的假象。

当前版本的处理：

- 只有**真正从服务端拿到数据**才更新“已同步”时间；
- 请求失败时保留上次真实成功的时间，并把右下角状态改为 `离线 · 数据显示 HH:mm:ss`（琥珀色），不再伪装成绿色“本地直连”；
- 凭据过期时状态直接显示 `登录已过期 · 需重新同步`，不再笼统地说“离线”；
- 手动刷新失败时提示“刷新失败，当前显示 xx:xx 的数据”，不再无条件提示“已刷新”。

### 为什么“切到胶囊后点不开卡片”（已修复，勿回退）

这是一个**重复绑定**导致的经典问题，值得留在文档里：

- `#yuyu-pill-btn` 上被绑了**两次** `click` 监听器（一个在设置区附近，一个在调度器附近），
  两处各自 `isOpen = !isOpen` —— 同一次点击先开、后关，卡片等于永远打不开。
- 同期还有第二个 bug：拖动把手在挂载时就固定成了 `whale ? whaleRoot : pill`，
  切换形态后把手不更新，切到胶囊后**既拖不动也收不到 pointer 事件**。

现在的约束：

1. 卡片开关只能走 `setCardIsOpen(next)` **一个**入口，任何新交互都必须复用它；
2. 拖动把手由 `applyWidgetStyle()` 调 `draggable.setHandle()` 同步切换，
   不允许在挂载时写死；
3. 回归测试在 `scripts/ui-test.mjs`（jsdom 模拟真实点击），改完前端务必跑 `npm run test:ui`。

### 为什么“读不到 Edge 的数据”（已修复，勿回退）

旧实现有三处会让 Edge 整段失效：

1. 只用 `LOCALAPPDATA/Microsoft/Edge/User Data` 一个固定路径，环境变量缺失（服务、计划任务）就直接跳过；
2. 只认 `Microsoft/Edge`，不认 `Edge Beta` / `Edge Dev` / `Edge SxS`；
3. profile 只认 `Default` 与 `Profile N`，而 Edge WebView2 的数据在
   `EdgeWebView/User Data/EBWebView/Default/...`，多一层嵌套就扫不到。

现在会枚举全部 Chromium 内核浏览器与全部 profile 变体，并递归下钻 `EBWebView`；
扫描失败时返回诊断（`profiles` / `files` / `unreadable`），可直接看出是「没装浏览器」
「文件被占用」还是「确实没登录」。

### 为什么 Token 会“1~2 天就失效”（已修复）

- `auth_token` 是 JWT，实测有效期约 **24 小时**；
- 网页端同时存了 `refresh_token`（`rt_` + 64 hex），`POST /api/v1/auth/refresh`
  可换取新的 `{ access_token, refresh_token, expires_in }`；
- **refresh token 是一次性的**：同一枚用第二次返回 `401 REFRESH_TOKEN_INVALID`。

因此实现上有三条硬约束：

1. 续期必须**串行**（同账号共享同一个 in-flight Promise），并发会互相作废；
2. 续期成功后必须**立即原子写盘**，绝不能用「直接覆盖」降级（写到一半崩溃就永久丢凭据）；
3. refresh token 与账号的**配对不能靠猜**：旧实现把所有 `rt_` 里的第一个塞给所有账号，
   会导致用 A 的凭据换出 A 的 token 写进 B。现在按「同 profile + 同文件偏移最近」配对，
   配不上就留空，让用户点一次「从浏览器同步」。

### Cordis 服务必须写进 `inject`

这是本插件出问题最多的一处，记录以免重犯：

- `export const inject = []` **不是**安全写法。服务只能通过 `inject` 声明后以属性访问（`ctx.webServer` / `ctx.tools`），未声明的属性访问会抛 `cannot get property "x" without inject`；
- `ctx.get()` 不是 Cordis 公开 API（只存在于内部 `ReflectService`），不要依赖；
- 因此本插件声明 `inject = ['webServer', 'tools']`，同时在 `apply()` 内部对每个服务做能力探测并全部包裹 `try/catch`，单个能力缺失只降级对应功能，不拖垮余额主链路。

### Agent 工具注册

DSH 的工具服务是 `@deepseek-ai/dsh-tools` 的 `ToolRuntime`，注册方法为 `tools.register({ name, description, parameters, output, execute })`，返回 disposer。`output` 为必填（`schema` + `render`）。旧版的 `ctx.agent.registerTool` 仅作为回退保留。

### 三个数据通道

| 通道 | 地址 | 用途 |
| :--- | :--- | :--- |
| 本地 bridge | `http://127.0.0.1:53788/yuyu-quota/api/*` | 前端主通道，免重启 |
| DSH 同源路由 | `<DSH_WEB_URL>/yuyu-quota/api/*` | bridge 端口被占用时的回退 |
| Agent Tool | `get_yuyu_api_balance` | 对话中提问余额 |

### 桥接端口的安全边界（重要）

`127.0.0.1:53788` 对所有本机程序可达，因此**不是**「只有 DSH 能访问」：

- **Origin 白名单**：只放行无 Origin（同源/命令行）、`127.0.0.1` / `localhost` / `[::1]`
  任意端口、以及 `dsh://` 协议。非白名单来源直接 `403`，CORS 头也不再无条件写 `*`。
  否则用户随便打开一个网页就能 `fetch` 到这里改偏好、触发下载安装。
- **更新安装必须带 sha256**：没有校验值就拒绝自动安装，避免更新源被篡改后写入任意代码。
- **解压前做 Zip-Slip 校验**：包内出现 `../`、绝对路径或盘符路径一律拒装，
  且必须包含 `package.json` 才认作插件包。
- **请求体上限 256KB**，防止恶意大包撑爆内存。
- **URL 解析与流式响应都有兜底 catch**：畸形请求行（如 `GET //[::1`）或
  读到目录（`EISDIR`）只影响当前请求，绝不能打崩 DSH 主进程。

### 余额字段说明

- 余额以服务端 `/api/v1/user/profile` 的 `balance` 字段为准，单位为 **USD ($)**，不是人民币；
- 服务端的 `updated_at` / `last_active_at` 会随每次请求刷新，**不能**用来判断余额数据是否新鲜；
- 充值到账后，`total_recharged` 会同步增加，插件据此记录 `balanceChangedAt`（余额变化时刻），可用于确认充值是否已被观测到。

---

## 开源许可证

MIT License
