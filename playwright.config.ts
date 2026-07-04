import { defineConfig, devices } from "@playwright/test";
import path from "path";

export const STORAGE_STATE_ADMIN = path.resolve(
  __dirname,
  "tests/playwright/.auth/admin.json",
);

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";

export default defineConfig({
  testDir: "./tests/playwright",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: "setup:admin",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "admin-desktop",
      testMatch: /.*\.admin\.spec\.ts/,
      dependencies: ["setup:admin"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: STORAGE_STATE_ADMIN,
        baseURL: BASE_URL,
      },
    },
    {
      name: "admin-mobile",
      testMatch: /.*\.admin\.spec\.ts/,
      dependencies: ["setup:admin"],
      use: {
        ...devices["iPhone 14"],
        storageState: STORAGE_STATE_ADMIN,
        baseURL: BASE_URL,
      },
    },
  ],
});