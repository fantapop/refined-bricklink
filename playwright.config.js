import { defineConfig } from "@playwright/test";

export default defineConfig({
  globalSetup: "./test/e2e/global-setup.js",
  testDir: "./test/e2e",
  timeout: 60000,
  expect: { timeout: 10000 },
  workers: 1,
  projects: [
    {
      name: "auth-setup",
      testMatch: "auth.setup.js",
    },
    {
      name: "no-auth",
      testMatch: "*.spec.js",
      testIgnore: "*.auth.spec.js",
    },
    {
      name: "auth",
      testMatch: "*.auth.spec.js",
      dependencies: ["auth-setup"],
    },
  ],
});
