import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadFeature } from "../../test/helpers/load-feature.js";
import { createWantedListsIndexTable } from "../../test/helpers/dom-factory.js";
import path from "path";

const featurePath = path.resolve(
  import.meta.dirname,
  "./wanted-list-download-buttons.js"
);

const LISTS = [
  { id: 123, name: "375 - castle" },
  { id: 456, name: "My Parts" },
];

describe("wanted-list-download-buttons feature", () => {
  let feature;

  beforeEach(() => {
    vi.useFakeTimers();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    // Simulate the wanted lists index page URL
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
    expect(feature.id).toBe("wanted-list-download-buttons");
    expect(feature.name).toBeDefined();
    expect(feature.enabledByDefault).toBe(true);
  });

  it("does nothing when not on the list page", async () => {
    window.location = { pathname: "/v2/wanted/search.page" };
    feature = loadFeature(featurePath);

    const table = createWantedListsIndexTable(LISTS);
    document.body.appendChild(table);
    feature.init();

    await vi.advanceTimersByTimeAsync(0);

    expect(document.querySelectorAll(".rb-dl-btn")).toHaveLength(0);
  });

  it("adds a Download button to each list row", async () => {
    const table = createWantedListsIndexTable(LISTS);
    document.body.appendChild(table);
    feature.init();

    await vi.advanceTimersByTimeAsync(0);

    const buttons = document.querySelectorAll(".rb-dl-btn");
    expect(buttons).toHaveLength(2);
  });

  it("sets the correct download href on each button", async () => {
    const table = createWantedListsIndexTable(LISTS);
    document.body.appendChild(table);
    feature.init();

    await vi.advanceTimersByTimeAsync(0);

    const buttons = Array.from(document.querySelectorAll(".rb-dl-btn"));
    expect(buttons[0].getAttribute("href")).toBe(
      "/files/clone/wanted/downloadXML.file?wantedMoreID=123&wlName=375%20-%20castle"
    );
    expect(buttons[1].getAttribute("href")).toBe(
      "/files/clone/wanted/downloadXML.file?wantedMoreID=456&wlName=My%20Parts"
    );
  });

  it("does not add duplicate buttons when MutationObserver fires again", async () => {
    const table = createWantedListsIndexTable(LISTS);
    document.body.appendChild(table);
    feature.init();

    await vi.advanceTimersByTimeAsync(0);

    // Simulate a DOM mutation that would re-trigger addButtons
    table.appendChild(document.createComment("re-render"));
    await vi.advanceTimersByTimeAsync(0);

    expect(document.querySelectorAll(".rb-dl-btn")).toHaveLength(2);
  });

  it("adds buttons to rows added dynamically after init", async () => {
    feature.init();

    // Table appears after init (React render)
    const table = createWantedListsIndexTable(LISTS);
    document.body.appendChild(table);

    await vi.advanceTimersByTimeAsync(0);

    expect(document.querySelectorAll(".rb-dl-btn")).toHaveLength(2);
  });

  it("destroy removes injected buttons and style", () => {
    const table = createWantedListsIndexTable(LISTS);
    document.body.appendChild(table);
    feature.init();

    feature.destroy();

    expect(document.querySelectorAll(".rb-dl-btn")).toHaveLength(0);
    expect(document.querySelector("style")).toBeNull();
  });
});
