import {
  assetApiUrl,
  errorResponse,
  fetchWithTimeout,
  githubHeaders,
  invalidTagResponse,
  parseReleaseTag,
  pickTgzAsset,
  releaseApiUrl,
  tokenMissingResponse,
  upstreamFailureResponse,
  type Env,
  type GithubRelease
} from './_shared';

/**
 * 私有仓库安装包代理（GET /api/download?tag=vX.Y.Z）。
 *
 * 由 Cloudflare 边缘节点跟随 GitHub 的 302 跳转，把真实二进制流直接回传给
 * 客户端 —— 不下发 302。原因：GitHub 的资产跳转目标在国内网络经常被拦或
 * 超时，而边缘节点位于海外骨干网，访问稳定；客户端只需认识我们自己的域名。
 */
export const onRequestGet = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;
  const url = new URL(request.url);
  const parsedTag = parseReleaseTag(url.searchParams.get('tag') || url.searchParams.get('version'));
  if (!parsedTag.ok) return invalidTagResponse();

  const token = env.GITHUB_TOKEN;
  if (!token) return tokenMissingResponse();

  try {
    const releaseRes = await fetchWithTimeout(releaseApiUrl(parsedTag.tag), {
      headers: githubHeaders(token, 'application/vnd.github.v3+json')
    });
    if (!releaseRes.ok) return upstreamFailureResponse(releaseRes.status);

    const release = (await releaseRes.json()) as GithubRelease;
    const asset = pickTgzAsset(release.assets);
    if (!asset || typeof asset.id !== 'number' || typeof asset.name !== 'string') {
      return errorResponse('ASSET_NOT_FOUND', '该版本没有可用的安装包。', 404);
    }

    const assetRes = await fetchWithTimeout(
      assetApiUrl(asset.id),
      {
        method: 'GET',
        headers: githubHeaders(token, 'application/octet-stream'),
        redirect: 'follow'
      },
      30_000
    );
    if (!assetRes.ok || !assetRes.body) {
      return upstreamFailureResponse(assetRes.status);
    }

    const headers = new Headers({
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${asset.name}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=0, no-store'
    });
    const contentLength = assetRes.headers.get('content-length')
      || (typeof asset.size === 'number' && asset.size > 0 ? String(asset.size) : null);
    if (contentLength) headers.set('Content-Length', contentLength);

    return new Response(assetRes.body, { headers });
  } catch {
    return upstreamFailureResponse(500);
  }
};

/** 只允许 GET / OPTIONS。 */
export const onRequestOptions = async (): Promise<Response> =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'X-Content-Type-Options': 'nosniff'
    }
  });
