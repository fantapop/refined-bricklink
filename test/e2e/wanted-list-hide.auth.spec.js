/**
 * E2E integration test for the wanted-list-hide feature.
 * Creates a real wanted list, hides it, verifies visibility behaviour,
 * then cleans up (unhides and deletes the list).
 *
 * Requires BrickLink authentication (runs in the "auth" project).
 */
import { test, expect } from "@playwright/test";
import { launchExtension } from "./helpers/extension-context.js";

const TEST_LIST_NAME = "RB E2E Hide Test (auto-delete)";
const BL = "https://www.bricklink.com";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the wantedMoreID of a list whose name starts with the given prefix,
 * or null if not found. Used to detect leftover lists from previous failed runs.
 */
async function findListByPrefix(context, namePrefix) {
  const page = await context.newPage();
  await page.goto(`${BL}/v2/wanted/list.page`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("table.wl-overview-list-table", { timeout: 15000 });
  const result = await page.evaluate((prefix) => {
    for (const a of document.querySelectorAll('a[href*="wantedMoreID="]')) {
      // Match only list-page links (edit.page or search.page), not download buttons
      if (!/\/wanted\/(search|edit)\.page/.test(a.href)) continue;
      if (a.textContent.trim().startsWith(prefix)) {
        const m = a.href.match(/wantedMoreID=(\d+)/);
        return m ? { id: m[1], name: a.textContent.trim() } : null;
      }
    }
    return null;
  }, namePrefix);
  await page.close();
  return result;
}

/**
 * Creates a new empty wanted list and returns its wantedMoreID.
 */
async function createWantedList(context, name) {
  const page = await context.newPage();
  await page.goto(`${BL}/v2/wanted/list.page`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("table.wl-overview-list-table", { timeout: 15000 });

  await page.getByRole("button", { name: "Create New List" }).click();
  const nameInput = page.locator(".wl-edit-modal-container input.form-text").first();
  await expect(nameInput).toBeVisible({ timeout: 10000 });
  await nameInput.fill(name);

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
 * Deletes a wanted list by wantedMoreID via the Setup → Delete flow.
 * If the list name has the hide pattern appended, enables "Show hidden" first
 * and unhides the list before deleting.
 * Only deletes lists whose name starts with TEST_LIST_NAME for safety.
 */
async function deleteTestList(context, wantedMoreID) {
  const page = await context.newPage();
  await page.goto(`${BL}/v2/wanted/list.page`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("table.wl-overview-list-table", { timeout: 15000 });

  // Safety: only delete if the name starts with our test prefix
  const actualName = await page.evaluate((id) => {
    for (const a of document.querySelectorAll('a[href*="wantedMoreID="]')) {
      // Match only list-page links (edit.page or search.page), not download buttons
      if (!/\/wanted\/(search|edit)\.page/.test(a.href)) continue;
      if (a.href.includes(`wantedMoreID=${id}`)) return a.textContent.trim();
    }
    return null;
  }, wantedMoreID);

  if (!actualName?.startsWith(TEST_LIST_NAME)) {
    await page.close();
    throw new Error(
      `Safety: refusing to delete list ${wantedMoreID} — name "${actualName}" doesn't start with "${TEST_LIST_NAME}"`
    );
  }

  // If the row is hidden (display:none), enable Show hidden first
  const row = page.locator(`tr:has(a[href*="wantedMoreID=${wantedMoreID}"])`);
  const isHidden = await row.evaluate((el) => el.style.display === "none");
  if (isHidden) {
    const showHiddenCb = page.locator(".rb-show-hidden-cb");
    await showHiddenCb.check();
    await expect(row).toBeVisible({ timeout: 3000 });
  }

  // If the list is currently hidden (has [x] in name), unhide it first
  if (actualName !== TEST_LIST_NAME) {
    await row.getByRole("button", { name: "Setup" }).click();
    await expect(page.locator(".wl-edit-modal-container .modal-footer")).toBeVisible({ timeout: 10000 });
    await page.locator(".wl-edit-modal-container .rb-hide-btn").click();
    await page.waitForTimeout(200);
    await page.locator(".wl-edit-modal-container").getByRole("button", { name: /save/i }).click();
    await page.waitForTimeout(800);
  }

  // Open Setup and delete
  await row.getByRole("button", { name: "Setup" }).click();
  await expect(page.locator(".wl-edit-modal-container .modal-footer")).toBeVisible({ timeout: 10000 });
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".wl-edit-modal-container .modal-footer button.text-link--grey").first().click();

  // Wait for the list to disappear
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.locator(`a[href*="wantedMoreID=${wantedMoreID}"]`).first()
  ).not.toBeVisible({ timeout: 15000 });

  await page.close();
}

// ── Test ──────────────────────────────────────────────────────────────────────

test.describe("Hideable Wanted Lists (auth required)", () => {
  test("creates, hides, toggles visibility, and deletes a wanted list", async () => {
    const context = await launchExtension();
    let testListId = null;

    try {
      // ── Step 1: Clean up any leftover list from a previous failed run ────────
      const leftover = await findListByPrefix(context, TEST_LIST_NAME);
      if (leftover) {
        await deleteTestList(context, leftover.id);
      }

      // ── Step 2: Create a fresh test list ─────────────────────────────────────
      testListId = await createWantedList(context, TEST_LIST_NAME);
      expect(testListId, "Failed to create test wanted list").toBeTruthy();

      // ── Step 3: Navigate to the list page ────────────────────────────────────
      const page = await context.newPage();
      await page.goto(`${BL}/v2/wanted/list.page`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("table.wl-overview-list-table", { timeout: 15000 });
      await expect(page.locator(`a[href*="wantedMoreID=${testListId}"]`).first()).toBeVisible({ timeout: 10000 });

      // Ensure "Show hidden" is off so the hide step has a visible effect
      const showHiddenCb = page.locator(".rb-show-hidden-cb");
      if (await showHiddenCb.isChecked()) await showHiddenCb.uncheck();

      // ── Step 4: Verify Setup modal has a Hide button ──────────────────────────
      const testRow = page.locator(`tr:has(a[href*="wantedMoreID=${testListId}"])`);
      await testRow.getByRole("button", { name: "Setup" }).click();
      await expect(
        page.locator(".wl-edit-modal-container .modal-footer")
      ).toBeVisible({ timeout: 10000 });
      await expect(page.locator(".wl-edit-modal-container .rb-hide-btn")).toBeVisible();
      await expect(page.locator(".wl-edit-modal-container .rb-hide-btn")).toContainText("Hide");

      // ── Step 5: Hide the list via the modal ───────────────────────────────────
      await page.locator(".wl-edit-modal-container .rb-hide-btn").click();
      await expect(page.locator(".wl-edit-modal-container .rb-hide-btn")).toContainText("Unhide");
      await page.locator(".wl-edit-modal-container").getByRole("button", { name: /save/i }).click();

      // ── Step 6: Verify the row is now hidden from the table ───────────────────
      await expect(testRow).toBeHidden({ timeout: 5000 });

      // ── Step 7: Toggle "Show hidden" ON — row should become visible ───────────
      await page.locator(".rb-show-hidden-cb").check();
      await expect(testRow).toBeVisible({ timeout: 3000 });

      // ── Step 8: Toggle "Show hidden" OFF — row should hide again ─────────────
      await page.locator(".rb-show-hidden-cb").uncheck();
      await expect(testRow).toBeHidden({ timeout: 3000 });

      await page.close();
    } finally {
      // ── Cleanup: delete the test list ─────────────────────────────────────────
      if (testListId) {
        await deleteTestList(context, testListId);
      }
      await context.close();
    }
  });

  test("Setup modal on search page has a Hide button", async () => {
    const context = await launchExtension();

    try {
      // Find any wanted list to use as the search page target
      const setupPage = await context.newPage();
      await setupPage.goto(`${BL}/v2/wanted/list.page`, { waitUntil: "domcontentloaded" });
      await setupPage.waitForSelector("table.wl-overview-list-table", { timeout: 15000 });
      const searchUrl = await setupPage.evaluate(() => {
        const a = document.querySelector('a[href*="wantedMoreID="]');
        if (!a) return null;
        const id = new URL(a.href).searchParams.get("wantedMoreID");
        return id ? `https://www.bricklink.com/v2/wanted/search.page?wantedMoreID=${id}` : null;
      });
      await setupPage.close();

      if (!searchUrl) {
        test.skip(true, "No wanted list found");
        return;
      }

      const page = await context.newPage();
      await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);

      await page.getByRole("button", { name: "Setup" }).first().click();
      await expect(page.locator(".modal-footer")).toBeVisible({ timeout: 10000 });
      await expect(page.locator(".modal-footer .rb-hide-btn")).toBeVisible({ timeout: 5000 });

      await page.close();
    } finally {
      await context.close();
    }
  });
});
