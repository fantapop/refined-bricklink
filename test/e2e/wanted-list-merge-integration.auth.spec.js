/**
 * Integration test for the wanted-list-merge feature.
 * Creates a real (empty) wanted list, merges another list's items into it,
 * verifies the item count, then deletes the test list.
 *
 * Requires BrickLink authentication (runs in the "auth" project).
 */
import { test, expect } from "@playwright/test";
import { launchExtension } from "./helpers/extension-context.js";

const TEST_LIST_NAME = "RB E2E Test (auto-delete)";
const BL = "https://www.bricklink.com";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Creates a new wanted list via the BrickLink management UI.
 * Returns the wantedMoreID string of the created list.
 */
/**
 * Returns the wantedMoreID of an existing list with the given name, or null.
 * Used to detect leftover test lists from previous failed runs.
 */
async function findListByName(context, name) {
  const page = await context.newPage();
  await page.goto(`${BL}/v2/wanted/list.page`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("table.wl-overview-list-table", { timeout: 15000 });
  const id = await page.evaluate((listName) => {
    for (const a of document.querySelectorAll('a[href*="wantedMoreID="]')) {
      if (a.textContent.trim() === listName) {
        const m = a.href.match(/wantedMoreID=(\d+)/);
        return m ? m[1] : null;
      }
    }
    return null;
  }, name);
  await page.close();
  return id;
}

async function createWantedList(context, name) {
  // Clean up any leftover list from a previous failed run
  const existingId = await findListByName(context, name);
  if (existingId) await deleteWantedList(context, existingId);

  const page = await context.newPage();
  await page.goto(`${BL}/v2/wanted/list.page`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("table.wl-overview-list-table", { timeout: 15000 });

  await page.getByRole("button", { name: "Create New List" }).click();

  // Wait for the name input inside the modal to be ready
  const nameInput = page.locator(".wl-edit-modal-container input.form-text").first();
  await expect(nameInput).toBeVisible({ timeout: 10000 });
  await nameInput.fill(name);

  // BrickLink navigates to the new list's search page after creation
  await Promise.all([
    page.waitForURL(/wantedMoreID=/, { timeout: 15000 }),
    page.getByRole("button", { name: "Create Wanted List" }).click(),
  ]);

  const m = page.url().match(/wantedMoreID=(\d+)/);
  const id = m ? m[1] : null;

  await page.close();
  return id;
}

/**
 * Deletes a wanted list by wantedMoreID, but only after confirming its name
 * matches TEST_LIST_NAME — so we never accidentally delete a real list.
 */
async function deleteWantedList(context, wantedMoreID) {
  const page = await context.newPage();
  await page.goto(`${BL}/v2/wanted/list.page`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("table.wl-overview-list-table", { timeout: 15000 });

  // Safety check: confirm the list with this ID has exactly the test list name
  const actualName = await page.evaluate((id) => {
    for (const a of document.querySelectorAll('a[href*="wantedMoreID="]')) {
      if (a.href.includes(`wantedMoreID=${id}`)) return a.textContent.trim();
    }
    return null;
  }, wantedMoreID);

  if (actualName !== TEST_LIST_NAME) {
    await page.close();
    throw new Error(
      `Safety: refusing to delete list ${wantedMoreID} — expected name "${TEST_LIST_NAME}", got "${actualName}"`
    );
  }

  // Open Setup dialog for this list row
  const row = page.locator(`tr:has(a[href*="wantedMoreID=${wantedMoreID}"])`);
  await row.getByRole("button", { name: "Setup" }).click();
  await expect(page.locator(".modal-footer button.text-link--grey")).toBeVisible({ timeout: 10000 });

  // BrickLink uses window.confirm() — accept it before clicking Delete
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".modal-footer button.text-link--grey").click();

  // Wait until the list link is gone from the table (confirms deletion completed)
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.locator(`a[href*="wantedMoreID=${wantedMoreID}"]`).first()
  ).not.toBeVisible({ timeout: 15000 });

  await page.close();
}

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
        await deleteWantedList(context, newListId);
      }
      await context.close();
    }
  });
});
