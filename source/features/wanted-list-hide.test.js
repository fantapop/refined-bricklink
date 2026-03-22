import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadFeature } from "../../test/helpers/load-feature.js";
import {
  createWantedListsIndexTableWithHeader,
  createWantedListSetupModal,
} from "../../test/helpers/dom-factory.js";
import path from "path";

const featurePath = path.resolve(import.meta.dirname, "./wanted-list-hide.js");

const LISTS = [
  { id: 1, name: "Active List" },
  { id: 2, name: "Hidden List [x]" },
  { id: 3, name: "Another Active List" },
];

/**
 * Sets up chrome mock and RefinedBricklink globals, then loads the feature.
 * storageValues overrides storage defaults.
 */
function loadHide(storageValues = {}) {
  globalThis.chrome = {
    storage: {
      sync: {
        get: (defaults, cb) => cb({ ...defaults, ...storageValues }),
        set: vi.fn(),
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
  };
  const pattern = storageValues["rb-hide-pattern"] ?? " [x]";
  globalThis.RefinedBricklink = {
    features: [],
    hidePattern: pattern,
    isHidden(name) {
      return (
        typeof name === "string" &&
        globalThis.RefinedBricklink.hidePattern.length > 0 &&
        name.endsWith(globalThis.RefinedBricklink.hidePattern)
      );
    },
  };
  return loadFeature(featurePath, { resetRegistry: false });
}

describe("wanted-list-hide feature", () => {
  let feature;

  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    Object.defineProperty(window, "location", {
      value: { pathname: "/v2/wanted/list.page" },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    if (feature?.destroy) feature.destroy();
  });

  // ── Metadata ──────────────────────────────────────────────────────────────

  describe("feature metadata", () => {
    it("has correct id", () => {
      feature = loadHide();
      expect(feature.id).toBe("wanted-list-hide");
    });

    it("has correct name", () => {
      feature = loadHide();
      expect(feature.name).toBe("Hideable Wanted Lists");
    });

    it("is enabled by default", () => {
      feature = loadHide();
      expect(feature.enabledByDefault).toBe(true);
    });

    it("has rb-hide-pattern text setting with default [x]", () => {
      feature = loadHide();
      const s = feature.settings.find((s) => s.name === "rb-hide-pattern");
      expect(s).toBeDefined();
      expect(s.type).toBe("text");
      expect(s.default).toBe(" [x]");
    });

    it("has no rb-show-hidden setting (removed from Customize)", () => {
      feature = loadHide();
      const s = feature.settings.find((s) => s.name === "rb-show-hidden");
      expect(s).toBeUndefined();
    });
  });

  // ── isHidden utility ──────────────────────────────────────────────────────

  describe("RefinedBricklink.isHidden", () => {
    it("returns true for a name ending with the default pattern", () => {
      feature = loadHide();
      expect(RefinedBricklink.isHidden("My List [x]")).toBe(true);
    });

    it("returns false for a name not ending with the pattern", () => {
      feature = loadHide();
      expect(RefinedBricklink.isHidden("My List")).toBe(false);
    });

    it("returns false for an empty string", () => {
      feature = loadHide();
      expect(RefinedBricklink.isHidden("")).toBe(false);
    });

    it("uses a custom hidePattern set via storage", () => {
      feature = loadHide({ "rb-hide-pattern": " - hidden" });
      feature.init();
      expect(RefinedBricklink.isHidden("My List - hidden")).toBe(true);
      expect(RefinedBricklink.isHidden("My List [x]")).toBe(false);
    });
  });

  // ── Body classes ──────────────────────────────────────────────────────────

  describe("body classes", () => {
    it("adds rb-hide-enabled synchronously on init (before storage resolves)", () => {
      feature = loadHide();
      feature.init();
      expect(document.body.classList.contains("rb-hide-enabled")).toBe(true);
    });

    it("adds rb-has-hidden-lists when hidden lists are present", () => {
      feature = loadHide();
      document.body.appendChild(createWantedListsIndexTableWithHeader(LISTS));
      feature.init();
      expect(document.body.classList.contains("rb-has-hidden-lists")).toBe(true);
    });

    it("does not add rb-has-hidden-lists when no hidden lists", () => {
      feature = loadHide();
      const visibleOnly = [{ id: 1, name: "List A" }, { id: 2, name: "List B" }];
      document.body.appendChild(createWantedListsIndexTableWithHeader(visibleOnly));
      feature.init();
      expect(document.body.classList.contains("rb-has-hidden-lists")).toBe(false);
    });

    it("removes all rb-* classes on destroy", () => {
      feature = loadHide();
      document.body.appendChild(createWantedListsIndexTableWithHeader(LISTS));
      feature.init();
      feature.destroy();
      expect(document.body.classList.contains("rb-hide-enabled")).toBe(false);
      expect(document.body.classList.contains("rb-show-hidden")).toBe(false);
      expect(document.body.classList.contains("rb-has-hidden-lists")).toBe(false);
    });
  });

  // ── Row visibility ────────────────────────────────────────────────────────

  describe("row visibility on list page", () => {
    function getRows(table) {
      return Array.from(table.querySelectorAll("tr")).filter((r) =>
        r.querySelector("td")
      );
    }

    it("hides rows whose name matches the pattern", () => {
      feature = loadHide();
      const table = createWantedListsIndexTableWithHeader(LISTS);
      document.body.appendChild(table);
      feature.init();
      const hiddenRow = getRows(table).find((r) =>
        r.querySelector("a")?.textContent?.includes("[x]")
      );
      expect(hiddenRow.style.display).toBe("none");
    });

    it("does not hide rows whose name does not match the pattern", () => {
      feature = loadHide();
      const table = createWantedListsIndexTableWithHeader(LISTS);
      document.body.appendChild(table);
      feature.init();
      const visibleRow = getRows(table).find(
        (r) => r.querySelector("a")?.textContent === "Active List"
      );
      expect(visibleRow.style.display).toBe("");
    });

    it("sets data-rb-hidden='true' on hidden rows", () => {
      feature = loadHide();
      const table = createWantedListsIndexTableWithHeader(LISTS);
      document.body.appendChild(table);
      feature.init();
      const hiddenRow = getRows(table).find((r) =>
        r.querySelector("a")?.textContent?.includes("[x]")
      );
      expect(hiddenRow.dataset.rbHidden).toBe("true");
    });

    it("shows hidden rows when rb-show-hidden is true", () => {
      feature = loadHide({ "rb-show-hidden": true });
      const table = createWantedListsIndexTableWithHeader(LISTS);
      document.body.appendChild(table);
      feature.init();
      getRows(table).forEach((r) => expect(r.style.display).toBe(""));
    });

    it("uses a custom pattern to identify hidden rows", () => {
      feature = loadHide({ "rb-hide-pattern": " - hidden" });
      const lists = [
        { id: 1, name: "Active" },
        { id: 2, name: "Secret - hidden" },
      ];
      const table = createWantedListsIndexTableWithHeader(lists);
      document.body.appendChild(table);
      feature.init();
      const rows = getRows(table);
      expect(rows[0].style.display).toBe("");
      expect(rows[1].style.display).toBe("none");
    });

    it("restores row visibility on destroy", () => {
      feature = loadHide();
      const table = createWantedListsIndexTableWithHeader(LISTS);
      document.body.appendChild(table);
      feature.init();
      feature.destroy();
      getRows(table).forEach((r) => expect(r.style.display).toBe(""));
    });
  });

  // ── Show-hidden toggle ────────────────────────────────────────────────────

  describe("show-hidden toggle", () => {
    it("inserts a toggle into the last th", () => {
      feature = loadHide();
      const table = createWantedListsIndexTableWithHeader(LISTS);
      document.body.appendChild(table);
      feature.init();
      expect(document.querySelector(".rb-hide-th-toggle")).not.toBeNull();
    });

    it("does not insert a duplicate toggle on repeated init", () => {
      feature = loadHide();
      const table = createWantedListsIndexTableWithHeader(LISTS);
      document.body.appendChild(table);
      feature.init();
      // Simulate a second call (e.g. observer firing)
      feature.init();
      expect(document.querySelectorAll(".rb-hide-th-toggle")).toHaveLength(1);
    });

    it("removes the toggle on destroy", () => {
      feature = loadHide();
      const table = createWantedListsIndexTableWithHeader(LISTS);
      document.body.appendChild(table);
      feature.init();
      feature.destroy();
      expect(document.querySelector(".rb-hide-th-toggle")).toBeNull();
    });
  });

  // ── Upload page ───────────────────────────────────────────────────────────

  describe("upload page dropdown", () => {
    beforeEach(() => {
      window.location = { pathname: "/v2/wanted/upload.page" };
    });

    function buildSelect(lists) {
      const select = document.createElement("select");
      select.id = "wantedlist_select";
      for (const list of lists) {
        const opt = document.createElement("option");
        opt.value = String(list.id);
        opt.text = list.name;
        select.appendChild(opt);
      }
      document.body.appendChild(select);
      return select;
    }

    it("hides options whose name matches the pattern", () => {
      feature = loadHide();
      const select = buildSelect(LISTS);
      feature.init();
      const hiddenOpt = Array.from(select.options).find((o) =>
        o.text.includes("[x]")
      );
      expect(hiddenOpt.hidden).toBe(true);
    });

    it("leaves visible options shown", () => {
      feature = loadHide();
      const select = buildSelect(LISTS);
      feature.init();
      const visibleOpts = Array.from(select.options).filter(
        (o) => !o.text.includes("[x]")
      );
      visibleOpts.forEach((o) => expect(o.hidden).toBe(false));
    });

    it("shows all options when rb-show-hidden is true", () => {
      feature = loadHide({ "rb-show-hidden": true });
      const select = buildSelect(LISTS);
      feature.init();
      Array.from(select.options).forEach((o) => expect(o.hidden).toBe(false));
    });

    it("respects custom hide pattern in dropdown", () => {
      feature = loadHide({ "rb-hide-pattern": " - hidden" });
      const lists = [
        { id: 1, name: "Active" },
        { id: 2, name: "Secret - hidden" },
      ];
      const select = buildSelect(lists);
      feature.init();
      expect(select.options[0].hidden).toBe(false);
      expect(select.options[1].hidden).toBe(true);
    });
  });

  // ── Setup modal injection ─────────────────────────────────────────────────

  describe("Setup modal button injection", () => {
    it("injects a Hide button into the modal footer", () => {
      feature = loadHide();
      const table = createWantedListsIndexTableWithHeader(LISTS);
      document.body.appendChild(table);
      const modal = createWantedListSetupModal("My List");
      document.body.appendChild(modal);
      feature.init();
      expect(modal.querySelector(".rb-hide-btn")).not.toBeNull();
    });

    it("labels the button 'Hide' for a non-hidden list", () => {
      feature = loadHide();
      const table = createWantedListsIndexTableWithHeader(LISTS);
      document.body.appendChild(table);
      const modal = createWantedListSetupModal("My List");
      document.body.appendChild(modal);
      feature.init();
      expect(modal.querySelector(".rb-hide-btn").textContent.trim()).toContain("Hide");
    });

    it("labels the button 'Unhide' for a list already matching the pattern", () => {
      feature = loadHide();
      const table = createWantedListsIndexTableWithHeader(LISTS);
      document.body.appendChild(table);
      const modal = createWantedListSetupModal("My List [x]");
      document.body.appendChild(modal);
      feature.init();
      expect(modal.querySelector(".rb-hide-btn").textContent.trim()).toContain("Unhide");
    });

    it("places the button after the Delete button in the footer", () => {
      feature = loadHide();
      const table = createWantedListsIndexTableWithHeader(LISTS);
      document.body.appendChild(table);
      const modal = createWantedListSetupModal("My List");
      document.body.appendChild(modal);
      feature.init();
      const footer = modal.querySelector(".modal-footer");
      const buttons = Array.from(footer.querySelectorAll("button"));
      const deleteIdx = buttons.findIndex((b) => b.textContent.trim() === "Delete");
      const hideIdx = buttons.findIndex((b) =>
        b.classList.contains("rb-hide-btn")
      );
      expect(hideIdx).toBe(deleteIdx + 1);
    });

    it("clicking Hide appends the pattern to the input value", () => {
      feature = loadHide();
      const table = createWantedListsIndexTableWithHeader(LISTS);
      document.body.appendChild(table);
      const modal = createWantedListSetupModal("My List");
      document.body.appendChild(modal);
      feature.init();
      modal.querySelector(".rb-hide-btn").click();
      expect(modal.querySelector("input.form-text").value).toBe("My List [x]");
    });

    it("clicking Unhide removes the pattern from the input value", () => {
      feature = loadHide();
      const table = createWantedListsIndexTableWithHeader(LISTS);
      document.body.appendChild(table);
      const modal = createWantedListSetupModal("My List [x]");
      document.body.appendChild(modal);
      feature.init();
      modal.querySelector(".rb-hide-btn").click();
      expect(modal.querySelector("input.form-text").value).toBe("My List");
    });

    it("updates button label after clicking Hide", () => {
      feature = loadHide();
      const table = createWantedListsIndexTableWithHeader(LISTS);
      document.body.appendChild(table);
      const modal = createWantedListSetupModal("My List");
      document.body.appendChild(modal);
      feature.init();
      const btn = modal.querySelector(".rb-hide-btn");
      btn.click();
      expect(btn.textContent.trim()).toContain("Unhide");
    });

    it("does not inject a second button on repeated observer callbacks", () => {
      feature = loadHide();
      const table = createWantedListsIndexTableWithHeader(LISTS);
      document.body.appendChild(table);
      const modal = createWantedListSetupModal("My List");
      document.body.appendChild(modal);
      feature.init();
      // Simulate observer re-firing (e.g. React re-render)
      // by triggering a DOM mutation — the observer should not inject again
      const dummy = document.createElement("span");
      modal.querySelector(".modal-body").appendChild(dummy);
      expect(modal.querySelectorAll(".rb-hide-btn")).toHaveLength(1);
    });
  });
});
