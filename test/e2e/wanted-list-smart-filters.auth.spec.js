/**
 * E2E tests for the wanted-list-smart-filters feature.
 *
 * Tests that the Color and Condition dropdowns on the wanted list search
 * page are filtered to only show values present in the list's items.
 *
 * Requires BrickLink authentication (runs in the "auth" project).
 */
import { test, expect } from "@playwright/test";
import { launchExtension } from "./helpers/extension-context.js";

test.describe("Smart Wanted List Filters (auth required)", () => {
  let context;
  let page;
  let searchUrl;

  test.beforeAll(async () => {
    context = await launchExtension();

    // Find a search URL for a list that has items
    const setupPage = await context.newPage();
    await setupPage.goto("https://www.bricklink.com/v2/wanted/list.page", {
      waitUntil: "domcontentloaded",
    });
    await setupPage.waitForSelector("table.wl-overview-list-table", { timeout: 15000 });

    searchUrl = await setupPage.evaluate(() => {
      // Only consider links that go to a specific wanted list (have wantedMoreID=)
      const links = document.querySelectorAll('a[href*="wantedMoreID="]');
      for (const link of links) {
        const row = link.closest("tr");
        if (!row) continue;
        const cells = row.querySelectorAll("td");
        for (const cell of cells) {
          const num = parseInt(cell.textContent.trim(), 10);
          if (num > 0) {
            // Strip to just wantedMoreID so filters aren't pre-expanded
            const m = link.href.match(/wantedMoreID=(\d+)/);
            return m
              ? `https://www.bricklink.com/v2/wanted/search.page?wantedMoreID=${m[1]}`
              : null;
          }
        }
      }
      // Fallback: first wantedMoreID link regardless of item count
      const first = document.querySelector('a[href*="wantedMoreID="]');
      if (first) {
        const m = first.href.match(/wantedMoreID=(\d+)/);
        return m
          ? `https://www.bricklink.com/v2/wanted/search.page?wantedMoreID=${m[1]}`
          : null;
      }
      return null;
    });

    await setupPage.close();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.skip(!searchUrl, "No wanted list with items found");
    page = await context.newPage();
    await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
  });

  test.afterEach(async () => {
    await page?.close().catch(() => {});
  });

  // ── Prerequisite: verify the data source format the feature depends on ──────

  test("search page HTML contains the wlJson the feature parses", async () => {
    // The feature fetches page HTML and extracts data with /var wlJson = (\{.+?\});/
    // If BrickLink changed the variable declaration (e.g. to `let` or `const`),
    // or changed the JSON format, filtering silently stops working.
    const html = await page.evaluate(async (url) => {
      const res = await fetch(url + "&type=A&sort=1&pageSize=100&page=1");
      return res.ok ? res.text() : null;
    }, searchUrl);

    expect(html, "Fetch of search page failed").not.toBeNull();
    expect(html, "wlJson variable not found — regex in feature will fail").toMatch(
      /var wlJson\s*=/
    );
    expect(html, "wantedItems array not found in wlJson").toMatch(/wantedItems/);
  });

  // ── Core filtering behaviour ──────────────────────────────────────────────

  test("Color and Condition selects are filtered after More Options is clicked, and stay filtered after applying a filter", async () => {
    // ── Open filters ──────────────────────────────────────────────────────────
    const moreOptionsBtn = page.getByText("More Options");
    await expect(moreOptionsBtn).toBeVisible({ timeout: 10000 });
    await moreOptionsBtn.click();

    const filterContainer = page.locator(".search-item-filters");
    await expect(filterContainer).toBeVisible({ timeout: 10000 });

    const colorSelect = filterContainer.locator("select").nth(0);
    const condSelect = filterContainer.locator("select").nth(1);
    await expect(colorSelect).toBeVisible();
    await expect(condSelect).toBeVisible();

    // ── Fetch all items for ground-truth comparison ───────────────────────────
    // window.wlJson only has page 1; fetch all pages the same way the feature does.
    const allItems = await page.evaluate(async (baseUrl) => {
      const items = [];
      let p = 1;
      while (true) {
        const res = await fetch(`${baseUrl}&type=A&sort=1&pageSize=100&page=${p}`);
        if (!res.ok) break;
        const html = await res.text();
        const m = html.match(/var wlJson = (\{.+?\});/);
        if (!m) break;
        const data = JSON.parse(m[1]);
        if (!data.wantedItems?.length) break;
        items.push(...data.wantedItems);
        if (items.length >= data.totalResults) break;
        p++;
      }
      return items;
    }, searchUrl);

    expect(allItems.length, "Could not fetch any wanted list items").toBeGreaterThan(0);

    const uniqueColorIDs = new Set(allItems.map((i) => String(i.colorID)));
    const uniqueConditions = new Set(allItems.map((i) => i.wantedNew));

    // ── Helper: assert color options are filtered ─────────────────────────────
    async function assertColorOptionsFiltered() {
      // Wait for the feature to apply filters (full BrickLink list has ~216 colors).
      // Check the first select (Color) specifically — the Condition select normally
      // has only 3 options and would satisfy a generic "< 10" check prematurely.
      await page.waitForFunction(
        () => {
          const container = document.querySelector(".search-item-filters");
          if (!container) return false;
          const selects = container.querySelectorAll("select");
          if (!selects.length) return false;
          return selects[0].options.length < 100;
        },
        { timeout: 15000 }
      );

      const opts = await colorSelect.evaluate((el) =>
        Array.from(el.options).map((o) => ({ value: o.value, text: o.text.trim() }))
      );
      const nonDefault = opts.filter((o) => o.value !== "-1" && o.value !== "0");

      expect(
        nonDefault.length,
        "Color select should have fewer options than the full BrickLink list (~216)"
      ).toBeLessThan(100);

      for (const opt of nonDefault) {
        expect(
          uniqueColorIDs,
          `Color option "${opt.text}" (id=${opt.value}) is not in the wanted list`
        ).toContain(opt.value);
      }

      return nonDefault;
    }

    // ── First check: filters applied on open ─────────────────────────────────
    const filteredOptions = await assertColorOptionsFiltered();

    // Condition select
    const specificConditions = new Set([...uniqueConditions].filter((c) => c !== "X"));
    if (specificConditions.size === 1) {
      await expect(condSelect).toHaveValue([...specificConditions][0]);
      expect(await condSelect.isDisabled()).toBe(true);
    } else {
      expect(await condSelect.isDisabled()).toBe(false);
    }

    // ── Select a color and click Apply ────────────────────────────────────────
    // Pick the first non-default color option so we exercise a real filter apply.
    test.skip(filteredOptions.length === 0, "No specific colors in list to filter by");

    const colorToSelect = filteredOptions[0].value;
    await colorSelect.selectOption(colorToSelect);

    const applyBtn = page.getByRole("button", { name: "Apply", exact: true });
    await expect(applyBtn).toBeVisible({ timeout: 5000 });
    await applyBtn.click();

    // Wait for the page to update after applying the filter
    await page.waitForLoadState("networkidle");

    // ── Re-open More Options and verify filters are still applied ─────────────
    // The filter container may have closed after Apply; re-open it.
    const moreOptionsBtnAgain = page.getByText("More Options");
    if (await moreOptionsBtnAgain.isVisible({ timeout: 3000 }).catch(() => false)) {
      await moreOptionsBtnAgain.click();
      await expect(filterContainer).toBeVisible({ timeout: 10000 });
    } else {
      // Filter container stayed open
      await expect(filterContainer).toBeVisible({ timeout: 5000 });
    }

    await assertColorOptionsFiltered();

    // ── Verify the applied color is still selected ────────────────────────────
    // After the page reloads with ?colorID=X in the URL, BrickLink pre-selects
    // that color. Our feature must preserve that selection when it re-filters the
    // option list — not reset it to the default.
    const selectedValue = await colorSelect.evaluate((el) => el.value);
    expect(
      selectedValue,
      "Color select should still show the applied color after smart filters re-run"
    ).toBe(colorToSelect);
  });
});
