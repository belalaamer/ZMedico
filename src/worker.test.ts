import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./worker";

afterEach(() => vi.restoreAllMocks());

describe("custom domain gateway", () => {
  it("rejects methods other than POST without contacting Supabase", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(new Request("https://zmedico2.belalaamer.workers.dev/api/domains", { method: "GET" }), { ASSETS: {} as Fetcher });

    expect(response.status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects oversized bodies at the Worker edge", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const body = JSON.stringify({ action: "list", tenant_id: "x", padding: "a".repeat(33_000) });

    const response = await worker.fetch(new Request("https://zmedico2.belalaamer.workers.dev/api/domains", { method: "POST", body, headers: { "Content-Type": "application/json" } }), { ASSETS: {} as Fetcher });

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards the authenticated request to the Supabase function", async () => {
    const upstream = new Response(JSON.stringify({ domains: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    const fetchMock = vi.fn().mockResolvedValue(upstream);
    vi.stubGlobal("fetch", fetchMock);
    const body = JSON.stringify({ action: "list", tenant_id: "tenant-1" });

    const response = await worker.fetch(new Request("https://zmedico2.belalaamer.workers.dev/api/domains", { method: "POST", body, headers: { Authorization: "Bearer test-jwt", apikey: "public-key", "Content-Type": "application/json" } }), { ASSETS: {} as Fetcher });
    const forwardedRequest = fetchMock.mock.calls[0]?.[0] as string;
    const forwardedInit = fetchMock.mock.calls[0]?.[1] as RequestInit;

    expect(response.status).toBe(200);
    expect(forwardedRequest).toBe("https://rqcmnfzfytyyicelvifk.supabase.co/functions/v1/manage-custom-domain");
    expect(new Headers(forwardedInit.headers).get("Authorization")).toBe("Bearer test-jwt");
    expect(new Headers(forwardedInit.headers).get("apikey")).toBe("public-key");
    expect(await response.text()).toContain("domains");
  });
});
