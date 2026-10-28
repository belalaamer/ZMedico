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

// ---------------------------------------------------------------------------
// P10 — the booking screen's three-step indicator on a phone.
//
// This can only be measured in a browser. jsdom has no layout engine, so a unit
// test cannot see a label breaking mid-phrase or a badge drifting onto another
// baseline; it would assert the same string either way.
//
// The screen needs tenant options before it renders the indicator at all, and
// `/book` with no clinic resolves to the incomplete-link card — which is why the
// existing `/book` overflow check above never looked at it. Every RPC the page
// makes is answered from the fixture below, and an RPC outside the fixture is a
// hard failure rather than a request that leaves the process: the repo's tracked
// .env points the dev server at Production, so "intercepted everything" is part
// of the safety argument, not a detail.
const FIXTURE_TENANT_ID = "11111111-1111-4111-8111-111111111111";
// Four slots so step 2 renders its grid: the row of time buttons is the part of
// this screen most likely to be squeezed by a narrow phone, and an empty list
// would hide it behind the "no available times" card.
const BOOKING_FIXTURE_SLOTS = [
  { slot_start: "2026-11-03T09:00:00", slot_end: "2026-11-03T09:30:00", available: true },
  { slot_start: "2026-11-03T11:30:00", slot_end: "2026-11-03T12:00:00", available: true },
  { slot_start: "2026-11-03T13:15:00", slot_end: "2026-11-03T13:45:00", available: true },
  { slot_start: "2026-11-03T16:45:00", slot_end: "2026-11-03T17:15:00", available: false },
];
const BOOKING_RPC_FIXTURES: Record<string, unknown> = {
  public_booking_tenant_by_slug: [{ tenant_id: FIXTURE_TENANT_ID }],
  patient_portal_booking_context: null,
  list_doctors_for_service: [],
  public_booking_slots_for_tenant: BOOKING_FIXTURE_SLOTS,
  public_booking_options_for_tenant: {
    tenant_id: FIXTURE_TENANT_ID,
    tenant_name: "QA Fixture Clinic",
    tenant_name_en: "QA Fixture Clinic",
    tenant_name_ar: "عيادة نموذجية",
    tenant_slug: "qa-fixture",
    branches: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        name_en: "Main branch",
        name_ar: "الفرع الرئيسي",
        address: null,
        phone: null,
        city: null,
        working_hours_start: null,
        working_hours_end: null,
        working_days: [0, 1, 2, 3, 4, 5, 6],
        max_future_booking_days: 30,
        min_advance_booking_hours: 0,
        slot_duration_minutes: 30,
        require_confirmation: false,
      },
    ],
    services: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        name_en: "Consultation",
        name_ar: "كشف",
        duration_minutes: 30,
        source: "service",
      },
    ],
    doctors: [],
  },
};

async function openBookingScreenWithFixture(page: Page, lang: "ar" | "en") {
  const asked: string[] = [];
  // Registered after the file-level guard, so it wins for these paths; anything
  // unnamed is refused here rather than forwarded.
  await page.route("**/rest/v1/rpc/**", async (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.split("/rpc/")[1] ?? "");
    asked.push(name);
    if (!(name in BOOKING_RPC_FIXTURES)) {
      return route.fulfill({ status: 501, contentType: "application/json", body: JSON.stringify({ message: `unstubbed rpc ${name}` }) });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(BOOKING_RPC_FIXTURES[name]),
    });
  });
  await page.addInitScript((value) => localStorage.setItem("zmedico.lang", value), lang);
  await page.goto("/book?tenant=qa-fixture", { waitUntil: "domcontentloaded", timeout: 45_000 });
  await expect(page.locator("[data-booking-steps]"), "booking options did not load from the fixture").toBeAttached({ timeout: 10_000 });
  return asked;
}

type StepGeometry = {
  rowOverflowX: number;
  docOverflowX: number;
  rowHeight: number;
  labels: Array<{ text: string; lines: number; right: number; left: number; width: number }>;
  separatorsShown: number;
};

async function measureSteps(page: Page): Promise<StepGeometry> {
  return page.locator("[data-booking-steps]").evaluate((row) => {
    const labels = [...row.querySelectorAll("[data-booking-step-label]")].map((label) => {
      const rect = label.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(label);
      // Distinct tops, not raw rects: a bidi label ("١٤ يومًا") yields one client
      // rect per directional fragment while sitting on a single line, which would
      // make a correct Arabic render fail this test.
      const tops = new Set(
        [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0).map((r) => Math.round(r.top)),
      );
      return {
        text: (label.textContent ?? "").trim(),
        lines: tops.size,
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
      };
    });
    const separators = [...row.children].filter((child) => child.textContent?.trim() === "/");
    const doc = document.documentElement;
    return {
      rowOverflowX: row.scrollWidth - row.clientWidth,
      docOverflowX: doc.scrollWidth - doc.clientWidth,
      rowHeight: Math.round(row.getBoundingClientRect().height),
      labels,
      separatorsShown: separators.filter((s) => getComputedStyle(s).display !== "none").length,
    };
  });
}

for (const lang of ["ar", "en"] as const) {
  test(`the three booking steps stay readable on a phone (${lang})`, async ({ page, viewport }) => {
    const width = viewport?.width ?? 0;
    const asked = await openBookingScreenWithFixture(page, lang);
    const geometry = await measureSteps(page);

    // Nothing the screen says may be cut off, and the page may not scroll sideways.
    expect(geometry.rowOverflowX, `step row overflows its own box by ${geometry.rowOverflowX}px`).toBeLessThanOrEqual(1);
    expect(geometry.docOverflowX, `document scrolls sideways by ${geometry.docOverflowX}px`).toBeLessThanOrEqual(1);

    // The three labels all render, at a real size — the fix may not be "hide two
    // of them", which would pass an overflow assertion and lose the information.
    expect(geometry.labels.map((l) => l.text), "the indicator lost a step label").toHaveLength(3);
    for (const label of geometry.labels) {
      expect(label.width, `"${label.text}" has no width`).toBeGreaterThan(0);
      expect(label.lines, `"${label.text}" broke across ${label.lines} lines`).toBe(1);
      expect(label.left, `"${label.text}" starts off the left edge`).toBeGreaterThanOrEqual(-1);
      expect(label.right, `"${label.text}" runs past the ${width}px screen`).toBeLessThanOrEqual(width + 1);
    }

    // The slashes are the only thing given up below 640px, and only because an
    // orphaned one at a line end reads as a broken list.
    expect(geometry.separatorsShown, `${width}px shows ${geometry.separatorsShown} separators`).toBe(width >= 640 ? 2 : 0);

    // Proves the fixture, not Production, answered: four named reads and nothing else.
    expect([...new Set(asked)].sort(), [
      "list_doctors_for_service",
      "patient_portal_booking_context",
      "public_booking_options_for_tenant",
      "public_booking_slots_for_tenant",
      "public_booking_tenant_by_slug",
    ].sort());
  });
}

// ---------------------------------------------------------------------------
// P10 (second half) — the whole booking flow, not just its header.
//
// The indicator fix was measured on step 1 only, so the same defect class was
// swept across all three steps instead of being assumed away. It found one: the
// "Find earliest availability within 14 days" button inherits whitespace-nowrap
// from the shared Button base, and at 320 px English its box measured 289 px
// inside a 246 px column — past its own card and 6 px off the device.
type LayoutOffender = { kind: string; label: string; text: string; over: number };

// Runs in the page. An element is an offender when it hangs past the screen, or
// when its own content is wider than its box and nothing is clipping it (an
// `overflow-x: auto` container is allowed to scroll, so it is not one).
function collectLayoutOffenders(screenWidth: number): { counted: number; offenders: LayoutOffender[] } {
  const offenders: LayoutOffender[] = [];
  let counted = 0;
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (cs.position === "fixed") continue;
    counted++;
    const label = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}`;
    const text = (el.textContent ?? "").trim().slice(0, 40);
    if (rect.right > screenWidth + 1 || rect.left < -1) {
      offenders.push({ kind: "offscreen", label, text, over: Math.round(Math.max(rect.right - screenWidth, -rect.left)) });
    } else if (el.scrollWidth - el.clientWidth > 1 && cs.overflowX === "visible") {
      offenders.push({ kind: "spills", label, text, over: el.scrollWidth - el.clientWidth });
    }
  }
  return { counted, offenders: offenders.slice(0, 12) };
}

const READ_ONLY_BOOKING_RPCS = [
  "list_doctors_for_service",
  "patient_portal_booking_context",
  "public_booking_options_for_tenant",
  "public_booking_slots_for_tenant",
  "public_booking_tenant_by_slug",
];

for (const lang of ["ar", "en"] as const) {
  test(`every booking step fits the screen edge to edge (${lang})`, async ({ page, viewport }) => {
    const width = viewport?.width ?? 0;
    const asked = await openBookingScreenWithFixture(page, lang);

    const sweep = async (step: string) => {
      const { counted, offenders } = await page.evaluate(collectLayoutOffenders, width);
      expect(counted, `step "${step}" rendered ${counted} elements — it did not load`).toBeGreaterThan(40);
      expect(offenders, `step "${step}" puts content outside a ${width}px screen:\n${JSON.stringify(offenders, null, 2)}`).toEqual([]);
    };

    await sweep("branch & service");

    await page.selectOption("#booking-service", { index: 1 });
    await page.locator('section[aria-labelledby="booking-step-one"] button.w-full').click();
    await expect(page.locator('section[aria-labelledby="booking-step-two"]')).toBeVisible({ timeout: 10_000 });
    await sweep("time");

    const availability = page.locator('section[aria-labelledby="booking-step-two"] button', { hasText: /availability|موعد متاح/ });
    const box = await availability.boundingBox();
    expect(box, "the earliest-availability control has no layout").not.toBeNull();
    expect(box!.x + box!.width, `the earliest-availability button ends ${Math.round(box!.x + box!.width - width)}px past a ${width}px screen`).toBeLessThanOrEqual(width + 1);

    await page.locator('section[aria-labelledby="booking-step-two"] .grid button').first().click();
    await page.locator('section[aria-labelledby="booking-step-two"] button.w-full').click();
    await expect(page.locator('form[aria-labelledby="booking-step-three"]')).toBeVisible({ timeout: 10_000 });
    await sweep("your details");

    // Self-probe: an audit that reports nothing is indistinguishable from an
    // audit that cannot see. Inject a known offender and require this same
    // function to name it, then remove it.
    await page.evaluate((w) => {
      const el = document.createElement("div");
      el.id = "layout-audit-control";
      el.textContent = "deliberately placed past the right edge";
      el.style.cssText = `position:absolute;top:0;left:${w + 40}px;width:200px;height:20px;`;
      document.body.appendChild(el);
    }, width);
    const control = await page.evaluate(collectLayoutOffenders, width);
    await page.evaluate(() => document.getElementById("layout-audit-control")?.remove());
    expect(
      control.offenders.some((o) => o.kind === "offscreen" && o.label === "div#layout-audit-control"),
      "the layout audit did not see a deliberately off-screen element, so its clean results mean nothing",
    ).toBe(true);

    // Clicking through three steps must still never have asked to write: the
    // submit button on step 3 is deliberately left alone.
    expect(
      [...new Set(asked)].filter((name) => !READ_ONLY_BOOKING_RPCS.includes(name)),
      "the walk-through reached beyond the fixture's read-only RPCs",
    ).toEqual([]);
  });
}

