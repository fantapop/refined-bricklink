import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadFeature } from "../../test/helpers/load-feature.js";
import { createWantedListEditTable } from "../../test/helpers/dom-factory.js";
import path from "path";

const featurePath = path.resolve(
  import.meta.dirname,
  "./quantity-spacing.js"
);

describe("quantity-spacing feature", () => {
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
    expect(feature.id).toBe("quantity-spacing");
    expect(feature.name).toBeDefined();
    expect(feature.enabledByDefault).toBe(true);
  });

  it("does nothing when no .table-wl-edit exists", () => {
    feature.init();
    expect(document.getElementById("rb-quantity-spacing-styles")).toBeNull();
  });

  it("injects styles when table exists", () => {
    const table = createWantedListEditTable([{ want: 1, have: 0 }]);
    document.body.appendChild(table);
    feature.init();
    expect(document.getElementById("rb-quantity-spacing-styles")).not.toBeNull();
  });

  it("destroy() removes styles", () => {
    const table = createWantedListEditTable([{ want: 1, have: 0 }]);
    document.body.appendChild(table);
    feature.init();
    expect(document.getElementById("rb-quantity-spacing-styles")).not.toBeNull();
    feature.destroy();
    expect(document.getElementById("rb-quantity-spacing-styles")).toBeNull();
  });
});
