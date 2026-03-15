/**
 * E2E tests for the wanted-list-download-all feature.
 * Requires BrickLink authentication (runs in the "auth" project).
 */
import { test, expect } from "@playwright/test";
import { launchExtension } from "./helpers/extension-context.js";

// ── ZIP helpers ────────────────────────────────────────────────────────────

/**
 * Extracts filenames from a ZIP buffer by scanning local file headers.
 * Does not require a zip library — reads the PK\x03\x04 structures directly.
 */
function extractZipFilenames(buf) {
  const filenames = [];
  let i = 0;
  while (i < buf.length - 30) {
    if (
      buf[i] === 0x50 &&
      buf[i + 1] === 0x4b &&
      buf[i + 2] === 0x03 &&
      buf[i + 3] === 0x04
    ) {
      const filenameLen = buf.readUInt16LE(i + 26);
      const extraLen = buf.readUInt16LE(i + 28);
      const compressedSize = buf.readUInt32LE(i + 18);
      const filename = buf.subarray(i + 30, i + 30 + filenameLen).toString("utf-8");
      filenames.push(filename);
      i += 30 + filenameLen + extraLen + compressedSize;
    } else {
      i++;
    }
  }
  return filenames;
}

/**
 * Reads a file's raw bytes from a ZIP buffer given its filename.
 */
function readZipEntry(buf, targetFilename) {
  let i = 0;
  while (i < buf.length - 30) {
    if (
      buf[i] === 0x50 &&
      buf[i + 1] === 0x4b &&
      buf[i + 2] === 0x03 &&
      buf[i + 3] === 0x04
    ) {
      const filenameLen = buf.readUInt16LE(i + 26);
      const extraLen = buf.readUInt16LE(i + 28);
      const compressedSize = buf.readUInt32LE(i + 18);
      const filename = buf.subarray(i + 30, i + 30 + filenameLen).toString("utf-8");
      const dataStart = i + 30 + filenameLen + extraLen;
      if (filename === targetFilename) {
        return buf.subarray(dataStart, dataStart + compressedSize);
      }
      i = dataStart + compressedSize;
    } else {
      i++;
    }
  }
  return null;
}

async function readDownload(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// ── Tests ──────────────────────────────────────────────────────────────────

test.describe("Wanted List Download All", () => {
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
    await expect(page.locator(".rb-dl-all-btn")).toBeVisible({ timeout: 10000 });
  });

  test.afterEach(async () => {
    await page.close();
  });

  // ── UI ───────────────────────────────────────────────────────────────────

  test("button appears with download icon and 'All' label", async () => {
    const btn = page.locator(".rb-dl-all-btn");
    await expect(btn.locator("i.fas.fa-download")).toBeVisible();
    await expect(btn.locator(".rb-dl-all-label")).toHaveText("All");
  });

  test("label switches to '(N)' when search filter is applied", async () => {
    const table = page.locator("table.wl-overview-list-table:not(.compact)");
    const totalRows = await table.locator("tr:has(td)").count();

    // Use the first word of the first list name as the search term
    const firstListName = await table.locator("tr:has(td) a").first().textContent();
    const searchTerm = firstListName.trim().split(/\s+/)[0];

    await page.locator("input.search-query").fill(searchTerm);
    await page.locator("input.search-query").dispatchEvent("input");

    const label = page.locator(".rb-dl-all-btn .rb-dl-all-label");
    await expect(label).toHaveText(/^\(\d+\)$/);

    const filteredCount = parseInt((await label.textContent()).replace(/[()]/g, ""), 10);
    expect(filteredCount).toBeGreaterThan(0);
    expect(filteredCount).toBeLessThanOrEqual(totalRows);
  });

  test("label reverts to 'All' when search is cleared", async () => {
    const input = page.locator("input.search-query");
    const label = page.locator(".rb-dl-all-btn .rb-dl-all-label");

    await input.fill("castle");
    await input.dispatchEvent("input");
    await expect(label).toHaveText(/^\(\d+\)$/);

    await input.fill("");
    await input.dispatchEvent("input");
    await expect(label).toHaveText("All");
  });

  // ── Downloads ────────────────────────────────────────────────────────────

  test("downloads a ZIP containing one .xml per list", async () => {
    const table = page.locator("table.wl-overview-list-table:not(.compact)");
    const rowCount = await table.locator("tr:has(td)").count();
    test.skip(rowCount < 2, "Need at least 2 wanted lists");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator(".rb-dl-all-btn").click(),
    ]);

    expect(download.suggestedFilename()).toBe("wanted-lists.zip");

    const buf = await readDownload(download);
    const filenames = extractZipFilenames(buf);

    expect(filenames.length).toBe(rowCount);
    for (const name of filenames) {
      expect(name).toMatch(/\.xml$/i);
    }
  });

  test("ZIP entries contain valid BrickLink XML", async () => {
    const table = page.locator("table.wl-overview-list-table:not(.compact)");
    const rowCount = await table.locator("tr:has(td)").count();
    test.skip(rowCount < 2, "Need at least 2 wanted lists");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator(".rb-dl-all-btn").click(),
    ]);

    const buf = await readDownload(download);
    const filenames = extractZipFilenames(buf);

    // Check each entry is valid XML with a WANTEDLIST root
    for (const filename of filenames) {
      const entry = readZipEntry(buf, filename);
      expect(entry, `entry for ${filename} should exist`).not.toBeNull();
      const xml = entry.toString("utf-8");
      expect(xml, `${filename} should contain WANTEDLIST`).toMatch(
        /<WANTEDLIST>|<\/WANTEDLIST>/i
      );
    }
  });

  test("filtered download uses wanted-lists-filtered.zip filename", async () => {
    const table = page.locator("table.wl-overview-list-table:not(.compact)");
    const rowCount = await table.locator("tr:has(td)").count();
    test.skip(rowCount < 2, "Need at least 2 wanted lists to test filtering");

    // Filter to fewer lists by using a specific search term
    const firstListName = await table.locator("tr:has(td) a").first().textContent();
    const searchTerm = firstListName.trim().split(/\s+/)[0];

    const input = page.locator("input.search-query");
    await input.fill(searchTerm);
    await input.dispatchEvent("input");

    const label = page.locator(".rb-dl-all-btn .rb-dl-all-label");
    await expect(label).toHaveText(/^\(\d+\)$/);

    const filteredCount = parseInt(
      (await label.textContent()).replace(/[()]/g, ""),
      10
    );
    test.skip(filteredCount < 2, "Search term matches all lists — need a more selective term");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator(".rb-dl-all-btn").click(),
    ]);

    expect(download.suggestedFilename()).toBe("wanted-lists-filtered.zip");

    const buf = await readDownload(download);
    const filenames = extractZipFilenames(buf);
    expect(filenames.length).toBe(filteredCount);
  });

  test("single filtered list downloads as XML directly (no zip)", async () => {
    const table = page.locator("table.wl-overview-list-table:not(.compact)");
    const rows = table.locator("tr:has(td)");
    const rowCount = await rows.count();
    test.skip(rowCount === 0, "No wanted lists found");

    // Find a list whose full name filters to exactly 1 result
    const input = page.locator("input.search-query");
    const label = page.locator(".rb-dl-all-btn .rb-dl-all-label");
    let found = false;

    for (let i = 0; i < rowCount; i++) {
      const name = (await rows.nth(i).locator("a").first().textContent()).trim();
      await input.fill(name);
      await input.dispatchEvent("input");
      await expect(label).not.toHaveText("All", { timeout: 2000 }).catch(() => {});
      if ((await label.textContent()) === "(1)") {
        found = true;
        break;
      }
    }
    test.skip(!found, "No list with a uniquely-filtering name found");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator(".rb-dl-all-btn").click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.xml$/i);

    const buf = await readDownload(download);
    const xml = buf.toString("utf-8");
    expect(xml).toMatch(/<WANTEDLIST>|<\/WANTEDLIST>/i);
  });
});
