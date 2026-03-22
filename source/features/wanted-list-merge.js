(function () {
  var observer = null;
  var styleEl = null;
  var modalEl = null;
  var btnEl = null;
  var isInserting = false;
  var cachedWlJson = null;

  // ── Preview fetch state (survives modal reopen within session) ────────────
  var itemCache = new Map();     // listId → items[]
  var fetchQueue = [];           // [{id, name}] pending
  var currentlyFetching = null;  // {id, name} | null

  var CSS = /* @inline */``;

  // ── Helpers ─────────────────────────────────────────────────────────────

  function getWantedMoreID() {
    var match = window.location.href.match(/wantedMoreID=(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  function escXml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Content scripts run in an isolated JS world and cannot access page-defined
  // variables like window.wlJson directly. Parse it from the inline script tag.
  function parseWlJson() {
    if (cachedWlJson) return cachedWlJson;
    var scripts = document.querySelectorAll("script:not([src])");
    for (var i = 0; i < scripts.length; i++) {
      var m = scripts[i].textContent.match(/var wlJson = (\{.+?\});/);
      if (m) {
        try {
          cachedWlJson = JSON.parse(m[1]);
          return cachedWlJson;
        } catch (e) {}
      }
    }
    return null;
  }

  // ── Data fetching ────────────────────────────────────────────────────────

  async function fetchListItems(wantedMoreID) {
    var allItems = [];
    var page = 1;
    while (true) {
      var url =
        "/v2/wanted/search.page?type=A&wantedMoreID=" +
        wantedMoreID +
        "&sort=1&pageSize=100&page=" +
        page;
      var response = await fetch(url);
      if (!response.ok) break;
      var html = await response.text();
      var match = html.match(/var wlJson = (\{.+?\});/);
      if (!match) break;
      var data = JSON.parse(match[1]);
      if (!data.wantedItems || data.wantedItems.length === 0) break;
      allItems = allItems.concat(data.wantedItems);
      if (allItems.length >= data.totalResults) break;
      page++;
    }
    return allItems;
  }

  // Returns the catalog item ID used in upload XML, extracting the variant
  // suffix for S/I/O types from the image URL (e.g. "9247" → "9247-2").
  function resolveCatalogId(itemType, itemNo, imgURL) {
    var id = String(itemNo);
    if (
      (itemType === "S" || itemType === "I" || itemType === "O") &&
      !/-\d+$/.test(id)
    ) {
      var imgMatch = imgURL && imgURL.match(/\/(\d+-\d+)\.[^/]+$/);
      if (imgMatch) id = imgMatch[1];
    }
    return id;
  }

  // ── Merge logic ──────────────────────────────────────────────────────────

  function mergeItems(itemsByList, opts) {
    // opts.itemTypes: Set of allowed item type codes, or null for all
    var merged = new Map();

    for (var e = 0; e < itemsByList.length; e++) {
      var listName = itemsByList[e].listName;
      var items = itemsByList[e].items;

      for (var i = 0; i < items.length; i++) {
        var item = items[i];

        if (opts.itemTypes && opts.itemTypes.size > 0 && !opts.itemTypes.has(item.itemType)) {
          continue;
        }

        var filled = item.wantedQtyFilled || 0;
        // wantedQty of -1 means "no minimum quantity" — treat as valid
        var qty;
        if (item.wantedQty < 0) {
          qty = item.wantedQty; // preserve -1 as-is; skip unfulfilledOnly check
        } else {
          qty = opts.unfulfilledOnly
            ? Math.max(0, item.wantedQty - filled)
            : item.wantedQty;
          if (qty <= 0) continue;
        }

        var catalogId = resolveCatalogId(item.itemType, item.itemNo, item.imgURL);
        var key = item.itemType + ":" + catalogId + ":" + item.colorID;

        if (!merged.has(key)) {
          var remarks = opts.addRemarks
            ? (qty > 0 ? qty + "@" + listName : listName)
            : item.wantedRemark || "";
          merged.set(key, {
            itemType: item.itemType,
            catalogId: catalogId,
            colorID: item.colorID,
            qty: qty,
            maxPrice: item.wantedPrice,
            condition: item.wantedNew,
            notify: item.wantedNotify,
            remarks: remarks,
            // Preview metadata — kept from first occurrence, consistent across lists
            itemName: item.itemName || "",
            imgURL: item.imgURL || "",
            colorName: item.colorName || "",
            colorHex: item.colorHex || "",
          });
        } else {
          var existing = merged.get(key);
          // Only sum positive quantities; -1 means "no minimum" so don't accumulate
          if (existing.qty >= 0 && qty >= 0) {
            existing.qty += qty;
          }

          // Take minimum maxPrice (-1 means no limit; lower positive = more restrictive)
          if (item.wantedPrice < existing.maxPrice) {
            existing.maxPrice = item.wantedPrice;
          }

          if (opts.addRemarks) {
            var addition = " / " + (qty > 0 ? qty + "@" : "") + listName;
            if (existing.remarks.length + addition.length <= 255) {
              existing.remarks += addition;
            }
          }
        }
      }
    }

    return Array.from(merged.values());
  }

  // ── XML generation ───────────────────────────────────────────────────────

  function generateXml(items) {
    var lines = ['<?xml version="1.0" encoding="UTF-8"?>', "<INVENTORY>"];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      lines.push("<ITEM>");
      lines.push("<ITEMTYPE>" + item.itemType + "</ITEMTYPE>");
      lines.push("<ITEMID>" + escXml(item.catalogId) + "</ITEMID>");
      if (item.colorID) lines.push("<COLOR>" + item.colorID + "</COLOR>");
      lines.push("<MINQTY>" + item.qty + "</MINQTY>");
      var price = Number(item.maxPrice);
      lines.push("<MAXPRICE>" + (isNaN(price) ? -1 : price).toFixed(4) + "</MAXPRICE>");
      if (item.condition) lines.push("<CONDITION>" + item.condition + "</CONDITION>");
      if (item.notify)    lines.push("<NOTIFY>" + item.notify + "</NOTIFY>");
      if (item.remarks) {
        lines.push("<REMARKS>" + escXml(item.remarks) + "</REMARKS>");
      }
      lines.push("</ITEM>");
    }
    lines.push("</INVENTORY>");
    return lines.join("\n");
  }

  // ── Upload ───────────────────────────────────────────────────────────────

  async function uploadXml(xml, wantedMoreID) {
    var params = new URLSearchParams();
    params.append("wantedMoreID", wantedMoreID);
    params.append("xmlStr", xml);
    var response = await fetch("/ajax/clone/wanted/uploadXML.ajax", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    return response.json();
  }

  async function confirmUpload(wantedMoreID, wantedItems) {
    // Step 2 uses itemID (internal numeric ID resolved by step 1), not itemNo
    var confirmItems = wantedItems.map(function (item) {
      return {
        wantedID: item.wantedID,
        wantedMoreID: item.wantedMoreID,
        itemID: item.itemID,
        colorID: item.colorID,
        wantedNew: item.wantedNew,
        wantedNotify: item.wantedNotify,
        wantedQtyFilled: item.wantedQtyFilled,
        wantedQty: item.wantedQty,
        wantedRemarks: item.wantedRemarks,
        wantedPrice: item.wantedPriceRaw,
      };
    });
    var params = new URLSearchParams();
    params.append("wantedMoreID", wantedMoreID);
    params.append("uploadFrom", "90");
    params.append("wantedItemStr", JSON.stringify(confirmItems));
    params.append("sourceLocation", "1400");
    var response = await fetch("/ajax/clone/wanted/upload.ajax", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    return response.json();
  }

  // ── Preview / fetch queue ────────────────────────────────────────────────

  var ITEM_TYPE_LABELS = {
    P: "Parts", S: "Sets", M: "Minifigs", G: "Gear",
    B: "Books", I: "Instr.", O: "Boxes", C: "Catalogs",
  };

  function getSelectedIds() {
    if (!modalEl) return [];
    return Array.from(
      modalEl.querySelectorAll(".rb-merge-list .rb-merge-item:not(.rb-hidden) input:checked")
    ).map(function (cb) { return parseInt(cb.value, 10); });
  }

  function getMergeOpts() {
    if (!modalEl) return null;
    var selectedTypes = new Set(
      Array.from(modalEl.querySelectorAll(".rb-type-cb:checked")).map(function (cb) { return cb.value; })
    );
    return {
      unfulfilledOnly: modalEl.querySelector(".rb-unfulfilled").checked,
      addRemarks: modalEl.querySelector(".rb-add-remarks").checked,
      itemTypes: selectedTypes.size === ITEM_TYPES.length ? null : selectedTypes,
    };
  }

  function updatePreview() {
    if (!modalEl) return;

    var spinnerEl  = modalEl.querySelector(".rb-preview-spinner");
    var statusEl   = modalEl.querySelector(".rb-preview-status-text");
    var listEl     = modalEl.querySelector(".rb-preview-list");

    var selectedIds = getSelectedIds();
    var wlJson = parseWlJson();
    var allLists = (wlJson && wlJson.lists) || [];

    var cachedLists = [];
    var pendingCount = 0;
    selectedIds.forEach(function (id) {
      if (itemCache.has(id)) {
        var entry = allLists.find(function (l) { return l.id === id; });
        cachedLists.push({ listName: entry ? entry.name : String(id), items: itemCache.get(id) });
      } else {
        pendingCount++;
      }
    });

    var isFetching = currentlyFetching !== null || fetchQueue.length > 0;

    // Spinner
    spinnerEl.style.display = isFetching ? "" : "none";

    // Status text: loading progress or item count
    if (selectedIds.length === 0) {
      statusEl.textContent = "Select lists to preview";
    } else if (isFetching) {
      var inQueue = fetchQueue.length + (currentlyFetching ? 1 : 0);
      var fetchingName = currentlyFetching ? currentlyFetching.name : "";
      statusEl.textContent = fetchingName
        ? "Loading \u201c" + fetchingName + "\u201d\u2026 (" + inQueue + " remaining)"
        : "Loading\u2026";
    } else {
      statusEl.textContent = "";
    }

    if (selectedIds.length === 0) {
      listEl.innerHTML = '<div class="rb-preview-empty">Select wanted lists to see a preview.</div>';
      return;
    }

    if (cachedLists.length === 0) {
      listEl.innerHTML = '<div class="rb-preview-empty">Loading\u2026</div>';
      return;
    }

    var merged = mergeItems(cachedLists, getMergeOpts());

    // Append item count to status (or show as standalone when done loading)
    var countText = merged.length + " item" + (merged.length !== 1 ? "s" : "") + (pendingCount > 0 ? " so far" : "");
    if (!isFetching) {
      statusEl.textContent = countText;
    } else if (merged.length > 0) {
      statusEl.textContent += " \u00b7 " + countText;
    }

    // Item rows (cap at 200 for performance)
    var MAX_ROWS = 200;
    var rows = merged.slice(0, MAX_ROWS).map(function (item) {
      var img = item.imgURL
        ? '<img class="rb-preview-img" src="' + escXml(item.imgURL) + '" alt="" onerror="this.style.display=\'none\'">'
        : '<span class="rb-preview-img rb-preview-img-missing"></span>';
      var hasColor = item.colorName && item.colorName !== "(Not Applicable)";
      var swatch = hasColor && item.colorHex
        ? '<span class="rb-preview-swatch" style="background:#' + item.colorHex + '"></span>'
        : "";
      var colorLabel = hasColor ? escXml(item.colorName) : "";
      var catalogUrl = "/pages/clone/catalogitem.page?" + item.itemType + "=" + encodeURIComponent(item.catalogId);
      var itemNoLink = '<a class="rb-preview-itemno-link" href="' + catalogUrl + '" target="_blank">' + escXml(item.catalogId) + "</a>";
      var metaLine = itemNoLink + (hasColor ? "\u00a0\u00b7\u00a0" + swatch + colorLabel : "");
      // item.itemName is already HTML-encoded by BrickLink (e.g. &#40; for parentheses)
      // Use it directly in innerHTML; decode entities for the title tooltip
      var nameHtml = item.itemName || escXml(item.catalogId);
      var nameTitle = nameHtml.replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(parseInt(n, 10)); })
                              .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
      return (
        '<div class="rb-preview-row">' +
          '<div class="rb-preview-col-img">' + img + "</div>" +
          '<div class="rb-preview-col-desc">' +
            '<div class="rb-preview-name" title="' + escXml(nameTitle) + '">' + nameHtml + "</div>" +
            '<div class="rb-preview-meta">' + metaLine + "</div>" +
          "</div>" +
          '<div class="rb-preview-col-qty">' + (item.qty < 0 ? "\u2014" : item.qty) + "</div>" +
        "</div>"
      );
    }).join("");

    var overflow = merged.length > MAX_ROWS
      ? '<div class="rb-preview-overflow">\u2026and ' + (merged.length - MAX_ROWS) + " more</div>"
      : "";

    listEl.innerHTML = rows + overflow;
  }

  function enqueueFetch(ids) {
    var wlJson = parseWlJson();
    var allLists = (wlJson && wlJson.lists) || [];

    ids.forEach(function (id) {
      if (itemCache.has(id)) return;
      if (currentlyFetching && currentlyFetching.id === id) return;
      if (fetchQueue.find(function (x) { return x.id === id; })) return;
      var entry = allLists.find(function (l) { return l.id === id; });
      fetchQueue.push({ id: id, name: entry ? entry.name : String(id) });
    });

    if (!currentlyFetching) drainFetchQueue();
  }

  async function drainFetchQueue() {
    if (fetchQueue.length === 0) {
      currentlyFetching = null;
      updatePreview();
      return;
    }

    currentlyFetching = fetchQueue.shift();
    updatePreview(); // show spinner immediately

    try {
      var items = await fetchListItems(currentlyFetching.id);
      itemCache.set(currentlyFetching.id, items);
    } catch (e) {
      console.error("[wanted-list-merge] Failed to fetch list:", currentlyFetching.name, e);
      itemCache.set(currentlyFetching.id, []);
    }

    currentlyFetching = null;
    updatePreview(); // show updated results
    drainFetchQueue();
  }

  function onListSelectionChange() {
    updateSubmitBtn();
    updateSelectAllLabel();

    var selectedIds = getSelectedIds();

    // Drop queued fetches for lists that are no longer selected
    fetchQueue = fetchQueue.filter(function (entry) {
      return selectedIds.indexOf(entry.id) !== -1;
    });

    enqueueFetch(selectedIds);
    updatePreview();
  }

  // ── Modal ────────────────────────────────────────────────────────────────

  var ITEM_TYPES = [
    { code: "P", label: "Parts" },
    { code: "S", label: "Sets" },
    { code: "M", label: "Minifigs" },
    { code: "G", label: "Gear" },
    { code: "B", label: "Books" },
    { code: "I", label: "Instructions" },
    { code: "O", label: "Original Box" },
    { code: "C", label: "Catalogs" },
  ];

  function closeModal() {
    if (modalEl) {
      modalEl.remove();
      modalEl = null;
    }
    // Leave itemCache intact — reuse on next open
    // Clear only the active queue so stale fetches don't update a closed modal
    fetchQueue = [];
    currentlyFetching = null;
  }

  function showModal() {
    closeModal();

    var currentId = getWantedMoreID();
    var wlJson = parseWlJson();
    var hideEnabled = document.body.classList.contains("rb-hide-enabled");
    var showHidden = document.body.classList.contains("rb-show-hidden");
    var lists = ((wlJson && wlJson.lists) || []).filter(function (l) {
      if (l.id === currentId) return false;
      if (hideEnabled && !showHidden && RefinedBricklink.isHidden(l.name)) return false;
      return true;
    });
    var listName = wlJson && wlJson.wantedListInfo ? wlJson.wantedListInfo.name : "";

    var typeCheckboxes = ITEM_TYPES.map(function (t) {
      return (
        '<label class="rb-merge-type-item">' +
        '<input type="checkbox" class="rb-type-cb" value="' + t.code + '" checked> ' +
        t.label +
        "</label>"
      );
    }).join("");

    modalEl = document.createElement("div");
    modalEl.className = "rb-merge-overlay";
    modalEl.innerHTML =
      '<div class="rb-merge-modal">' +
        '<div class="rb-merge-header">' +
          '<h3 class="rb-merge-title">Add Lists to \u201c' + escXml(listName) + '\u201d</h3>' +
          '<span class="rb-merge-close" title="Close"><i class="fas fa-times"></i></span>' +
        "</div>" +
        '<div class="rb-merge-content">' +

          // Column 1: list selection
          '<div class="rb-merge-col rb-merge-col-lists">' +
            '<div class="rb-merge-col-title">Select wanted lists</div>' +
            '<div class="rb-merge-top-row">' +
              '<input class="rb-merge-search" type="text" placeholder="Filter lists\u2026">' +
              '<label class="rb-merge-select-all-label"><input type="checkbox" class="rb-merge-select-all"> <span class="rb-select-all-text"></span></label>' +
            "</div>" +
            '<div class="rb-merge-sub-header">Name</div>' +
            '<div class="rb-merge-list">' +
              (lists.length === 0
                ? '<div class="rb-merge-empty">No other wanted lists found.</div>'
                : lists.map(function (l) {
                    return (
                      '<label class="rb-merge-item" data-name="' +
                      escXml(l.name.toLowerCase()) +
                      '">' +
                      '<input type="checkbox" value="' + l.id + '"> ' +
                      escXml(l.name) +
                      "</label>"
                    );
                  }).join("")
              ) +
            "</div>" +
          "</div>" +

          // Column 2: filters + options stacked
          '<div class="rb-merge-col rb-merge-col-filters">' +
            '<div class="rb-merge-col-title">Filters</div>' +
            '<div class="rb-merge-top-row"></div>' +
            '<div class="rb-merge-sub-header">Item Type</div>' +
            '<div class="rb-merge-types">' +
              typeCheckboxes +
            "</div>" +
            '<div class="rb-merge-sub-header rb-merge-sub-header--gap">Options</div>' +
            '<div class="rb-merge-options-content">' +
              '<label class="rb-merge-option">' +
                '<input type="checkbox" class="rb-unfulfilled" checked> ' +
                '<span>Unfulfilled only<small>items where Have &lt; Want</small></span>' +
              "</label>" +
              '<label class="rb-merge-option">' +
                '<input type="checkbox" class="rb-add-remarks" checked> ' +
                '<span>Add source list name to remarks</span>' +
              "</label>" +
            "</div>" +
          "</div>" +

          // Column 3: preview
          '<div class="rb-merge-col rb-merge-col-preview">' +
            '<div class="rb-merge-col-title">Preview</div>' +
            '<div class="rb-merge-top-row rb-preview-top">' +
              '<i class="fas fa-spinner fa-spin rb-preview-spinner" style="display:none"></i>' +
              '<span class="rb-preview-status-text">Select lists to preview</span>' +
            "</div>" +
            '<div class="rb-merge-sub-header rb-preview-col-headers">' +
              '<span class="rb-preview-hdr-img">Image</span>' +
              '<span class="rb-preview-hdr-desc">Description</span>' +
              '<span class="rb-preview-hdr-qty">Qty</span>' +
            "</div>" +
            '<div class="rb-preview-list"></div>' +
          "</div>" +

        "</div>" +
        '<div class="rb-merge-footer">' +
          '<span class="rb-merge-status"></span>' +
          "<div>" +
            '<button class="bl-btn rb-merge-cancel">Cancel</button>' +
            '<button class="bl-btn rb-merge-submit" disabled>Add Items</button>' +
          "</div>" +
        "</div>" +
      "</div>";

    modalEl.querySelector(".rb-merge-close").addEventListener("click", closeModal);
    modalEl.querySelector(".rb-merge-cancel").addEventListener("click", closeModal);
    modalEl.addEventListener("click", function (e) {
      if (e.target === modalEl) closeModal();
    });

    var selectAll = modalEl.querySelector(".rb-merge-select-all");
    selectAll.addEventListener("change", function () {
      var checked = selectAll.checked;
      modalEl.querySelectorAll(".rb-merge-list .rb-merge-item:not(.rb-hidden) input").forEach(function (cb) {
        cb.checked = checked;
      });
      onListSelectionChange();
    });

    modalEl.querySelector(".rb-merge-list").addEventListener("change", function () {
      onListSelectionChange();
    });

    modalEl.querySelector(".rb-merge-search").addEventListener("input", function () {
      var q = this.value.toLowerCase();
      modalEl.querySelectorAll(".rb-merge-item").forEach(function (item) {
        item.classList.toggle("rb-hidden", q !== "" && !item.dataset.name.includes(q));
      });
      updateSubmitBtn();
      updateSelectAllLabel();
    });

    // Rerun preview when filters change (no new fetches needed)
    modalEl.querySelector(".rb-merge-types").addEventListener("change", updatePreview);
    modalEl.querySelector(".rb-merge-options-content").addEventListener("change", updatePreview);

    modalEl.querySelector(".rb-merge-submit").addEventListener("click", onSubmit);

    document.body.appendChild(modalEl);
    modalEl.querySelector(".rb-merge-search").focus();
    updateSubmitBtn();
    updateSelectAllLabel();
  }

  function updateSubmitBtn() {
    if (!modalEl) return;
    var anyChecked = Array.from(
      modalEl.querySelectorAll(".rb-merge-list .rb-merge-item:not(.rb-hidden) input:checked")
    ).length > 0;
    modalEl.querySelector(".rb-merge-submit").disabled = !anyChecked;
  }

  function updateSelectAllLabel() {
    if (!modalEl) return;
    var total   = modalEl.querySelectorAll(".rb-merge-list .rb-merge-item").length;
    var visible = modalEl.querySelectorAll(".rb-merge-list .rb-merge-item:not(.rb-hidden)").length;
    var checked = modalEl.querySelectorAll(".rb-merge-list .rb-merge-item:not(.rb-hidden) input:checked").length;
    var label = visible === total
      ? "All\u00a0(" + total + ")"
      : "Filtered\u00a0(" + visible + ")";
    modalEl.querySelector(".rb-select-all-text").textContent = label;
    modalEl.querySelector(".rb-merge-select-all").checked = visible > 0 && checked === visible;
  }

  async function onSubmit() {
    var wantedMoreID = getWantedMoreID();
    if (!wantedMoreID) return;

    var selectedIds = Array.from(
      modalEl.querySelectorAll(".rb-merge-list .rb-merge-item:not(.rb-hidden) input:checked")
    ).map(function (cb) { return parseInt(cb.value, 10); });

    var selectedTypes = new Set(
      Array.from(modalEl.querySelectorAll(".rb-type-cb:checked")).map(function (cb) { return cb.value; })
    );

    var unfulfilledOnly = modalEl.querySelector(".rb-unfulfilled").checked;
    var addRemarks = modalEl.querySelector(".rb-add-remarks").checked;

    var status = modalEl.querySelector(".rb-merge-status");
    var submitBtn = modalEl.querySelector(".rb-merge-submit");
    var cancelBtn = modalEl.querySelector(".rb-merge-cancel");
    submitBtn.disabled = true;
    cancelBtn.disabled = true;

    var wlJson = parseWlJson();
    var allLists = (wlJson && wlJson.lists) || [];
    var itemsByList = [];

    for (var i = 0; i < selectedIds.length; i++) {
      var id = selectedIds[i];
      var listEntry = allLists.find(function (l) { return l.id === id; });
      var name = listEntry ? listEntry.name : String(id);

      var items;
      if (itemCache.has(id)) {
        items = itemCache.get(id); // reuse cached data from preview
      } else {
        status.textContent =
          "Fetching " + name + "\u2026 (" + (i + 1) + "/" + selectedIds.length + ")";
        try {
          items = await fetchListItems(id);
          itemCache.set(id, items);
        } catch (e) {
          console.error("[wanted-list-merge] Failed to fetch list:", name, e);
          items = [];
        }
      }
      itemsByList.push({ listName: name, items: items });
    }

    status.textContent = "Merging items\u2026";
    var merged = mergeItems(itemsByList, {
      unfulfilledOnly: unfulfilledOnly,
      addRemarks: addRemarks,
      itemTypes: selectedTypes.size === ITEM_TYPES.length ? null : selectedTypes,
    });

    if (merged.length === 0) {
      status.textContent = "No items to add.";
      cancelBtn.disabled = false;
      return;
    }

    status.textContent = "Uploading " + merged.length + " items\u2026";
    var xml = generateXml(merged);

    try {
      // Step 1: parse XML and resolve itemIDs
      var step1 = await uploadXml(xml, wantedMoreID);
      if (step1.returnCode !== 0) {
        status.textContent = "Error: " + step1.returnMessage;
        cancelBtn.disabled = false;
        return;
      }

      var verifiedItems = step1.wantedItems || [];
      var skipped = (step1.notFoundItems || []).length + (step1.wrongColorItems || []).length;

      if (verifiedItems.length === 0) {
        status.textContent = "No valid items to add.";
        cancelBtn.disabled = false;
        return;
      }

      // Step 2: confirm upload
      status.textContent = "Confirming " + verifiedItems.length + " items\u2026";
      var step2 = await confirmUpload(wantedMoreID, verifiedItems);
      if (step2.returnCode !== 0) {
        status.textContent = "Error: " + step2.returnMessage;
        cancelBtn.disabled = false;
        return;
      }

      var doneMsg = "Done! " + verifiedItems.length + " item" + (verifiedItems.length !== 1 ? "s" : "") + " added.";
      if (skipped > 0) doneMsg += " (" + skipped + " not found, skipped)";
      status.textContent = doneMsg;
      setTimeout(function () {
        closeModal();
        window.location.reload();
      }, 1500);
    } catch (e) {
      console.error("[wanted-list-merge] Upload failed:", e);
      status.textContent = "Upload failed: " + e.message;
      cancelBtn.disabled = false;
    }
  }

  // ── Button insertion ─────────────────────────────────────────────────────

  function insertBtn() {
    if (isInserting) return;
    if (btnEl && document.body.contains(btnEl)) return;
    btnEl = null;

    var btnGroup = document.querySelector(".btn-group.l-inline-block");
    if (!btnGroup) return;

    isInserting = true;
    btnEl = document.createElement("button");
    btnEl.className = "bl-btn";
    btnEl.type = "button";
    btnEl.textContent = "Add Lists";
    btnEl.addEventListener("click", showModal);

    var addItemBtn = Array.from(btnGroup.querySelectorAll("button")).find(
      function (b) { return b.textContent.trim() === "Add Item"; }
    );
    if (addItemBtn) {
      addItemBtn.insertAdjacentElement("afterend", btnEl);
    } else {
      btnGroup.appendChild(btnEl);
    }

    // Prevent the toolbar row from wrapping after we add a button.
    // Walk up to find the flex container that also holds the search input.
    var el = btnGroup.parentElement;
    for (var i = 0; i < 4; i++) {
      if (!el) break;
      if (el.querySelector('input[placeholder="Search Wanted List"]')) {
        el.style.flexWrap = "nowrap";
        break;
      }
      el = el.parentElement;
    }

    isInserting = false;
  }

  // ── Feature ──────────────────────────────────────────────────────────────

  var featureDef = {
    id: "wanted-list-merge",
    name: "Add from Wanted Lists",
    description:
      'Adds an "Add Lists" button to the wanted list search page toolbar to merge items from other wanted lists into the current list.',
    enabledByDefault: true,
    section: "Wanted Lists",

    // Exposed for testing
    _mergeItems: mergeItems,
    _generateXml: generateXml,
    _resolveCatalogId: resolveCatalogId,
    _escXml: escXml,

    init() {
      if (!window.location.href.includes("/wanted/search.page")) return;
      if (!getWantedMoreID()) return;

      styleEl = document.createElement("style");
      styleEl.textContent = CSS;
      document.head.appendChild(styleEl);

      insertBtn();

      observer = new MutationObserver(insertBtn);
      observer.observe(document.querySelector("main") || document.body, {
        childList: true,
        subtree: true,
      });
    },

    destroy() {
      closeModal();
      cachedWlJson = null;
      itemCache.clear();
      fetchQueue = [];
      currentlyFetching = null;
      if (observer) { observer.disconnect(); observer = null; }
      if (styleEl) { styleEl.remove(); styleEl = null; }
      if (btnEl) { btnEl.remove(); btnEl = null; }
      isInserting = false;
    },
  };

  RefinedBricklink.features.push(featureDef);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = featureDef;
  }
})();
