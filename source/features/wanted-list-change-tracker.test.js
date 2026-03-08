import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadFeature } from "../../test/helpers/load-feature.js";
import { createWantedListEditTable } from "../../test/helpers/dom-factory.js";
import path from "path";

const featurePath = path.resolve(
  import.meta.dirname,
  "./wanted-list-change-tracker.js"
);

describe("wanted-list-change-tracker feature", () => {
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
    expect(feature.id).toBe("wanted-list-change-tracker");
    expect(feature.name).toBeDefined();
    expect(feature.enabledByDefault).toBe(true);
  });

  it("pushes itself onto the registry", () => {
    expect(RefinedBricklink.features).toHaveLength(1);
    expect(RefinedBricklink.features[0].id).toBe("wanted-list-change-tracker");
  });

  it("does nothing when no .table-wl-edit exists", () => {
    feature.init();
    expect(document.getElementById("rb-change-tracker-styles")).toBeNull();
  });

  it("injects styles when table exists", () => {
    const table = createWantedListEditTable([{ want: 1, have: 0 }]);
    document.body.appendChild(table);
    feature.init();
    expect(document.getElementById("rb-change-tracker-styles")).not.toBeNull();
  });

  it("adds orange background class when value changes", () => {
    const table = createWantedListEditTable([{ want: 1, have: 0 }]);
    document.body.appendChild(table);
    feature.init();

    const wantInput = table.querySelector(
      ".wl-col-quantity input.form-text.width-small"
    );
    wantInput.value = "5";
    wantInput.dispatchEvent(new Event("input", { bubbles: true }));

    expect(wantInput.classList.contains("rb-changed-field")).toBe(true);
  });

  it("removes indicator when value reverts to original", () => {
    const table = createWantedListEditTable([{ want: 1, have: 0 }]);
    document.body.appendChild(table);
    feature.init();

    const wantInput = table.querySelector(
      ".wl-col-quantity input.form-text.width-small"
    );

    wantInput.value = "5";
    wantInput.dispatchEvent(new Event("input", { bubbles: true }));
    expect(wantInput.classList.contains("rb-changed-field")).toBe(true);

    wantInput.value = "1";
    wantInput.dispatchEvent(new Event("input", { bubbles: true }));
    expect(wantInput.classList.contains("rb-changed-field")).toBe(false);
  });

  it("creates spin panel for quantity inputs", () => {
    const table = createWantedListEditTable([{ want: 1, have: 0 }]);
    document.body.appendChild(table);
    feature.init();

    const panels = table.querySelectorAll(".rb-spin-panel");
    // Two panels: one for Want, one for Have
    expect(panels.length).toBe(2);
  });

  it("spin panel has up/down/max/revert buttons", () => {
    const table = createWantedListEditTable([{ want: 1, have: 0 }]);
    document.body.appendChild(table);
    feature.init();

    const panel = table.querySelector(".rb-spin-panel");
    expect(panel.querySelector(".rb-s-up")).not.toBeNull();
    expect(panel.querySelector(".rb-s-down")).not.toBeNull();
    expect(panel.querySelector(".rb-s-eq")).not.toBeNull();
    expect(panel.querySelector(".rb-s-revert")).not.toBeNull();
  });

  it("revert button is hidden when field is unchanged", () => {
    const table = createWantedListEditTable([{ want: 1, have: 0 }]);
    document.body.appendChild(table);
    feature.init();

    // Trigger an update to set initial state
    const wantInput = table.querySelector(
      ".wl-col-quantity input.form-text.width-small"
    );
    wantInput.dispatchEvent(new Event("input", { bubbles: true }));

    const panel = wantInput.parentNode.querySelector(".rb-spin-panel");
    const revert = panel.querySelector(".rb-s-revert");
    expect(revert.classList.contains("rb-hidden")).toBe(true);
  });

  it("revert button shows when field is modified", () => {
    const table = createWantedListEditTable([{ want: 1, have: 0 }]);
    document.body.appendChild(table);
    feature.init();

    const wantInput = table.querySelector(
      ".wl-col-quantity input.form-text.width-small"
    );
    wantInput.value = "5";
    wantInput.dispatchEvent(new Event("input", { bubbles: true }));

    const panel = wantInput.parentNode.querySelector(".rb-spin-panel");
    const revert = panel.querySelector(".rb-s-revert");
    expect(revert.classList.contains("rb-hidden")).toBe(false);
  });

  it("revert button restores original value", () => {
    const table = createWantedListEditTable([{ want: 2, have: 0 }]);
    document.body.appendChild(table);
    feature.init();

    const wantInput = table.querySelector(
      ".wl-col-quantity input.form-text.width-small"
    );
    wantInput.value = "99";
    wantInput.dispatchEvent(new Event("input", { bubbles: true }));
    expect(wantInput.classList.contains("rb-changed-field")).toBe(true);

    const panel = wantInput.parentNode.querySelector(".rb-spin-panel");
    const revert = panel.querySelector(".rb-s-revert");
    revert.click();

    expect(wantInput.value).toBe("2");
    expect(wantInput.classList.contains("rb-changed-field")).toBe(false);
  });

  it("equals button is hidden when have equals want", () => {
    const table = createWantedListEditTable([{ want: 3, have: 3 }]);
    document.body.appendChild(table);
    feature.init();

    const inputs = table.querySelectorAll(
      ".wl-col-quantity input.form-text.width-small"
    );
    const haveInput = inputs[1];
    const panel = haveInput.parentNode.querySelector(".rb-spin-panel");
    const eq = panel.querySelector(".rb-s-eq");
    expect(eq.classList.contains("rb-hidden")).toBe(true);
  });

  it("equals button shows on Have when have differs from want", () => {
    const table = createWantedListEditTable([{ want: 5, have: 1 }]);
    document.body.appendChild(table);
    feature.init();

    const inputs = table.querySelectorAll(
      ".wl-col-quantity input.form-text.width-small"
    );
    const haveInput = inputs[1];
    const panel = haveInput.parentNode.querySelector(".rb-spin-panel");
    const eq = panel.querySelector(".rb-s-eq");
    expect(eq.classList.contains("rb-hidden")).toBe(false);
  });

  it("equals button on Have sets have to want quantity", () => {
    const table = createWantedListEditTable([{ want: 5, have: 1 }]);
    document.body.appendChild(table);
    feature.init();

    const inputs = table.querySelectorAll(
      ".wl-col-quantity input.form-text.width-small"
    );
    const haveInput = inputs[1];
    const panel = haveInput.parentNode.querySelector(".rb-spin-panel");
    const eq = panel.querySelector(".rb-s-eq");
    eq.click();

    expect(haveInput.value).toBe("5");
  });

  it("equals button on Want sets want to have quantity", () => {
    const table = createWantedListEditTable([{ want: 5, have: 1 }]);
    document.body.appendChild(table);
    feature.init();

    const inputs = table.querySelectorAll(
      ".wl-col-quantity input.form-text.width-small"
    );
    const wantInput = inputs[0];
    const panel = wantInput.parentNode.querySelector(".rb-spin-panel");
    const eq = panel.querySelector(".rb-s-eq");
    eq.click();

    expect(wantInput.value).toBe("1");
  });

  it("tracks price field changes", () => {
    const table = createWantedListEditTable([
      { want: 1, have: 0, price: "5.00" },
    ]);
    document.body.appendChild(table);
    feature.init();

    const priceInput = table.querySelector(".wl-col-price input.form-text");
    priceInput.value = "10.00";
    priceInput.dispatchEvent(new Event("input", { bubbles: true }));

    expect(priceInput.classList.contains("rb-changed-field")).toBe(true);
  });

  it("tracks condition select changes", () => {
    const table = createWantedListEditTable([
      { want: 1, have: 0, condition: "N" },
    ]);
    document.body.appendChild(table);
    feature.init();

    const sel = table.querySelector(".wl-col-condition select.form-text");
    sel.value = "U";
    sel.dispatchEvent(new Event("change", { bubbles: true }));

    expect(sel.classList.contains("rb-changed-field")).toBe(true);
  });

  it("handles multiple rows independently", () => {
    const table = createWantedListEditTable([
      { want: 1, have: 0 },
      { want: 3, have: 2 },
    ]);
    document.body.appendChild(table);
    feature.init();

    const wantInputs = table.querySelectorAll(
      ".wl-col-quantity input.form-text.width-small"
    );
    const firstWant = wantInputs[0];
    const secondWant = wantInputs[2]; // 0=want1, 1=have1, 2=want2

    secondWant.value = "99";
    secondWant.dispatchEvent(new Event("input", { bubbles: true }));

    expect(firstWant.classList.contains("rb-changed-field")).toBe(false);
    expect(secondWant.classList.contains("rb-changed-field")).toBe(true);
  });

  it("does not create spin panel for non-quantity fields", () => {
    const table = createWantedListEditTable([
      { want: 1, have: 0, price: "5.00" },
    ]);
    document.body.appendChild(table);
    feature.init();

    const priceCell = table.querySelector(".wl-col-price");
    expect(priceCell.querySelector(".rb-spin-panel")).toBeNull();
  });

  it("destroy() removes styles and panels", () => {
    const table = createWantedListEditTable([{ want: 1, have: 0 }]);
    document.body.appendChild(table);
    feature.init();

    expect(document.getElementById("rb-change-tracker-styles")).not.toBeNull();
    expect(table.querySelectorAll(".rb-spin-panel").length).toBeGreaterThan(0);

    feature.destroy();

    expect(document.getElementById("rb-change-tracker-styles")).toBeNull();
    expect(table.querySelectorAll(".rb-spin-panel").length).toBe(0);
  });
});
