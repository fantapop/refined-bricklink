(function () {
  var STYLE_ID = "rb-change-tracker-styles";
  var styleEl = null;
  var inputHandler = null;
  var changeHandler = null;
  var domObserver = null;
  var tracked = []; // { field, originalValue, panel }
  var isWiringUp = false; // Prevent re-entry during DOM modifications

  // ── Helpers ──────────────────────────────────────────────────────────

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

  // Use native input value setter to trigger React's synthetic event system.
  var nativeInputSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  ).set;

  function setFieldValue(field, newValue) {
    nativeInputSetter.call(field, String(newValue));
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // ── Spinner panel (replaces native spinners on changed number inputs) ─

  function isQuantityInput(field) {
    return (
      field.type === "number" &&
      field.closest(".wl-col-quantity") !== null
    );
  }

  function getSiblingInput(field) {
    var cell = field.closest(".wl-col-quantity");
    if (!cell) return null;
    var inputs = cell.querySelectorAll("input.form-text");
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i] !== field) return inputs[i];
    }
    return null;
  }

  function buildSpinPanel(field, originalValue) {
    var panel = document.createElement("div");
    panel.className = "rb-spin-panel";

    // Up (top-left)
    var up = document.createElement("button");
    up.className = "rb-s-up";
    up.title = "Increment";
    up.innerHTML =
      '<svg width="8" height="5" viewBox="0 0 8 5"><polygon points="4,0.5 7,4.5 1,4.5" fill="#555"/></svg>';
    up.addEventListener("click", function (e) {
      e.preventDefault();
      var step = field.step ? Number(field.step) : 1;
      setFieldValue(field, (Number(field.value) || 0) + step);
    });

    // Equals (top-right) — sets this field to match its sibling
    var eq = document.createElement("button");
    eq.className = "rb-s-eq";
    eq.title = "Match other quantity";
    eq.innerHTML =
      '<svg width="8" height="6" viewBox="0 0 8 6"><rect x="1" y="0.5" width="6" height="1.5" rx="0.3" fill="#555"/><rect x="1" y="3.5" width="6" height="1.5" rx="0.3" fill="#555"/></svg>';
    eq.addEventListener("click", function (e) {
      e.preventDefault();
      var sibling = getSiblingInput(field);
      if (sibling) setFieldValue(field, sibling.value);
    });

    // Down (bottom-left)
    var down = document.createElement("button");
    down.className = "rb-s-down";
    down.title = "Decrement";
    down.innerHTML =
      '<svg width="8" height="5" viewBox="0 0 8 5"><polygon points="4,4.5 1,0.5 7,0.5" fill="#555"/></svg>';
    down.addEventListener("click", function (e) {
      e.preventDefault();
      var step = field.step ? Number(field.step) : 1;
      var min = field.min !== "" ? Number(field.min) : 0;
      setFieldValue(field, Math.max(min, (Number(field.value) || 0) - step));
    });

    // Revert (bottom-right)
    var revert = document.createElement("button");
    revert.className = "rb-s-revert";
    revert.title = "Revert to original";
    revert.innerHTML =
      '<svg width="5" height="8" viewBox="0 0 5 8"><polygon points="0.5,4 4.5,1 4.5,7" fill="#555"/></svg>';
    revert.addEventListener("click", function (e) {
      e.preventDefault();
      setFieldValue(field, originalValue);
    });

    panel.appendChild(up);
    panel.appendChild(eq);
    panel.appendChild(down);
    panel.appendChild(revert);
    return panel;
  }

  function updateSpinPanel(entry) {
    var panel = entry.panel;
    if (!panel) return;

    var isModified =
      String(getCurrentValue(entry.field)) !== String(entry.originalValue);
    var revertBtn = panel.querySelector(".rb-s-revert");
    if (revertBtn) {
      revertBtn.classList.toggle("rb-hidden", !isModified);
    }

    var eqBtn = panel.querySelector(".rb-s-eq");
    if (eqBtn) {
      var sibling = getSiblingInput(entry.field);
      var showEq = sibling && entry.field.value !== sibling.value;
      eqBtn.classList.toggle("rb-hidden", !showEq);
    }
  }

  // ── Per-field setup ──────────────────────────────────────────────────

  function setupField(field, preservedOriginalValue) {
    var originalValue =
      preservedOriginalValue !== undefined
        ? preservedOriginalValue
        : getOriginalValue(field);
    var panel = null;

    // Quantity number inputs get the custom spinner panel
    if (isQuantityInput(field)) {
      panel = buildSpinPanel(field, originalValue);
      var parent = field.parentNode;
      if (parent) {
        parent.style.position = "relative";
        parent.insertBefore(panel, field.nextSibling);
      }
    }

    tracked.push({
      field: field,
      originalValue: originalValue,
      panel: panel,
    });
  }

  // ── Update indicator state ───────────────────────────────────────────

  function updateField(entry) {
    var current = getCurrentValue(entry.field);
    var changed = String(current) !== String(entry.originalValue);

    if (changed) {
      entry.field.classList.add("rb-changed-field");
    } else {
      entry.field.classList.remove("rb-changed-field");
    }

    updateSpinPanel(entry);
  }

  function updateAll() {
    for (var i = 0; i < tracked.length; i++) {
      updateField(tracked[i]);
    }
  }

  // ── Feature definition ────────────────────────────────────────────────

  var featureDef = {
    id: "wanted-list-change-tracker",
    name: "Quantity Control Panel",
    description:
      "Adds a control panel to quantity fields on wanted list edit pages. Highlights changes, revert to original values, or match Have to Want with one click.",
    enabledByDefault: true,
    section: "Search",
    docsUrl: "https://github.com/fantapop/refined-bricklink#quantity-control-panel",
    cssVars: [
      {
        name: "--rb-changed-bg",
        label: "Changed field highlight",
        description: "Background color on fields you've edited (quantity and price)",
        default: "#fef3e2",
        type: "color",
      },
      {
        name: "--rb-panel-btn-bg",
        label: "Control button background",
        description: "Background color of increment/decrement/revert buttons",
        default: "#f0f0f0",
        type: "color",
      },
      {
        name: "--rb-panel-btn-hover-bg",
        label: "Control button background (hover)",
        description: "Background color of control buttons on hover",
        default: "#dddddd",
        type: "color",
      },
    ],

    init: function () {
      var table = document.querySelector(".table-wl-edit");
      if (!table) return;

      // Inject styles
      styleEl = document.createElement("style");
      styleEl.id = STYLE_ID;
      styleEl.textContent = /* @inline */``;
      document.head.appendChild(styleEl);

      // The table shell exists at document_idle but React renders the
      // editable fields (input.form-text, select, textarea) asynchronously.
      // React also re-renders after save/cancel, so keep watching for changes.
      var wireUpFields = function () {
        // Prevent re-entry during DOM modifications
        if (isWiringUp) return true;
        isWiringUp = true;

        // Temporarily disconnect observer to prevent cross-triggering with other features
        if (domObserver) domObserver.disconnect();

        var fields = table.querySelectorAll(
          "input.form-text, select.form-text, textarea.form-text"
        );
        if (fields.length === 0) {
          if (domObserver) domObserver.observe(table, { childList: true, subtree: true });
          isWiringUp = false;
          return false;
        }

        // Check if these are the exact same field elements we already tracked
        var fieldsChanged = tracked.length !== fields.length;
        if (!fieldsChanged) {
          for (var i = 0; i < fields.length; i++) {
            var found = false;
            for (var j = 0; j < tracked.length; j++) {
              if (tracked[j].field === fields[i]) {
                found = true;
                break;
              }
            }
            if (!found) {
              fieldsChanged = true;
              break;
            }
          }
        }

        if (!fieldsChanged) {
          if (domObserver) domObserver.observe(table, { childList: true, subtree: true });
          isWiringUp = false;
          return true;
        }

        // If we already had tracked fields (mid-session React re-render), preserve
        // originalValues by index so user changes survive the DOM replacement.
        // Only re-snapshot when transitioning from no fields → fields (entering edit mode).
        var preservedOriginals = [];
        if (tracked.length > 0) {
          for (var i = 0; i < tracked.length; i++) {
            preservedOriginals[i] = tracked[i].originalValue;
          }
        }

        // Clear old tracked entries and remove old panels
        for (var i = 0; i < tracked.length; i++) {
          var entry = tracked[i];
          entry.field.classList.remove("rb-changed-field");
          if (entry.panel && entry.panel.parentNode) {
            entry.panel.remove();
          }
        }
        tracked = [];

        // Remove old event listeners
        if (inputHandler) {
          table.removeEventListener("input", inputHandler);
          inputHandler = null;
        }
        if (changeHandler) {
          table.removeEventListener("change", changeHandler);
          changeHandler = null;
        }

        // Set up new fields, reusing preserved originalValues when available
        for (var i = 0; i < fields.length; i++) {
          setupField(fields[i], preservedOriginals[i]);
        }

        // Also track notify checkboxes
        var notifyChecks = table.querySelectorAll(
          ".wl-col-notify input[type=checkbox]"
        );
        var notifyOffset = fields.length;
        for (var i = 0; i < notifyChecks.length; i++) {
          setupField(notifyChecks[i], preservedOriginals[notifyOffset + i]);
        }

        // Event delegation for change detection
        inputHandler = function () {
          updateAll();
        };
        changeHandler = function () {
          updateAll();
        };
        table.addEventListener("input", inputHandler);
        table.addEventListener("change", changeHandler);

        // Set initial visibility of panel buttons
        updateAll();

        // Reconnect observer after DOM modifications are complete
        if (domObserver) domObserver.observe(table, { childList: true, subtree: true });

        isWiringUp = false;
        return true;
      };

      // Try immediately (fields may already be rendered)
      wireUpFields();

      // Watch for React to re-render the fields (happens on initial load and after save/cancel)
      domObserver = new MutationObserver(function () {
        wireUpFields();
      });
      domObserver.observe(table, { childList: true, subtree: true });

      // Note: No need to watch the banner — React re-renders the table after save/cancel,
      // which triggers the domObserver, and wireUpFields will re-snapshot automatically.
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
          if (changeHandler)
            table.removeEventListener("change", changeHandler);
        }
        inputHandler = null;
        changeHandler = null;
      }
      // Remove panels and clear changed-field classes
      for (var i = 0; i < tracked.length; i++) {
        var entry = tracked[i];
        entry.field.classList.remove("rb-changed-field");
        if (entry.panel && entry.panel.parentNode) {
          entry.panel.remove();
        }
      }
      tracked = [];
      isWiringUp = false;
    },
  };

  RefinedBricklink.features.push(featureDef);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = featureDef;
  }
})();
