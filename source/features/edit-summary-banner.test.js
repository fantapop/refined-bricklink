import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadFeature } from "../../test/helpers/load-feature.js";
import { createWantedListEditTable } from "../../test/helpers/dom-factory.js";
import path from "path";

const featurePath = path.resolve(
  import.meta.dirname,
  "./edit-summary-banner.js"
);

function createBanner() {
  const banner = document.createElement("div");
  banner.id = "wanted-save-banner";
  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Cancel";
  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save";
  banner.appendChild(cancelBtn);
  banner.appendChild(saveBtn);
  document.body.appendChild(banner);
  return banner;
}

describe("edit-summary-banner feature", () => {
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
    expect(feature.id).toBe("edit-summary-banner");
    expect(feature.name).toBeDefined();
    expect(feature.enabledByDefault).toBe(true);
  });

  it("does nothing without table", () => {
    createBanner();
    feature.init();
    expect(document.getElementById("rb-edit-summary")).toBeNull();
  });

  it("does nothing without banner", () => {
    const table = createWantedListEditTable([{ description: "Part A" }]);
    document.body.appendChild(table);
    feature.init();
    expect(document.getElementById("rb-edit-summary")).toBeNull();
  });

  it("shows '1 item changed' with popover for single row", () => {
    const table = createWantedListEditTable([
      { description: "Castle 375", want: 1, have: 0, price: "5.00" },
    ]);
    document.body.appendChild(table);
    createBanner();

    feature.init();

    const summary = document.getElementById("rb-edit-summary");
    expect(summary).not.toBeNull();
    expect(summary.style.display).toBe("none");

    // Change the condition select
    const sel = table.querySelector(".wl-col-condition select.form-text");
    sel.value = "N";
    sel.dispatchEvent(new Event("change", { bubbles: true }));

    expect(summary.style.display).not.toBe("none");
    const link = summary.querySelector(".rb-summary-link");
    expect(link.textContent).toBe("1 item changed");

    const grid = summary.querySelector(".rb-summary-grid");
    expect(grid).not.toBeNull();
    expect(grid.querySelector(".rb-summary-popover-desc").textContent).toBe("Castle 375");
    expect(grid.querySelector(".rb-summary-popover-fields").textContent).toBe("Condition");
  });

  it("shows 'Multiple' when more than one field changed on a row", () => {
    const table = createWantedListEditTable([
      { description: "Castle 375", want: 1, have: 0, price: "5.00" },
    ]);
    document.body.appendChild(table);
    createBanner();

    feature.init();

    // Change condition and want qty
    const sel = table.querySelector(".wl-col-condition select.form-text");
    sel.value = "N";

    const wantInput = table.querySelectorAll(".wl-col-quantity input.form-text.width-small")[0];
    wantInput.value = "10";

    table.dispatchEvent(new Event("input", { bubbles: true }));

    const summary = document.getElementById("rb-edit-summary");
    const fields = summary.querySelector(".rb-summary-popover-fields");
    expect(fields.textContent).toBe("Multiple");
  });

  it("shows count with grid popover for multiple rows changed", () => {
    const table = createWantedListEditTable([
      { description: "Castle 375", want: 1 },
      { description: "Knight Black", want: 2 },
      { description: "Shield", want: 3 },
    ]);
    document.body.appendChild(table);
    createBanner();

    feature.init();

    const rows = table.querySelectorAll(".table-row");
    const dataRows = [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].querySelector("input.form-text")) dataRows.push(rows[i]);
    }

    dataRows[0].querySelector(".wl-col-condition select.form-text").value = "N";
    dataRows[1].querySelector(".wl-col-price input.form-text").value = "99";
    dataRows[2].querySelector(".wl-col-remarks textarea.form-text").value = "updated";

    table.dispatchEvent(new Event("input", { bubbles: true }));

    const summary = document.getElementById("rb-edit-summary");
    expect(summary.querySelector(".rb-summary-link").textContent).toBe("3 items changed");

    // Grid has 6 children (3 desc + 3 fields)
    const grid = summary.querySelector(".rb-summary-grid");
    expect(grid).not.toBeNull();
    const descs = grid.querySelectorAll(".rb-summary-popover-desc");
    const fields = grid.querySelectorAll(".rb-summary-popover-fields");
    expect(descs.length).toBe(3);
    expect(fields.length).toBe(3);

    expect(descs[0].textContent).toBe("Castle 375");
    expect(fields[0].textContent).toBe("Condition");
    expect(descs[1].textContent).toBe("Knight Black");
    expect(fields[1].textContent).toBe("Max Price");
    expect(descs[2].textContent).toBe("Shield");
    expect(fields[2].textContent).toBe("Remarks");
  });

  it("updates from multi-item to single-item count", () => {
    const table = createWantedListEditTable([
      { description: "Castle 375", want: 1 },
      { description: "Knight Black", want: 2 },
    ]);
    document.body.appendChild(table);
    createBanner();

    feature.init();

    const rows = table.querySelectorAll(".table-row");
    const dataRows = [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].querySelector("input.form-text")) dataRows.push(rows[i]);
    }

    const sel0 = dataRows[0].querySelector(".wl-col-condition select.form-text");
    const sel1 = dataRows[1].querySelector(".wl-col-condition select.form-text");
    sel0.value = "N";
    sel1.value = "U";
    table.dispatchEvent(new Event("change", { bubbles: true }));

    const summary = document.getElementById("rb-edit-summary");
    expect(summary.querySelector(".rb-summary-link").textContent).toBe("2 items changed");

    // Revert one row — count updates to 1
    sel1.value = "X";
    table.dispatchEvent(new Event("change", { bubbles: true }));

    expect(summary.querySelector(".rb-summary-link").textContent).toBe("1 item changed");
    const descs = summary.querySelectorAll(".rb-summary-popover-desc");
    expect(descs.length).toBe(1);
    expect(descs[0].textContent).toBe("Castle 375");
  });

  it("reverting all fields hides the summary", () => {
    const table = createWantedListEditTable([
      { description: "Castle 375", want: 1, price: "5.00" },
    ]);
    document.body.appendChild(table);
    createBanner();

    feature.init();

    const sel = table.querySelector(".wl-col-condition select.form-text");
    sel.value = "N";
    table.dispatchEvent(new Event("change", { bubbles: true }));

    const summary = document.getElementById("rb-edit-summary");
    expect(summary.style.display).not.toBe("none");

    // Revert back to original
    sel.value = "X";
    table.dispatchEvent(new Event("change", { bubbles: true }));

    expect(summary.style.display).toBe("none");
  });

  it("destroy removes injected elements and listeners", () => {
    const table = createWantedListEditTable([
      { description: "Castle 375", want: 1 },
    ]);
    document.body.appendChild(table);
    createBanner();

    feature.init();

    expect(document.getElementById("rb-edit-summary")).not.toBeNull();
    expect(document.getElementById("rb-edit-summary-styles")).not.toBeNull();

    feature.destroy();

    expect(document.getElementById("rb-edit-summary")).toBeNull();
    expect(document.getElementById("rb-edit-summary-styles")).toBeNull();
  });
});
