import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadFeature } from "../../test/helpers/load-feature.js";
import { createWantedListsIndexTable } from "../../test/helpers/dom-factory.js";
import path from "path";

const featurePath = path.resolve(
  import.meta.dirname,
  "./wanted-list-download-all.js"
);

const LISTS = [
  { id: 123, name: "375 - castle" },
  { id: 456, name: "My Parts" },
  { id: 0, name: "Default Wanted List" },
];

function createSearchGroup() {
  const div = document.createElement("div");
  div.className = "search-group";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "search-query form-text";
  input.placeholder = "Search Wanted Lists by name";
  const btn = document.createElement("button");
  btn.className = "bl-btn bl-btn-search";
  div.appendChild(input);
  div.appendChild(btn);
  return div;
}

describe("wanted-list-download-all feature", () => {
  let feature;

  beforeEach(() => {
    vi.useFakeTimers();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    Object.defineProperty(window, "location", {
      value: { pathname: "/v2/wanted/list.page" },
      writable: true,
      configurable: true,
    });
    feature = loadFeature(featurePath);
  });

  afterEach(() => {
    if (feature && typeof feature.destroy === "function") feature.destroy();
    vi.useRealTimers();
  });

  it("registers with correct id and metadata", () => {
    expect(feature.id).toBe("wanted-list-download-all");
    expect(feature.name).toBeDefined();
    expect(feature.enabledByDefault).toBe(true);
    expect(feature.section).toBe("Wanted Lists");
  });

  it("does nothing when not on the list page", () => {
    window.location = { pathname: "/v2/wanted/search.page" };
    feature = loadFeature(featurePath);

    document.body.appendChild(createSearchGroup());
    document.body.appendChild(createWantedListsIndexTable(LISTS));
    feature.init();

    expect(document.querySelector(".rb-dl-all-btn")).toBeNull();
  });

  it("inserts download all button as sibling after .search-group", async () => {
    document.body.appendChild(createSearchGroup());
    document.body.appendChild(createWantedListsIndexTable(LISTS));
    feature.init();

    await vi.advanceTimersByTimeAsync(0);

    const btn = document.querySelector(".rb-dl-all-btn");
    expect(btn).not.toBeNull();
    // Button is a sibling of .search-group (not inside it) to avoid line-wrapping
    const searchGroup = document.querySelector(".search-group");
    expect(searchGroup.nextElementSibling).toBe(btn);
  });

  it("shows 'All' label with fa-download icon when no filter", async () => {
    document.body.appendChild(createSearchGroup());
    document.body.appendChild(createWantedListsIndexTable(LISTS));
    feature.init();

    await vi.advanceTimersByTimeAsync(0);

    const btn = document.querySelector(".rb-dl-all-btn");
    expect(btn.querySelector(".rb-dl-all-label").textContent).toBe("All");
    expect(btn.querySelector("i.fas.fa-download")).not.toBeNull();
  });

  it("shows count in parens when search input has value", async () => {
    const searchGroup = createSearchGroup();
    document.body.appendChild(searchGroup);

    // Simulate filtered table (only 1 row visible)
    const filteredTable = createWantedListsIndexTable([LISTS[0]]);
    filteredTable.className = "wl-overview-list-table"; // non-compact
    document.body.appendChild(filteredTable);

    feature.init();
    await vi.advanceTimersByTimeAsync(0);

    // Set search value and fire input event
    const input = searchGroup.querySelector("input.search-query");
    input.value = "castle";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    await vi.advanceTimersByTimeAsync(0);

    const btn = document.querySelector(".rb-dl-all-btn");
    expect(btn.querySelector(".rb-dl-all-label").textContent).toBe("(1)");
  });

  it("updates count when table rows change (MutationObserver)", async () => {
    const searchGroup = createSearchGroup();
    const table = createWantedListsIndexTable(LISTS);
    document.body.appendChild(searchGroup);
    document.body.appendChild(table);
    feature.init();

    await vi.advanceTimersByTimeAsync(0);

    const btn = document.querySelector(".rb-dl-all-btn");
    expect(btn.querySelector(".rb-dl-all-label").textContent).toBe("All");

    // Simulate React re-rendering table with 1 row
    const newTable = createWantedListsIndexTable([LISTS[0]]);
    table.replaceWith(newTable);

    await vi.advanceTimersByTimeAsync(0);

    // Label stays "All" (no filter active), count reflects new table
    // updateButton re-reads visible rows after the mutation
    expect(btn.querySelector(".rb-dl-all-label").textContent).toBe("All");
  });

  it("does not add duplicate buttons on repeated MutationObserver fires", async () => {
    document.body.appendChild(createSearchGroup());
    document.body.appendChild(createWantedListsIndexTable(LISTS));
    feature.init();

    await vi.advanceTimersByTimeAsync(0);

    // Trigger a DOM mutation
    document.body.appendChild(document.createComment("re-render"));

    await vi.advanceTimersByTimeAsync(0);

    expect(document.querySelectorAll(".rb-dl-all-btn")).toHaveLength(1);
  });

  it("inserts button when search group appears after init (React render)", async () => {
    feature.init();

    // Search group appears after init
    document.body.appendChild(createSearchGroup());
    document.body.appendChild(createWantedListsIndexTable(LISTS));

    await vi.advanceTimersByTimeAsync(0);

    expect(document.querySelector(".rb-dl-all-btn")).not.toBeNull();
  });

  it("clicks direct XML download link when only one list is visible", async () => {
    document.body.appendChild(createSearchGroup());
    document.body.appendChild(createWantedListsIndexTable([LISTS[0]]));
    feature.init();

    await vi.advanceTimersByTimeAsync(0);

    const btn = document.querySelector(".rb-dl-all-btn");

    // Track <a> clicks via document-level listener
    const clicks = [];
    document.addEventListener("click", (e) => {
      if (e.target.tagName === "A") clicks.push(e.target.getAttribute("href"));
    });

    btn.click();

    expect(clicks).toHaveLength(1);
    expect(clicks[0]).toBe(
      "/files/clone/wanted/downloadXML.file?wantedMoreID=123&wlName=375%20-%20castle"
    );
  });

  it("destroy removes button and style", () => {
    document.body.appendChild(createSearchGroup());
    document.body.appendChild(createWantedListsIndexTable(LISTS));
    feature.init();

    feature.destroy();

    expect(document.querySelector(".rb-dl-all-btn")).toBeNull();
    expect(document.querySelector("style")).toBeNull();
  });
});
