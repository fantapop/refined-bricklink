(function () {
  var STYLE_ID = "rb-edit-summary-styles";
  var styleEl = null;
  var inputHandler = null;
  var changeHandler = null;
  var domObserver = null;
  var summaryEl = null;
  var snapshots = []; // { row, description, fields: [{ el, originalValue, displayName }] }
  var isWiringUp = false; // Prevent re-entry during DOM modifications

  // ── Field definitions ──────────────────────────────────────────────

  var FIELD_DEFS = [
    { colClass: "wl-col-condition", selector: "select.form-text", name: "Condition" },
    { colClass: "wl-col-price", selector: "input.form-text", name: "Max Price" },
    { colClass: "wl-col-quantity", selector: "input.form-text.width-small", name: "Want Qty", index: 0 },
    { colClass: "wl-col-quantity", selector: "input.form-text.width-small", name: "Have Qty", index: 1 },
    { colClass: "wl-col-remarks", selector: "textarea.form-text", name: "Remarks" },
    { colClass: "wl-col-notify", selector: "input[type=checkbox]", name: "Notify" },
  ];

  // ── Helpers ────────────────────────────────────────────────────────

  function getOriginalValue(field) {
    // For React-managed fields, defaultChecked/defaultValue may not reflect
    // the actual initial state if React sets values via JS properties.
    // So just use the current value at snapshot time as the baseline.
    return getCurrentValue(field);
  }

  function getCurrentValue(field) {
    if (field.type === "checkbox") return field.checked;
    return field.value;
  }

  function snapshotRow(row) {
    var descCell = row.querySelector(".wl-col-desc");
    var description = descCell ? descCell.textContent.trim() : "Item";
    var fields = [];

    for (var i = 0; i < FIELD_DEFS.length; i++) {
      var def = FIELD_DEFS[i];
      var col = row.querySelector("." + def.colClass);
      if (!col) continue;
      var els = col.querySelectorAll(def.selector);
      var el = def.index !== undefined ? els[def.index] : els[0];
      if (!el) continue;
      fields.push({
        el: el,
        originalValue: getOriginalValue(el),
        displayName: def.name,
      });
    }

    return { row: row, description: description, fields: fields };
  }

  function getChangedFields(snapshot) {
    var changed = [];
    for (var i = 0; i < snapshot.fields.length; i++) {
      var f = snapshot.fields[i];
      if (String(getCurrentValue(f.el)) !== String(f.originalValue)) {
        changed.push(f.displayName);
      }
    }
    return changed;
  }

  // ── Summary rendering ─────────────────────────────────────────────

  function updateSummary() {
    if (!summaryEl) return;

    var changedRows = [];
    for (var i = 0; i < snapshots.length; i++) {
      var changed = getChangedFields(snapshots[i]);
      if (changed.length > 0) {
        changedRows.push({
          description: snapshots[i].description,
          fields: changed,
        });
      }
    }

    console.log("[edit-summary-banner] updateSummary() found", changedRows.length, "changed rows");

    // Always clear previous content first
    summaryEl.innerHTML = "";

    if (changedRows.length === 0) {
      console.log("[edit-summary-banner] No changes, hiding summary");
      summaryEl.style.display = "none";
      return;
    }

    console.log("[edit-summary-banner] Showing summary for changes");
    summaryEl.style.display = "";

    // Wrap link + popover so hovering anywhere in the wrapper keeps popover open
    var wrapper = document.createElement("span");
    wrapper.className = "rb-summary-wrapper";

    var link = document.createElement("span");
    link.className = "rb-summary-link";
    link.textContent = changedRows.length + " item" + (changedRows.length === 1 ? "" : "s") + " changed";
    wrapper.appendChild(link);

    var popover = document.createElement("div");
    popover.className = "rb-summary-popover";

    var grid = document.createElement("div");
    grid.className = "rb-summary-grid";
    for (var j = 0; j < changedRows.length; j++) {
      var descSpan = document.createElement("span");
      descSpan.className = "rb-summary-popover-desc";
      descSpan.textContent = changedRows[j].description;
      descSpan.title = changedRows[j].description;
      grid.appendChild(descSpan);

      var fieldsSpan = document.createElement("span");
      fieldsSpan.className = "rb-summary-popover-fields";
      fieldsSpan.textContent = changedRows[j].fields.length > 1 ? "Multiple" : changedRows[j].fields[0];
      grid.appendChild(fieldsSpan);
    }
    popover.appendChild(grid);

    // Scroll indicator — shown when popover has overflow, hidden at bottom
    var scrollHint = document.createElement("div");
    scrollHint.className = "rb-summary-scroll-hint";
    scrollHint.textContent = "\u25BC more";
    scrollHint.style.display = "none";
    popover.appendChild(scrollHint);

    function updateScrollHint() {
      var hasOverflow = popover.scrollHeight > popover.clientHeight;
      var atBottom = popover.scrollTop + popover.clientHeight >= popover.scrollHeight - 2;
      scrollHint.style.display = (hasOverflow && !atBottom) ? "" : "none";
    }
    popover.addEventListener("scroll", updateScrollHint);

    // Check overflow once popover becomes visible (on hover)
    var hintObserver = new MutationObserver(function () {
      if (popover.offsetHeight > 0) updateScrollHint();
    });
    hintObserver.observe(popover, { attributes: true, attributeFilter: ["style"] });
    // Also check via wrapper hover since display is toggled by CSS
    wrapper.addEventListener("mouseenter", function () {
      // Small delay to let browser lay out the popover
      setTimeout(updateScrollHint, 0);
    });

    wrapper.appendChild(popover);
    summaryEl.appendChild(wrapper);
  }

  // ── Feature definition ──────────────────────────────────────────────

  var featureDef = {
    id: "edit-summary-banner",
    name: "Edit Summary Banner",
    description:
      "Shows a live summary of changed fields in the save banner on wanted list edit pages.",
    enabledByDefault: true,
    section: "Search",
    docsUrl: "https://github.com/fantapop/refined-bricklink#edit-summary-banner",
    cssVars: [
      {
        name: "--rb-summary-popover-width",
        label: "Summary popover width",
        description: "Width of the changed-fields popover in the save banner",
        default: "400px",
        type: "text",
      },
      {
        name: "--rb-summary-popover-max-height",
        label: "Summary popover max height",
        description: "Max height before the summary popover scrolls",
        default: "300px",
        type: "text",
      },
    ],

    init: function () {
      var table = document.querySelector(".table-wl-edit");
      var banner = document.getElementById("wanted-save-banner");
      if (!table || !banner) return;

      // Find the container inside the banner (holds the float-right button span)
      // Fall back to banner itself if no container exists (e.g. in tests)
      var container = banner.querySelector(".container-xl") || banner;

      // Inject styles
      styleEl = document.createElement("style");
      styleEl.id = STYLE_ID;
      styleEl.textContent = /* @inline */``;
      document.head.appendChild(styleEl);

      // Create summary element — insert inside the float-right button span,
      // before the first button, so it sits to the left of Cancel/Save
      summaryEl = document.createElement("span");
      summaryEl.id = "rb-edit-summary";
      summaryEl.style.display = "none";
      var buttonSpan = container.querySelector(".float-right");
      if (buttonSpan) {
        buttonSpan.insertBefore(summaryEl, buttonSpan.firstChild);
      } else {
        container.insertBefore(summaryEl, container.firstChild);
      }

      var wireUp = function () {
        console.log("[edit-summary-banner] wireUp() called");
        // Prevent re-entry during DOM modifications
        if (isWiringUp) {
          console.log("[edit-summary-banner] wireUp() skipped - already wiring up");
          return true;
        }
        isWiringUp = true;

        // Temporarily disconnect observer to prevent cross-triggering with other features
        if (domObserver) domObserver.disconnect();

        var rows = table.querySelectorAll(".table-row");
        // Skip header row — check for editable fields
        var dataRows = [];
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].querySelector("input.form-text, select.form-text, textarea.form-text, .wl-col-notify input[type=checkbox]")) {
            dataRows.push(rows[i]);
          }
        }
        if (dataRows.length === 0) {
          console.log("[edit-summary-banner] No editable fields found - clearing snapshots");
          // Clear snapshots when exiting edit mode (after save/cancel)
          // This ensures we don't compare against stale pre-save snapshots
          snapshots = [];
          updateSummary(); // Hide summary since there are no fields to track
          if (domObserver) domObserver.observe(table, { childList: true, subtree: true });
          isWiringUp = false;
          return false;
        }

        // Check if the field elements themselves have changed (not just rows)
        var fieldsChanged = false;
        if (snapshots.length !== dataRows.length) {
          fieldsChanged = true;
        } else {
          for (var i = 0; i < dataRows.length; i++) {
            // Get current fields in this row
            var currentFields = [];
            for (var j = 0; j < FIELD_DEFS.length; j++) {
              var def = FIELD_DEFS[j];
              var col = dataRows[i].querySelector("." + def.colClass);
              if (!col) continue;
              var els = col.querySelectorAll(def.selector);
              var el = def.index !== undefined ? els[def.index] : els[0];
              if (el) currentFields.push(el);
            }

            // Compare with snapshotted fields
            if (snapshots[i].fields.length !== currentFields.length) {
              fieldsChanged = true;
              break;
            }
            for (var k = 0; k < currentFields.length; k++) {
              if (snapshots[i].fields[k].el !== currentFields[k]) {
                fieldsChanged = true;
                break;
              }
            }
            if (fieldsChanged) break;
          }
        }

        if (!fieldsChanged) {
          if (domObserver) domObserver.observe(table, { childList: true, subtree: true });
          isWiringUp = false;
          return true;
        }

        // Clear old snapshots
        snapshots = [];

        // Remove old event listeners
        if (inputHandler) {
          table.removeEventListener("input", inputHandler);
          inputHandler = null;
        }
        if (changeHandler) {
          table.removeEventListener("change", changeHandler);
          changeHandler = null;
        }

        // Snapshot new rows
        for (var i = 0; i < dataRows.length; i++) {
          snapshots.push(snapshotRow(dataRows[i]));
        }
        console.log("[edit-summary-banner] Snapshotted", snapshots.length, "rows");

        inputHandler = function () { updateSummary(); };
        changeHandler = function () { updateSummary(); };
        table.addEventListener("input", inputHandler);
        table.addEventListener("change", changeHandler);

        console.log("[edit-summary-banner] Calling updateSummary()");
        updateSummary();

        // Reconnect observer after DOM modifications are complete
        if (domObserver) domObserver.observe(table, { childList: true, subtree: true });

        isWiringUp = false;
        return true;
      };

      wireUp();

      domObserver = new MutationObserver(function () {
        wireUp();
      });
      domObserver.observe(table, { childList: true, subtree: true });

      // Note: No need to watch the banner — React re-renders the table after save/cancel,
      // which triggers the domObserver, and wireUp will re-snapshot automatically.
    },

    destroy: function () {
      if (domObserver) {
        domObserver.disconnect();
        domObserver = null;
      }
      if (styleEl) {
        styleEl.remove();
        styleEl = null;
      }
      if (inputHandler || changeHandler) {
        var table = document.querySelector(".table-wl-edit");
        if (table) {
          if (inputHandler) table.removeEventListener("input", inputHandler);
          if (changeHandler) table.removeEventListener("change", changeHandler);
        }
        inputHandler = null;
        changeHandler = null;
      }
      if (summaryEl && summaryEl.parentNode) {
        summaryEl.remove();
      }
      summaryEl = null;
      snapshots = [];
      isWiringUp = false;
    },
  };

  RefinedBricklink.features.push(featureDef);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = featureDef;
  }
})();
