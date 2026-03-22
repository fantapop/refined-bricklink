/**
 * Shared helpers for creating and deleting BrickLink wanted lists in E2E tests.
 */
import { expect } from "@playwright/test";

const BL = "https://www.bricklink.com";

/**
 * Returns the wantedMoreID of an existing list with the given name, or null.
 */
export async function findListByName(context, name) {
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

/**
 * Creates a new wanted list with the given name.
 * Cleans up any leftover list with the same name first (from a previous failed run).
 * Returns the wantedMoreID of the created list.
 */
export async function createWantedList(context, name) {
  const existingId = await findListByName(context, name);
  if (existingId) await deleteWantedList(context, existingId, name);

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
 * Deletes a wanted list by wantedMoreID.
 * Safety check: refuses to delete unless the list's name matches expectedName,
 * so we never accidentally delete a real list.
 */
export async function deleteWantedList(context, wantedMoreID, expectedName) {
  const page = await context.newPage();
  await page.goto(`${BL}/v2/wanted/list.page`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("table.wl-overview-list-table", { timeout: 15000 });

  const actualName = await page.evaluate((id) => {
    for (const a of document.querySelectorAll('a[href*="wantedMoreID="]')) {
      if (a.href.includes(`wantedMoreID=${id}`)) return a.textContent.trim();
    }
    return null;
  }, wantedMoreID);

  if (actualName !== expectedName) {
    await page.close();
    throw new Error(
      `Safety: refusing to delete list ${wantedMoreID} — expected "${expectedName}", got "${actualName}"`
    );
  }

  const row = page.locator(`tr:has(a[href*="wantedMoreID=${wantedMoreID}"])`);
  await row.getByRole("button", { name: "Setup" }).click();
  await expect(page.locator(".wl-edit-modal-container .modal-footer")).toBeVisible({ timeout: 10000 });

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".wl-edit-modal-container").getByRole("button", { name: "Delete" }).click();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.locator(`a[href*="wantedMoreID=${wantedMoreID}"]`).first()
  ).not.toBeVisible({ timeout: 15000 });

  await page.close();
}
