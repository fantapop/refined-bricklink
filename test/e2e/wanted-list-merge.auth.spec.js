/**
 * E2E tests for the wanted-list-merge feature.
 * Tests the "Add Lists" button and modal on the wanted list search page.
 * Does NOT submit a merge to avoid modifying real wanted list data.
 *
 * Requires BrickLink authentication (runs in the "auth" project).
 */
import { test, expect } from "@playwright/test";
import { launchExtension } from "./helpers/extension-context.js";

test.describe("Add Lists (wanted-list-merge) (auth required)", () => {
  let context;
  let page;
  let searchPageUrl;

  test.beforeAll(async () => {
    context = await launchExtension();

    // Find a wanted list search page URL from the list index
    const setupPage = await context.newPage();
    await setupPage.goto("https://www.bricklink.com/v2/wanted/list.page", {
      waitUntil: "domcontentloaded",
    });

    // Wait for the table to render before querying links
    await setupPage.waitForSelector("table.wl-overview-list-table", { timeout: 15000 });

    searchPageUrl = await setupPage.evaluate(() => {
      const links = document.querySelectorAll('a[href*="wantedMoreID="]');
      for (const link of links) {
        const row = link.closest("tr");
        if (!row) continue;
        // Prefer lists that have at least one item
        const cells = row.querySelectorAll("td");
        for (const cell of cells) {
          const num = parseInt(cell.textContent.trim(), 10);
          if (num > 0) return link.href;
        }
      }
      // Fall back to first link regardless of item count
      return links[0] ? links[0].href : null;
    });

    await setupPage.close();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.skip(!searchPageUrl, "No wanted list found — create at least one wanted list");

    page = await context.newPage();
    await page.goto(searchPageUrl, { waitUntil: "domcontentloaded" });

    // Enter edit mode so the toolbar with "Add Lists" appears
    await expect(page.locator(".table-wl-edit")).toBeVisible({ timeout: 15000 });
    await page.locator(".wl-hover-editable").first().click();
    await expect(
      page.locator("button", { hasText: "Add Lists" })
    ).toBeVisible({ timeout: 10000 });
  });

  test.afterEach(async () => {
    await page.close();
  });

  // ── Button ───────────────────────────────────────────────────────────────

  test("Add Lists button appears in the toolbar", async () => {
    await expect(
      page.locator(".btn-group.l-inline-block button", { hasText: "Add Lists" })
    ).toBeVisible({ timeout: 5000 });
  });

  // ── Modal opening ─────────────────────────────────────────────────────────

  test("clicking Add Lists opens the merge modal", async () => {
    await page.locator(".btn-group.l-inline-block button", { hasText: "Add Lists" }).click();

    await expect(page.locator(".rb-merge-overlay")).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".rb-merge-modal")).toBeVisible();
  });

  test("modal title includes current list name", async () => {
    await page.locator(".btn-group.l-inline-block button", { hasText: "Add Lists" }).click();

    await expect(page.locator(".rb-merge-title")).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".rb-merge-title")).toContainText("Add Lists to");
  });

  // ── List column ───────────────────────────────────────────────────────────

  test("modal shows other wanted lists or empty state", async () => {
    await page.locator(".btn-group.l-inline-block button", { hasText: "Add Lists" }).click();
    await expect(page.locator(".rb-merge-list")).toBeVisible({ timeout: 5000 });

    const items = page.locator(".rb-merge-list .rb-merge-item");
    const empty = page.locator(".rb-merge-list .rb-merge-empty");
    const hasItems = (await items.count()) > 0;
    const hasEmpty = await empty.isVisible();
    expect(hasItems || hasEmpty).toBe(true);
  });

  test("current list is excluded from the list", async () => {
    // Get the current list name from the page title
    const currentName = await page.evaluate(() => {
      const m = document.querySelector("script:not([src])")?.textContent?.match(
        /wantedListInfo.*?"name"\s*:\s*"([^"]+)"/
      );
      return m ? m[1] : null;
    });

    await page.locator(".btn-group.l-inline-block button", { hasText: "Add Lists" }).click();
    await expect(page.locator(".rb-merge-list")).toBeVisible({ timeout: 5000 });

    if (currentName) {
      const matchingItems = page.locator(".rb-merge-list .rb-merge-item", {
        hasText: currentName,
      });
      await expect(matchingItems).toHaveCount(0);
    }
  });

  test("search filter hides non-matching lists", async () => {
    await page.locator(".btn-group.l-inline-block button", { hasText: "Add Lists" }).click();

    const items = page.locator(".rb-merge-list .rb-merge-item");
    if ((await items.count()) === 0) test.skip();

    await page.locator(".rb-merge-search").fill("zzz_no_match_xqz");

    const visible = page.locator(".rb-merge-list .rb-merge-item:not(.rb-hidden)");
    await expect(visible).toHaveCount(0);
  });

  test("clearing search filter restores the list", async () => {
    await page.locator(".btn-group.l-inline-block button", { hasText: "Add Lists" }).click();

    const items = page.locator(".rb-merge-list .rb-merge-item");
    if ((await items.count()) === 0) test.skip();
    const totalCount = await items.count();

    await page.locator(".rb-merge-search").fill("zzz_no_match_xqz");
    await page.locator(".rb-merge-search").fill("");

    await expect(
      page.locator(".rb-merge-list .rb-merge-item:not(.rb-hidden)")
    ).toHaveCount(totalCount);
  });

  // ── Submit button state ───────────────────────────────────────────────────

  test("submit button is disabled when nothing is selected", async () => {
    await page.locator(".btn-group.l-inline-block button", { hasText: "Add Lists" }).click();
    await expect(page.locator(".rb-merge-submit")).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".rb-merge-submit")).toBeDisabled();
  });

  test("submit button enables after selecting a list", async () => {
    await page.locator(".btn-group.l-inline-block button", { hasText: "Add Lists" }).click();

    const firstItem = page.locator(".rb-merge-list .rb-merge-item").first();
    if ((await firstItem.count()) === 0) test.skip();

    await firstItem.click();
    await expect(page.locator(".rb-merge-submit")).toBeEnabled({ timeout: 3000 });
  });

  test("select all checkbox checks all visible items", async () => {
    await page.locator(".btn-group.l-inline-block button", { hasText: "Add Lists" }).click();

    const items = page.locator(".rb-merge-list .rb-merge-item");
    if ((await items.count()) === 0) test.skip();

    await page.locator(".rb-merge-select-all").check();

    const unchecked = page.locator(
      ".rb-merge-list .rb-merge-item:not(.rb-hidden) input:not(:checked)"
    );
    await expect(unchecked).toHaveCount(0);
    await expect(page.locator(".rb-merge-submit")).toBeEnabled();
  });

  // ── Modal closing ─────────────────────────────────────────────────────────

  test("Cancel button closes the modal", async () => {
    await page.locator(".btn-group.l-inline-block button", { hasText: "Add Lists" }).click();
    await expect(page.locator(".rb-merge-modal")).toBeVisible({ timeout: 5000 });

    await page.locator(".rb-merge-cancel").click();
    await expect(page.locator(".rb-merge-overlay")).not.toBeVisible();
  });

  test("close button (×) closes the modal", async () => {
    await page.locator(".btn-group.l-inline-block button", { hasText: "Add Lists" }).click();
    await expect(page.locator(".rb-merge-modal")).toBeVisible({ timeout: 5000 });

    await page.locator(".rb-merge-close").click();
    await expect(page.locator(".rb-merge-overlay")).not.toBeVisible();
  });

  test("clicking the overlay backdrop closes the modal", async () => {
    await page.locator(".btn-group.l-inline-block button", { hasText: "Add Lists" }).click();
    await expect(page.locator(".rb-merge-modal")).toBeVisible({ timeout: 5000 });

    // Click the overlay area outside the modal (top-left corner of viewport)
    await page.locator(".rb-merge-overlay").click({ position: { x: 5, y: 5 } });
    await expect(page.locator(".rb-merge-overlay")).not.toBeVisible();
  });
});
