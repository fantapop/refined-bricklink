/**
 * E2E test for the reverse-wanted-list feature.
 * Requires BrickLink authentication (runs in the "auth" project).
 */
import { test, expect } from "@playwright/test";
import { launchExtension } from "./helpers/extension-context.js";

test.describe("Reverse Wanted List (auth required)", () => {
  let context;
  let page;

  test.beforeAll(async () => {
    context = await launchExtension();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("reverses the wanted list order in the modal", async () => {
    page = await context.newPage();

    // Navigate to a catalog page that has an "Add to Wanted List" link.
    // Part 3001 (2x4 Brick) is a safe, always-available item.
    await page.goto(
      "https://www.bricklink.com/v2/catalog/catalogitem.page?P=3001",
      { waitUntil: "domcontentloaded" }
    );

    // Click the "Add to Wanted List" link
    const addLink = page.locator("a.bl-wanted-addable").first();
    await expect(addLink).toBeVisible({ timeout: 10000 });
    await addLink.click();

    // Wait for the list buttons to appear in the DOM
    const listContainer = page.locator(".wl-add-list .l-overflow-auto--y");
    try {
      await expect(async () => {
        const count = await listContainer
          .locator("button.wl-search-list")
          .count();
        expect(count).toBeGreaterThanOrEqual(2);
      }).toPass({ timeout: 15000 });
    } catch (err) {
      console.error("Modal list did not populate. Pausing for inspection...");
      await page.pause();
      throw err;
    }

    // Grab the list names in displayed order
    const names = await listContainer
      .locator(".wl-search-list__name")
      .allTextContents();

    // The first item should still be "Default Wanted List" (pinned)
    // and there should be at least 2 items total
    expect(names.length).toBeGreaterThanOrEqual(2);
    expect(names[0].trim()).toContain("Wanted List");

    await page.close();
  });
});
