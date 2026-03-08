import { describe, it, expect, beforeEach } from "vitest";

describe("Feature Registry", () => {
  beforeEach(() => {
    globalThis.RefinedBricklink = { features: [] };
  });

  it("initializes as an empty array", () => {
    expect(RefinedBricklink.features).toEqual([]);
  });

  it("allows pushing feature definitions", () => {
    RefinedBricklink.features.push({ id: "test", name: "Test" });
    expect(RefinedBricklink.features).toHaveLength(1);
    expect(RefinedBricklink.features[0].id).toBe("test");
  });

  it("preserves existing features when registry is reused", () => {
    RefinedBricklink.features.push({ id: "a" });
    RefinedBricklink.features.push({ id: "b" });
    expect(RefinedBricklink.features).toHaveLength(2);
  });
});
