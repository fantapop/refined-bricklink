(function () {
  var fetchInProgress = false;
  var cachedData = null;
  var filterObserver = null;
  var bannerObserver = null;
  var bannerWatcher = null;
  var selectWatcher = null;
  var filterContainerWatcher = null; // Watches filter container for React re-renders
  var tableObserver = null; // Watches table for edits that trigger filter changes
  var pollIntervalId = null; // Active polling interval when watching for filter changes
  var restoreFilterStates = null; // Function to restore filter states
  var originalOptions = {}; // Cache of original select options by label
  var expectedSelectStates = {}; // Track what we set the selects to

  // ── Data fetching ─────────────────────────────────────────────────

  function getWantedMoreID() {
    var match = window.location.href.match(/wantedMoreID=(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  async function fetchAllWantedItems(wantedMoreID) {
    if (fetchInProgress) return null;
    if (cachedData && cachedData.wantedMoreID === wantedMoreID) {
      return cachedData.items;
    }

    fetchInProgress = true;
    var allItems = [];
    var page = 1;

    try {
      while (true) {
        var url = `https://www.bricklink.com/v2/wanted/search.page?type=A&wantedMoreID=${wantedMoreID}&sort=1&pageSize=100&page=${page}`;
        var response = await fetch(url);
        if (!response.ok) break;

        var html = await response.text();

        // Extract wlJson from the HTML
        var match = html.match(/var wlJson = (\{.+?\});/);
        if (!match) break;

        var data = JSON.parse(match[1]);
        if (!data.wantedItems || data.wantedItems.length === 0) break;

        allItems = allItems.concat(data.wantedItems);

        // Check if we have all items
        if (allItems.length >= data.totalResults) break;

        page++;
      }

      cachedData = { wantedMoreID: wantedMoreID, items: allItems };
      return allItems;
    } catch (e) {
      console.error("[wanted-list-smart-filters] Failed to fetch items:", e);
      return null;
    } finally {
      fetchInProgress = false;
    }
  }

  // ── Filter optimization ───────────────────────────────────────────

  function getUniqueValues(items, fieldName) {
    var values = new Set();
    items.forEach(function (item) {
      values.add(item[fieldName]);
    });
    return Array.from(values);
  }

  function optimizeSelectFilter(select, items, fieldName, valueProp, displayProp) {
    // Save original options on first run
    if (!originalOptions[fieldName]) {
      originalOptions[fieldName] = [];
      for (var i = 0; i < select.options.length; i++) {
        originalOptions[fieldName].push({
          value: select.options[i].value,
          text: select.options[i].text,
          defaultSelected: select.options[i].defaultSelected
        });
      }
    }

    // Restore all original options before filtering
    select.innerHTML = "";
    originalOptions[fieldName].forEach(function(optData) {
      var opt = document.createElement("option");
      opt.value = optData.value;
      opt.text = optData.text;
      opt.defaultSelected = optData.defaultSelected;
      select.appendChild(opt);
    });

    // Get unique values from the wanted list items
    var uniqueValues = getUniqueValues(items, fieldName);

    // Create a map of value -> display name from items
    var valueMap = {};
    items.forEach(function (item) {
      var val = item[fieldName];
      var display = displayProp ? item[displayProp] : null;
      if (!valueMap[val]) {
        valueMap[val] = display;
      }
    });

    // Check if ALL items have the exact same value (for auto-select logic)
    var allSameValue = uniqueValues.length === 1;
    var singleValue = allSameValue ? uniqueValues[0] : null;

    // Remove options that don't match any items
    var optionsToRemove = [];
    for (var i = 0; i < select.options.length; i++) {
      var option = select.options[i];
      var value = valueProp === "number" ? parseInt(option.value, 10) : option.value;

      // Keep "All" / "Any" options (typically -1, 0, or "X")
      var isDefaultOption =
        value === -1 ||
        value === 0 ||
        option.value === "X" ||
        option.value === "0" ||
        option.value === "-1";

      if (isDefaultOption) continue;

      // Remove if not in unique values
      if (!uniqueValues.includes(value)) {
        optionsToRemove.push(option);
      }
    }

    optionsToRemove.forEach(function (option) { option.remove(); });

    // Auto-select and disable ONLY if all items have the exact same value
    if (allSameValue) {
      var foundMatch = false;
      for (var i = 0; i < select.options.length; i++) {
        var option = select.options[i];
        var value = valueProp === "number" ? parseInt(option.value, 10) : option.value;

        if (value === singleValue || (singleValue === "X" && option.value === "X")) {
          select.value = option.value;
          select.disabled = true;
          select.style.opacity = "0.6";
          select.title = "All items in your wanted list have this value";

          // Save expected state so we can restore if React resets it
          expectedSelectStates[fieldName] = {
            value: option.value,
            disabled: true,
            opacity: "0.6"
          };

          foundMatch = true;
          break;
        }
      }

      if (!foundMatch) {
        console.warn("[wanted-list-smart-filters] Could not find matching option for value:", singleValue);
      }
    } else {
      // Not auto-selecting, clear expected state
      expectedSelectStates[fieldName] = null;
    }
  }

  async function applySmartFilters() {
    var filterContainer = document.querySelector(".search-item-filters");
    if (!filterContainer) return;

    var wantedMoreID = getWantedMoreID();
    if (!wantedMoreID) return;

    // Fetch all wanted items (will use cache if available)
    var items = await fetchAllWantedItems(wantedMoreID);
    if (!items || items.length === 0) return;

    // Find the select elements by their labels
    var selects = filterContainer.querySelectorAll("select");
    for (var i = 0; i < selects.length; i++) {
      var select = selects[i];
      var label = select.closest(".l-flex")?.querySelector("label")?.textContent?.trim();

      if (label === "Color:") {
        optimizeSelectFilter(select, items, "colorID", "number", "colorName");
      } else if (label === "Condition:") {
        optimizeSelectFilter(select, items, "wantedNew", "string");
      }
    }
  }

  // ── Feature definition ──────────────────────────────────────────────

  var featureDef = {
    id: "wanted-list-smart-filters",
    name: "Smart Wanted List Filters",
    description:
      "Filters the Color and Condition dropdowns on wanted list search pages to show only values that exist in your wanted list. Auto-selects and disables if all items share the same value.",
    enabledByDefault: true,
    section: "Search",
    docsUrl: "https://github.com/fantapop/refined-bricklink#smart-wanted-list-filters",

    init: function () {
      // Only run on wanted list search pages
      if (!window.location.href.includes("/wanted/search.page")) return;

      var wantedMoreID = getWantedMoreID();
      if (!wantedMoreID) return;

      // Start fetching data in the background
      fetchAllWantedItems(wantedMoreID).catch(function(err) {
        console.error("[wanted-list-smart-filters] Pre-fetch error:", err);
      });

      // Watch for filter container to appear (when "More Options" is clicked)
      var filterContainerSeen = false;
      filterObserver = new MutationObserver(function() {
        var filterContainer = document.querySelector(".search-item-filters");

        // Only apply filters when container first appears, not on subsequent changes
        if (filterContainer && !filterContainerSeen) {
          filterContainerSeen = true;

          applySmartFilters().then(function() {
            // Set up watcher on the filter container to detect React re-renders
            setupFilterContainerWatcher();
          }).catch(function(err) {
            console.error("[wanted-list-smart-filters] Error applying filters:", err);
          });
        } else if (!filterContainer && filterContainerSeen) {
          // Container was hidden - reset flag so we can apply again when it reappears
          filterContainerSeen = false;
          // Disconnect the filter container watcher since it's hidden
          if (filterContainerWatcher) {
            filterContainerWatcher.disconnect();
            filterContainerWatcher = null;
          }
        }
      });

      filterObserver.observe(document.body, { childList: true, subtree: true });

      // Function to restore filter select states
      restoreFilterStates = function() {
        var filterContainer = document.querySelector(".search-item-filters");
        if (!filterContainer) return;

        var selects = filterContainer.querySelectorAll("select");
        for (var i = 0; i < selects.length; i++) {
          var select = selects[i];
          var label = select.closest(".l-flex")?.querySelector("label")?.textContent?.trim();
          var fieldName = null;

          if (label === "Color:") fieldName = "colorID";
          else if (label === "Condition:") fieldName = "wantedNew";

          if (fieldName && expectedSelectStates[fieldName]) {
            var expected = expectedSelectStates[fieldName];

            if (select.value !== expected.value || select.disabled !== expected.disabled) {
              select.value = expected.value;
              select.disabled = expected.disabled;
              select.style.opacity = expected.opacity;
              select.title = "All items in your wanted list have this value";
            }
          }
        }
      };

      // Watch table for edits, then poll to detect filter changes
      // React updates filters 10-20ms after table mutations
      function setupFilterContainerWatcher() {
        // Disconnect old table observer if exists
        if (tableObserver) {
          tableObserver.disconnect();
          tableObserver = null;
        }

        var table = document.querySelector(".table-wl-edit");
        if (!table) return;

        // Watch table for mutations (user editing items)
        tableObserver = new MutationObserver(function() {
          // Clear any existing polling interval
          if (pollIntervalId) {
            clearInterval(pollIntervalId);
            pollIntervalId = null;
          }

          // Start polling to detect filter changes (React updates filters ~10-20ms after table)
          var checkCount = 0;
          var maxChecks = 100; // 100 checks * 5ms = 500ms max

          pollIntervalId = setInterval(function() {
            checkCount++;
            var filterContainer = document.querySelector(".search-item-filters");
            if (!filterContainer) {
              clearInterval(pollIntervalId);
              pollIntervalId = null;
              return;
            }

            // Check if any filter select has changed from expected state
            var selects = filterContainer.querySelectorAll("select");
            var needsRestore = false;

            for (var i = 0; i < selects.length; i++) {
              var select = selects[i];
              var label = select.closest(".l-flex")?.querySelector("label")?.textContent?.trim();
              var fieldName = null;

              if (label === "Color:") fieldName = "colorID";
              else if (label === "Condition:") fieldName = "wantedNew";

              if (fieldName && expectedSelectStates[fieldName]) {
                var expected = expectedSelectStates[fieldName];
                if (select.value !== expected.value || select.disabled !== expected.disabled) {
                  needsRestore = true;
                  break;
                }
              }
            }

            if (needsRestore) {
              restoreFilterStates();
              clearInterval(pollIntervalId);
              pollIntervalId = null;
            } else if (checkCount >= maxChecks) {
              clearInterval(pollIntervalId);
              pollIntervalId = null;
            }
          }, 5);
        });

        tableObserver.observe(table, { childList: true, subtree: true, attributes: true });
      }

      // Watch for save banner to appear, then watch for it to hide (save complete)
      var lastBannerHeight = null;
      var saveInProgress = false;

      bannerWatcher = new MutationObserver(function() {
        var banner = document.getElementById("wanted-save-banner");
        if (!banner) {
          lastBannerHeight = null;
          return;
        }

        var currentHeight = banner.offsetHeight;

        // Banner just appeared (went from 0 to > 0 or first time seeing it)
        if ((lastBannerHeight === 0 || lastBannerHeight === null) && currentHeight > 0) {
          saveInProgress = false;

          // React re-renders the filters when entering edit mode, resetting their values
          // Re-apply the filter state (but don't re-fetch data)
          var filterContainer = document.querySelector(".search-item-filters");
          if (filterContainer && cachedData) {
            applySmartFilters().then(function() {
              setupFilterContainerWatcher();
            });
          }
        }

        // Banner just hid (went from > 0 to 0) - save completed
        if (lastBannerHeight > 0 && currentHeight === 0 && !saveInProgress) {
          saveInProgress = true; // Prevent multiple triggers
          cachedData = null;

          // Re-fetch data in background
          var wantedMoreID = getWantedMoreID();
          if (wantedMoreID) {
            fetchAllWantedItems(wantedMoreID).then(function(items) {
              // Re-apply filters if they're currently visible
              var filterContainer = document.querySelector(".search-item-filters");
              if (filterContainer) {
                applySmartFilters().then(function() {
                  setupFilterContainerWatcher();
                });
              }

              // Allow next save detection
              setTimeout(function() { saveInProgress = false; }, 1000);
            }).catch(function(err) {
              console.error("[wanted-list-smart-filters] Re-fetch error:", err);
              saveInProgress = false;
            });
          }
        }

        lastBannerHeight = currentHeight;
      });
      bannerWatcher.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] });
    },

    destroy: function () {
      // Clear caches
      cachedData = null;
      originalOptions = {};
      expectedSelectStates = {};

      // Clear polling interval
      if (pollIntervalId) {
        clearInterval(pollIntervalId);
        pollIntervalId = null;
      }

      // Disconnect observers
      if (tableObserver) {
        tableObserver.disconnect();
        tableObserver = null;
      }
      if (filterObserver) {
        filterObserver.disconnect();
        filterObserver = null;
      }
      if (filterContainerWatcher) {
        filterContainerWatcher.disconnect();
        filterContainerWatcher = null;
      }
      if (bannerWatcher) {
        bannerWatcher.disconnect();
        bannerWatcher = null;
      }
      if (selectWatcher) {
        selectWatcher.disconnect();
        selectWatcher = null;
      }

      // Clear function reference
      restoreFilterStates = null;
    },
  };

  RefinedBricklink.features.push(featureDef);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = featureDef;
  }
})();
