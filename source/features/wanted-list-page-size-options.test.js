import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadFeature } from "../../test/helpers/load-feature.js";
import path from "path";

const featurePath = path.resolve(
  import.meta.dirname,
  "./wanted-list-page-size-options.js"
);

function createPageSizeSelect(value = "25") {
  const sel = document.createElement("select");
  sel.className = "select width-xsm tight";
  for (const v of ["25", "50", "100"]) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v + " per pg";
    sel.appendChild(opt);
  }
  sel.value = value;
  return sel;
}

function settings(overrides = {}) {
  return { "rb-page-size-options": "50,100,250,500", ...overrides };
}

describe("wanted-list-page-size-options feature", () => {
  let feature;

  beforeEach(() => {
    document.body.innerHTML = "";
    Object.defineProperty(window, "location", {
      value: { pathname: "/v2/wanted/search.page", search: "" },
      writable: true,
      configurable: true,
    });
    globalThis.chrome = { storage: { sync: { get: vi.fn(), set: vi.fn() } } };
    feature = loadFeature(featurePath);
  });

  afterEach(() => {
    if (feature && typeof feature.destroy === "function") feature.destroy();
  });

  it("registers with correct id and metadata", () => {
    expect(feature.id).toBe("wanted-list-page-size-options");
    expect(feature.enabledByDefault).toBe(true);
    expect(feature.settings[0].default).toBe("50,100,250,500");
  });

  it("replaces select options with custom values", () => {
    const sel = createPageSizeSelect("25");
    document.body.appendChild(sel);
    feature.init(settings());
    const values = Array.from(sel.options).map((o) => o.value);
    expect(values).toEqual(["50", "100", "250", "500"]);
  });

  it("updates all matching selects on the page", () => {
    const top = createPageSizeSelect("25");
    const bottom = createPageSizeSelect("25");
    document.body.appendChild(top);
    document.body.appendChild(bottom);
    feature.init(settings());
    for (const sel of [top, bottom]) {
      expect(Array.from(sel.options).map((o) => o.value)).toEqual(["50", "100", "250", "500"]);
    }
  });

  it("sorts options numerically", () => {
    const sel = createPageSizeSelect("25");
    document.body.appendChild(sel);
    feature.init(settings({ "rb-page-size-options": "500,50,250,100" }));
    const values = Array.from(sel.options).map((o) => o.value);
    expect(values).toEqual(["50", "100", "250", "500"]);
  });

  it("uses 'N per pg' label format", () => {
    const sel = createPageSizeSelect("25");
    document.body.appendChild(sel);
    feature.init(settings());
    expect(sel.options[0].textContent).toBe("50 per pg");
    expect(sel.options[3].textContent).toBe("500 per pg");
  });

  it("preserves current value if still in new options", () => {
    const sel = createPageSizeSelect("100");
    document.body.appendChild(sel);
    feature.init(settings());
    expect(sel.value).toBe("100");
  });

  it("does not preserve current value if not in new options", () => {
    const sel = createPageSizeSelect("25");
    document.body.appendChild(sel);
    feature.init(settings());
    expect(sel.value).not.toBe("25");
  });

  it("restores value from URL when pageSize is not in original options", () => {
    window.location.search = "?wantedMoreID=123&pageSize=500";
    // BrickLink falls back to "25" since 500 isn't in the original options
    const sel = createPageSizeSelect("25");
    document.body.appendChild(sel);
    feature.init(settings());
    expect(sel.value).toBe("500");
  });

  it("does nothing when not on search page", () => {
    window.location.pathname = "/v2/wanted/list.page";
    const sel = createPageSizeSelect("25");
    document.body.appendChild(sel);
    feature.init(settings());
    expect(Array.from(sel.options).map((o) => o.value)).toEqual(["25", "50", "100"]);
  });

  it("destroy() restores original options on all selects", () => {
    const top = createPageSizeSelect("25");
    const bottom = createPageSizeSelect("25");
    document.body.appendChild(top);
    document.body.appendChild(bottom);
    feature.init(settings());
    feature.destroy();
    for (const sel of [top, bottom]) {
      expect(Array.from(sel.options).map((o) => o.value)).toEqual(["25", "50", "100"]);
    }
  });
});
