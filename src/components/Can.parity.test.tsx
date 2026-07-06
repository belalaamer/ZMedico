import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

/**
 * Sprint 1 · Batch 2A — wrapper parity tests.
 *
 * Assert that <Can> and <CanExport> render identical output to the legacy
 * behavior (usePermissions().can(module, action)) after being migrated to
 * route through AuthorizationService.
 */

const mockAuthz = { authz: { can: vi.fn() }, loading: false, isAdmin: false };
vi.mock("@/lib/authz/useAuthorization", () => ({
  useAuthorization: () => mockAuthz,
}));

import { Can } from "./Can";
import { CanExport } from "./CanExport";

function legacyDecision(map: Record<string, string[]>, mod: string, action: string) {
  return (map[mod] ?? []).includes(action);
}

const CASES: Array<{ role: string; map: Record<string, string[]> }> = [
  { role: "admin-like", map: { invoices: ["view", "create", "edit", "delete", "export"] } },
  { role: "viewer", map: { invoices: ["view"] } },
  { role: "no-access", map: {} },
  { role: "export-only", map: { reports: ["view", "export"] } },
];

describe("wrapper parity · <Can>", () => {
  for (const c of CASES) {
    for (const action of ["view", "create", "edit", "delete", "export"]) {
      it(`role=${c.role} invoices.${action} matches legacy`, () => {
        mockAuthz.authz.can = vi.fn((key: string) => {
          const [m, a] = key.split(".");
          return legacyDecision(c.map, m, a);
        });
        const { container } = render(
          <Can module="invoices" action={action}>
            <span>OK</span>
          </Can>,
        );
        const legacy = legacyDecision(c.map, "invoices", action);
        expect(container.textContent === "OK").toBe(legacy);
      });
    }
  }

  it("renders fallback when denied", () => {
    mockAuthz.authz.can = vi.fn(() => false);
    const { container } = render(
      <Can module="x" action="view" fallback={<span>FB</span>}>
        <span>OK</span>
      </Can>,
    );
    expect(container.textContent).toBe("FB");
  });

  it("renders nothing while loading", () => {
    const { container } = render(
      // temporarily flip loading
      (() => {
        mockAuthz.loading = true;
        return (
          <Can module="x">
            <span>OK</span>
          </Can>
        );
      })(),
    );
    expect(container.textContent).toBe("");
    mockAuthz.loading = false;
  });
});

describe("wrapper parity · <CanExport>", () => {
  for (const c of CASES) {
    it(`role=${c.role} gates on <module>.export`, () => {
      mockAuthz.authz.can = vi.fn((key: string) => {
        const [m, a] = key.split(".");
        return legacyDecision(c.map, m, a);
      });
      const { container } = render(
        <CanExport module="reports">
          <button>PDF</button>
        </CanExport>,
      );
      const legacy = legacyDecision(c.map, "reports", "export");
      expect(container.textContent === "PDF").toBe(legacy);
    });
  }
});