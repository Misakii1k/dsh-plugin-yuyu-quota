# 云端版本推送：部署指南

本插件采用与「小药盒」同源的三层分发架构。仓库是**私有**的，因此客户端
不能直连 GitHub —— 全部走 Cloudflare 边缘代理。

```
                                  ┌──────────────────────────┐
  客户端 (DSH 插件后端)            │  Cloudflare Pages        │
        │                         │                          │
        ├─① GET /version.json ───>│  Functions/version.json.ts│──> api.github.com
        │   （1.5s 竞速，极速通道）│  （带 GITHUB_TOKEN 代理）  │    releases/latest
        │                         │                          │
        ├─② GET /api/releases ───>│  Functions/api/releases.ts│──> api.github.com
        │                         │                          │
        └─③ GET /api/download ───>│  Functions/api/download.ts│──> assets（流式回传）
             ?tag=vX.Y.Z           └──────────────────────────┘
```

## 为什么不让客户端直连 GitHub

1. 仓库私有 → 匿名访问 `api.github.com` 一律 404；
2. GitHub 的资产下载会 302 到 `release-assets.githubusercontent.com`，国内网络
   经常被拦或超时。由 Cloudflare 边缘节点跟随跳转、把二进制流直接回传，客户端
   只认识自己的域名，稳定得多。

## 一次性部署步骤

### 1. 创建 Cloudflare Pages 项目

```bash
# 登录（浏览器授权）
npx wrangler login

# 首次部署（会自动创建项目）
npx wrangler pages deploy public --project-name dsh-plugin-yuyu-quota-update
```

记下输出里的域名，形如 `https://dsh-plugin-yuyu-quota-update.pages.dev`。

### 2. 配置 GitHub Token（**必需**）

在 Pages 控制台 → 你的项目 → **Settings → Environment variables** 添加：

| 变量名 | 值 | 说明 |
|---|---|---|
| `GITHUB_TOKEN` | `github_pat_...` | fine-grained token，权限**仅** `Contents: Read`，仓库范围**仅** `Misakii1k/dsh-plugin-yuyu-quota` |

> 不要用 classic token，也不要把 token 写进 `wrangler.toml`（那个文件会进仓库）。

配置后**重新部署一次**（环境变量只在部署时注入）：

```bash
npx wrangler pages deploy public --project-name dsh-plugin-yuyu-quota-update
```

### 3. 把域名填进插件默认配置

编辑 `src/index.ts` 的 `defaultPreferences()`：

```ts
updateFeedUrl: 'https://dsh-plugin-yuyu-quota-update.pages.dev',
```

重新 `npm run build && npm run pack`，然后重装插件。
（也可以在浮窗设置里手动填，但写进默认值新用户就不用配。）

### 4. 验证三个端点

```bash
BASE=https://dsh-plugin-yuyu-quota-update.pages.dev

curl -s $BASE/version.json            # 应返回 {version, downloadUrl, fileSize, sha256}
curl -s $BASE/api/releases | head -c 300
curl -sI "$BASE/api/download?tag=v1.1.0"   # 应 200 + content-type: application/gzip
```

若 `version.json` 返回 503 且提示 `GITHUB_TOKEN_NOT_CONFIGURED`，说明第 2 步没生效。

## 发版流程

```bash
# 1. 改版本号（package.json）
npm version patch --no-git-tag-version

# 2. 写发布说明（可选，会被写进 version.json 的 releaseNotes）
#    docs/releases/<版本号>.md

# 3. 打包（自动 build + 校验 + 生成 tgz）
npm run pack

# 4. 生成静态兜底清单
node scripts/gen-version.mjs --release

# 5. 提交并打 tag，推送即触发 CI
git add -A && git commit -m "release: v1.1.1"
git tag v1.1.1
git push && git push --tags
```

CI（`.github/workflows/release.yml`）会：类型检查 → 冒烟测试 → 打包 →
创建 GitHub Release 并上传 `tgz` 与 `version.json` → （若配了
`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` 两个 secret）自动部署 Pages。

## 客户端如何探测

`src/update.ts` 的 `checkForUpdate()`：

1. 先打 `{updateFeedUrl}/version.json`，**1.5 秒**熔断。若它返回了更高版本，
   立刻采用，不再等 GitHub；
2. 否则并发查 GitHub Release / Tag / raw manifest（仓库公开后才有用）；
3. 所有候选取版本号最高者；同版本时用一方补另一方的 `sha256` 与体积。

下载走 `downloadUpdate()`：校验字节数与 sha256，任一不符就删掉临时文件并报错。

## 常见问题

**Q: `/api/download` 报 `UPSTREAM_ERROR`（502）**
GitHub token 失效或权限不足。用新 token 替换环境变量后重新部署。

**Q: 客户端一直显示「检查失败」**
先确认 `updateFeedUrl` 已填写且是 `https://`。未填写时客户端只会查 GitHub，
而私有仓库必然 404 —— 这是预期行为，不是 bug。

**Q: 想临时跳过 Cloudflare，直接测更新流程**
把 `updateFeedUrl` 指向任意能返回同结构 JSON 的地址即可（本仓库自带的
`functions/` 可以本地用 `npx wrangler pages dev public` 跑起来）。
