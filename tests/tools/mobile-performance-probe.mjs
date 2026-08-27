import { chromium } from "@playwright/test";

const baseURL = process.env.BASE_URL || "https://zmedico2.belalaamer.workers.dev";
const routes = ["/", "/auth", "/pricing", "/request-trial", "/patient-portal/login", "/check-in", "/book"];
const viewports = [
  { name: "iphone-se", width: 375, height: 667 },
  { name: "iphone-14", width: 390, height: 844 },
  { name: "pixel", width: 360, height: 800 },
];

const browser = await chromium.launch({ headless: true });
const rows = [];
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    try {
      for (const route of routes) {
        const page = await context.newPage();
        const errors = [];
        page.on("requestfailed", (request) => {
          errors.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText || "failed"}`);
        });
        page.on("pageerror", (error) => errors.push(`pageerror: ${String(error).slice(0, 300)}`));
        const started = Date.now();
        let navigationError = null;
        try {
          await page.goto(`${baseURL}${route}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
          await page.waitForTimeout(500);
        } catch (error) {
          navigationError = String(error).slice(0, 500);
        }
        const metrics = await page.evaluate(() => {
          const nav = performance.getEntriesByType("navigation")[0];
          const paints = performance.getEntriesByType("paint");
          const de = document.documentElement;
          const resources = performance.getEntriesByType("resource");
          const scripts = resources
            .filter((entry) => entry.initiatorType === "script" || /\.js(?:\?|$)/.test(entry.name))
            .map((entry) => ({
              name: entry.name,
              transferSize: entry.transferSize || 0,
              encodedBodySize: entry.encodedBodySize || 0,
              duration: entry.duration || 0,
            }))
            .sort((a, b) => b.transferSize - a.transferSize);
          return {
            url: location.href,
            title: document.title,
            rootTextLength: document.querySelector("#root")?.textContent?.trim().length || 0,
            domContentLoaded: nav?.domContentLoadedEventEnd || 0,
            responseEnd: nav?.responseEnd || 0,
            firstPaint: paints.find((entry) => entry.name === "first-paint")?.startTime || 0,
            firstContentfulPaint: paints.find((entry) => entry.name === "first-contentful-paint")?.startTime || 0,
            scrollWidth: de.scrollWidth,
            clientWidth: de.clientWidth,
            resourceCount: resources.length,
            totalTransfer: resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
            jsTransfer: scripts.reduce((sum, entry) => sum + entry.transferSize, 0),
            topScripts: scripts.slice(0, 8),
          };
        });
        rows.push({
          viewport: viewport.name,
          route,
          elapsedMs: Date.now() - started,
          finalPath: new URL(metrics.url).pathname,
          ...metrics,
          errors: navigationError ? [...errors, `navigation: ${navigationError}`] : errors,
        });
        await page.close();
      }
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ baseURL, generatedAt: new Date().toISOString(), rows }, null, 2));
