(function () {
  var styleEl = null;
  var tableObserver = null;
  var modalBodyObserver = null;
  var storageListener = null;
  var showHidden = false;
  var isInjectingHideBtn = false;

  var CSS = /* @inline */``;

  var isHidden = RefinedBricklink.isHidden;

  // ── Management page helpers ───────────────────────────────────────────────

  function getMainTable() {
    return (
      document.querySelector("table.wl-overview-list-table:not(.compact)") ||
      document.querySelector("table.wl-overview-list-table")
    );
  }

  function getListRows() {
    var table = getMainTable();
    if (!table) return [];
    return Array.from(table.querySelectorAll("tr")).filter(function (r) {
      return r.querySelector("td");
    });
  }

  function applyRowVisibility() {
    var rows = getListRows();
    var hasAnyHidden = false;
    rows.forEach(function (row) {
      var a = row.querySelector("a[href*='wantedMoreID=']");
      var name = a ? a.textContent.trim() : "";
      var hidden = isHidden(name);
      if (hidden) hasAnyHidden = true;
      row.dataset.rbHidden = hidden ? "true" : "";
      row.style.display = hidden && !showHidden ? "none" : "";
    });
    document.body.classList.toggle("rb-has-hidden-lists", hasAnyHidden);
    // Keep toggle checkbox in sync
    var cb = document.querySelector(".rb-show-hidden-cb");
    if (cb) cb.checked = showHidden;
  }

  function insertToggle() {
    if (document.querySelector(".rb-hide-th-toggle")) return;
    var table = getMainTable();
    if (!table) return;
    // Last <th> is the actions column (Easy Buy / Setup / Download)
    var ths = table.querySelectorAll("th");
    var lastTh = ths[ths.length - 1];
    if (!lastTh) return;

    var div = document.createElement("div");
    div.className = "rb-hide-th-toggle";
    div.innerHTML =
      '<label class="rb-hide-toggle">' +
      '<input type="checkbox" class="rb-show-hidden-cb"' +
      (showHidden ? " checked" : "") +
      "> Show hidden" +
      "</label>";

    var cb = div.querySelector(".rb-show-hidden-cb");
    cb.addEventListener("change", function () {
      showHidden = cb.checked;
      document.body.classList.toggle("rb-show-hidden", showHidden);
      chrome.storage.sync.set({ "rb-show-hidden": showHidden });
      applyRowVisibility();
    });

    lastTh.appendChild(div);
  }

  function attachModalObserver(modal) {
    injectHideBtn(modal); // initial inject
    var wasOpen = false;
    modalBodyObserver = new MutationObserver(function () {
      var isOpen = !!modal.querySelector(".modal-body");
      if (!isInjectingHideBtn) injectHideBtn(modal);
      // Modal just closed — re-apply visibility so row hides/shows immediately
      if (wasOpen && !isOpen) applyRowVisibility();
      wasOpen = isOpen;
    });
    modalBodyObserver.observe(modal, { childList: true, subtree: true });
  }

  function attachBodyModalObserver() {
    // Search page: modal has no .wl-edit-modal-container wrapper; watch body
    // for .modal-footer to appear, then inject whenever footer lacks our button.
    // IMPORTANT: find nameInput relative to the footer's own modal-dialog —
    // there may be other .modal-body elements in the DOM (e.g. join-mailing).
    modalBodyObserver = new MutationObserver(function () {
      if (isInjectingHideBtn) return;
      var footer = document.querySelector(".modal-footer");
      if (!footer || footer.querySelector(".rb-hide-btn")) return;
      var modalDialog = footer.closest(".modal-dialog");
      var nameInput = modalDialog && modalDialog.querySelector("input.form-text");
      if (nameInput) injectHideBtnInto(footer, nameInput);
    });
    modalBodyObserver.observe(document.body, { childList: true, subtree: true });
  }

  function injectHideBtn(modal) {
    if (isInjectingHideBtn) return;
    if (modal.querySelector(".rb-hide-btn")) return;
    var nameInput = modal.querySelector("input.form-text");
    if (!nameInput) return;
    var footer = modal.querySelector(".modal-footer");
    if (!footer) return;
    injectHideBtnInto(footer, nameInput);
  }

  function injectHideBtnInto(footer, nameInput) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bl-btn text-link text-link--grey rb-hide-btn";

    function updateLabel() {
      var hidden = isHidden(nameInput.value);
      btn.innerHTML =
        '<i class="fas ' + (hidden ? "fa-eye" : "fa-eye-slash") + '"></i> ' +
        (hidden ? "Unhide" : "Hide");
    }
    updateLabel();

    btn.addEventListener("click", function () {
      var pattern = RefinedBricklink.hidePattern;
      var newValue = isHidden(nameInput.value)
        ? nameInput.value.slice(0, -pattern.length)
        : nameInput.value + pattern;
      // Use native setter so React's controlled input detects the change
      var nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, "value"
      ).set;
      nativeSetter.call(nameInput, newValue);
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
      updateLabel();
    });

    nameInput.addEventListener("input", updateLabel);

    // Place next to the Delete button in the footer (bottom-left)
    isInjectingHideBtn = true;
    var deleteBtn = Array.from(footer.querySelectorAll("button")).find(
      function (b) { return b.textContent.trim() === "Delete"; }
    );
    if (deleteBtn) {
      deleteBtn.insertAdjacentElement("afterend", btn);
    } else {
      footer.insertBefore(btn, footer.firstChild);
    }
    isInjectingHideBtn = false;
  }

  // ── Upload page helpers ───────────────────────────────────────────────────

  function applyUploadDropdown() {
    var select = document.getElementById("wantedlist_select");
    if (!select) return;
    Array.from(select.options).forEach(function (opt) {
      if (opt.value === "-1") return; // "Create New Wanted List" — always visible
      // Option text format: "List Name (N)" — strip the count before checking
      var rawName = opt.text.replace(/\s*\(\d+\)\s*$/, "").trim();
      opt.hidden = !showHidden && isHidden(rawName);
    });
  }

  function insertUploadToggle() {
    if (document.querySelector(".rb-upload-show-hidden")) return;
    var select = document.getElementById("wantedlist_select");
    if (!select) return;

    var div = document.createElement("div");
    div.className = "rb-upload-show-hidden";
    div.innerHTML =
      '<label class="rb-hide-toggle">' +
      '<input type="checkbox"' +
      (showHidden ? " checked" : "") +
      "> Show hidden lists" +
      "</label>";

    var cb = div.querySelector("input");
    cb.addEventListener("change", function () {
      showHidden = cb.checked;
      document.body.classList.toggle("rb-show-hidden", showHidden);
      chrome.storage.sync.set({ "rb-show-hidden": showHidden });
      applyUploadDropdown();
    });

    select.parentElement.insertAdjacentElement("afterend", div);
  }

  // ── Feature ──────────────────────────────────────────────────────────────

  var featureDef = {
    id: "wanted-list-hide",
    name: "Hideable Wanted Lists",
    description:
      "Lists whose names end with the configured hide pattern are hidden from all views. Use the Hide button in the Setup modal to hide or unhide a list. A global checkbox for whether to show hidden lists is added to various places.",
    enabledByDefault: true,
    section: "Wanted Lists",
    settings: [
      {
        name: "rb-hide-pattern",
        label: "Hide pattern",
        description: 'Suffix that marks a list as hidden. Include spaces if desired (e.g. " [x]", " - hidden")',
        type: "text",
        default: " [x]",
      },
    ],

    init() {
      // Set synchronously so other features that init after us can check it
      document.body.classList.add("rb-hide-enabled");

      chrome.storage.sync.get({ "rb-show-hidden": false, "rb-hide-pattern": " [x]" }, function (stored) {
        showHidden = !!stored["rb-show-hidden"];
        RefinedBricklink.hidePattern = stored["rb-hide-pattern"] || " [x]";
        document.body.classList.toggle("rb-show-hidden", showHidden);

        if (
          window.location.pathname.includes("/v2/wanted/list.page") ||
          window.location.pathname.includes("/v2/wanted/search.page")
        ) {
          styleEl = document.createElement("style");
          styleEl.textContent = CSS;
          document.head.appendChild(styleEl);
        }

        if (window.location.pathname.includes("/v2/wanted/list.page")) {
          applyRowVisibility();
          insertToggle();

          // Re-apply when table rows change or names update (sort/filter/save)
          var table = getMainTable();
          if (table) {
            tableObserver = new MutationObserver(applyRowVisibility);
            tableObserver.observe(table, {
              childList: true,
              subtree: true,
              characterData: true,
            });
          }
        }

        if (window.location.pathname.includes("/v2/wanted/list.page")) {
          // list.page: .wl-edit-modal-container is always in DOM (empty until
          // Setup is clicked). Watch it so we survive React full re-renders.
          var modal = document.querySelector(".wl-edit-modal-container");
          if (modal) attachModalObserver(modal);
        }

        if (window.location.pathname.includes("/v2/wanted/search.page")) {
          // search.page: modal has no .wl-edit-modal-container wrapper; watch
          // body for .modal-footer to appear each time Setup is clicked.
          attachBodyModalObserver();
        }

        if (window.location.pathname.includes("/v2/wanted/upload.page")) {
          applyUploadDropdown();
          insertUploadToggle();
        }
      });

      // Sync state when changed from options page or another tab
      storageListener = function (changes) {
        if (changes["rb-hide-pattern"]) {
          RefinedBricklink.hidePattern = changes["rb-hide-pattern"].newValue || " [x]";
          if (window.location.pathname.includes("/v2/wanted/list.page")) {
            applyRowVisibility();
          }
          if (window.location.pathname.includes("/v2/wanted/upload.page")) {
            applyUploadDropdown();
          }
        }
        if (changes["rb-show-hidden"]) {
          showHidden = !!changes["rb-show-hidden"].newValue;
          document.body.classList.toggle("rb-show-hidden", showHidden);
          if (window.location.pathname.includes("/v2/wanted/list.page")) {
            applyRowVisibility();
          }
          if (window.location.pathname.includes("/v2/wanted/upload.page")) {
            applyUploadDropdown();
            var cb = document.querySelector(".rb-upload-show-hidden input");
            if (cb) cb.checked = showHidden;
          }
        }
      };
      chrome.storage.onChanged.addListener(storageListener);

      // Let other features (download-all, download-buttons) react to body
      // class changes (rb-show-hidden, rb-has-hidden-lists) by observing them
      // from their own init — nothing to do here.
    },

    destroy() {
      document.body.classList.remove(
        "rb-hide-enabled",
        "rb-show-hidden",
        "rb-has-hidden-lists"
      );
      if (tableObserver) {
        tableObserver.disconnect();
        tableObserver = null;
      }
      if (modalBodyObserver) {
        modalBodyObserver.disconnect();
        modalBodyObserver = null;
      }
      if (storageListener) {
        chrome.storage.onChanged.removeListener(storageListener);
        storageListener = null;
      }
      if (styleEl) {
        styleEl.remove();
        styleEl = null;
      }
      var thToggle = document.querySelector(".rb-hide-th-toggle");
      if (thToggle) thToggle.remove();
      showHidden = false;
      // Restore row visibility
      getListRows().forEach(function (r) {
        r.style.display = "";
        delete r.dataset.rbHidden;
      });
      // Restore upload dropdown
      var select = document.getElementById("wantedlist_select");
      if (select) {
        Array.from(select.options).forEach(function (o) {
          o.hidden = false;
        });
      }
      var uploadToggle = document.querySelector(".rb-upload-show-hidden");
      if (uploadToggle) uploadToggle.remove();
    },
  };

  RefinedBricklink.features.push(featureDef);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = featureDef;
  }
})();
