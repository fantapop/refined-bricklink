import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadFeature } from "../../test/helpers/load-feature.js";
import {
  createWantedListModal,
  createWantedAddLink,
} from "../../test/helpers/dom-factory.js";
import path from "path";

const featurePath = path.resolve(
  import.meta.dirname,
  "./reverse-wanted-list.js"
);

describe("reverse-wanted-list feature", () => {
  let feature;

  beforeEach(() => {
    vi.useFakeTimers();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    feature = loadFeature(featurePath);
  });

  afterEach(() => {
    if (feature && typeof feature.destroy === "function") feature.destroy();
    vi.useRealTimers();
  });

  it("registers with correct id and metadata", () => {
    expect(feature.id).toBe("reverse-wanted-list");
    expect(feature.name).toBeDefined();
    expect(feature.enabledByDefault).toBe(true);
  });

  it("also pushes itself onto the registry", () => {
    expect(RefinedBricklink.features).toHaveLength(1);
    expect(RefinedBricklink.features[0].id).toBe("reverse-wanted-list");
  });

  it("reverses list order after click triggers MutationObserver", async () => {
    feature.init();

    // Click the trigger link first (sets up the domObserver)
    const link = createWantedAddLink();
    document.body.appendChild(link);
    link.click();

    // Append the modal — the domObserver on document.body fires immediately
    const modal = createWantedListModal([
      "Default Wanted List",
      "Alpha",
      "Bravo",
      "Charlie",
    ]);
    document.body.appendChild(modal);

    // MutationObserver callbacks are microtasks in jsdom
    await vi.advanceTimersByTimeAsync(0);

    const container = document.querySelector(
      ".wl-add-list .l-overflow-auto--y"
    );
    const names = Array.from(
      container.querySelectorAll(".wl-search-list__name")
    ).map((el) => el.textContent);

    expect(names).toEqual([
      "Default Wanted List",
      "Charlie",
      "Bravo",
      "Alpha",
    ]);
  });

  it("skips reversal when fewer than 2 buttons", async () => {
    feature.init();

    const link = createWantedAddLink();
    document.body.appendChild(link);
    link.click();

    const modal = createWantedListModal(["Default Wanted List"]);
    document.body.appendChild(modal);

    await vi.advanceTimersByTimeAsync(0);

    // With < 2 buttons, applyReversedOrder returns early — no crash
    const container = document.querySelector(
      ".wl-add-list .l-overflow-auto--y"
    );
    const names = Array.from(
      container.querySelectorAll(".wl-search-list__name")
    ).map((el) => el.textContent);
    expect(names).toEqual(["Default Wanted List"]);
  });

  it("processes immediately if DOM is already populated when click fires", async () => {
    feature.init();

    // DOM already has the modal before the click
    const modal = createWantedListModal([
      "Default Wanted List",
      "Alpha",
      "Bravo",
      "Charlie",
    ]);
    document.body.appendChild(modal);

    const link = createWantedAddLink();
    document.body.appendChild(link);
    link.click();

    // tryProcess() runs synchronously on click since DOM is ready
    await vi.advanceTimersByTimeAsync(0);

    const container = document.querySelector(
      ".wl-add-list .l-overflow-auto--y"
    );
    const names = Array.from(
      container.querySelectorAll(".wl-search-list__name")
    ).map((el) => el.textContent);

    expect(names).toEqual([
      "Default Wanted List",
      "Charlie",
      "Bravo",
      "Alpha",
    ]);
  });

  it("re-reverses when MutationObserver fires (React re-render)", async () => {
    feature.init();

    const link = createWantedAddLink();
    document.body.appendChild(link);
    link.click();

    const modal = createWantedListModal([
      "Default Wanted List",
      "Alpha",
      "Bravo",
      "Charlie",
    ]);
    document.body.appendChild(modal);
    await vi.advanceTimersByTimeAsync(0);

    const container = document.querySelector(
      ".wl-add-list .l-overflow-auto--y"
    );

    // Simulate React re-rendering by re-appending in original order
    const buttons = Array.from(
      container.querySelectorAll("button.wl-search-list")
    );
    const origOrder = ["Default Wanted List", "Alpha", "Bravo", "Charlie"];
    for (const name of origOrder) {
      const btn = buttons.find(
        (b) =>
          b.querySelector(".wl-search-list__name").textContent === name
      );
      container.appendChild(btn);
    }

    // containerObserver fires asynchronously
    await vi.advanceTimersByTimeAsync(0);

    const names = Array.from(
      container.querySelectorAll(".wl-search-list__name")
    ).map((el) => el.textContent);

    expect(names).toEqual([
      "Default Wanted List",
      "Charlie",
      "Bravo",
      "Alpha",
    ]);
  });

  it("destroy() cleans up handler and observers", () => {
    feature.init();

    const link = createWantedAddLink();
    document.body.appendChild(link);
    link.click();

    // domObserver is active
    feature.destroy();

    // No crash, no lingering observers
  });
});
