/**
 * E2E tests for the wanted-list-download-buttons feature.
 * Requires BrickLink authentication (runs in the "auth" project).
 */
import { test, expect } from "@playwright/test";
import { launchExtension } from "./helpers/extension-context.js";

test.describe("Wanted List Download Buttons (auth required)", () => {
  let context;
  let page;

  test.beforeAll(async () => {
    context = await launchExtension();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    page = await context.newPage();
    await page.goto("https://www.bricklink.com/v2/wanted/list.page", {
      waitUntil: "domcontentloaded",
    });
  });

  test.afterEach(async () => {
    await page.close();
  });

  test("adds a Download button to each wanted list row", async () => {
    // Wait for the list table to render
    const table = page.locator("table.wl-overview-list-table:not(.compact)");
    await expect(table).toBeVisible({ timeout: 10000 });

    // Wait for our injected buttons
    const downloadButtons = page.locator(".rb-dl-btn");
    await expect(downloadButtons.first()).toBeVisible({ timeout: 5000 });

    // Should have one button per list row
    const rowCount = await table.locator("tr td.no-break").count();
    await expect(downloadButtons).toHaveCount(rowCount);
  });

  test("Download button has the correct href", async () => {
    const table = page.locator("table.wl-overview-list-table:not(.compact)");
    await expect(table).toBeVisible({ timeout: 10000 });

    const firstBtn = page.locator(".rb-dl-btn").first();
    await expect(firstBtn).toBeVisible({ timeout: 5000 });

    const href = await firstBtn.getAttribute("href");
    expect(href).toMatch(
      /\/files\/clone\/wanted\/downloadXML\.file\?wantedMoreID=\d+&wlName=/
    );
  });

  test("clicking Download downloads an XML file with at least one item", async () => {
    const table = page.locator("table.wl-overview-list-table:not(.compact)");
    await expect(table).toBeVisible({ timeout: 10000 });

    await expect(page.locator(".rb-dl-btn").first()).toBeVisible({ timeout: 5000 });

    // Find the first row that has a non-zero item count
    const rows = table.locator("tr:has(td.no-break)");
    const rowCount = await rows.count();
    let downloadBtn = null;
    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const itemCount = parseInt(await row.locator("td:nth-child(2) span").textContent(), 10);
      if (itemCount > 0) {
        downloadBtn = row.locator(".rb-dl-btn");
        break;
      }
    }
    expect(downloadBtn, "No wanted list with items found").not.toBeNull();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadBtn.click(),
    ]);

    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const xml = Buffer.concat(chunks).toString("utf-8");

    expect(xml).toMatch(/<ITEM>/i);
  });
});
