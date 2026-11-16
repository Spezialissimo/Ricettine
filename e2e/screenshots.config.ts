import { defineConfig, devices } from "@playwright/test";

// Screenshot generator for the README and docs, run by scripts/screenshots.sh against the demo site.
// Not part of the normal e2e run (that config's testDir is ./tests) and not run by CI.
export default defineConfig({
  testDir: "./screenshots",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:8080",
    extraHTTPHeaders: { "X-Ricettine-Site": "demo" },
  },
  projects: [
    {
      name: "desktop",
      grep: /@desktop/,
      use: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    },
    { name: "mobile", grep: /@mobile/, use: { ...devices["Pixel 7"] } },
  ],
});
