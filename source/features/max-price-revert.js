(function () {
  var STYLE_ID = "rb-max-price-revert-styles";
  var styleEl = null;
  var inputHandler = null;
  var changeHandler = null;
  var domObserver = null;
  var tracked = []; // { field, originalValue, panel }
  var isWiringUp = false;

  // ── Helpers ──────────────────────────────────────────────────────────

  function getOriginalValue(field) {
    return field.value;
  }

  function getCurrentValue(field) {
    return field.value;
  }

  function isPriceInput(field) {
    return (
      field.type === "number" &&
      field.closest(".wl-col-price") !== null
    );
  }

  // ── Control panel ────────────────────────────────────────────────────

  function buildControlPanel(field, originalValue) {
    var panel = document.createElement("div");
    panel.className = "rb-price-panel";

    // Up
    var up = document.createElement("button");
    up.className = "rb-p-up";
    up.title = "Increment";
    up.innerHTML =
      '<svg width="8" height="5" viewBox="0 0 8 5"><polygon points="4,0.5 7,4.5 1,4.5" fill="#555"/></svg>';
    up.addEventListener("click", function (e) {
      e.preventDefault();
      field.stepUp();
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // Revert
    var revert = document.createElement("button");
    revert.className = "rb-p-revert";
    revert.title = "Revert to original";
    revert.innerHTML =
      '<svg width="5" height="8" viewBox="0 0 5 8"><polygon points="0.5,4 4.5,1 4.5,7" fill="#555"/></svg>';
    revert.addEventListener("click", function (e) {
      e.preventDefault();
      field.value = originalValue;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // Down
    var down = document.createElement("button");
    down.className = "rb-p-down";
    down.title = "Decrement";
    down.innerHTML =
      '<svg width="8" height="5" viewBox="0 0 8 5"><polygon points="4,4.5 1,0.5 7,0.5" fill="#555"/></svg>';
    down.addEventListener("click", function (e) {
      e.preventDefault();
      field.stepDown();
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // Empty spacer for top-right slot
    var spacer = document.createElement("div");
    spacer.className = "rb-p-spacer rb-hidden";

    // Grid order: up (top-left), spacer (top-right), down (bottom-left), revert (bottom-right)
    panel.appendChild(up);
    panel.appendChild(spacer);
    panel.appendChild(down);
    panel.appendChild(revert);
    return panel;
  }

  function updatePanel(entry) {
    var panel = entry.panel;
    if (!panel) return;

    var isModified =
      String(getCurrentValue(entry.field)) !== String(entry.originalValue);
    var revertBtn = panel.querySelector(".rb-p-revert");
    if (revertBtn) {
      revertBtn.classList.toggle("rb-hidden", !isModified);
    }
  }

  // ── Per-field setup ──────────────────────────────────────────────────

  function setupField(field) {
    var originalValue = getOriginalValue(field);
    var panel = null;

    if (isPriceInput(field)) {
      panel = buildControlPanel(field, originalValue);
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
      entry.field.classList.add("rb-price-changed");
    } else {
      entry.field.classList.remove("rb-price-changed");
    }

    updatePanel(entry);
  }

  function updateAll() {
    for (var i = 0; i < tracked.length; i++) {
      updateField(tracked[i]);
    }
  }

  // ── Feature definition ────────────────────────────────────────────────

  var featureDef = {
    id: "max-price-revert",
    name: "Max Price Revert Button",
    description:
      "Adds increment/decrement and revert controls to max price fields on wanted list edit pages.",
    enabledByDefault: true,

    init: function () {
      var table = document.querySelector(".table-wl-edit");
      if (!table) return;

      // Inject styles
      styleEl = document.createElement("style");
      styleEl.id = STYLE_ID;
      styleEl.textContent = /* @inline */``;
      document.head.appendChild(styleEl);

      var wireUpFields = function () {
        if (isWiringUp) return true;
        isWiringUp = true;

        // Temporarily disconnect observer
        if (domObserver) domObserver.disconnect();

        var fields = table.querySelectorAll(".wl-col-price input.form-text");
        if (fields.length === 0) {
          if (domObserver) domObserver.observe(table, { childList: true, subtree: true });
          isWiringUp = false;
          return false;
        }

        // Check if these are the exact same field elements
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

        // Clear old tracked entries and remove old panels
        for (var i = 0; i < tracked.length; i++) {
          var entry = tracked[i];
          entry.field.classList.remove("rb-price-changed");
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

        // Set up new fields
        for (var i = 0; i < fields.length; i++) {
          setupField(fields[i]);
        }

        // Event delegation
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

        // Reconnect observer
        if (domObserver) domObserver.observe(table, { childList: true, subtree: true });

        isWiringUp = false;
        return true;
      };

      wireUpFields();

      domObserver = new MutationObserver(function () {
        wireUpFields();
      });
      domObserver.observe(table, { childList: true, subtree: true });
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
      for (var i = 0; i < tracked.length; i++) {
        var entry = tracked[i];
        entry.field.classList.remove("rb-price-changed");
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
