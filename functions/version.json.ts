import {
  corsHeaders,
  fetchWithTimeout,
  githubHeaders,
  jsonResponse,
  pickTgzAsset,
  releaseApiUrl,
  tokenMissingResponse,
  upstreamFailureResponse,
  type Env,
  type GithubRelease
} from './api/_shared';

/**
 * 版本元数据端点（GET /version.json）。
 *
 * 直接从 GitHub Releases 读取最新正式发布的元数据，动态提取安装包的真实
 * 字节数与 SHA256，杜绝「静态 version.json 与实际附件之间哈希漂移」这类
 * 会导致下载校验失败的经典问题。
 *
 * 仓库是私有的，所以这个端点必须持有 GITHUB_TOKEN —— 也正因如此，客户端
 * 不能直连 api.github.com，只能走这里。
 */
export const onRequestGet = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;
  const token = env.GITHUB_TOKEN;
  const cors = corsHeaders(request);
  const cacheHeaders = { 'Cache-Control': 'public, max-age=60, s-maxage=300', ...cors };

  if (!token) return tokenMissingResponse();

  try {
    const res = await fetchWithTimeout(releaseApiUrl(null), {
      headers: githubHeaders(token, 'application/vnd.github.v3+json')
    });
    if (!res.ok) return upstreamFailureResponse(res.status);

    const release = (await res.json()) as GithubRelease;
    const rawTag = typeof release.tag_name === 'string' ? release.tag_name.trim() : '';
    const version = rawTag.replace(/^[vV]/, '');
    if (!version) return upstreamFailureResponse(502);

    const asset = pickTgzAsset(release.assets);
    const manifest: Record<string, unknown> = {
      version,
      releaseDate: typeof release.published_at === 'string'
        ? release.published_at.slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      downloadUrl: `/api/download?tag=v${encodeURIComponent(version)}`
    };

    if (asset) {
      if (typeof asset.size === 'number' && asset.size > 0) {
        manifest.fileSize = asset.size;
      }
      // GitHub 的 digest 字段形如 `sha256:abc...`
      if (typeof asset.digest === 'string' && asset.digest.startsWith('sha256:')) {
        manifest.sha256 = asset.digest.slice(7).toLowerCase();
      }
    }

    if (typeof release.body === 'string' && release.body.trim()) {
      // 发布说明里的 HTML 注释属于元数据，不展示给用户
      const notes = release.body.replace(/<!--[\s\S]*?-->/g, '').replace(/\n{3,}/g, '\n\n').trim();
      if (notes) manifest.releaseNotes = notes.slice(0, 1500);
    }

    return jsonResponse(manifest, 200, cacheHeaders);
  } catch {
    return upstreamFailureResponse(500);
  }
};
