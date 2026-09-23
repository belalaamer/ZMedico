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
  { path: "/workspace", area: "dashboard" },
  { path: "/patients", area: "patients" },
  { path: "/calendar", area: "calendar" },
  { path: "/queue", area: "queue" },
  { path: "/invoices", area: "invoices" },
  { path: "/treasury", area: "treasury" },
  { path: "/physio", area: "physio" },
  { path: "/hr/staff", area: "hr" },
  { path: "/settings", area: "settings" },
] as const;

const FATAL_TEXT =
  /Something went wrong|The app hit an unexpected error|تعذّر تحميل الصفحة|حدث خطأ غير متوقع/i;

async function openCoreRoute(page: Page, path: string) {
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
  for (const { path, area } of CORE_ROUTES) {
    test(`${area} renders without blank/error state: ${path}`, async ({
      page,
    }) => {
      await openCoreRoute(page, path);
    });
  }
});
