export interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const isHtmlRequest = request.method === "GET" && (pathname === "/" || !pathname.includes("."));
    const assetRequest = isHtmlRequest
      ? new Request(url, request)
      : request;
    if (isHtmlRequest) {
      assetRequest.headers.set("x-zmedico-html-refresh", "c3c8fd5");
    }
    const response = await env.ASSETS.fetch(assetRequest);
    const contentType = response.headers.get("content-type");

    // Cloudflare may omit Content-Type for a small helper chunk uploaded through
    // the direct assets API. Browsers enforce JavaScript MIME for module imports.
    if (isHtmlRequest || (/\.(?:m?js)$/.test(pathname) && !contentType)) {
      const headers = new Headers(response.headers);
      if (isHtmlRequest) {
        headers.set("cache-control", "no-store, max-age=0");
      } else {
        headers.set("content-type", "text/javascript; charset=UTF-8");
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    return response;
  },
};
