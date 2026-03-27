import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadFeature } from "../test/helpers/load-feature.js";
import path from "path";

const mainPath = path.resolve(import.meta.dirname, "./main.js");

describe("main.js", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    localStorage.clear();
    globalThis.RefinedBricklink = { features: [] };
    chrome.storage.sync.get.mockReset();
    chrome.runtime.getManifest.mockReturnValue({ version: "0.1.0" });
  });

  it("stamps a version meta tag on the document head", () => {
    chrome.storage.sync.get.mockImplementation((defaults, cb) => cb({}));
    loadFeature(mainPath, { resetRegistry: false });

    const meta = document.querySelector('meta[name="rb-version"]');
    expect(meta).not.toBeNull();
    expect(meta.content).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("calls init() on enabled features", () => {
    const mockInit = vi.fn();
    RefinedBricklink.features.push({
      id: "test-feature",
      enabledByDefault: true,
      init: mockInit,
    });

    chrome.storage.sync.get.mockImplementation((defaults, cb) => {
      cb({ "test-feature": true });
    });
    loadFeature(mainPath, { resetRegistry: false });

    expect(mockInit).toHaveBeenCalledOnce();
  });

  it("skips disabled features", () => {
    const mockInit = vi.fn();
    RefinedBricklink.features.push({
      id: "disabled-feature",
      enabledByDefault: false,
      init: mockInit,
    });

    chrome.storage.sync.get.mockImplementation((defaults, cb) => {
      cb({ "disabled-feature": false });
    });
    loadFeature(mainPath, { resetRegistry: false });

    expect(mockInit).not.toHaveBeenCalled();
  });

  it("catches and logs errors from feature init", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    RefinedBricklink.features.push({
      id: "broken-feature",
      enabledByDefault: true,
      init() {
        throw new Error("boom");
      },
    });

    chrome.storage.sync.get.mockImplementation((defaults, cb) => {
      cb({ "broken-feature": true });
    });
    loadFeature(mainPath, { resetRegistry: false });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("broken-feature"),
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it("exports initFeatures and defaults for testing", () => {
    RefinedBricklink.features.push({
      id: "foo",
      enabledByDefault: true,
      init: vi.fn(),
    });

    chrome.storage.sync.get.mockImplementation((defaults, cb) => cb(defaults));
    const mod = loadFeature(mainPath, { resetRegistry: false });

    expect(mod).toHaveProperty("initFeatures");
    expect(mod).toHaveProperty("defaults");
    expect(typeof mod.initFeatures).toBe("function");
    expect(mod.defaults).toEqual({ foo: true });
  });
});
