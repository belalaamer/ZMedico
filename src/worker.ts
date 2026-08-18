export interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await env.ASSETS.fetch(request);
    const pathname = new URL(request.url).pathname;
    const contentType = response.headers.get("content-type");

    // Cloudflare may omit Content-Type for a small helper chunk uploaded through
    // the direct assets API. Browsers enforce JavaScript MIME for module imports.
    if (/\.(?:m?js)$/.test(pathname) && !contentType) {
      const headers = new Headers(response.headers);
      headers.set("content-type", "text/javascript; charset=UTF-8");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    return response;
  },
};
