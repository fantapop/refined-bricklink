/**
 * Integration test for the wanted-list-merge feature.
 * Creates a real (empty) wanted list, merges another list's items into it,
 * verifies the item count, then deletes the test list.
 *
 * Requires BrickLink authentication (runs in the "auth" project).
 */
import { test, expect } from "@playwright/test";
import { launchExtension } from "./helpers/extension-context.js";
import { createWantedList, deleteWantedList } from "./helpers/wanted-list-crud.js";

const TEST_LIST_NAME = "RB E2E Test (auto-delete)";
const BL = "https://www.bricklink.com";

/**
 * Fetches totalResults for a wanted list from its search page wlJson.
 */
async function getListItemCount(context, wantedMoreID) {
  const page = await context.newPage();
  await page.goto(
    `${BL}/v2/wanted/search.page?type=A&wantedMoreID=${wantedMoreID}&sort=1&pageSize=100&page=1`,
    { waitUntil: "domcontentloaded" }
  );
  const count = await page.evaluate(() => window.wlJson?.totalResults ?? 0);
  await page.close();
  return count;
}

// ── Test ──────────────────────────────────────────────────────────────────────

test.describe("Add Lists integration (auth required)", () => {
  test("merges items from a source list into a newly created list", async () => {
    const context = await launchExtension();
    let newListId = null;

    try {
      // ── Step 1: Find a source list that has items ───────────────────────────
      const overviewPage = await context.newPage();
      await overviewPage.goto(`${BL}/v2/wanted/list.page`, {
        waitUntil: "domcontentloaded",
      });
      await overviewPage.waitForSelector("table.wl-overview-list-table", {
        timeout: 15000,
      });

      // Table has no tbody — rows are direct children of table.
      // Each data row: td[name link], td[item count], td[progress], td[buttons]
      const sourceList = await overviewPage.evaluate(() => {
        for (const row of document.querySelectorAll(
          "table.wl-overview-list-table tr"
        )) {
          const a = row.querySelector('a[href*="wantedMoreID="]');
          if (!a) continue;
          const m = a.href.match(/wantedMoreID=(\d+)/);
          if (!m) continue;
          const tds = row.querySelectorAll("td");
          const count = parseInt(tds[1]?.textContent?.trim(), 10);
          if (count > 0) return { id: m[1], name: a.textContent.trim(), count };
        }
        return null;
      });
      await overviewPage.close();

      if (!sourceList) {
        test.skip(true, "No wanted list with items found");
        return;
      }

      // Confirm item count via search page wlJson (ground truth for comparison)
      const sourceItemCount = await getListItemCount(context, sourceList.id);
      if (sourceItemCount === 0) {
        test.skip(true, "Source list wlJson.totalResults is 0");
        return;
      }

      // ── Step 2: Create a new empty wanted list ──────────────────────────────
      newListId = await createWantedList(context, TEST_LIST_NAME);
      expect(newListId, "Failed to create test wanted list").toBeTruthy();

      // ── Step 3: Navigate to the new list and run the merge ──────────────────
      const mergePage = await context.newPage();
      await mergePage.goto(
        `${BL}/v2/wanted/edit.page?wantedMoreID=${newListId}`,
        { waitUntil: "domcontentloaded" }
      );
      // "Add Lists" is inserted into the toolbar on page load — no edit mode needed
      await expect(
        mergePage.getByRole("button", { name: "Add Lists" })
      ).toBeVisible({ timeout: 15000 });

      // Open the modal
      await mergePage.getByRole("button", { name: "Add Lists" }).click();
      await expect(mergePage.locator(".rb-merge-modal")).toBeVisible({
        timeout: 5000,
      });

      // Uncheck "unfulfilled only" so all items are included (predictable count)
      await mergePage.locator(".rb-unfulfilled").uncheck();

      // Select the source list by name and submit
      const sourceItem = mergePage.locator(".rb-merge-item", {
        hasText: sourceList.name,
      });
      await expect(sourceItem).toBeVisible({ timeout: 5000 });
      await sourceItem.click();
      await expect(mergePage.locator(".rb-merge-submit")).toBeEnabled();

      // Submit — extension calls location.reload() on success
      await Promise.all([
        mergePage.waitForEvent("load", { timeout: 30000 }),
        mergePage.locator(".rb-merge-submit").click(),
      ]);

      await mergePage.close();

      // ── Step 4: Verify the item count in the new list matches the source ────
      const mergedCount = await getListItemCount(context, newListId);
      expect(mergedCount).toBe(sourceItemCount);
    } finally {
      // ── Cleanup: delete the test list (name-verified before deletion) ───────
      if (newListId) {
        await deleteWantedList(context, newListId, TEST_LIST_NAME);
      }
      await context.close();
    }
  });
});
