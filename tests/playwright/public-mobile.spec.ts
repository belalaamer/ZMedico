import { test, expect, Page } from "@playwright/test";

const PUBLIC_ROUTES = [
  "/auth",
  "/pricing",
  "/request-trial",
  "/patient-portal/login",
  "/check-in",
  "/book",
] as const;

// Smoke only: never allow a page side effect to write to a connected backend.
// Read-only RPCs also use POST and are intentionally blocked in this suite;
// authenticated/API integration is a separate, isolated-fixture requirement.
test.beforeEach(async ({ page }) => {
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname.endsWith(".supabase.co") && !["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "External mutations disabled in public QA" }) });
      return;
    }
    await route.continue();
  });
});

async function openPublicPage(page: Page, path: string) {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error).slice(0, 300)));
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(700);
  return pageErrors;
}

async function assertNoHorizontalOverflow(page: Page, path: string) {
  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    rootText: document.querySelector("#root")?.textContent?.trim() ?? "",
  }));
  expect(
    layout.scrollWidth,
    `Horizontal overflow on ${path}: scrollWidth=${layout.scrollWidth} > clientWidth=${layout.clientWidth}`,
  ).toBeLessThanOrEqual(layout.clientWidth + 1);
  expect(layout.rootText, `Blank root on ${path}`).not.toBe("");
}

test.describe("public unauthenticated mobile smoke", () => {
  for (const route of ["/patients", "/queue"]) {
    test(`protected direct URL stays behind login after refresh: ${route}`, async ({ page }) => {
      const errors = await openPublicPage(page, route);
      await expect(page).toHaveURL(/\/auth(?:[?#].*)?$/);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/auth(?:[?#].*)?$/);
      await assertNoHorizontalOverflow(page, route);
      expect(errors).toEqual([]);
    });
  }
  test("landing menu exposes staff sign-in and remains tappable", async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width >= 600, "Tablet/desktop uses the full header actions");
    const errors = await openPublicPage(page, "/");
    await assertNoHorizontalOverflow(page, "/");

    const menuButton = page.getByRole("button", {
      name: /فتح القائمة|open menu/i,
    });
    await expect(menuButton, "Mobile landing menu trigger is missing").toBeVisible();
    await menuButton.click();

    const signIn = page.getByRole("link", {
      name: /تسجيل الدخول|sign in/i,
    });
    await expect(signIn, "Sign in is missing from the mobile landing menu").toBeVisible();
    await expect(signIn).toHaveAttribute("href", "/auth");
    const box = await signIn.boundingBox();
    expect(box, "Mobile Sign in link has no layout").not.toBeNull();
    expect(box!.height, "Mobile Sign in target is too small").toBeGreaterThanOrEqual(32);
    expect(errors, `Uncaught errors on /:\n${errors.join("\n")}`).toEqual([]);
  });

  for (const route of PUBLIC_ROUTES) {
    test(`public route loads without blank root or runtime errors: ${route}`, async ({ page }) => {
      const errors = await openPublicPage(page, route);
      await assertNoHorizontalOverflow(page, route);
      expect(errors, `Uncaught errors on ${route}:\n${errors.join("\n")}`).toEqual([]);
    });
  }
});
