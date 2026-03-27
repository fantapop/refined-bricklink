(function () {
  var hashChangeHandler = null;
  var styleEl = null;
  var tabLi = null;
  var selectedParts = [];
  var setCache = new Map();  // key: "partNum:colorId", value: Map<setId, {qty,setName,year}>
  var lastLoadedPart = null; // {partNum, colorDataMap, partName} — skip re-fetch for same part
  var partRowsEl = null;
  var partsTitleEl = null;
  var resultsTitleEl = null;
  var resultsListEl = null;
  var lastResults = null;  // cached for re-sorting without re-fetching
  var sortBy = "year";
  var sortDir = "desc";

  var PANEL_ID = "rb-set-detective-panel";
  var TAB_ID = "rb-set-detective-tab";
  var HASH = "#rb-set-detective";

  // ── Feature definition ──────────────────────────────────────────────────────

  var featureDef = {
    id: "set-detective",
    name: "Set Detective",
    description:
      'Identify which set a partially assembled model came from by searching for sets that contain a given combination of known parts.',
    enabledByDefault: true,
    section: "Search",

    init: function () {
      if (!location.pathname.startsWith("/v2/wanted/")) return;
      injectStyles();
      injectTab();
      if (location.hash === HASH) showPanel();
      hashChangeHandler = function () {
        if (location.hash === HASH) showPanel();
        else hidePanel();
      };
      window.addEventListener("hashchange", hashChangeHandler);
    },

    destroy: function () {
      hidePanel();
      if (tabLi && tabLi.parentElement) tabLi.parentElement.removeChild(tabLi);
      tabLi = null;
      if (styleEl && styleEl.parentElement) styleEl.parentElement.removeChild(styleEl);
      styleEl = null;
      if (hashChangeHandler) {
        window.removeEventListener("hashchange", hashChangeHandler);
        hashChangeHandler = null;
      }
      selectedParts = [];
      setCache = new Map();
      lastLoadedPart = null;
      partRowsEl = null;
      partsTitleEl = null;
      resultsTitleEl = null;
      resultsListEl = null;
      lastResults = null;
      sortBy = "year";
      sortDir = "desc";
    },
  };

  // ── Tab injection ───────────────────────────────────────────────────────────

  function injectTab() {
    var subnav = document.querySelector("ul.view-selector--subnav");
    if (!subnav || document.getElementById(TAB_ID)) return;
    tabLi = document.createElement("li");
    tabLi.id = TAB_ID;
    tabLi.className = "view-selector__item";
    var a = document.createElement("a");
    a.href = HASH;
    a.className = "view-selector__item-content";
    a.textContent = "Set Detective";
    tabLi.appendChild(a);
    subnav.appendChild(tabLi);
  }

  // ── Panel show / hide ───────────────────────────────────────────────────────

  function getSubnavContainer() {
    var subnav = document.querySelector("ul.view-selector--subnav");
    return subnav ? subnav.closest(".container-xl") : null;
  }

  function getContentSiblings() {
    var subnavContainer = getSubnavContainer();
    if (!subnavContainer || !subnavContainer.parentElement) return [];
    return Array.from(subnavContainer.parentElement.children).filter(function (el) {
      return el !== subnavContainer && el.id !== PANEL_ID;
    });
  }

  function showPanel() {
    getContentSiblings().forEach(function (el) { el.style.display = "none"; });
    var subnav = document.querySelector("ul.view-selector--subnav");
    if (subnav) {
      Array.from(subnav.querySelectorAll(".view-selector__item--active")).forEach(
        function (el) { el.classList.remove("view-selector__item--active"); }
      );
    }
    if (tabLi) tabLi.classList.add("view-selector__item--active");
    var panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = buildPanel();
      var subnavContainer = getSubnavContainer();
      if (subnavContainer && subnavContainer.parentElement) {
        subnavContainer.parentElement.insertBefore(panel, subnavContainer.nextSibling);
      }
    }
    panel.style.display = "";
  }

  function hidePanel() {
    getContentSiblings().forEach(function (el) { el.style.display = ""; });
    if (tabLi) tabLi.classList.remove("view-selector__item--active");
    var panel = document.getElementById(PANEL_ID);
    if (panel) panel.style.display = "none";
  }

  // ── Panel construction ──────────────────────────────────────────────────────

  function buildPanel() {
    var panel = document.createElement("div");
    panel.id = PANEL_ID;

    // Header — BL l-flex l-split / h2.tight / strong pattern
    var header = document.createElement("header");
    header.className = "container-xl container-header l-pad-y l-border-round--null";
    var headerInner = document.createElement("div");
    headerInner.className = "l-flex l-split";
    var headerLeft = document.createElement("div");
    headerLeft.className = "break-word l-margin-right--sm";
    var h2 = document.createElement("h2");
    h2.className = "tight";
    var strong = document.createElement("strong");
    strong.textContent = "Set Detective";
    h2.appendChild(strong);
    headerLeft.appendChild(h2);
    headerInner.appendChild(headerLeft);
    header.appendChild(headerInner);
    panel.appendChild(header);

    // Content wrapper (white background)
    var container = document.createElement("div");
    container.className = "container-xl container-header-sub l-pad-y";

    // 3-column flex layout
    var content = document.createElement("div");
    content.className = "rb-ss-content";

    content.appendChild(buildFormColumn());

    var partsResult = buildPartsColumn();
    content.appendChild(partsResult.col);
    partRowsEl = partsResult.listEl;
    partsTitleEl = partsResult.titleEl;

    var resultsResult = buildResultsColumn();
    content.appendChild(resultsResult.col);
    resultsTitleEl = resultsResult.titleEl;
    resultsListEl = resultsResult.listEl;

    container.appendChild(content);
    panel.appendChild(container);

    return panel;
  }

  // ── Left column: Part entry form ────────────────────────────────────────────

  function buildFormColumn() {
    var col = document.createElement("div");
    col.className = "rb-ss-col rb-ss-col-form";

    // Action bar
    var topRow = document.createElement("div");
    topRow.className = "rb-ss-top-row";
    var titleEl = document.createElement("span");
    titleEl.className = "rb-ss-col-title";
    titleEl.textContent = "Add a Part";
    topRow.appendChild(titleEl);
    col.appendChild(topRow);

    // Empty sub-header (matches height/style of other columns' sub-headers)
    var formSubHeader = document.createElement("div");
    formSubHeader.className = "rb-ss-sub-header rb-ss-form-subheader";
    formSubHeader.textContent = "\u00a0";
    col.appendChild(formSubHeader);

    // White form body
    var body = document.createElement("div");
    body.className = "rb-ss-form-body";

    // Part # input
    var partNumGroup = document.createElement("div");
    partNumGroup.className = "rb-ss-form-group";
    var partNumLabel = document.createElement("label");
    partNumLabel.className = "rb-ss-form-label";
    partNumLabel.textContent = "Part Number";
    var partNumInput = document.createElement("input");
    partNumInput.type = "text";
    partNumInput.className = "rb-ss-form-input";
    partNumInput.placeholder = "e.g. 3001";
    partNumInput.autocomplete = "off";
    partNumGroup.appendChild(partNumLabel);
    partNumGroup.appendChild(partNumInput);
    body.appendChild(partNumGroup);

    // Preview container — hidden until the user types a part number
    var partPreviewEl = document.createElement("div");
    partPreviewEl.className = "rb-ss-part-preview rb-ss-hidden";

    // Status text — shown inside preview container during load/error
    var partStatusEl = document.createElement("div");
    partStatusEl.className = "rb-ss-part-status rb-ss-hidden";
    partPreviewEl.appendChild(partStatusEl);

    // Part info area — only shown once data is ready (no layout shift during load)
    var partInfoEl = document.createElement("div");
    partInfoEl.className = "rb-ss-part-info rb-ss-hidden";
    var partInfoInner = document.createElement("div");
    partInfoInner.className = "rb-ss-part-info-inner";
    var partImg = document.createElement("img");
    partImg.className = "rb-ss-part-img";
    partImg.alt = "";
    var partNameEl = document.createElement("span");
    partNameEl.className = "rb-ss-part-name";
    partInfoInner.appendChild(partImg);
    partInfoInner.appendChild(partNameEl);
    partInfoEl.appendChild(partInfoInner);
    partPreviewEl.appendChild(partInfoEl);
    body.appendChild(partPreviewEl);

    // Color select
    var colorGroup = document.createElement("div");
    colorGroup.className = "rb-ss-form-group";
    var colorLabel = document.createElement("label");
    colorLabel.className = "rb-ss-form-label";
    colorLabel.textContent = "Color";
    var colorWrap = document.createElement("div");
    colorWrap.className = "rb-ss-color-wrap";
    var swatch = document.createElement("span");
    swatch.className = "rb-ss-form-swatch";
    swatch.style.visibility = "hidden";
    var colorSelect = document.createElement("select");
    colorSelect.className = "rb-ss-color-select";
    colorSelect.disabled = true;
    colorSelect.title = "Enter a part number first";
    appendOption(colorSelect, "", "");
    colorWrap.appendChild(swatch);
    colorWrap.appendChild(colorSelect);
    colorGroup.appendChild(colorLabel);
    colorGroup.appendChild(colorWrap);
    body.appendChild(colorGroup);

    // Min Qty
    var qtyGroup = document.createElement("div");
    qtyGroup.className = "rb-ss-form-group";
    var qtyLabel = document.createElement("label");
    qtyLabel.className = "rb-ss-form-label";
    qtyLabel.textContent = "Min Qty";
    var qtyInput = document.createElement("input");
    qtyInput.type = "number";
    qtyInput.className = "rb-ss-form-input rb-ss-qty-input";
    qtyInput.value = "1";
    qtyInput.min = "1";
    qtyGroup.appendChild(qtyLabel);
    qtyGroup.appendChild(qtyInput);
    body.appendChild(qtyGroup);

    // Add Part button
    var addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "bl-btn primaryBlue rb-ss-add-btn";
    addBtn.textContent = "Add Part";
    addBtn.disabled = true;
    body.appendChild(addBtn);

    col.appendChild(body);

    // ── State + wiring ──

    var colorDataMap = {};
    var loadGen = 0;

    function setStatus(text) {
      partStatusEl.textContent = text;
      partStatusEl.classList.toggle("rb-ss-hidden", !text);
    }

    function resetForm() {
      colorDataMap = {};
      colorSelect.innerHTML = "";
      appendOption(colorSelect, "", "");
      colorSelect.disabled = true;
      colorSelect.title = "Enter a part number first";
      swatch.style.background = "";
      swatch.style.visibility = "hidden";
      partImg.src = "";
      partNameEl.textContent = "";
      partInfoEl.classList.add("rb-ss-hidden");
      partPreviewEl.classList.add("rb-ss-hidden");
      setStatus("");
      addBtn.disabled = true;
    }

    async function loadPart(partNum, gen) {
      try {
        // Use cached color data if the same part number was loaded before
        if (lastLoadedPart && lastLoadedPart.partNum === partNum) {
          if (gen !== loadGen) return;
          colorDataMap = lastLoadedPart.colorDataMap;
          partNameEl.textContent = lastLoadedPart.partName;
          setStatus("");
          var cachedEntries = Object.values(colorDataMap);
          if (cachedEntries.length > 0) {
            partImg.style.visibility = "hidden";
            partImg.onload = function () { partImg.style.visibility = ""; };
            partImg.onerror = function () { partImg.style.visibility = "hidden"; };
            partImg.src = "//img.bricklink.com/ItemImage/PN/" + cachedEntries[0].colorId +
              "/" + encodeURIComponent(partNum) + ".png";
          }
          colorSelect.innerHTML = "";
          appendOption(colorSelect, "", "Select color\u2026");
          Object.keys(colorDataMap).forEach(function (name) { appendOption(colorSelect, name, name); });
          colorSelect.disabled = false;
          colorSelect.title = "";
          addBtn.disabled = true;
          partInfoEl.classList.remove("rb-ss-hidden");
          return;
        }

        var resp = await fetch(
          "/v2/catalog/catalogitem.page?P=" + encodeURIComponent(partNum)
        );
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        var html = await resp.text();
        if (gen !== loadGen) return;

        var doc = new DOMParser().parseFromString(html, "text/html");

        // Extract part name
        var nameEl =
          doc.querySelector(".hero-unit h1") ||
          doc.querySelector("h1.fn") ||
          doc.querySelector("h1");
        var partName = nameEl ? nameEl.textContent.trim() : partNum;

        var colorDivs = Array.from(
          doc.querySelectorAll("#_idColorListKnown > div[data-name]")
        );
        if (colorDivs.length === 0) {
          setStatus("No known colors found");
          return;
        }

        // Populate color data map
        colorDataMap = {};
        colorDivs.forEach(function (div) {
          var name = div.dataset.name;
          var colorId = div.dataset.color || "0";
          var rawRgb = div.dataset.rgb || "";
          colorDataMap[name] = {
            colorId: colorId,
            colorRgb: rawRgb
              ? rawRgb.startsWith("#")
                ? rawRgb
                : "#" + rawRgb
              : "",
          };
        });

        partNameEl.textContent = partName;
        setStatus("");

        // Show image using first color
        var firstColorId = colorDivs[0].dataset.color || "0";
        partImg.style.visibility = "hidden";
        partImg.onload = function () { partImg.style.visibility = ""; };
        partImg.onerror = function () { partImg.style.visibility = "hidden"; };
        partImg.src =
          "//img.bricklink.com/ItemImage/PN/" +
          firstColorId +
          "/" +
          encodeURIComponent(partNum) +
          ".png";

        // Populate select
        colorSelect.innerHTML = "";
        appendOption(colorSelect, "", "Select color\u2026");
        colorDivs.forEach(function (div) {
          appendOption(colorSelect, div.dataset.name, div.dataset.name);
        });
        colorSelect.disabled = false;
        colorSelect.title = "";
        addBtn.disabled = true; // Still need color selection
        setStatus("");
        partInfoEl.classList.remove("rb-ss-hidden");

        // Cache for next time the same part number is entered
        lastLoadedPart = { partNum: partNum, colorDataMap: colorDataMap, partName: partName };
      } catch (e) {
        if (gen !== loadGen) return;
        setStatus("Could not load part info");
        colorSelect.disabled = true;
        colorSelect.title = "Enter a part number first";
      }
    }

    var debounceTimer = null;
    partNumInput.addEventListener("input", function () {
      clearTimeout(debounceTimer);
      var val = partNumInput.value.trim();

      // Only whitespace changed and colors are already showing — nothing to do
      if (lastLoadedPart && val === lastLoadedPart.partNum && !colorSelect.disabled) {
        return;
      }

      loadGen++;
      colorDataMap = {};
      colorSelect.innerHTML = "";
      appendOption(colorSelect, "", "");
      colorSelect.disabled = true;
      colorSelect.title = "Enter a part number first";
      swatch.style.background = "";
      swatch.style.visibility = "hidden";
      addBtn.disabled = true;
      partInfoEl.classList.add("rb-ss-hidden");
      partImg.src = "";
      partNameEl.textContent = "";

      if (!val) {
        partPreviewEl.classList.add("rb-ss-hidden");
        setStatus("");
        return;
      }

      // Show preview container as soon as user types anything
      partPreviewEl.classList.remove("rb-ss-hidden");

      // Same part number but select was cleared (e.g. after adding a part) — restore instantly
      if (lastLoadedPart && val === lastLoadedPart.partNum) {
        colorDataMap = lastLoadedPart.colorDataMap;
        partNameEl.textContent = lastLoadedPart.partName;
        setStatus("");
        var firstEntry = Object.values(colorDataMap)[0];
        if (firstEntry) {
          partImg.style.visibility = "hidden";
          partImg.onload = function () { partImg.style.visibility = ""; };
          partImg.onerror = function () { partImg.style.visibility = "hidden"; };
          partImg.src = "//img.bricklink.com/ItemImage/PN/" + firstEntry.colorId +
            "/" + encodeURIComponent(val) + ".png";
        }
        colorSelect.innerHTML = "";
        appendOption(colorSelect, "", "Select color\u2026");
        Object.keys(colorDataMap).forEach(function (name) { appendOption(colorSelect, name, name); });
        colorSelect.disabled = false;
        colorSelect.title = "";
        addBtn.disabled = true;
        partInfoEl.classList.remove("rb-ss-hidden");
        return;
      }

      setStatus("Loading\u2026");

      var capturedGen = loadGen;
      debounceTimer = setTimeout(function () {
        loadPart(val, capturedGen);
      }, 600);
    });

    colorSelect.addEventListener("change", function () {
      var colorName = colorSelect.value;
      var data = colorDataMap[colorName];
      if (data) {
        swatch.style.background = data.colorRgb || "";
        swatch.style.visibility = data.colorRgb ? "visible" : "hidden";
        var partNum = partNumInput.value.trim();
        if (partNum && data.colorId) {
          partImg.style.visibility = "hidden";
          partImg.onload = function () { partImg.style.visibility = ""; };
          partImg.onerror = function () { partImg.style.visibility = "hidden"; };
          partImg.src =
            "//img.bricklink.com/ItemImage/PN/" +
            data.colorId +
            "/" +
            encodeURIComponent(partNum) +
            ".png";
        }
        addBtn.disabled = false;
      } else {
        swatch.style.background = "";
        swatch.style.visibility = "hidden";
        addBtn.disabled = true;
      }
    });

    addBtn.addEventListener("click", function () {
      var partNum = partNumInput.value.trim();
      var colorName = colorSelect.value;
      var data = colorDataMap[colorName];
      if (!partNum || !colorName || !data) return;
      var minQty = Math.max(1, parseInt(qtyInput.value) || 1);

      selectedParts.push({
        partNum: partNum,
        partName: partNameEl.textContent || partNum,
        colorName: colorName,
        colorId: data.colorId,
        colorRgb: data.colorRgb,
        minQty: minQty,
      });

      renderPartsColumn();
      runSearch();

      // Reset form
      loadGen++;
      partNumInput.value = "";
      qtyInput.value = "1";
      resetForm();
    });

    return col;
  }

  // ── Middle column: Selected parts ───────────────────────────────────────────

  function buildPartsColumn() {
    var col = document.createElement("div");
    col.className = "rb-ss-col rb-ss-col-parts";

    // Action bar
    var topRow = document.createElement("div");
    topRow.className = "rb-ss-top-row";
    var titleEl = document.createElement("span");
    titleEl.className = "rb-ss-col-title";
    titleEl.textContent = "Selected Parts";
    topRow.appendChild(titleEl);
    col.appendChild(topRow);

    // Sub-header
    var subHeader = document.createElement("div");
    subHeader.className = "rb-ss-sub-header rb-ss-parts-subheader";
    var phDesc = document.createElement("div");
    phDesc.className = "rb-ss-ph-desc";
    phDesc.textContent = "Part";
    var phQty = document.createElement("div");
    phQty.className = "rb-ss-ph-qty";
    phQty.textContent = "Min Qty";
    var phRm = document.createElement("div");
    phRm.className = "rb-ss-ph-rm";
    subHeader.appendChild(phDesc);
    subHeader.appendChild(phQty);
    subHeader.appendChild(phRm);
    col.appendChild(subHeader);

    // Scrollable list
    var listEl = document.createElement("div");
    listEl.className = "rb-ss-list";
    showEmptyState(listEl, "No parts added yet.");
    col.appendChild(listEl);

    return { col: col, listEl: listEl, titleEl: titleEl };
  }

  function renderPartsColumn() {
    if (!partRowsEl) return;
    partRowsEl.innerHTML = "";

    if (partsTitleEl) {
      partsTitleEl.textContent = selectedParts.length > 0
        ? "Selected Parts (" + selectedParts.length + ")"
        : "Selected Parts";
    }

    if (selectedParts.length === 0) {
      showEmptyState(partRowsEl, "No parts added yet.");
      return;
    }

    selectedParts.forEach(function (part, idx) {
      var row = document.createElement("div");
      row.className = "rb-preview-row";

      // Image
      var imgCol = document.createElement("div");
      imgCol.className = "rb-preview-col-img rb-ss-ph-img";
      var img = document.createElement("img");
      img.className = "rb-preview-img";
      img.alt = "";
      img.style.visibility = "hidden";
      img.onload = function () { img.style.visibility = ""; };
      img.onerror = function () { img.style.visibility = "hidden"; };
      img.src =
        "//img.bricklink.com/ItemImage/PN/" +
        part.colorId +
        "/" +
        encodeURIComponent(part.partNum) +
        ".png";
      imgCol.appendChild(img);
      row.appendChild(imgCol);

      // Description
      var descCol = document.createElement("div");
      descCol.className = "rb-preview-col-desc rb-ss-ph-desc";

      var nameEl = document.createElement("div");
      nameEl.className = "rb-preview-name";
      nameEl.title = part.partName;
      nameEl.textContent = part.partName;

      var metaEl = document.createElement("div");
      metaEl.className = "rb-preview-meta";

      var link = document.createElement("a");
      link.href = "/v2/catalog/catalogitem.page?P=" + encodeURIComponent(part.partNum);
      link.target = "_blank";
      link.className = "rb-preview-itemno-link";
      link.textContent = part.partNum;

      var swatchEl = document.createElement("span");
      swatchEl.className = "rb-preview-swatch";
      swatchEl.style.background = part.colorRgb || "";

      metaEl.appendChild(link);
      metaEl.appendChild(document.createTextNode("\u00b7 "));
      metaEl.appendChild(swatchEl);
      metaEl.appendChild(document.createTextNode("\u00a0" + part.colorName));

      descCol.appendChild(nameEl);
      descCol.appendChild(metaEl);
      row.appendChild(descCol);

      // Qty — editable input
      var qtyCol = document.createElement("div");
      qtyCol.className = "rb-ss-ph-qty rb-ss-qty-cell";
      var rowQtyInput = document.createElement("input");
      rowQtyInput.type = "number";
      rowQtyInput.className = "rb-ss-row-qty-input";
      rowQtyInput.value = String(part.minQty);
      rowQtyInput.min = "1";
      rowQtyInput.title = "Minimum quantity";
      (function (i) {
        rowQtyInput.addEventListener("change", function () {
          var newQty = Math.max(1, parseInt(rowQtyInput.value) || 1);
          rowQtyInput.value = String(newQty);
          selectedParts[i].minQty = newQty;
          runSearch(); // re-intersect with new minQty; cache avoids re-fetching
        });
      })(idx);
      qtyCol.appendChild(rowQtyInput);
      row.appendChild(qtyCol);

      // Remove
      var rmCol = document.createElement("div");
      rmCol.className = "rb-ss-ph-rm rb-ss-rm-col";
      var rmBtn = document.createElement("button");
      rmBtn.type = "button";
      rmBtn.className = "rb-ss-btn-remove";
      rmBtn.title = "Remove";
      rmBtn.textContent = "\u2715";
      rmBtn.addEventListener("click", function () {
        selectedParts.splice(idx, 1);
        renderPartsColumn();
        runSearch();
      });
      rmCol.appendChild(rmBtn);
      row.appendChild(rmCol);

      partRowsEl.appendChild(row);
    });
  }

  // ── Right column: Results ───────────────────────────────────────────────────

  function buildResultsColumn() {
    var col = document.createElement("div");
    col.className = "rb-ss-col rb-ss-col-results";

    // Action bar
    var topRow = document.createElement("div");
    topRow.className = "rb-ss-top-row";
    var titleEl = document.createElement("span");
    titleEl.className = "rb-ss-col-title";
    titleEl.textContent = "Matching Sets";
    topRow.appendChild(titleEl);

    // Sort controls
    var sortControls = document.createElement("span");
    sortControls.className = "rb-ss-sort-controls";

    var sortCaption = document.createElement("span");
    sortCaption.className = "caption rb-ss-sort-caption";
    sortCaption.textContent = "Sort By";

    var sortSelect = document.createElement("select");
    sortSelect.className = "select clean rb-ss-sort-select";
    [["year", "Year"], ["name", "Name"], ["setno", "Set No"]].forEach(function (opt) {
      var o = document.createElement("option");
      o.value = opt[0];
      o.textContent = opt[1];
      if (opt[0] === sortBy) o.selected = true;
      sortSelect.appendChild(o);
    });

    var orderCaption = document.createElement("span");
    orderCaption.className = "caption rb-ss-sort-caption";
    orderCaption.textContent = "Order";

    var dirSelect = document.createElement("select");
    dirSelect.className = "select clean rb-ss-sort-select";
    [["desc", "Down"], ["asc", "Up"]].forEach(function (opt) {
      var o = document.createElement("option");
      o.value = opt[0];
      o.textContent = opt[1];
      if (opt[0] === sortDir) o.selected = true;
      dirSelect.appendChild(o);
    });

    sortControls.appendChild(sortCaption);
    sortControls.appendChild(sortSelect);
    sortControls.appendChild(orderCaption);
    sortControls.appendChild(dirSelect);
    topRow.appendChild(sortControls);
    col.appendChild(topRow);

    sortSelect.addEventListener("change", function () {
      sortBy = sortSelect.value;
      if (lastResults) renderResults(lastResults);
    });
    dirSelect.addEventListener("change", function () {
      sortDir = dirSelect.value;
      if (lastResults) renderResults(lastResults);
    });

    // Sub-header
    var subHeaderEl = document.createElement("div");
    subHeaderEl.className = "rb-ss-sub-header rb-ss-results-subheader";
    buildResultsSubHeaderRow(subHeaderEl);
    col.appendChild(subHeaderEl);

    // Scrollable list
    var listEl = document.createElement("div");
    listEl.className = "rb-ss-list";
    showEmptyState(listEl, "Add a part to search.");
    col.appendChild(listEl);

    return { col: col, titleEl: titleEl, subHeaderEl: subHeaderEl, listEl: listEl };
  }

  function renderResultsEmpty() {
    if (!resultsListEl) return;
    lastResults = null;
    if (resultsTitleEl) resultsTitleEl.textContent = "Matching Sets";
    resultsListEl.innerHTML = "";
    showEmptyState(resultsListEl, "Add a part to search.");
  }

  function sortResults(results) {
    var sorted = results.slice();
    sorted.sort(function (a, b) {
      var cmp = 0;
      if (sortBy === "year") {
        cmp = parseInt(a.year || 0) - parseInt(b.year || 0);
      } else if (sortBy === "name") {
        cmp = (a.setName || "").localeCompare(b.setName || "");
      } else if (sortBy === "setno") {
        cmp = (a.setId || "").localeCompare(b.setId || "", undefined, { numeric: true });
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return sorted;
  }

  function renderResults(results) {
    if (!resultsListEl) return;
    lastResults = results;

    if (resultsTitleEl) {
      resultsTitleEl.textContent = "Matching Sets (" + results.length + ")";
    }

    resultsListEl.innerHTML = "";

    if (results.length === 0) {
      showEmptyState(
        resultsListEl,
        "No sets found containing all specified parts with the given quantities."
      );
      return;
    }

    var sorted = sortResults(results);
    sorted.forEach(function (result) {
      var row = document.createElement("div");
      row.className = "rb-preview-row";

      // Image
      var imgCol = document.createElement("div");
      imgCol.className = "rb-preview-col-img rb-ss-rh-img";
      var img = document.createElement("img");
      img.className = "rb-preview-img";
      img.alt = "";
      img.style.visibility = "hidden";
      img.onload = function () { img.style.visibility = ""; };
      img.onerror = function () { img.style.visibility = "hidden"; };
      img.src =
        "//img.bricklink.com/ItemImage/SN/0/" +
        encodeURIComponent(result.setId) +
        ".png";
      imgCol.appendChild(img);
      row.appendChild(imgCol);

      // Set info
      var descCol = document.createElement("div");
      descCol.className = "rb-preview-col-desc rb-ss-rh-desc";

      var nameEl = document.createElement("div");
      nameEl.className = "rb-preview-name";
      nameEl.title = result.setName || result.setId;
      nameEl.textContent = result.setName || result.setId;

      var metaEl = document.createElement("div");
      metaEl.className = "rb-preview-meta";
      var idLink = document.createElement("a");
      idLink.href =
        "/v2/catalog/catalogitem.page?S=" + encodeURIComponent(result.setId);
      idLink.target = "_blank";
      idLink.className = "rb-preview-itemno-link";
      idLink.textContent = result.setId;
      metaEl.appendChild(idLink);

      descCol.appendChild(nameEl);
      descCol.appendChild(metaEl);
      row.appendChild(descCol);

      // Year
      var yearCol = document.createElement("div");
      yearCol.className = "rb-ss-rh-year rb-ss-results-year";
      yearCol.textContent = result.year || "";
      row.appendChild(yearCol);

      resultsListEl.appendChild(row);
    });
  }

  function buildResultsSubHeaderRow(container) {
    var shDesc = document.createElement("div");
    shDesc.className = "rb-ss-rh-desc";
    shDesc.textContent = "Set";
    var shYear = document.createElement("div");
    shYear.className = "rb-ss-rh-year";
    shYear.textContent = "Year";
    container.appendChild(shDesc);
    container.appendChild(shYear);
  }

  // ── Search logic ────────────────────────────────────────────────────────────

  async function runSearch() {
    if (selectedParts.length === 0) {
      renderResultsEmpty();
      return;
    }

    if (resultsTitleEl) resultsTitleEl.textContent = "Matching Sets";
    resultsListEl.innerHTML = "";
    showEmptyState(resultsListEl, "Searching\u2026");
    try {
      var partMaps = await Promise.all(
        selectedParts.map(function (p) {
          return fetchPartSets(p.partNum, p.colorId);
        })
      );

      // Intersect: sets must contain ALL parts with at least the required quantity
      var commonIds = new Set();
      partMaps[0].forEach(function (entry, setId) {
        if (entry.qty >= selectedParts[0].minQty) commonIds.add(setId);
      });
      for (var j = 1; j < partMaps.length; j++) {
        var minQty = selectedParts[j].minQty;
        Array.from(commonIds).forEach(function (id) {
          var entry = partMaps[j].get(id);
          if (!entry || entry.qty < minQty) commonIds.delete(id);
        });
      }

      var results = Array.from(commonIds).map(function (setId) {
        var base = partMaps[0].get(setId);
        return { setId: setId, setName: base.setName, year: base.year };
      });

      // Sort newest first
      results.sort(function (a, b) {
        return parseInt(b.year || 0) - parseInt(a.year || 0);
      });

      renderResults(results);
    } catch (e) {
      if (resultsTitleEl) resultsTitleEl.textContent = "Matching Sets";
      resultsListEl.innerHTML = "";
      var errEl = document.createElement("div");
      errEl.className = "rb-ss-empty rb-ss-error";
      errEl.textContent = "Search failed: " + e.message;
      resultsListEl.appendChild(errEl);
    }
  }

  async function fetchPartSets(partNum, colorId) {
    var key = partNum + ":" + colorId;
    if (setCache.has(key)) return setCache.get(key);
    // v=0: force list view (popular parts default to a color-navigation page)
    // ov=Y: show all sets without truncation
    // colorID: pre-filter to the specific color server-side
    var resp = await fetch(
      "/catalogItemIn.asp?P=" + encodeURIComponent(partNum) +
      "&v=0&in=S&ov=Y&colorID=" + encodeURIComponent(colorId)
    );
    if (!resp.ok)
      throw new Error("HTTP " + resp.status + " fetching part " + partNum);
    var html = await resp.text();
    var map = parseSetMap(html);
    setCache.set(key, map);
    return map;
  }

  function parseSetMap(html) {
    var result = new Map();
    var doc = new DOMParser().parseFromString(html, "text/html");

    // Find the data table — identified by a header row with "Qty" in cell[1]
    var dataTable = null;
    var tables = doc.querySelectorAll("table");
    for (var t = 0; t < tables.length; t++) {
      var trows = tables[t].querySelectorAll("tr");
      for (var r = 0; r < trows.length; r++) {
        var cells = trows[r].cells;
        if (
          cells.length >= 2 &&
          cells[1] &&
          cells[1].textContent.trim() === "Qty"
        ) {
          dataTable = tables[t];
          break;
        }
      }
      if (dataTable) break;
    }
    if (!dataTable) return result;

    var allRows = dataTable.querySelectorAll("tr");
    for (var i = 0; i < allRows.length; i++) {
      var row = allRows[i];
      var cells = row.cells;

      // Skip section header rows (single cell spanning ≥4 columns)
      if (cells.length === 1 && cells[0].colSpan >= 4) continue;

      // Data rows need at least 5 cells
      if (cells.length < 5) continue;

      // Find the set link in cell[2]
      var link = cells[2].querySelector("a[href]");
      if (!link) continue;

      var href = link.getAttribute("href") || "";
      var setId = null;

      // Primary: extract from URL parameter
      var idMatch = href.match(/[?&]S=([^&\s]+)/i);
      if (idMatch) {
        setId = idMatch[1];
      }

      // Fallback: use the link text (typically the set number)
      if (!setId) {
        var linkText = link.textContent.trim();
        if (/^[A-Za-z0-9]/.test(linkText)) setId = linkText;
      }

      if (!setId) continue;

      var qty = parseInt(cells[1].textContent.trim());
      if (isNaN(qty)) continue;

      // Set name: first child element's text (BL wraps it in <font>),
      // falling back to first non-empty text node
      var setName = setId;
      var firstElem = cells[3].firstElementChild;
      if (firstElem && firstElem.textContent.trim()) {
        setName = firstElem.textContent.trim();
      } else {
        var descNodes = cells[3].childNodes;
        for (var n = 0; n < descNodes.length; n++) {
          if (descNodes[n].nodeType === 3 && descNodes[n].textContent.trim()) {
            setName = descNodes[n].textContent.trim();
            break;
          }
        }
      }

      var year = cells[4].textContent.trim();

      // Keep entry with higher qty if set appears multiple times
      if (!result.has(setId) || result.get(setId).qty < qty) {
        result.set(setId, { qty: qty, setName: setName, year: year });
      }
    }
    return result;
  }

  // ── Utilities ───────────────────────────────────────────────────────────────

  function appendOption(select, value, text) {
    var opt = document.createElement("option");
    opt.value = value;
    opt.textContent = text;
    select.appendChild(opt);
    return opt;
  }

  function showEmptyState(container, text) {
    var el = document.createElement("div");
    el.className = "rb-ss-empty";
    el.textContent = text;
    container.appendChild(el);
  }

  function injectStyles() {
    if (document.getElementById("rb-set-detective-styles")) return;
    styleEl = document.createElement("style");
    styleEl.id = "rb-set-detective-styles";
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
  }

  // ── Styles ──────────────────────────────────────────────────────────────────

  var CSS = /* @inline */``;

  // ── Registration ────────────────────────────────────────────────────────────

  RefinedBricklink.features.push(featureDef);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = featureDef;
  }
})();
