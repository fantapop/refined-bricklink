import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { resolve } from "path";
import { launchExtension, extensionPath } from "./helpers/extension-context.js";

const { version } = JSON.parse(readFileSync(resolve(extensionPath, "manifest.json"), "utf-8"));

test.describe("Extension loading", () => {
  let context;

  test.beforeAll(async () => {
    context = await launchExtension();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("stamps version meta tag on bricklink.com", async () => {
    const page = await context.newPage();
    await page.goto("https://www.bricklink.com/v2/main.page", {
      waitUntil: "domcontentloaded",
    });

    // Content script runs at document_idle — wait for the meta tag to appear
    await page.waitForSelector('meta[name="rb-version"]', { state: "attached", timeout: 10000 });

    const pageVersion = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="rb-version"]');
      return meta ? meta.content : null;
    });

    // rb-version is the manifest version + a build timestamp suffix (e.g. "0.2.4+20260315-1342")
    expect(pageVersion).toMatch(new RegExp("^" + version.replace(/\./g, "\\.") + "(\\+\\d{8}-\\d{4})?$"));
    await page.close();
  });
});
