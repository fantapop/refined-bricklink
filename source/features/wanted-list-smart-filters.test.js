import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { createWantedListEditTable } from "../../test/helpers/dom-factory.js";
import featureDef from "./wanted-list-smart-filters.js";

describe("wanted-list-smart-filters feature", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (featureDef.destroy) featureDef.destroy();
  });

  /**
   * Helper to create the search filter container
   */
  function createFilterContainer() {
    const container = document.createElement("div");
    container.className = "search-item-filters";

    // Color filter
    const colorDiv = document.createElement("div");
    colorDiv.className = "l-flex";
    const colorLabel = document.createElement("label");
    colorLabel.textContent = "Color:";
    const colorSelect = document.createElement("select");
    colorSelect.className = "form-select";

    // Add color options (simplified - real page has 216)
    [
      { value: "-1", text: "Any" },
      { value: "11", text: "Black" },
      { value: "1", text: "White" },
      { value: "5", text: "Red" },
    ].forEach((opt) => {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.text;
      colorSelect.appendChild(option);
    });

    colorDiv.appendChild(colorLabel);
    colorDiv.appendChild(colorSelect);
    container.appendChild(colorDiv);

    // Condition filter
    const condDiv = document.createElement("div");
    condDiv.className = "l-flex";
    const condLabel = document.createElement("label");
    condLabel.textContent = "Condition:";
    const condSelect = document.createElement("select");
    condSelect.className = "form-select";

    [
      { value: "X", text: "Any" },
      { value: "N", text: "New" },
      { value: "U", text: "Used" },
    ].forEach((opt) => {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.text;
      condSelect.appendChild(option);
    });

    condDiv.appendChild(condLabel);
    condDiv.appendChild(condSelect);
    container.appendChild(condDiv);

    return container;
  }

  /**
   * Helper to wait for async operations
   */
  async function waitFor(condition, timeout = 1000) {
    const start = Date.now();
    while (!condition() && Date.now() - start < timeout) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (!condition()) {
      throw new Error("waitFor timeout");
    }
  }

  it("registers with correct metadata", () => {
    expect(featureDef.id).toBe("wanted-list-smart-filters");
    expect(featureDef.name).toBe("Smart Wanted List Filters");
    expect(featureDef.enabledByDefault).toBe(true);
  });

  it("does nothing when not on search page", () => {
    // Mock URL to not include /wanted/search.page
    const originalHref = window.location.href;
    Object.defineProperty(window, "location", {
      writable: true,
      value: { href: "https://www.bricklink.com/v2/wanted/list.page" },
    });

    const table = createWantedListEditTable([{ condition: "N" }]);
    document.body.appendChild(table);

    featureDef.init();

    // Should not have started anything (no fetch, no observers)
    expect(document.querySelector(".search-item-filters")).toBeNull();

    // Restore
    Object.defineProperty(window, "location", {
      writable: true,
      value: { href: originalHref },
    });
  });

  it("fetches and filters options when filter container appears", async () => {
    // Mock URL
    Object.defineProperty(window, "location", {
      writable: true,
      value: { href: "https://www.bricklink.com/v2/wanted/search.page?wantedMoreID=123" },
    });

    // Mock fetch to return wanted items (all items are condition "N" = New)
    global.fetch = vi.fn((url) => {
      if (url.includes("wanted/search.page")) {
        const html = `var wlJson = {"wantedItems": [{"wantedNew": "N", "colorID": 11}, {"wantedNew": "N", "colorID": 11}], "totalResults": 2};`;
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(html),
        });
      }
      return Promise.reject(new Error("Not found"));
    });

    // Initialize feature
    featureDef.init();

    // Wait for initial fetch to complete
    await waitFor(() => global.fetch.mock.calls.length > 0);
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Add the filter container (simulating "More Options" being clicked)
    const filterContainer = createFilterContainer();
    document.body.appendChild(filterContainer);

    // Wait for filters to be applied
    await new Promise((resolve) => setTimeout(resolve, 100));

    const conditionSelect = filterContainer.querySelector(
      'div.l-flex:has(label:contains("Condition")) select'
    );
    const condLabel = Array.from(filterContainer.querySelectorAll("label")).find(
      (l) => l.textContent === "Condition:"
    );
    const condSelect = condLabel?.nextElementSibling;

    expect(condSelect).toBeTruthy();
    expect(condSelect.value).toBe("N"); // Auto-selected
    expect(condSelect.disabled).toBe(true); // Disabled because all items are "N"
  });

  it("maintains filter state when item fields are edited", async () => {
    // Mock URL
    Object.defineProperty(window, "location", {
      writable: true,
      value: { href: "https://www.bricklink.com/v2/wanted/search.page?wantedMoreID=123" },
    });

    // Mock fetch - all items are "N" (New)
    global.fetch = vi.fn((url) => {
      if (url.includes("wanted/search.page")) {
        const html = `var wlJson = {"wantedItems": [{"wantedNew": "N", "colorID": 11}, {"wantedNew": "N", "colorID": 11}], "totalResults": 2};`;
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(html),
        });
      }
      return Promise.reject(new Error("Not found"));
    });

    // Create table with editable item rows
    const table = createWantedListEditTable([
      { condition: "N", want: 1, have: 0 },
      { condition: "N", want: 2, have: 0 },
    ]);
    document.body.appendChild(table);

    // Initialize feature
    featureDef.init();

    // Wait for fetch to complete
    await waitFor(() => global.fetch.mock.calls.length > 0);
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Add the filter container (simulating "More Options" being clicked)
    const filterContainer = createFilterContainer();
    document.body.appendChild(filterContainer);

    // Wait for filters to be applied
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Get the condition filter select
    const condLabel = Array.from(filterContainer.querySelectorAll("label")).find(
      (l) => l.textContent === "Condition:"
    );
    const condSelect = condLabel?.nextElementSibling;

    // Verify initial state
    expect(condSelect.value).toBe("N");
    expect(condSelect.disabled).toBe(true);

    console.log("Before edit - Filter value:", condSelect.value, "disabled:", condSelect.disabled);

    // Simulate editing the table (which triggers the table observer)
    // Mutate the table to trigger the observer
    const tableRow = table.querySelector(".table-row");
    tableRow.setAttribute("data-test", "mutation");

    // Simulate React resetting the filter after the table mutation
    // (In real browser, this happens ~10-20ms after table changes)
    await new Promise((resolve) => setTimeout(resolve, 10));

    condSelect.value = "X"; // React resets the value
    condSelect.disabled = false;

    console.log("After React reset - Filter value:", condSelect.value, "disabled:", condSelect.disabled);

    // Wait for polling to detect and restore (happens every 5ms)
    await new Promise((resolve) => setTimeout(resolve, 30));

    console.log("After restore - Filter value:", condSelect.value, "disabled:", condSelect.disabled);

    // Verify filter state is maintained
    expect(condSelect.value).toBe("N");
    expect(condSelect.disabled).toBe(true);
    expect(condSelect.style.opacity).toBe("0.6");
  });
});
