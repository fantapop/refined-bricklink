import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadFeature } from "../../test/helpers/load-feature.js";
import path from "path";

const featurePath = path.resolve(
  import.meta.dirname,
  "./wanted-list-page-size.js"
);

function createEditLink(wantedMoreID) {
  const a = document.createElement("a");
  a.href = `https://www.bricklink.com/v2/wanted/edit.page?wantedMoreID=${wantedMoreID}`;
  return a;
}

function createSearchLink(wantedMoreID, extraParams = "") {
  const a = document.createElement("a");
  a.href = `https://www.bricklink.com/v2/wanted/search.page?wantedMoreID=${wantedMoreID}${extraParams}`;
  return a;
}

function settings(overrides = {}) {
  return { "rb-page-size": "100", ...overrides };
}

describe("wanted-list-page-size feature", () => {
  let feature;

  beforeEach(() => {
    document.body.innerHTML = "";
    globalThis.chrome = { storage: { sync: { get: vi.fn(), set: vi.fn() } } };
    feature = loadFeature(featurePath);
  });

  afterEach(() => {
    if (feature && typeof feature.destroy === "function") feature.destroy();
  });

  it("registers with correct id and metadata", () => {
    expect(feature.id).toBe("wanted-list-page-size");
    expect(feature.name).toBeDefined();
    expect(feature.enabledByDefault).toBe(true);
    expect(feature.settings).toHaveLength(1);
    expect(feature.settings[0].type).toBe("select");
    expect(feature.settings[0].default).toBe("100");
  });

  it("rewrites edit.page links to search.page with pageSize=100", () => {
    const a = createEditLink(123);
    document.body.appendChild(a);
    feature.init(settings());
    const url = new URL(a.href);
    expect(url.pathname).toBe("/v2/wanted/search.page");
    expect(url.searchParams.get("pageSize")).toBe("100");
    expect(url.searchParams.get("wantedMoreID")).toBe("123");
  });

  it("adds pageSize to direct search.page links", () => {
    const a = createSearchLink(123);
    document.body.appendChild(a);
    feature.init(settings());
    expect(new URL(a.href).searchParams.get("pageSize")).toBe("100");
  });

  it("uses preference of 50 when configured", () => {
    const a = createEditLink(123);
    document.body.appendChild(a);
    feature.init(settings({ "rb-page-size": "50" }));
    const url = new URL(a.href);
    expect(url.pathname).toBe("/v2/wanted/search.page");
    expect(url.searchParams.get("pageSize")).toBe("50");
  });

  it("does nothing when preference is 25 (BrickLink default)", () => {
    const a = createEditLink(123);
    const originalHref = a.href;
    document.body.appendChild(a);
    feature.init(settings({ "rb-page-size": "25" }));
    expect(a.href).toBe(originalHref);
  });

  it("does not modify links that already have pageSize", () => {
    const a = createSearchLink(123, "&pageSize=50");
    const originalHref = a.href;
    document.body.appendChild(a);
    feature.init(settings());
    expect(a.href).toBe(originalHref);
  });

  it("picks up links added dynamically via MutationObserver", async () => {
    feature.init(settings());
    const a = createEditLink(456);
    document.body.appendChild(a);
    await new Promise((r) => setTimeout(r, 0));
    const url = new URL(a.href);
    expect(url.pathname).toBe("/v2/wanted/search.page");
    expect(url.searchParams.get("pageSize")).toBe("100");
  });

  it("destroy() restores original hrefs", () => {
    const a = createEditLink(123);
    const originalHref = a.href;
    document.body.appendChild(a);
    feature.init(settings());
    expect(new URL(a.href).pathname).toBe("/v2/wanted/search.page");
    feature.destroy();
    expect(a.href).toBe(originalHref);
  });
});
