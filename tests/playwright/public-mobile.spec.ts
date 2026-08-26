import { test, expect, Page } from "@playwright/test";

const PUBLIC_ROUTES = [
  "/auth",
  "/pricing",
  "/request-trial",
  "/patient-portal/login",
  "/check-in",
  "/book",
] as const;

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
