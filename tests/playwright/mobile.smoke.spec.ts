/**
 * ZMedico — Mobile smoke suite (authenticated Admin).
 *
 * Runs the same spec once per mobile viewport project defined in
 * `playwright.config.ts` (`mobile-smoke:iphone-se`, `:iphone-14`,
 * `:pixel`, `:ipad-mini`). Reuses the seeded Admin `storageState`
 * produced by `auth.setup.ts` — no app code, no auth code touched.
 *
 * Checks per route:
 *   1. No horizontal page overflow
 *      (documentElement.scrollWidth <= clientWidth).
 *   2. RTL stays intact (dir="rtl", lang="ar").
 *   3. Zero uncaught page errors while loading.
 *   4. Bottom nav (if present) does not cover the last CTA/card.
 *
 * Plus lightweight integration smoke: each critical area has at least
 * one visible tappable primary CTA (create/new/save button).
 *
 * Run:
 *   BASE_URL=... ADMIN_EMAIL=... ADMIN_PASS=... \
 *     npx playwright test --project=mobile-smoke:iphone-14
 *   # or all four viewports:
 *   npx playwright test mobile.smoke.spec.ts
 */
import { test, expect, Page } from "@playwright/test";

const ROUTES = [
  "/",
  "/patients",
  "/calendar",
  "/queue",
  "/invoices",
  "/invoices/outstanding",
  "/payments",
  "/treasury",
  "/expenses",
  "/coupons",
  "/medical/records",
  "/medical/quick-consult",
  "/medical/prescriptions",
  "/physio",
  "/physio/dashboard",
  "/physio/followups",
  "/inventory",
  "/inventory/products",
  "/inventory/suppliers",
  "/inventory/purchase-orders",
  "/inventory/alerts",
  "/hr/staff",
  "/hr/schedules",
  "/hr/attendance",
  "/hr/payroll",
  "/hr/leaves",
  "/reports",
  "/branches",
  "/settings",
  "/settings/users",
] as const;

// CTA hints per critical area. Arabic + English, matched loosely on the
// visible button text. If the button exists at all on the page the area
// smoke passes; we intentionally do NOT click through to avoid mutating
// production data.
const INTEGRATION_CTAS: Array<{ route: string; label: RegExp }> = [
  { route: "/patients", label: /مريض|Patient|إضافة|Add|New|جديد/i },
  { route: "/calendar", label: /موعد|Appointment|جديد|New|حجز|Book/i },
  { route: "/invoices", label: /فاتورة|Invoice|جديد|New|إنشاء|Create/i },
  { route: "/payments", label: /دفع|Payment|تسجيل|Record|جديد|New/i },
  { route: "/treasury", label: /خزينة|Treasury|إغلاق|Close|جديد|New|إضافة|Add/i },
  { route: "/medical/quick-consult", label: /حفظ|Save/i },
  { route: "/medical/records", label: /سجل|Record|جديد|New|إضافة|Add/i },
  { route: "/physio", label: /حالة|Case|جديد|New|إضافة|Add/i },
  { route: "/inventory/products", label: /منتج|Product|جديد|New|إضافة|Add/i },
  { route: "/hr/staff", label: /موظف|Staff|جديد|New|إضافة|Add/i },
  { route: "/settings", label: /حفظ|Save|عام|General|إعدادات|Settings/i },
];

async function gotoStable(page: Page, path: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  await page.goto(path, { waitUntil: "networkidle", timeout: 45_000 });
  // Let RTL/layout settle after hydration.
  await page.waitForTimeout(800);
  return errors;
}

async function measureOverflow(page: Page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    return {
      scrollW: de.scrollWidth,
      clientW: de.clientWidth,
      dir: de.dir,
      lang: de.lang,
    };
  });
}

test.describe("ZMedico mobile smoke @mobile", () => {
  for (const route of ROUTES) {
    test(`no horizontal overflow + RTL intact: ${route}`, async ({ page }) => {
      const errors = await gotoStable(page, route);

      const m = await measureOverflow(page);
      expect(
        m.scrollW,
        `Horizontal overflow on ${route}: scrollWidth=${m.scrollW} > clientWidth=${m.clientW}`,
      ).toBeLessThanOrEqual(m.clientW + 1);

      expect(m.dir, `RTL lost on ${route}`).toBe("rtl");
      expect(m.lang, `lang not Arabic on ${route}`).toMatch(/^ar/i);

      expect(
        errors,
        `Uncaught page errors on ${route}:\n${errors.join("\n")}`,
      ).toEqual([]);
    });
  }

  test("bottom navigation does not cover the last visible card", async ({
    page,
    viewport,
  }) => {
    // Only meaningful on phone-sized viewports where the bottom tab bar shows.
    test.skip(!viewport || viewport.width >= 600, "Tablet: no bottom nav");
    await gotoStable(page, "/");
    const overlap = await page.evaluate(() => {
      const nav = document.querySelector<HTMLElement>(
        "nav[aria-label*=bottom i], nav.fixed.bottom-0, [data-mobile-tabbar]",
      );
      if (!nav) return { hasNav: false, overlap: 0 };
      const nr = nav.getBoundingClientRect();
      // Find any card/section that ends within the nav band.
      const cards = Array.from(
        document.querySelectorAll<HTMLElement>(
          "main [class*=card i], main section, main article",
        ),
      );
      let worst = 0;
      for (const el of cards) {
        const r = el.getBoundingClientRect();
        if (r.bottom > nr.top && r.top < nr.top) {
          worst = Math.max(worst, r.bottom - nr.top);
        }
      }
      return { hasNav: true, overlap: Math.round(worst) };
    });
    // Allow up to 8px overlap for shadows; anything larger means content is hidden.
    expect(overlap.overlap, "Bottom nav overlaps content").toBeLessThanOrEqual(8);
  });

  for (const { route, label } of INTEGRATION_CTAS) {
    test(`integration smoke — primary CTA present: ${route}`, async ({
      page,
    }) => {
      await gotoStable(page, route);
      const cta = page.getByRole("button").filter({ hasText: label }).first();
      await expect(
        cta,
        `No primary CTA matching ${label} on ${route}`,
      ).toBeVisible({ timeout: 8_000 });
      const box = await cta.boundingBox();
      expect(box, `CTA has no layout on ${route}`).not.toBeNull();
      // Tappable minimum: at least 32px tall (Apple HIG 44 is ideal, we allow 32 to avoid false positives on chip-style CTAs).
      expect(
        box!.height,
        `CTA too small to tap on ${route}: h=${box!.height}`,
      ).toBeGreaterThanOrEqual(32);
    });
  }
});