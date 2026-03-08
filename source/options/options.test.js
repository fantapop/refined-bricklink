import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadFeature } from "../../test/helpers/load-feature.js";
import path from "path";

const optionsPath = path.resolve(
  import.meta.dirname,
  "./options.js"
);

describe("options page", () => {
  const fakeFeatures = [
    {
      id: "feature-a",
      name: "Feature A",
      description: "Description A",
      enabledByDefault: true,
      init: vi.fn(),
    },
    {
      id: "feature-b",
      name: "Feature B",
      description: "Description B",
      enabledByDefault: false,
      init: vi.fn(),
    },
  ];

  let origAppendChild;

  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = '<div id="features-list"></div>';

    globalThis.RefinedBricklink = { features: [] };

    // Mock manifest to return fake script list
    chrome.runtime.getManifest.mockReturnValue({
      content_scripts: [
        {
          js: [
            "registry.js",
            "features/fake-a.js",
            "features/fake-b.js",
            "main.js",
          ],
        },
      ],
    });

    // Intercept script tags appended to <head> by options.js.
    // options.js filters out registry.js and main.js, so only
    // fake-a.js and fake-b.js will be loaded (2 scripts).
    let loadCount = 0;
    origAppendChild = document.head.appendChild.bind(document.head);
    vi.spyOn(document.head, "appendChild").mockImplementation((el) => {
      if (el.tagName === "SCRIPT" && el.src) {
        loadCount++;
        // On the last script, populate registry
        if (loadCount === 2) {
          RefinedBricklink.features.push(...fakeFeatures);
        }
        // Fire onload in microtask so the IIFE finishes assigning handler
        Promise.resolve().then(() => {
          if (el.onload) el.onload();
        });
        return el;
      }
      return origAppendChild(el);
    });

    chrome.storage.sync.get.mockReset();
    chrome.storage.sync.set.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function loadOptions() {
    loadFeature(optionsPath, { resetRegistry: false });
    // Wait for microtasks — scripts load sequentially so each
    // onload fires in its own microtask chain
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  it("renders a card for each feature", async () => {
    chrome.storage.sync.get.mockImplementation((defaults, cb) => {
      cb({ "feature-a": true, "feature-b": false });
    });

    await loadOptions();

    const cards = document.querySelectorAll(".feature-card");
    expect(cards).toHaveLength(2);
  });

  it("shows feature names and descriptions", async () => {
    chrome.storage.sync.get.mockImplementation((defaults, cb) => {
      cb({ "feature-a": true, "feature-b": false });
    });

    await loadOptions();

    const names = Array.from(
      document.querySelectorAll(".feature-name")
    ).map((el) => el.textContent);
    expect(names).toEqual(["Feature A", "Feature B"]);
  });

  it("checks the checkbox for enabled features", async () => {
    chrome.storage.sync.get.mockImplementation((defaults, cb) => {
      cb({ "feature-a": true, "feature-b": false });
    });

    await loadOptions();

    const checkboxA = document.querySelector('[data-id="feature-a"]');
    const checkboxB = document.querySelector('[data-id="feature-b"]');
    expect(checkboxA.checked).toBe(true);
    expect(checkboxB.checked).toBe(false);
  });

  it("saves to storage when a toggle changes", async () => {
    chrome.storage.sync.get.mockImplementation((defaults, cb) => {
      cb({ "feature-a": true, "feature-b": false });
    });

    await loadOptions();

    const checkboxB = document.querySelector('[data-id="feature-b"]');
    checkboxB.checked = true;
    checkboxB.dispatchEvent(new Event("change"));

    expect(chrome.storage.sync.set).toHaveBeenCalledWith({
      "feature-b": true,
    });
  });
});
