import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createWantedListEditTable } from "../../test/helpers/dom-factory.js";

const maxPriceRevert = await import(
  "./max-price-revert.js"
);

describe("max-price-revert", () => {
  let table;

  beforeEach(() => {
    document.body.innerHTML = "";
    global.RefinedBricklink = { features: [] };
  });

  afterEach(() => {
    if (maxPriceRevert.default?.destroy) {
      maxPriceRevert.default.destroy();
    }
  });

  it("registers with correct metadata", () => {
    expect(maxPriceRevert.default).toBeDefined();
    expect(maxPriceRevert.default.id).toBe("max-price-revert");
    expect(maxPriceRevert.default.name).toBe("Max Price Revert Button");
    expect(maxPriceRevert.default.enabledByDefault).toBe(true);
  });

  it("does nothing without table", () => {
    expect(() => maxPriceRevert.default.init()).not.toThrow();
  });

  it("injects control panel for max price inputs", () => {
    table = createWantedListEditTable([
      { description: "Part 1", condition: "N", price: "5.00", want: 1, have: 0 },
    ]);
    document.body.appendChild(table);

    maxPriceRevert.default.init();

    const priceInput = table.querySelector(".wl-col-price input.form-text");
    expect(priceInput).toBeTruthy();

    const panel = priceInput.parentNode.querySelector(".rb-price-panel");
    expect(panel).toBeTruthy();
    expect(panel.querySelectorAll("button").length).toBe(3); // up, down, revert
  });

  it("shows revert button when price is changed", () => {
    table = createWantedListEditTable([
      { description: "Part 1", condition: "N", price: "5.00", want: 1, have: 0 },
    ]);
    document.body.appendChild(table);

    maxPriceRevert.default.init();

    const priceInput = table.querySelector(".wl-col-price input.form-text");
    const panel = priceInput.parentNode.querySelector(".rb-price-panel");
    const revertBtn = panel.querySelector(".rb-p-revert");

    // Initially hidden (no changes)
    expect(revertBtn.classList.contains("rb-hidden")).toBe(true);

    // Change the value
    priceInput.value = "10.00";
    priceInput.dispatchEvent(new Event("input", { bubbles: true }));

    // Revert button should now be visible
    expect(revertBtn.classList.contains("rb-hidden")).toBe(false);

    // Revert back
    priceInput.value = "5.00";
    priceInput.dispatchEvent(new Event("input", { bubbles: true }));

    // Revert button should be hidden again
    expect(revertBtn.classList.contains("rb-hidden")).toBe(true);
  });

  it("revert button restores original value", () => {
    table = createWantedListEditTable([
      { description: "Part 1", condition: "N", price: "5.00", want: 1, have: 0 },
    ]);
    document.body.appendChild(table);

    maxPriceRevert.default.init();

    const priceInput = table.querySelector(".wl-col-price input.form-text");
    const panel = priceInput.parentNode.querySelector(".rb-price-panel");
    const revertBtn = panel.querySelector(".rb-p-revert");

    const original = priceInput.value;

    // Change the value
    priceInput.value = "10.00";
    priceInput.dispatchEvent(new Event("input", { bubbles: true }));

    expect(priceInput.value).toBe("10.00");

    // Click revert
    revertBtn.click();

    expect(priceInput.value).toBe(original);
  });

  it("up button increments by step", () => {
    table = createWantedListEditTable([
      { description: "Part 1", condition: "N", price: "5", want: 1, have: 0 },
    ]);
    document.body.appendChild(table);

    maxPriceRevert.default.init();

    const priceInput = table.querySelector(".wl-col-price input.form-text");
    const panel = priceInput.parentNode.querySelector(".rb-price-panel");
    const upBtn = panel.querySelector(".rb-p-up");

    // Mock stepUp
    const stepUpSpy = vi.fn();
    priceInput.stepUp = stepUpSpy;

    upBtn.click();

    expect(stepUpSpy).toHaveBeenCalledOnce();
  });

  it("down button decrements by step", () => {
    table = createWantedListEditTable([
      { description: "Part 1", condition: "N", price: "5", want: 1, have: 0 },
    ]);
    document.body.appendChild(table);

    maxPriceRevert.default.init();

    const priceInput = table.querySelector(".wl-col-price input.form-text");
    const panel = priceInput.parentNode.querySelector(".rb-price-panel");
    const downBtn = panel.querySelector(".rb-p-down");

    // Mock stepDown
    const stepDownSpy = vi.fn();
    priceInput.stepDown = stepDownSpy;

    downBtn.click();

    expect(stepDownSpy).toHaveBeenCalledOnce();
  });

  it("adds orange background to changed fields", () => {
    table = createWantedListEditTable([
      { description: "Part 1", condition: "N", price: "5.00", want: 1, have: 0 },
    ]);
    document.body.appendChild(table);

    maxPriceRevert.default.init();

    const priceInput = table.querySelector(".wl-col-price input.form-text");

    // No change yet
    expect(priceInput.classList.contains("rb-price-changed")).toBe(false);

    // Change the value
    priceInput.value = "10.00";
    priceInput.dispatchEvent(new Event("input", { bubbles: true }));

    // Should have changed class
    expect(priceInput.classList.contains("rb-price-changed")).toBe(true);

    // Revert back
    priceInput.value = "5.00";
    priceInput.dispatchEvent(new Event("input", { bubbles: true }));

    // Class should be removed
    expect(priceInput.classList.contains("rb-price-changed")).toBe(false);
  });

  it("cleans up on destroy", () => {
    table = createWantedListEditTable([
      { description: "Part 1", condition: "N", price: "5.00", want: 1, have: 0 },
    ]);
    document.body.appendChild(table);

    maxPriceRevert.default.init();

    const priceInput = table.querySelector(".wl-col-price input.form-text");

    // Change value to add class
    priceInput.value = "10.00";
    priceInput.dispatchEvent(new Event("input", { bubbles: true }));

    const panel = priceInput.parentNode.querySelector(".rb-price-panel");
    expect(panel).toBeTruthy();
    expect(priceInput.classList.contains("rb-price-changed")).toBe(true);

    // Destroy
    maxPriceRevert.default.destroy();

    // Panel should be removed
    expect(priceInput.parentNode.querySelector(".rb-price-panel")).toBeFalsy();

    // Class should be removed
    expect(priceInput.classList.contains("rb-price-changed")).toBe(false);

    // Style should be removed
    expect(document.getElementById("rb-max-price-revert-styles")).toBeFalsy();
  });
});
