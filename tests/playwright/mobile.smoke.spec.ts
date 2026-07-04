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

// CTA hints per critical area. Arabic + English. Matched against the
// button accessible name (visible text OR aria-label) because many
// mobile primary actions are icon-only FABs. If any button matches, the
// area smoke passes; we intentionally do NOT click through — no
// production data is mutated.
const INTEGRATION_CTAS: Array<{ route: string; label: RegExp }> = [
  { route: "/patients", label: /مريض|Patient|إضافة|Add|New|جديد/i },
  { route: "/calendar", label: /موعد|Appointment|جديد|New|حجز|Book/i },
  { route: "/invoices", label: /فاتورة|Invoice|جديد|New|إنشاء|Create/i },
  { route: "/payments", label: /دفع|Payment|تسجيل|Record|جديد|New/i },
  { route: "/treasury", label: /خزينة|Treasury|إغلاق|Close|جديد|New|إضافة|Add/i },
  { route: "/medical/quick-consult", label: /حفظ|Save/i },
  { route: "/medical/records", label: /سجل|Record|جديد|New|إضافة|Add|كشف|Consult/i },
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

  test("scroll container reserves space for the bottom navigation", async ({
    page,
    viewport,
  }) => {
    // Only phone widths — tablet (≥768px) hides the bottom tab bar.
    test.skip(!viewport || viewport.width >= 768, "Tablet: no bottom nav");
    await gotoStable(page, "/");
    const info = await page.evaluate(() => {
      const nav = document.querySelector<HTMLElement>(
        "nav.md\\:hidden.fixed.bottom-0, nav[aria-label][class*='bottom-0']",
      );
      const main = document.querySelector<HTMLElement>("main");
      if (!nav || !main) return { hasNav: !!nav, hasMain: !!main };
      const navH = Math.round(nav.getBoundingClientRect().height);
      const padBottom = parseFloat(getComputedStyle(main).paddingBottom) || 0;
      // Scroll to the very end and confirm the last child of main is not
      // hidden under the fixed bottom nav.
      main.scrollTo({ top: main.scrollHeight, behavior: "instant" as ScrollBehavior });
      const last = main.lastElementChild as HTMLElement | null;
      const lastBottom = last ? last.getBoundingClientRect().bottom : 0;
      const navTop = nav.getBoundingClientRect().top;
      return {
        hasNav: true,
        hasMain: true,
        navH,
        padBottom: Math.round(padBottom),
        lastBottom: Math.round(lastBottom),
        navTop: Math.round(navTop),
      };
    });
    expect(info.hasNav, "Mobile bottom nav should be present").toBe(true);
    expect(info.hasMain, "Main scroll container should be present").toBe(true);
    // The main container must reserve at least the nav's height as bottom padding.
    expect(
      info.padBottom ?? 0,
      `main paddingBottom=${info.padBottom}px is less than nav height=${info.navH}px`,
    ).toBeGreaterThanOrEqual(info.navH ?? 64);
    // When scrolled to the end, the last child's bottom edge must not
    // extend past the nav's top edge (i.e. it must be visible above the nav).
    if (info.lastBottom && info.navTop) {
      expect(
        info.lastBottom,
        `last content bottom=${info.lastBottom}px is below nav top=${info.navTop}px`,
      ).toBeLessThanOrEqual(info.navTop + 2);
    }
  });

  for (const { route, label } of INTEGRATION_CTAS) {
    test(`integration smoke — primary CTA present: ${route}`, async ({
      page,
    }) => {
      await gotoStable(page, route);
      // Match on accessible name — covers visible text AND aria-label,
      // so icon-only FABs (common mobile pattern) are counted.
      const cta = page.getByRole("button", { name: label }).first();
      await expect(
        cta,
        `No primary CTA matching ${label} on ${route}`,
      ).toBeVisible({ timeout: 8_000 });
      const box = await cta.boundingBox();
      expect(box, `CTA has no layout on ${route}`).not.toBeNull();
      // Tappable minimum: 32px tall (Apple HIG suggests 44; we allow 32
      // to avoid false positives on chip-style secondary CTAs).
      expect(
        box!.height,
        `CTA too small to tap on ${route}: h=${box!.height}`,
      ).toBeGreaterThanOrEqual(32);
    });
  }
});