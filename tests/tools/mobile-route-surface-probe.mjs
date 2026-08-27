import { chromium } from "@playwright/test";

const baseURL = process.env.BASE_URL || "https://zmedico2.belalaamer.workers.dev";
const routes = [
  "/", "/auth", "/pricing", "/request-trial", "/patient-portal/login", "/check-in", "/book", "/trust",
  "/workspace", "/patients", "/patients/test", "/leads", "/leads/analytics", "/leads/test", "/calendar", "/queue", "/queue/audit", "/queue/self-audit", "/appointments/test",
  "/invoices", "/invoices/outstanding", "/invoices/test", "/payments", "/treasury", "/treasury/daily-close", "/expenses", "/expenses/self-audit", "/physio", "/physio/dashboard", "/physio/reports", "/physio/followups", "/physio/test", "/coupons", "/reminders", "/reminders/scheduled",
  "/inventory", "/inventory/stock", "/inventory/products", "/inventory/products/test", "/inventory/categories", "/inventory/suppliers", "/inventory/purchase-orders", "/inventory/purchase-orders/test", "/inventory/alerts",
  "/medical/records", "/medical/records/test", "/medical/consultation/test", "/medical/quick-consult", "/medical/prescriptions", "/medical/prescriptions/test", "/medical/documents", "/patients/test/dental", "/medical/specialties", "/medical/diagnoses", "/medical/medications", "/medical/procedures",
  "/hr/departments", "/hr/positions", "/hr/staff", "/hr/staff/test", "/hr/schedules", "/hr/attendance", "/hr/leaves", "/hr/payroll", "/hr/pending-commissions", "/hr/performance", "/hr/target-bonuses",
  "/reports", "/reports/financial", "/reports/operational", "/reports/medical", "/reports/hr", "/reports/inventory", "/reports/scheduled", "/reports/commissions", "/reports/doctor-performance",
  "/branches", "/branches/dashboard", "/settings", "/settings/general", "/settings/appointments", "/settings/invoices", "/settings/payments", "/settings/services", "/settings/insurance", "/settings/insurance-contracts", "/settings/communication", "/settings/languages", "/settings/roles", "/settings/users", "/settings/backup", "/settings/audit", "/settings/system", "/settings/qa", "/system/self-audit", "/platform",
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const rows = [];
try {
  for (const route of routes) {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${String(error).slice(0, 240)}`));
    page.on("requestfailed", (request) => errors.push(`request: ${request.url()} :: ${request.failure()?.errorText || "failed"}`));
    let navigationError = null;
    const started = Date.now();
    try {
      await page.goto(`${baseURL}${route}`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.waitForTimeout(300);
    } catch (error) {
      navigationError = String(error).slice(0, 300);
    }
    const surface = await page.evaluate(() => ({
      finalPath: location.pathname,
      rootTextLength: document.querySelector("#root")?.textContent?.trim().length || 0,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      title: document.title,
    })).catch(() => ({ finalPath: "", rootTextLength: 0, scrollWidth: 0, clientWidth: 0, title: "" }));
    rows.push({ route, ...surface, elapsedMs: Date.now() - started, errors: navigationError ? [...errors, `navigation: ${navigationError}`] : errors });
    await page.close();
  }
} finally {
  await context.close();
  await browser.close();
}
console.log(JSON.stringify({ baseURL, viewport: { width: 390, height: 844 }, generatedAt: new Date().toISOString(), rows }, null, 2));
