import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "./worker";

function testEnv(assets: Env["ASSETS"] = {} as Env["ASSETS"]): Env {
  return { ASSETS: assets, EMAIL: { send: vi.fn() } as unknown as Env["EMAIL"], EMAIL_FROM: "noreply@example.test" };
}

afterEach(() => vi.restoreAllMocks());

describe("custom domain gateway", () => {
  it.each(["null", "[]", '"text"', "42", "true"])("rejects non-object portal payload %s", async (body) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(new Request("https://zmedico2.belalaamer.workers.dev/api/patient-portal-email", {
      method: "POST", headers: { Authorization: "Bearer test-jwt" }, body,
    }), testEnv());
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects methods other than POST without contacting Supabase", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(new Request("https://zmedico2.belalaamer.workers.dev/api/domains", { method: "GET" }), testEnv());

    expect(response.status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a controlled gateway error when the domain service is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));

    const response = await worker.fetch(new Request("https://zmedico2.belalaamer.workers.dev/api/domains", {
      method: "POST",
      headers: { Authorization: "Bearer test-jwt", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list", tenant_id: "tenant-1" }),
    }), testEnv());

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Domain service is unavailable" });
  });

  it("rejects oversized bodies at the Worker edge", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const body = JSON.stringify({ action: "list", tenant_id: "x", padding: "a".repeat(33_000) });

    const response = await worker.fetch(new Request("https://zmedico2.belalaamer.workers.dev/api/domains", { method: "POST", body, headers: { "Content-Type": "application/json" } }), testEnv());

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks an unregistered provider subdomain on the index document", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const assetsFetch = vi.fn();

    const response = await worker.fetch(new Request("https://probe.belalaamer.com/index.html", { method: "GET" }), testEnv({ fetch: assetsFetch } as unknown as Env["ASSETS"]));

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Tenant subdomain is not active");
    expect(assetsFetch).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("redirects the active provider subdomain root to /auth", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ tenant_id: "tenant-1", default_branch_id: "branch-1" }]), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const assetsFetch = vi.fn();

    const response = await worker.fetch(new Request("https://blitz-physio.belalaamer.com/?utm_source=marketing", { method: "GET" }), testEnv({ fetch: assetsFetch } as unknown as Env["ASSETS"]));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://blitz-physio.belalaamer.com/auth");
    expect(assetsFetch).not.toHaveBeenCalled();
  });

  it("redirects an active custom hostname root to its tenant login", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ tenant_id: "tenant-1", default_branch_id: "branch-1" }]), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const assetsFetch = vi.fn();

    const response = await worker.fetch(new Request("https://www.psipump.com/", { method: "GET" }), testEnv({ fetch: assetsFetch } as unknown as Env["ASSETS"]));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://www.psipump.com/auth");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(assetsFetch).not.toHaveBeenCalled();
  });

  it("keeps the platform hostname on the public shell", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const assetsFetch = vi.fn().mockResolvedValue(new Response("app shell", { status: 200, headers: { "Content-Type": "text/html" } }));

    const response = await worker.fetch(new Request("https://belalaamer.com/", { method: "GET" }), testEnv({ fetch: assetsFetch } as unknown as Env["ASSETS"]));

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(assetsFetch).toHaveBeenCalledTimes(1);
  });

  it("adds browser security headers to the HTML shell", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const assetsFetch = vi.fn().mockResolvedValue(new Response("app shell", {
      status: 200,
      headers: { "Content-Type": "text/html" },
    }));

    const response = await worker.fetch(new Request("https://belalaamer.com/"), testEnv({ fetch: assetsFetch } as unknown as Env["ASSETS"]));

    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(response.headers.get("Content-Security-Policy")).toBe("frame-ancestors 'self'");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=(self)");
  });

  it("rejects oversized patient portal email bodies before Supabase calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(new Request("https://zmedico2.belalaamer.workers.dev/api/patient-portal-email", {
      method: "POST",
      headers: { Authorization: "Bearer test-jwt", "Content-Type": "application/json" },
      body: JSON.stringify({ patient_id: "00000000-0000-0000-0000-000000000000", username: "u", temporary_password: "password", padding: "x".repeat(17_000) }),
    }), testEnv());

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an overlong portal username before authentication lookup", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(new Request("https://zmedico2.belalaamer.workers.dev/api/patient-portal-email", {
      method: "POST",
      headers: { Authorization: "Bearer test-jwt", "Content-Type": "application/json" },
      body: JSON.stringify({ patient_id: "00000000-0000-0000-0000-000000000000", username: "u".repeat(121), temporary_password: "password" }),
    }), testEnv());

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("distinguishes an unavailable authentication service from invalid credentials", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));

    const response = await worker.fetch(new Request("https://zmedico2.belalaamer.workers.dev/api/patient-portal-email", {
      method: "POST",
      headers: { Authorization: "Bearer test-jwt", "Content-Type": "application/json" },
      body: JSON.stringify({ patient_id: "00000000-0000-0000-0000-000000000000", username: "patient", temporary_password: "password" }),
    }), testEnv());

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Authentication service is unavailable" });
  });

  it("forwards the authenticated request to the Supabase function", async () => {
    const upstream = new Response(JSON.stringify({ domains: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    const fetchMock = vi.fn().mockResolvedValue(upstream);
    vi.stubGlobal("fetch", fetchMock);
    const body = JSON.stringify({ action: "list", tenant_id: "tenant-1" });

    const response = await worker.fetch(new Request("https://zmedico2.belalaamer.workers.dev/api/domains", { method: "POST", body, headers: { Authorization: "Bearer test-jwt", apikey: "public-key", "Content-Type": "application/json" } }), testEnv());
    const forwardedRequest = fetchMock.mock.calls[0]?.[0] as string;
    const forwardedInit = fetchMock.mock.calls[0]?.[1] as RequestInit;

    expect(response.status).toBe(200);
    expect(forwardedRequest).toBe("https://rqcmnfzfytyyicelvifk.supabase.co/functions/v1/manage-custom-domain");
    expect(new Headers(forwardedInit.headers).get("Authorization")).toBe("Bearer test-jwt");
    expect(new Headers(forwardedInit.headers).get("apikey")).toBe("public-key");
    expect(await response.text()).toContain("domains");
  });
});
