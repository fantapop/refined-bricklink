(function () {
  let clickHandler = null;
  let containerObserver = null;
  let perfObserver = null;
  let domObserver = null;

  var featureDef = {
    id: "reverse-wanted-list",
    name: "Reverse Wanted List Order",
    description:
      "Reverses the wanted list order in the 'Add to Wanted List' modal so the most recently created lists appear first.",
    enabledByDefault: true,
    section: "Modals",
    docsUrl: "https://github.com/fantapop/refined-bricklink#reverse-wanted-list-order",

    init() {
      // Stash the original order once so we can always derive reversed order
      let originalOrder = null;

      const captureOriginalOrder = function (container) {
        if (originalOrder) return;
        const buttons = container.querySelectorAll("button.wl-search-list");
        // Store the text of each button as the canonical original order
        originalOrder = Array.from(buttons).map(function (btn) {
          return btn.querySelector(".wl-search-list__name")?.textContent?.trim();
        });
      };

      const applyReversedOrder = function (container) {
        const buttons = Array.from(
          container.querySelectorAll("button.wl-search-list")
        );
        if (buttons.length < 2) return;

        // Build a lookup: name -> position in reversed original order
        // First item (Default Wanted List) stays at index 0,
        // the rest are reversed
        const reversedOrder = [originalOrder[0]].concat(
          originalOrder.slice(1).reverse()
        );
        const orderMap = {};
        for (let i = 0; i < reversedOrder.length; i++) {
          orderMap[reversedOrder[i]] = i;
        }

        // Sort visible buttons by their position in the reversed order
        buttons.sort(function (a, b) {
          const nameA = a.querySelector(".wl-search-list__name")?.textContent?.trim();
          const nameB = b.querySelector(".wl-search-list__name")?.textContent?.trim();
          var posA = orderMap[nameA] !== undefined ? orderMap[nameA] : 999999;
          var posB = orderMap[nameB] !== undefined ? orderMap[nameB] : 999999;
          return posA - posB;
        });

        // Pause observer while we mutate to avoid infinite loop
        if (containerObserver) containerObserver.disconnect();
        for (const btn of buttons) {
          container.appendChild(btn);
        }
        // Resume observing for React re-renders (e.g. search filter changes)
        if (containerObserver) {
          containerObserver.observe(container, { childList: true });
        }
      };

      const watchContainer = function (container) {
        if (containerObserver) containerObserver.disconnect();
        containerObserver = new MutationObserver(function () {
          applyReversedOrder(container);
        });
        containerObserver.observe(container, { childList: true });
      };

      /**
       * Uses a MutationObserver on document.body to detect the instant
       * React renders the list items, then reorders and disconnects.
       */
      const waitForListAndReverse = function () {
        // Clean up any previous observer from an earlier modal open
        if (domObserver) domObserver.disconnect();

        var tryProcess = function () {
          var container = document.querySelector(
            ".wl-add-list .l-overflow-auto--y"
          );
          if (
            container &&
            container.querySelectorAll("button.wl-search-list").length >= 2
          ) {
            if (domObserver) {
              domObserver.disconnect();
              domObserver = null;
            }
            captureOriginalOrder(container);
            applyReversedOrder(container);
            watchContainer(container);
            return true;
          }
          return false;
        };

        // Check immediately in case DOM is already populated
        if (tryProcess()) return;

        // Watch for DOM changes — fires the instant React renders list items
        domObserver = new MutationObserver(function () {
          tryProcess();
        });
        domObserver.observe(document.body, { childList: true, subtree: true });
      };

      // Primary trigger: watch for the AJAX response that loads wanted list data.
      // PerformanceObserver fires when the resource finishes downloading,
      // then our MutationObserver catches the React render immediately after.
      if (typeof PerformanceObserver !== "undefined") {
        perfObserver = new PerformanceObserver(function (list) {
          for (var i = 0; i < list.getEntries().length; i++) {
            if (list.getEntries()[i].name.includes("addmodalinfo.ajax")) {
              waitForListAndReverse();
              break;
            }
          }
        });
        perfObserver.observe({ type: "resource", buffered: false });
      }

      // Fallback trigger: click handler for environments without
      // PerformanceObserver (e.g. tests) or as a belt-and-suspenders backup
      clickHandler = function (e) {
        if (e.target.closest("a.bl-wanted-addable")) {
          waitForListAndReverse();
        }
      };
      document.addEventListener("click", clickHandler, true);
    },

    destroy() {
      if (clickHandler) {
        document.removeEventListener("click", clickHandler, true);
        clickHandler = null;
      }
      if (containerObserver) {
        containerObserver.disconnect();
        containerObserver = null;
      }
      if (perfObserver) {
        perfObserver.disconnect();
        perfObserver = null;
      }
      if (domObserver) {
        domObserver.disconnect();
        domObserver = null;
      }
    },
  };

  RefinedBricklink.features.push(featureDef);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = featureDef;
  }
})();
