/**
 * E2E test for the Set Detective feature.
 * Navigates to the wanted list page, opens the Set Detective tab,
 * adds multiple parts, and verifies the intersection search finds results.
 *
 * Requires BrickLink authentication (runs in the "auth" project).
 */
import { test, expect } from "@playwright/test";
import { launchExtension } from "./helpers/extension-context.js";

const BL = "https://www.bricklink.com";

/**
 * Fills in the Add a Part form and clicks Add Part.
 * Waits for the color select to be enabled before selecting.
 */
async function addPart(panel, partNum, colorLabel) {
  const partInput = panel.locator("input[placeholder='e.g. 3001']");
  await partInput.fill(partNum);

  const colorSelect = panel.locator(".rb-ss-color-select");
  await expect(colorSelect).toBeEnabled({ timeout: 15000 });
  await colorSelect.selectOption({ label: colorLabel });

  const addBtn = panel.locator(".rb-ss-add-btn");
  await expect(addBtn).toBeEnabled({ timeout: 5000 });
  await addBtn.click();
}

test.describe("Set Detective (auth required)", () => {
  test("intersects multiple parts to find matching sets", async () => {
    const context = await launchExtension();

    try {
      const page = await context.newPage();

      // Set Detective is injected on any /v2/wanted/ page.
      await page.goto(`${BL}/v2/wanted/list.page`, {
        waitUntil: "domcontentloaded",
      });

      // ── Step 1: Open the Set Detective tab ───────────────────────────────────
      const tab = page.locator("#rb-set-detective-tab a");
      await expect(tab).toBeVisible({ timeout: 15000 });
      await tab.click();

      const panel = page.locator("#rb-set-detective-panel");
      await expect(panel).toBeVisible({ timeout: 5000 });

      const resultsCol = panel.locator(".rb-ss-col-results");

      // ── Step 2: Add first part ────────────────────────────────────────────────
      // Part 27261 in Dark Bluish Gray
      await addPart(panel, "27261", "Dark Bluish Gray");

      const firstRow = resultsCol.locator(".rb-preview-row").first();
      await expect(firstRow).toBeVisible({ timeout: 20000 });
      const countAfterFirst = await resultsCol.locator(".rb-preview-row").count();
      expect(countAfterFirst).toBeGreaterThan(0);

      // ── Step 3: Add second part ───────────────────────────────────────────────
      // Part 22387 in Black — together these two parts intersect to find 70356-1.
      await addPart(panel, "22387", "Black");

      await expect(firstRow).toBeVisible({ timeout: 20000 });
      const countAfterSecond = await resultsCol.locator(".rb-preview-row").count();
      expect(countAfterSecond).toBeGreaterThan(0);

      // The intersection should narrow results down from the first search.
      expect(countAfterSecond).toBeLessThan(countAfterFirst);

      // ── Step 4: Verify set 70356-1 appears in the results ────────────────────
      await expect(resultsCol.locator(".rb-preview-itemno-link", { hasText: "70356-1" })).toBeVisible();

      // ── Step 5: Verify result rows are well-formed ───────────────────────────
      await expect(firstRow.locator(".rb-preview-name")).toBeVisible();
      await expect(firstRow.locator(".rb-ss-results-year")).toBeVisible();

      await page.close();
    } finally {
      await context.close();
    }
  });
});
