import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthorizationService } from "@/lib/authz/AuthorizationService";
import { DEFAULT_PERMISSIONS } from "@/lib/rolePermissions";
import { SidebarContent } from "./Sidebar";

/**
 * P4 read from the rendered component, not from the source text:
 * roleNavigationContract.test.ts proves which gates the file declares; this
 * proves the nav that actually comes out of them — that the day list is on
 * screen without expanding anything, that a closed group is out of the
 * accessibility tree until opened, and that a group an audience does not
 * maintain is absent from the nav rather than merely collapsed.
 */
const state = vi.hoisted(() => ({ role: "receptionist", pending: 0 }));

vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: "en", t: (key: string) => key }) }));
vi.mock("@/contexts/TenantBrandingContext", () => ({ useTenantBranding: () => ({ branding: null }) }));
vi.mock("@/contexts/BranchContext", () => ({
  useBranch: () => ({
    currentBranchId: "branch-1",
    branchSelectionReady: true,
    subscription: { tenant_id: "tenant-1", plan_features: {}, subscription_status: "active" },
    isModuleEnabled: () => true,
  }),
}));
vi.mock("@/lib/realtime", () => ({ subscribeResilient: () => undefined }));
vi.mock("@/lib/platformWorkspace", () => ({ isSystemOwnerWorkspaceHandoff: () => false }));
vi.mock("@/lib/authz/useAuthorization", () => ({
  useAuthorization: () => {
    const perms = DEFAULT_PERMISSIONS[state.role] ?? {};
    const isAdmin = state.role === "admin";
    const can = (module: string, action = "view") => (perms[module] ?? []).includes(action);
    return {
      loading: false,
      authz: new AuthorizationService({ legacyCan: can, isAdmin, roles: isAdmin ? ["admin"] : [state.role] }),
    };
  },
}));

// The two badges are the only reads this component makes; both are count-only
// head queries, so the chain just has to be awaitable.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      for (const verb of ["select", "eq", "is", "neq", "in", "not", "or", "order", "limit", "gte", "lte"]) {
        chain[verb] = () => chain;
      }
      chain.then = (onValue: (result: { count: number }) => unknown) =>
        Promise.resolve({ count: state.pending }).then(onValue);
      return chain;
    },
  },
}));

/** The badge counts settle on a microtask; flush them inside act, not after. */
async function mount(initialPath = "/workspace") {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <SidebarContent />
    </MemoryRouter>,
  );
  await act(async () => {});
}

/** Every door a role is offered, open or closed — a plain DOM scan. */
const navHrefs = () =>
  Array.from(document.querySelectorAll("nav a[href]")).map((a) => (a.getAttribute("href") ?? "").split("?")[0]);

/** The section holding the flat day list: the header's own parent. */
function daySection(): HTMLElement {
  const section = screen.getByText("My day").closest("div")?.parentElement;
  if (!section) throw new Error("the day links are no longer grouped under the day header");
  return section;
}

/** Paths a role reaches without clicking anything, sorted so order can't hide a miss. */
const dayHrefs = () =>
  Array.from(daySection().querySelectorAll("a"))
    .map((a) => (a.getAttribute("href") ?? "").split("?")[0])
    .sort();

/** One collapsible group: its header button and the region its links live in. */
function group(label: string) {
  const header = screen.getByText(label).closest("button");
  const region = header?.parentElement?.querySelector('[role="region"]');
  if (!header || !region) throw new Error(`the "${label}" group is missing from the nav`);
  return { header, region: region as HTMLElement };
}

const openGroup = (label: string) => fireEvent.click(group(label).header);

afterEach(() => {
  cleanup();
  state.role = "receptionist";
  state.pending = 0;
});

describe("role-tuned sidebar (rendered)", () => {
  it("puts the desk's work on screen with nothing to expand", async () => {
    await mount();
    expect(screen.getByText("My day")).toBeInTheDocument();
    // A closed group drops its links from the accessibility tree, so the day
    // section is the only part this can assert without a click — and it is
    // exactly the part that must not need one.
    expect(dayHrefs()).toEqual([
      "/appointments/pending",
      "/calendar",
      "/invoices",
      "/leads",
      "/patients",
      "/payments",
      "/queue",
    ]);
    expect(navHrefs().join(" ")).not.toMatch(/specialties|diagnoses|medications|procedures|queue\/audit|self-audit/);
    expect(screen.queryByText("Master Catalogs")).toBeNull();
    expect(screen.queryByText("Oversight & Audits")).toBeNull();
  });

  it("counts the approvals the desk owes inside the day list", async () => {
    state.pending = 3;
    await mount();
    const pending = await screen.findByRole("link", { name: /Pending Bookings\s*3/ });
    expect(daySection().contains(pending)).toBe(true);
  });

  it("keeps clinical work one expansion away for the doctor, and money out entirely", async () => {
    state.role = "doctor";
    await mount();
    expect(dayHrefs()).toEqual([
      "/appointments/pending",
      "/calendar",
      "/leads",
      "/medical/quick-consult",
      "/patients",
      "/queue",
    ]);
    expect(navHrefs().join(" ")).not.toMatch(/invoices|payments|treasury|coupons|expenses/);

    const care = group("Care & Follow-ups");
    // Closed means unreachable, not only shrunken: the region is hidden from
    // assistive tech and its links hold no tab stop.
    expect(within(care.region).queryByRole("link", { name: "medicalRecords" })).toBeNull();
    expect(care.region).toHaveAttribute("aria-hidden", "true");
    openGroup("Care & Follow-ups");
    const records = within(care.region).getByRole("link", { name: "medicalRecords" });
    expect(records).toHaveAttribute("href", "/medical/records?branch=branch-1");
    expect(records).toHaveAttribute("tabindex", "0");
    expect(screen.queryByText("Master Catalogs")).toBeNull();
    expect(screen.queryByText("Oversight & Audits")).toBeNull();
  });

  it("leaves the owner the maintenance screens, behind their own groups", async () => {
    state.role = "admin";
    await mount();
    const catalogs = group("Master Catalogs");
    const oversight = group("Oversight & Audits");
    expect(screen.getByText("Setup & Admin")).toBeInTheDocument();
    openGroup("Master Catalogs");
    expect(within(catalogs.region).getByRole("link", { name: "diagnoses" }))
      .toHaveAttribute("href", "/medical/diagnoses?branch=branch-1");
    openGroup("Oversight & Audits");
    expect(within(oversight.region).getAllByRole("link").map((a) => a.getAttribute("href")))
      .toEqual(expect.arrayContaining(["/queue/audit?branch=branch-1", "/system/self-audit?branch=branch-1"]));
  });
});
