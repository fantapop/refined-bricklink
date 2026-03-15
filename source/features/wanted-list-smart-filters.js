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
    if (fetchInProgress) {
      console.log("[wanted-list-smart-filters] Fetch already in progress");
      return null;
    }
    if (cachedData && cachedData.wantedMoreID === wantedMoreID) {
      console.log("[wanted-list-smart-filters] Using cached data");
      return cachedData.items;
    }

    fetchInProgress = true;
    var allItems = [];
    var page = 1;

    try {
      while (true) {
        var url = `https://www.bricklink.com/v2/wanted/search.page?type=A&wantedMoreID=${wantedMoreID}&sort=1&pageSize=100&page=${page}`;
        console.log("[wanted-list-smart-filters] Fetching page", page, "from", url);
        var response = await fetch(url);
        if (!response.ok) {
          console.log("[wanted-list-smart-filters] Response not ok:", response.status);
          break;
        }

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
      console.log("[wanted-list-smart-filters] Saved", originalOptions[fieldName].length, "original options for", fieldName);
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
    console.log("[wanted-list-smart-filters] Restored", select.options.length, "options for", fieldName);

    // Get unique values from the wanted list items
    var uniqueValues = getUniqueValues(items, fieldName);

    console.log("[wanted-list-smart-filters] Unique values for", fieldName, ":", uniqueValues);

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

      if (isDefaultOption) {
        continue;
      }

      // Remove if not in unique values
      if (!uniqueValues.includes(value)) {
        optionsToRemove.push(option);
      }
    }

    optionsToRemove.forEach(function (option) {
      console.log("[wanted-list-smart-filters] Removing option:", option.value, option.text);
      option.remove();
    });

    // Log remaining options
    console.log("[wanted-list-smart-filters] Remaining options after filtering:");
    for (var i = 0; i < select.options.length; i++) {
      console.log("  -", select.options[i].value, ":", select.options[i].text);
    }

    // Auto-select and disable ONLY if all items have the exact same value
    if (allSameValue) {
      console.log("[wanted-list-smart-filters] All items have same value:", singleValue, "for field:", fieldName);
      console.log("[wanted-list-smart-filters] Looking for option with value:", singleValue, "valueProp:", valueProp);

      // Find the matching option and select it
      var foundMatch = false;
      for (var i = 0; i < select.options.length; i++) {
        var option = select.options[i];
        var value = valueProp === "number" ? parseInt(option.value, 10) : option.value;

        console.log("[wanted-list-smart-filters] Comparing", value, "===", singleValue, "?", value === singleValue);

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

          console.log("[wanted-list-smart-filters] Auto-selected and disabled:", option.value);
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
    console.log("[wanted-list-smart-filters] applySmartFilters started");

    var filterContainer = document.querySelector(".search-item-filters");
    if (!filterContainer) {
      console.log("[wanted-list-smart-filters] Filter container not visible yet");
      return;
    }

    console.log("[wanted-list-smart-filters] Filter container found");

    var wantedMoreID = getWantedMoreID();
    console.log("[wanted-list-smart-filters] wantedMoreID:", wantedMoreID);
    if (!wantedMoreID) return;

    // Fetch all wanted items (will use cache if available)
    console.log("[wanted-list-smart-filters] Getting items...");
    var items = await fetchAllWantedItems(wantedMoreID);
    console.log("[wanted-list-smart-filters] Got items:", items ? items.length : 0);
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
      } else if (label === "Years:") {
        // Years might need special handling if it's in the data
        // For now, skip it since wantedItems doesn't seem to have year info
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
      console.log("[wanted-list-smart-filters] init called, URL:", window.location.href);

      // Only run on wanted list search pages
      if (!window.location.href.includes("/wanted/search.page")) {
        console.log("[wanted-list-smart-filters] Not on search page, skipping");
        return;
      }

      var wantedMoreID = getWantedMoreID();
      if (!wantedMoreID) {
        console.log("[wanted-list-smart-filters] No wantedMoreID found");
        return;
      }

      // Start fetching data in the background
      console.log("[wanted-list-smart-filters] Pre-fetching all items...");
      fetchAllWantedItems(wantedMoreID).then(function(items) {
        console.log("[wanted-list-smart-filters] Pre-fetch complete:", items ? items.length : 0, "items");
      }).catch(function(err) {
        console.error("[wanted-list-smart-filters] Pre-fetch error:", err);
      });

      // Watch for filter container to appear (when "More Options" is clicked)
      var filterContainerSeen = false;
      filterObserver = new MutationObserver(function() {
        var filterContainer = document.querySelector(".search-item-filters");

        // Only apply filters when container first appears, not on subsequent changes
        if (filterContainer && !filterContainerSeen) {
          console.log("[wanted-list-smart-filters] Filter container appeared, applying filters...");
          filterContainerSeen = true;

          applySmartFilters().then(function() {
            console.log("[wanted-list-smart-filters] Smart filters applied");
            // Set up watcher on the filter container to detect React re-renders
            setupFilterContainerWatcher();
          }).catch(function(err) {
            console.error("[wanted-list-smart-filters] Error applying filters:", err);
          });
        } else if (!filterContainer && filterContainerSeen) {
          // Container was hidden - reset flag so we can apply again when it reappears
          filterContainerSeen = false;
          console.log("[wanted-list-smart-filters] Filter container hidden");
          // Disconnect the filter container watcher since it's hidden
          if (filterContainerWatcher) {
            filterContainerWatcher.disconnect();
            filterContainerWatcher = null;
          }
        }
      });

      filterObserver.observe(document.body, { childList: true, subtree: true });

      // Function to restore filter select states
      restoreFilterStates = function(event) {
        console.log("[wanted-list-smart-filters] Restoring filter states after mutation or event:", event);
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
              console.log("[wanted-list-smart-filters] Restoring filter state:", fieldName, expected.value);
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
        if (!table) {
          console.log("[wanted-list-smart-filters] Table not found, skipping observer setup");
          return;
        }

        // Watch table for mutations (user editing items)
        tableObserver = new MutationObserver(function(mutations) {
          console.log("[wanted-list-smart-filters] Table mutated, watching for filter changes...");

          // Clear any existing polling interval
          if (pollIntervalId) {
            clearInterval(pollIntervalId);
            pollIntervalId = null;
          }

          // Start polling to detect filter changes (React updates filters ~10-20ms after table)
          var startTime = Date.now();
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
                  var elapsed = Date.now() - startTime;
                  console.log("[wanted-list-smart-filters] Filter changed after", elapsed, "ms -", "restoring");
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
        console.log("[wanted-list-smart-filters] Table observer set up");
      }

      // Watch for save banner to appear, then watch for it to hide (save complete)
      var lastBannerHeight = null;
      var saveInProgress = false;

      bannerWatcher = new MutationObserver(function() {
        var banner = document.getElementById("wanted-save-banner");
        if (!banner) {
          if (lastBannerHeight !== null) {
            console.log("[wanted-list-smart-filters] Banner removed from DOM");
            lastBannerHeight = null;
          }
          return;
        }

        var currentHeight = banner.offsetHeight;

        // Log any height change for debugging
        if (currentHeight !== lastBannerHeight) {
          console.log("[wanted-list-smart-filters] Banner height changed:", lastBannerHeight, "→", currentHeight);
        }

        // Banner just appeared (went from 0 to > 0 or first time seeing it)
        if ((lastBannerHeight === 0 || lastBannerHeight === null) && currentHeight > 0) {
          console.log("[wanted-list-smart-filters] *** Edit mode entered - banner appeared ***");
          saveInProgress = false;

          // React re-renders the filters when entering edit mode, resetting their values
          // Re-apply the filter state (but don't re-fetch data)
          var filterContainer = document.querySelector(".search-item-filters");
          if (filterContainer && cachedData) {
            console.log("[wanted-list-smart-filters] Re-applying filter state after edit mode entered");
            applySmartFilters().then(function() {
              setupFilterContainerWatcher();
            });
          }
        }

        // Banner just hid (went from > 0 to 0) - save completed
        if (lastBannerHeight > 0 && currentHeight === 0 && !saveInProgress) {
          console.log("[wanted-list-smart-filters] Save detected, clearing cache");
          saveInProgress = true; // Prevent multiple triggers
          cachedData = null;

          // Re-fetch data in background
          var wantedMoreID = getWantedMoreID();
          if (wantedMoreID) {
            console.log("[wanted-list-smart-filters] Re-fetching items after save...");
            fetchAllWantedItems(wantedMoreID).then(function(items) {
              console.log("[wanted-list-smart-filters] Re-fetch complete:", items ? items.length : 0, "items");

              // Re-apply filters if they're currently visible
              var filterContainer = document.querySelector(".search-item-filters");
              if (filterContainer) {
                console.log("[wanted-list-smart-filters] Re-applying filters with fresh data");
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
