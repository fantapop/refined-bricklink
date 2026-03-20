import { describe, it, expect } from "vitest";
import { loadFeature } from "../../test/helpers/load-feature.js";
import path from "path";

const featurePath = path.resolve(import.meta.dirname, "./wanted-list-merge.js");

function loadMerge() {
  return loadFeature(featurePath);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeItem(overrides = {}) {
  return {
    itemType: "P",
    itemNo: "3001",
    colorID: 11,
    wantedQty: 5,
    wantedQtyFilled: 0,
    wantedNew: "X",
    wantedNotify: "N",
    wantedPrice: -1,
    wantedRemark: null,
    ...overrides,
  };
}

// ── escXml ───────────────────────────────────────────────────────────────────

describe("escXml", () => {
  it("escapes special XML characters", () => {
    const { _escXml } = loadMerge();
    expect(_escXml('a & b < c > d "e"')).toBe("a &amp; b &lt; c &gt; d &quot;e&quot;");
  });

  it("leaves plain strings unchanged", () => {
    const { _escXml } = loadMerge();
    expect(_escXml("3001")).toBe("3001");
  });
});

// ── mergeItems ───────────────────────────────────────────────────────────────

describe("mergeItems", () => {
  it("returns one entry per unique item+color+type", () => {
    const { _mergeItems } = loadMerge();
    const items = [makeItem({ itemNo: "3001", colorID: 11 }), makeItem({ itemNo: "3001", colorID: 7 })];
    const result = _mergeItems([{ listName: "List A", items }], { unfulfilledOnly: false, addRemarks: false });
    expect(result).toHaveLength(2);
  });

  it("sums quantities for duplicate item+color", () => {
    const { _mergeItems } = loadMerge();
    const listA = [makeItem({ wantedQty: 3 })];
    const listB = [makeItem({ wantedQty: 4 })];
    const result = _mergeItems(
      [{ listName: "A", items: listA }, { listName: "B", items: listB }],
      { unfulfilledOnly: false, addRemarks: false }
    );
    expect(result[0].qty).toBe(7);
  });

  it("takes the minimum maxPrice", () => {
    const { _mergeItems } = loadMerge();
    const listA = [makeItem({ wantedPrice: 0.5 })];
    const listB = [makeItem({ wantedPrice: 0.3 })];
    const result = _mergeItems(
      [{ listName: "A", items: listA }, { listName: "B", items: listB }],
      { unfulfilledOnly: false, addRemarks: false }
    );
    expect(result[0].maxPrice).toBe(0.3);
  });

  it("-1 (no price limit) wins over a specific price", () => {
    const { _mergeItems } = loadMerge();
    const listA = [makeItem({ wantedPrice: 0.5 })];
    const listB = [makeItem({ wantedPrice: -1 })];
    const result = _mergeItems(
      [{ listName: "A", items: listA }, { listName: "B", items: listB }],
      { unfulfilledOnly: false, addRemarks: false }
    );
    expect(result[0].maxPrice).toBe(-1);
  });

  it("unfulfilledOnly uses wantedQty - wantedQtyFilled", () => {
    const { _mergeItems } = loadMerge();
    const items = [makeItem({ wantedQty: 10, wantedQtyFilled: 3 })];
    const result = _mergeItems(
      [{ listName: "A", items }],
      { unfulfilledOnly: true, addRemarks: false }
    );
    expect(result[0].qty).toBe(7);
  });

  it("unfulfilledOnly skips items where Have >= Want", () => {
    const { _mergeItems } = loadMerge();
    const items = [makeItem({ wantedQty: 5, wantedQtyFilled: 5 })];
    const result = _mergeItems(
      [{ listName: "A", items }],
      { unfulfilledOnly: true, addRemarks: false }
    );
    expect(result).toHaveLength(0);
  });

  it("addRemarks records source list and qty", () => {
    const { _mergeItems } = loadMerge();
    const items = [makeItem({ wantedQty: 3 })];
    const result = _mergeItems(
      [{ listName: "My List", items }],
      { unfulfilledOnly: false, addRemarks: true }
    );
    expect(result[0].remarks).toBe("3@My List");
  });

  it("addRemarks appends multiple source lists", () => {
    const { _mergeItems } = loadMerge();
    const listA = [makeItem({ wantedQty: 2 })];
    const listB = [makeItem({ wantedQty: 4 })];
    const result = _mergeItems(
      [{ listName: "A", items: listA }, { listName: "B", items: listB }],
      { unfulfilledOnly: false, addRemarks: true }
    );
    expect(result[0].remarks).toBe("2@A / 4@B");
  });

  it("remarks do not exceed 255 characters", () => {
    const { _mergeItems } = loadMerge();
    const longName = "X".repeat(200);
    const listA = [makeItem({ wantedQty: 1 })];
    const listB = [makeItem({ wantedQty: 1 })];
    const result = _mergeItems(
      [{ listName: longName, items: listA }, { listName: longName, items: listB }],
      { unfulfilledOnly: false, addRemarks: true }
    );
    expect(result[0].remarks.length).toBeLessThanOrEqual(255);
  });

  it("includes items with wantedQty of -1 (no minimum)", () => {
    const { _mergeItems } = loadMerge();
    const items = [makeItem({ wantedQty: -1 })];
    const result = _mergeItems([{ listName: "A", items }], { unfulfilledOnly: false, addRemarks: false });
    expect(result).toHaveLength(1);
    expect(result[0].qty).toBe(-1);
  });

  it("includes -1 qty items even when unfulfilledOnly is true", () => {
    const { _mergeItems } = loadMerge();
    const items = [makeItem({ wantedQty: -1, wantedQtyFilled: 0 })];
    const result = _mergeItems([{ listName: "A", items }], { unfulfilledOnly: true, addRemarks: false });
    expect(result).toHaveLength(1);
  });

  it("does not sum -1 qty across lists", () => {
    const { _mergeItems } = loadMerge();
    const listA = [makeItem({ wantedQty: -1 })];
    const listB = [makeItem({ wantedQty: -1 })];
    const result = _mergeItems(
      [{ listName: "A", items: listA }, { listName: "B", items: listB }],
      { unfulfilledOnly: false, addRemarks: false }
    );
    expect(result[0].qty).toBe(-1);
  });

  it("distinguishes items by itemType", () => {
    const { _mergeItems } = loadMerge();
    const items = [
      makeItem({ itemType: "P", itemNo: "375", colorID: 0 }),
      makeItem({ itemType: "S", itemNo: "375", colorID: 0 }),
    ];
    const result = _mergeItems(
      [{ listName: "A", items }],
      { unfulfilledOnly: false, addRemarks: false }
    );
    expect(result).toHaveLength(2);
  });
});

// ── resolveCatalogId ─────────────────────────────────────────────────────────

describe("resolveCatalogId", () => {
  it("returns itemNo as-is for parts", () => {
    const { _resolveCatalogId } = loadMerge();
    expect(_resolveCatalogId("P", "3001", "")).toBe("3001");
  });

  it("extracts variant suffix from imgURL for sets", () => {
    const { _resolveCatalogId } = loadMerge();
    expect(_resolveCatalogId("S", "76940", "//img.bricklink.com/ItemImage/ST/0/76940-1.t2.png")).toBe("76940-1");
  });

  it("extracts non-primary variant from imgURL", () => {
    const { _resolveCatalogId } = loadMerge();
    expect(_resolveCatalogId("S", "9247", "//img.bricklink.com/ItemImage/ST/0/9247-2.t2.png")).toBe("9247-2");
  });

  it("extracts variant for Instructions", () => {
    const { _resolveCatalogId } = loadMerge();
    expect(_resolveCatalogId("I", "76940", "//img.bricklink.com/ItemImage/ST/0/76940-1.t2.png")).toBe("76940-1");
  });

  it("leaves itemNo as-is when imgURL is empty", () => {
    const { _resolveCatalogId } = loadMerge();
    expect(_resolveCatalogId("S", "76940", "")).toBe("76940");
  });

  it("preserves existing variant suffix in itemNo", () => {
    const { _resolveCatalogId } = loadMerge();
    expect(_resolveCatalogId("S", "76940-3", "//img.bricklink.com/ItemImage/ST/0/76940-3.t2.png")).toBe("76940-3");
  });
});

// ── generateXml ──────────────────────────────────────────────────────────────

function makeXmlItem(overrides = {}) {
  return {
    itemType: "P", catalogId: "3001", colorID: 11,
    qty: 1, maxPrice: -1, condition: "X", notify: "N", remarks: "",
    ...overrides,
  };
}

describe("generateXml", () => {
  it("generates valid XML wrapper", () => {
    const { _generateXml } = loadMerge();
    expect(_generateXml([])).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(_generateXml([])).toContain("<INVENTORY>");
    expect(_generateXml([])).toContain("</INVENTORY>");
  });

  it("includes all required fields per item", () => {
    const { _generateXml } = loadMerge();
    const xml = _generateXml([makeXmlItem({ qty: 5, maxPrice: 0.25, condition: "N", notify: "Y" })]);
    expect(xml).toContain("<ITEMTYPE>P</ITEMTYPE>");
    expect(xml).toContain("<ITEMID>3001</ITEMID>");
    expect(xml).toContain("<COLOR>11</COLOR>");
    expect(xml).toContain("<MINQTY>5</MINQTY>");
    expect(xml).toContain("<MAXPRICE>0.2500</MAXPRICE>");
    expect(xml).toContain("<CONDITION>N</CONDITION>");
    expect(xml).toContain("<NOTIFY>Y</NOTIFY>");
  });

  it("omits COLOR when colorID is 0", () => {
    const { _generateXml } = loadMerge();
    const xml = _generateXml([makeXmlItem({ catalogId: "76940-1", colorID: 0, condition: null, notify: null })]);
    expect(xml).not.toContain("<COLOR>");
  });

  it("omits REMARKS tag when empty", () => {
    const { _generateXml } = loadMerge();
    expect(_generateXml([makeXmlItem()])).not.toContain("<REMARKS>");
  });

  it("includes REMARKS when present", () => {
    const { _generateXml } = loadMerge();
    expect(_generateXml([makeXmlItem({ remarks: "2@My List" })])).toContain("<REMARKS>2@My List</REMARKS>");
  });

  it("escapes special characters in REMARKS", () => {
    const { _generateXml } = loadMerge();
    expect(_generateXml([makeXmlItem({ remarks: "A & B" })])).toContain("<REMARKS>A &amp; B</REMARKS>");
  });

  it("formats maxPrice to 4 decimal places", () => {
    const { _generateXml } = loadMerge();
    expect(_generateXml([makeXmlItem()])).toContain("<MAXPRICE>-1.0000</MAXPRICE>");
  });

  it("uses catalogId directly in ITEMID", () => {
    const { _generateXml } = loadMerge();
    const xml = _generateXml([makeXmlItem({ catalogId: "9247-2", colorID: 0, condition: null, notify: null })]);
    expect(xml).toContain("<ITEMID>9247-2</ITEMID>");
  });
});
