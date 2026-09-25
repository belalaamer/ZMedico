/**
 * ZMedico — authenticated core-route regression suite.
 *
 * This file intentionally matches `*.admin.spec.ts` so it runs in both
 * Playwright projects already defined in `playwright.config.ts`:
 *   - admin-desktop
 *   - admin-mobile
 *
 * The suite is read-only. It verifies that the main operational surfaces
 * actually render for the seeded QA Admin instead of silently passing with
 * an empty page, an auth redirect, or an ErrorBoundary crash.
 */
import { test, expect, type Page } from "@playwright/test";

const CORE_ROUTES = [
  // Core / always-on operational surfaces: Access Denied is a regression.
  { path: "/workspace", area: "dashboard", requireAccess: true },
  { path: "/patients", area: "patients", requireAccess: true },
  { path: "/calendar", area: "calendar", requireAccess: true },
  { path: "/queue", area: "queue", requireAccess: true },
  { path: "/reminders", area: "reminders", requireAccess: true },
  { path: "/invoices", area: "invoices", requireAccess: true },
  { path: "/payments", area: "payments", requireAccess: true },
  { path: "/treasury", area: "treasury", requireAccess: true },
  { path: "/expenses", area: "expenses", requireAccess: true },
  { path: "/coupons", area: "coupons", requireAccess: true },
  { path: "/medical/records", area: "medical records", requireAccess: true },
  { path: "/medical/quick-consult", area: "quick consult", requireAccess: true },
  { path: "/medical/prescriptions", area: "prescriptions", requireAccess: true },
  { path: "/medical/documents", area: "medical documents", requireAccess: true },
  { path: "/settings", area: "settings", requireAccess: true },
  { path: "/settings/appointments", area: "appointment settings", requireAccess: true },
  { path: "/settings/invoices", area: "invoice settings", requireAccess: true },
  { path: "/settings/services", area: "services settings", requireAccess: true },
  { path: "/settings/roles", area: "role permissions", requireAccess: true },
  { path: "/settings/users", area: "user management", requireAccess: true },
  { path: "/settings/audit", area: "audit logs", requireAccess: true },

  // Optional subscription modules: still load the route/chunk and reject
  // crashes/blank pages; an explicit entitlement denial is acceptable.
  { path: "/leads", area: "leads", requireAccess: false },
  { path: "/physio", area: "physio", requireAccess: false },
  { path: "/inventory/products", area: "inventory products", requireAccess: false },
  { path: "/inventory/purchase-orders", area: "inventory purchase orders", requireAccess: false },
  { path: "/hr/staff", area: "hr staff", requireAccess: false },
  { path: "/reports/financial", area: "financial reports", requireAccess: false },
  { path: "/reports/operational", area: "operational reports", requireAccess: false },
] as const;

const FATAL_TEXT =
  /Something went wrong|The app hit an unexpected error|تعذّر تحميل الصفحة|حدث خطأ غير متوقع/i;
const ACCESS_DENIED_TEXT =
  /Access denied|You do not have permission|لا تملك صلاحية الوصول|ليس لديك صلاحية|تم رفض الوصول/i;

async function openCoreRoute(page: Page, path: string, requireAccess: boolean) {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(String(error).slice(0, 500));
  });

  await page.goto(path, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });

  // Give lazy route chunks, authz and branch context a bounded window to
  // settle. Realtime connections can keep the network busy indefinitely,
  // so this deliberately does not depend on networkidle.
  const main = page.locator("main").first();
  await expect(
    main,
    `App shell did not render <main> for ${path}`,
  ).toBeVisible({ timeout: 30_000 });

  await expect(
    page,
    `Authenticated QA session was redirected to login from ${path}`,
  ).not.toHaveURL(/\/auth(?:[/?#]|$)/);

  await expect(
    page.locator("body"),
    `Fatal error UI rendered on ${path}`,
  ).not.toContainText(FATAL_TEXT);

  if (requireAccess) {
    await expect(
      page.locator("body"),
      `Admin unexpectedly received Access Denied on core route ${path}`,
    ).not.toContainText(ACCESS_DENIED_TEXT);
  }

  // A route can be technically mounted while still being blank because of
  // a rendering/data-state regression. Require meaningful visible content,
  // while allowing legitimate zero-data / empty-state screens.
  await expect
    .poll(
      async () => (await main.innerText()).replace(/\s+/g, " ").trim().length,
      {
        timeout: 20_000,
        message: `Main content stayed blank on ${path}`,
      },
    )
    .toBeGreaterThan(8);

  const renderedSurfaces = await main
    .locator(
      [
        "h1",
        "h2",
        "h3",
        "button",
        "a",
        "input",
        "table",
        '[role="table"]',
        '[role="button"]',
        '[role="status"]',
      ].join(","),
    )
    .count();

  expect(
    renderedSurfaces,
    `No meaningful UI surface rendered on ${path}`,
  ).toBeGreaterThan(0);

  expect(
    pageErrors,
    `Uncaught browser errors on ${path}:\n${pageErrors.join("\n")}`,
  ).toEqual([]);
}

test.describe("ZMedico authenticated core routes @admin", () => {
  for (const { path, area, requireAccess } of CORE_ROUTES) {
    test(`${area} renders without blank/error state: ${path}`, async ({
      page,
    }) => {
      await openCoreRoute(page, path, requireAccess);
    });
  }
});
