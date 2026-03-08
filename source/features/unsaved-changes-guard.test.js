import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadFeature } from "../../test/helpers/load-feature.js";
import path from "path";

const featurePath = path.resolve(
  import.meta.dirname,
  "./unsaved-changes-guard.js"
);

describe("unsaved-changes-guard feature", () => {
  let feature;

  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    feature = loadFeature(featurePath);
  });

  afterEach(() => {
    if (feature && typeof feature.destroy === "function") feature.destroy();
  });

  it("registers with correct id and metadata", () => {
    expect(feature.id).toBe("unsaved-changes-guard");
    expect(feature.name).toBeDefined();
    expect(feature.enabledByDefault).toBe(true);
  });

  it("does nothing when no #wanted-save-banner exists", () => {
    feature.init();
    // No error thrown, no handler attached
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("does not warn when banner is hidden (display: none)", () => {
    const banner = document.createElement("div");
    banner.id = "wanted-save-banner";
    banner.style.display = "none";
    document.body.appendChild(banner);

    feature.init();

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("warns when banner is visible", () => {
    const banner = document.createElement("div");
    banner.id = "wanted-save-banner";
    banner.style.display = "block";
    // jsdom doesn't compute layout, so offsetHeight is always 0.
    // Override it to simulate a visible banner.
    Object.defineProperty(banner, "offsetHeight", { value: 50 });
    document.body.appendChild(banner);

    feature.init();

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("stops warning after banner becomes hidden again", () => {
    const banner = document.createElement("div");
    banner.id = "wanted-save-banner";
    document.body.appendChild(banner);

    // Start visible
    let offsetH = 50;
    Object.defineProperty(banner, "offsetHeight", { get: () => offsetH });

    feature.init();

    // Visible — should warn
    const e1 = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(e1);
    expect(e1.defaultPrevented).toBe(true);

    // Hidden — should not warn
    offsetH = 0;
    const e2 = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(e2);
    expect(e2.defaultPrevented).toBe(false);
  });

  it("warns when edit-summary is present and visible", () => {
    const banner = document.createElement("div");
    banner.id = "wanted-save-banner";
    document.body.appendChild(banner);

    // Simulate edit-summary-banner being active with changes
    const summary = document.createElement("span");
    summary.id = "rb-edit-summary";
    summary.style.display = "";
    document.body.appendChild(summary);

    feature.init();

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not warn when edit-summary is present but hidden", () => {
    const banner = document.createElement("div");
    banner.id = "wanted-save-banner";
    Object.defineProperty(banner, "offsetHeight", { value: 50 });
    document.body.appendChild(banner);

    // Simulate edit-summary-banner being active but no changes
    const summary = document.createElement("span");
    summary.id = "rb-edit-summary";
    summary.style.display = "none";
    document.body.appendChild(summary);

    feature.init();

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("destroy() removes the beforeunload handler", () => {
    const banner = document.createElement("div");
    banner.id = "wanted-save-banner";
    Object.defineProperty(banner, "offsetHeight", { value: 50 });
    document.body.appendChild(banner);

    feature.init();
    feature.destroy();

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
