/**
 * E2E tests for features on the wanted list edit page:
 * - edit-summary-banner: live change summary in the save banner
 * - unsaved-changes-guard: beforeunload warning (via edit-summary integration)
 *
 * Requires BrickLink authentication (runs in the "auth" project).
 */
import { test, expect } from "@playwright/test";
import { launchExtension } from "./helpers/extension-context.js";

test.describe("Wanted List Edit Page (auth required)", () => {
  let context;
  let page;
  let editUrl;

  test.beforeAll(async () => {
    context = await launchExtension();

    // Discover the edit URL for a list that has items
    const setupPage = await context.newPage();
    await setupPage.goto("https://www.bricklink.com/v2/wanted/list.page", {
      waitUntil: "domcontentloaded",
    });

    // Grab the first edit link that points to a list with items
    editUrl = await setupPage.evaluate(() => {
      const links = document.querySelectorAll(
        'a[href*="wanted/search.page"]'
      );
      for (const link of links) {
        const row = link.closest("tr");
        if (!row) continue;
        // Check the Items column — skip lists with 0 items
        const cells = row.querySelectorAll("td");
        for (const cell of cells) {
          const num = parseInt(cell.textContent.trim(), 10);
          if (num > 0) return link.href;
        }
      }
      // Fallback to first edit link
      return links[0] ? links[0].href : null;
    });

    await setupPage.close();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.skip(!editUrl, "No edit URL found — no wanted lists with items");

    page = await context.newPage();

    // Navigate directly to the edit page
    await page.goto(editUrl, { waitUntil: "domcontentloaded" });

    // Wait for the table to render in view mode
    await expect(page.locator(".table-wl-edit")).toBeVisible({ timeout: 15000 });

    // Click a cell to enter edit mode
    await page.locator(".wl-hover-editable").first().click();

    // Wait for edit mode — save banner becomes visible and selects render
    await expect(page.locator("#wanted-save-banner")).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator(".wl-col-condition select.form-text").first()
    ).toBeVisible({ timeout: 15000 });
  });

  test.afterEach(async () => {
    if (!page) return;
    // Dismiss any beforeunload dialog that may fire during close
    const dismisser = (dialog) => dialog.dismiss().catch(() => {});
    page.on("dialog", dismisser);
    await page.close().catch(() => {});
  });

  test("edit-summary-banner injects summary element", async () => {
    const summary = page.locator("#rb-edit-summary");
    await expect(summary).toBeAttached({ timeout: 5000 });
    await expect(summary).toHaveCSS("display", "none");
  });

  test("edit-summary-banner shows count after changing a field", async () => {
    const conditionSelect = page
      .locator(".wl-col-condition select.form-text")
      .first();

    // Record the original value, then change it
    const original = await conditionSelect.inputValue();
    const newValue = original === "N" ? "U" : "N";
    await conditionSelect.selectOption(newValue);

    // Summary should now be visible with "1 item changed"
    const summary = page.locator("#rb-edit-summary");
    await expect(summary).not.toHaveCSS("display", "none");
    await expect(summary.locator(".rb-summary-link")).toHaveText(
      "1 item changed"
    );

    // Revert the change
    await conditionSelect.selectOption(original);

    // Summary should hide again
    await expect(summary).toHaveCSS("display", "none");
  });

  test("edit-summary-banner shows popover with grid on hover", async () => {
    const conditionSelect = page
      .locator(".wl-col-condition select.form-text")
      .first();

    const original = await conditionSelect.inputValue();
    const newValue = original === "N" ? "U" : "N";
    await conditionSelect.selectOption(newValue);

    const wrapper = page.locator(".rb-summary-wrapper");
    await expect(wrapper).toBeVisible();

    // Hover to reveal the popover
    await wrapper.hover();

    const popover = page.locator(".rb-summary-popover");
    await expect(popover).toBeVisible();

    // Popover should contain the grid with at least one row
    const grid = popover.locator(".rb-summary-grid");
    await expect(grid).toBeVisible();
    await expect(
      grid.locator(".rb-summary-popover-desc").first()
    ).toBeVisible();
    await expect(
      grid.locator(".rb-summary-popover-fields").first()
    ).toBeVisible();

    // Revert
    await conditionSelect.selectOption(original);
  });

  test("features still work after save/cancel", async () => {
    const conditionSelect = page
      .locator(".wl-col-condition select.form-text")
      .first();

    // Make a change
    const original = await conditionSelect.inputValue();
    const changed = original === "N" ? "U" : "N";
    await conditionSelect.selectOption(changed);

    // Verify summary shows "1 item changed"
    const summary = page.locator("#rb-edit-summary");
    await expect(summary).not.toHaveCSS("display", "none");
    await expect(summary.locator(".rb-summary-link")).toHaveText(
      "1 item changed"
    );

    // Click Save
    const saveButton = page.locator("#wanted-save-banner button, #wanted-save-banner input[type=submit]").filter({ hasText: "Save" });
    await saveButton.click();

    // Wait for save to complete — banner should hide
    await expect(page.locator("#wanted-save-banner")).toBeHidden({ timeout: 10000 });

    // Summary should also be hidden now
    await expect(summary).toHaveCSS("display", "none");

    // Click a cell to re-enter edit mode
    await page.locator(".wl-hover-editable").first().click();
    await expect(page.locator("#wanted-save-banner")).toBeVisible({ timeout: 10000 });
    await expect(conditionSelect).toBeVisible({ timeout: 10000 });

    // Make another change — the select and control panels should work
    const newOriginal = await conditionSelect.inputValue();
    const newChanged = newOriginal === "N" ? "U" : "N";
    await conditionSelect.selectOption(newChanged);

    // Summary should show "1 item changed" again
    await expect(summary).not.toHaveCSS("display", "none");
    await expect(summary.locator(".rb-summary-link")).toHaveText(
      "1 item changed"
    );

    // Verify control panel buttons still work
    const quantityInput = page
      .locator(".wl-col-quantity input.form-text.width-small")
      .first();

    // Hover the quantity field to show the control panel.
    // force:true skips the interception check — the panel appears on CSS :hover and
    // can cover the input center, causing Playwright to retry indefinitely otherwise.
    await quantityInput.hover({ force: true });
    const panel = quantityInput.locator("..").locator(".rb-spin-panel");
    await expect(panel).toBeVisible();

    // Click the increment button in our panel — this fires the input event and marks the field changed
    await panel.locator(".rb-s-up").click();

    // Revert button should now be visible
    const revertBtn = panel.locator(".rb-s-revert");
    await expect(revertBtn).not.toHaveClass(/rb-hidden/);
  });

  test("unsaved-changes-guard fires only when changes exist", async () => {
    const select = page
      .locator(".wl-col-condition select.form-text")
      .first();

    // Make a change so the summary becomes visible
    const orig = await select.inputValue();
    const changed = orig === "N" ? "U" : "N";
    await select.selectOption(changed);

    // Confirm the summary is visible (guard relies on this)
    const summary = page.locator("#rb-edit-summary");
    await expect(summary).not.toHaveCSS("display", "none");

    // Navigating away should trigger the beforeunload dialog
    let dialogFired = false;
    page.once("dialog", async (dialog) => {
      dialogFired = true;
      await dialog.dismiss().catch(() => {});
    });

    await page
      .goto("https://www.bricklink.com/v2/main.page", {
        waitUntil: "domcontentloaded",
        timeout: 5000,
      })
      .catch(() => {
        // Navigation may be cancelled by the dialog dismiss — that's expected
      });

    expect(dialogFired).toBe(true);
  });
});
