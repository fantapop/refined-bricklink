/**
 * E2E tests for the wanted-list-set-image feature.
 *
 * Tests that clicking a set thumbnail opens the lightbox and the images load,
 * on both the wanted list index page and the wanted list search page.
 *
 * Requires BrickLink authentication (runs in the "auth" project).
 */
import { test, expect } from "@playwright/test";
import { launchExtension } from "./helpers/extension-context.js";

test.describe("Wanted List Set Image Lightbox (auth required)", () => {
  let context;

  test.beforeAll(async () => {
    context = await launchExtension();
  });

  test.afterAll(async () => {
    await context.close();
  });

  /** Poll until an <img> element is fully loaded (naturalWidth > 0). */
  async function waitForImageLoad(locator, timeout = 15000) {
    await expect(async () => {
      const loaded = await locator.evaluate(
        (img) => img.complete && img.naturalWidth > 0
      );
      expect(loaded).toBe(true);
    }).toPass({ timeout });
  }

  test("lightbox opens from list page and main image loads", async () => {
    const page = await context.newPage();
    await page.goto("https://www.bricklink.com/v2/wanted/list.page", {
      waitUntil: "domcontentloaded",
    });

    // Wait for BrickLink's table to render before checking for extension elements
    await page.waitForSelector("table.wl-overview-list-table", { timeout: 20000 });

    // Wait for the extension to inject set thumbnails (only present if a list
    // name matches the set-number pattern — skip gracefully if none do)
    const setImg = page.locator(".rb-set-img").first();
    const found = await setImg.isVisible().catch(() => false) ||
      await expect(setImg).toBeVisible({ timeout: 10000 }).then(() => true).catch(() => false);
    if (!found) {
      test.skip(true, "No wanted lists with set-number names found — skipping list page lightbox test");
      return;
    }

    // Click the thumbnail to open the lightbox
    await setImg.click();

    // Overlay should appear (fetch + lightbox render)
    const overlay = page.locator("#rb-lightbox-overlay");
    await expect(overlay).toBeVisible({ timeout: 15000 });

    // Main image should load successfully
    const mainImg = page.locator(".rb-lil-img");
    await expect(mainImg).toBeVisible();
    await waitForImageLoad(mainImg);

    // Caption should be non-empty
    const title = page.locator(".rb-lil-title");
    await expect(title).not.toBeEmpty();

    await page.close();
  });

  test("lightbox opens from search page and main image loads", async () => {
    const page = await context.newPage();
    await page.goto("https://www.bricklink.com/v2/wanted/list.page", {
      waitUntil: "domcontentloaded",
    });

    // Wait for BrickLink's table, then for extension-injected thumbnails
    await page.waitForSelector("table.wl-overview-list-table", { timeout: 20000 });
    await expect(page.locator(".rb-set-img").first()).toBeVisible({
      timeout: 10000,
    });

    // Find the wantedMoreID for a list that has a set image (matched the pattern)
    const searchUrl = await page.evaluate(() => {
      for (const img of document.querySelectorAll(".rb-set-img")) {
        const link = img
          .closest(".rb-set-img-row")
          ?.querySelector("a[href*='wantedMoreID=']");
        if (!link) continue;
        const m = link.href.match(/wantedMoreID=(\d+)/);
        if (m)
          return `https://www.bricklink.com/v2/wanted/search.page?wantedMoreID=${m[1]}`;
      }
      return null;
    });

    expect(
      searchUrl,
      "No wanted list with a set-number name found — cannot test search page lightbox"
    ).not.toBeNull();

    await page.goto(searchUrl, { waitUntil: "domcontentloaded" });

    // Wait for the header set image to appear
    const headerImg = page.locator(".rb-set-img-header");
    await expect(headerImg).toBeVisible({ timeout: 15000 });

    // Click to open lightbox
    await headerImg.click();

    // Overlay should appear
    const overlay = page.locator("#rb-lightbox-overlay");
    await expect(overlay).toBeVisible({ timeout: 15000 });

    // Main image should load successfully
    const mainImg = page.locator(".rb-lil-img");
    await expect(mainImg).toBeVisible();
    await waitForImageLoad(mainImg);

    // Caption should be non-empty
    const title = page.locator(".rb-lil-title");
    await expect(title).not.toBeEmpty();

    await page.close();
  });
});
