(function () {
  var CSS = /* @inline */``;

  var tableObserver = null;
  var storageListener = null;
  var styleEl = null;
  var isApplying = false;
  var currentPattern = null;
  var searchPageWrapper = null;

  var DEFAULT_TEMPLATE = "^{set_number}";
  // {set_number} is substituted with this capture group at match time
  var SET_NUMBER_REGEX = "(\\d{3,6}(?:-\\d+)?)";

  // Expand a user-facing template (e.g. "^{set_number}") into a full regex
  // string by substituting {set_number} (case-insensitive) with the fixed
  // number capture group.
  function templateToRegex(template) {
    return template.replace(/\{set_number\}/gi, SET_NUMBER_REGEX);
  }

  // Extract set number from a list name using the configured template.
  // Returns e.g. "75192-1" or null if no match.
  function extractSetNumber(name, template) {
    try {
      var re = new RegExp(templateToRegex(template));
      var m = name.match(re);
      if (!m || !m[1]) return null;
      var num = m[1];
      if (!num.includes("-")) num = num + "-1";
      return num;
    } catch (e) {
      return null;
    }
  }

  function imageUrl(setNum) {
    return "//" + "img.bricklink.com/ItemImage/SN/0/" + encodeURIComponent(setNum) + ".png";
  }

  // ── list.page ─────────────────────────────────────────────────────────────

  function getListRows() {
    var table =
      document.querySelector("table.wl-overview-list-table:not(.compact)") ||
      document.querySelector("table.wl-overview-list-table");
    if (!table) return [];
    return Array.from(table.querySelectorAll("tr")).filter(function (r) {
      return r.querySelector("td");
    });
  }

  function unwrapListRow(row) {
    var wrapper = row.querySelector(".rb-set-img-row");
    if (!wrapper) return;
    var link = wrapper.querySelector("a[href*='wantedMoreID=']");
    if (link && wrapper.parentElement) {
      wrapper.parentElement.insertBefore(link, wrapper);
    }
    wrapper.remove();
  }

  function applyListPageImages() {
    if (isApplying) return;
    isApplying = true;
    getListRows().forEach(function (row) {
      var a = row.querySelector("a[href*='wantedMoreID=']");
      if (!a) return;
      var name = a.textContent.trim();
      var setNum = extractSetNumber(name, currentPattern);

      // Skip rows already correctly processed — avoids triggering the observer
      // again and creating a mutation cycle with React's re-renders.
      var existingImg = row.querySelector(".rb-set-img");
      if (existingImg && existingImg.title === setNum) return;

      unwrapListRow(row);

      if (!setNum) return;

      var img = document.createElement("img");
      img.className = "rb-set-img";
      img.src = imageUrl(setNum);
      img.alt = "";
      img.title = setNum;
      img.addEventListener("error", function () { img.remove(); });
      (function (sn) {
        img.addEventListener("click", function () {
          fetchVarImages(sn, function (result) {
            if (result) showLightbox(result.images, result.itemno, result.itemName);
          });
        });
      })(setNum);

      var wrapper = document.createElement("div");
      wrapper.className = "rb-set-img-row";
      a.parentElement.insertBefore(wrapper, a);
      wrapper.appendChild(a);
      wrapper.appendChild(img);
    });
    isApplying = false;
  }

  function initListPage() {
    applyListPageImages();
    var table =
      document.querySelector("table.wl-overview-list-table:not(.compact)") ||
      document.querySelector("table.wl-overview-list-table");
    if (table) {
      tableObserver = new MutationObserver(applyListPageImages);
      tableObserver.observe(table, { childList: true, subtree: true });
    }
  }

  // ── lightbox ─────────────────────────────────────────────────────────────

  var lightboxEl = null;
  var lightboxCurrentIndex = 0;
  var lightboxImages = null;
  var lightboxKeyHandler = null;

  function fetchVarImages(setNum, callback) {
    fetch("/v2/catalog/catalogitem.page?S=" + encodeURIComponent(setNum))
      .then(function (res) { return res.text(); })
      .then(function (html) {
        function field(name) {
          var m = html.match(new RegExp(name + "\\s*:\\s*'([^']*)'"));
          return m ? m[1] : null;
        }
        var images = [];
        var seenUrls = {};

        function addImage(url, thumb_url, typeItem) {
          if (!url || url === "LARGE_IMAGE" || url.includes(".t1.") || seenUrls[url]) return;
          seenUrls[url] = true;
          images.push({ url: url, thumb_url: thumb_url || url, typeItem: typeItem });
        }

        // Set images from _var_images.push() calls — isBig:true only
        var pushRe = /_var_images\.push\(\s*\{([^}]+)\}\s*\)/g;
        var pm;
        while ((pm = pushRe.exec(html)) !== null) {
          var block = pm[1];
          if (!/\bisBig\s*:\s*true\b/.test(block)) continue;
          var urlM   = block.match(/\burl\s*:\s*'([^']*)'/);
          var thumbM = block.match(/\bthumb_url\s*:\s*'([^']*)'/);
          var typeM  = block.match(/\btypeItem\s*:\s*'([^']*)'/);
          var typeItem = typeM ? typeM[1] : "S";
          if (urlM) addImage(urlM[1], thumbM ? thumbM[1] : urlM[1], typeItem);
        }

        // Fallback: use _var_item main image if push calls yielded nothing
        if (!images.length) {
          addImage(
            field("strLegacyLargeImgUrl") || field("strMainLImgUrl"),
            field("strMainSImgUrl"),
            "S"
          );
        }

        // Decode HTML entities in item name (e.g. &middot; in FRIENDS sets)
        var rawName = field("strItemName") || "";
        var tempEl = document.createElement("div");
        tempEl.innerHTML = rawName;
        var itemName = tempEl.textContent;
        var itemno = field("itemno") || setNum;

        callback(images.length ? { images: images, itemno: itemno, itemName: itemName } : null);
      })
      .catch(function () { callback(null); });
  }

  function imageCaption(typeItem, itemno, itemName) {
    var base = "Set " + itemno + (itemName ? " " + itemName : "");
    if (typeItem === "I") return "(Instructions) for " + base;
    if (typeItem === "O") return "(Original Box) for " + base;
    return base;
  }

  var lightboxItemno = null;
  var lightboxItemName = null;

  function selectLightboxImage(index) {
    if (!lightboxEl || !lightboxImages) return;
    lightboxCurrentIndex = index;
    var img = lightboxImages[index];

    lightboxEl.querySelector(".rb-lil-img").src = img.url;
    lightboxEl.querySelector(".rb-lil-title").textContent =
      imageCaption(img.typeItem, lightboxItemno, lightboxItemName);
    lightboxEl.querySelectorAll(".rb-lil-thumb").forEach(function (t, i) {
      t.classList.toggle("rb-lil-thumb-selected", i === index);
    });
  }

  function closeLightbox() {
    if (lightboxEl) { lightboxEl.remove(); lightboxEl = null; }
    if (lightboxKeyHandler) {
      document.removeEventListener("keydown", lightboxKeyHandler);
      lightboxKeyHandler = null;
    }
    lightboxImages = null;
    lightboxItemno = null;
    lightboxItemName = null;
  }

  function showLightbox(images, itemno, itemName) {
    closeLightbox();
    lightboxImages = images;
    lightboxItemno = itemno;
    lightboxItemName = itemName;
    lightboxCurrentIndex = 0;

    var overlay = document.createElement("div");
    overlay.id = "rb-lightbox-overlay";
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeLightbox();
    });

    var box = document.createElement("div");
    box.id = "rb-lightbox";
    lightboxEl = overlay;

    // Thumbnail column
    var thumbsCol = document.createElement("div");
    thumbsCol.className = "rb-lil-thumbs";
    images.forEach(function (img, i) {
      var thumb = document.createElement("div");
      thumb.className = "rb-lil-thumb" + (i === 0 ? " rb-lil-thumb-selected" : "");
      var thumbImg = document.createElement("img");
      thumbImg.src = img.thumb_url || img.url;
      thumbImg.alt = ({ S: "Set", I: "Instructions", O: "Original Box" })[img.typeItem] || "";
      thumb.appendChild(thumbImg);
      thumb.addEventListener("click", function () { selectLightboxImage(i); });
      thumbsCol.appendChild(thumb);
    });

    // Main column
    var mainCol = document.createElement("div");
    mainCol.className = "rb-lil-main";

    var closeLink = document.createElement("a");
    closeLink.className = "rb-lil-close";
    closeLink.href = "#";
    var closeImg = document.createElement("img");
    closeImg.src = "//static.bricklink.com/clone/img/close_grey.png";
    closeImg.border = "0";
    closeLink.appendChild(closeImg);
    closeLink.addEventListener("click", function (e) { e.preventDefault(); closeLightbox(); });

    var imgWrapper = document.createElement("div");
    imgWrapper.className = "rb-lil-img-wrapper";
    var mainImg = document.createElement("img");
    mainImg.className = "rb-lil-img";
    mainImg.src = images[0].url;
    imgWrapper.appendChild(mainImg);

    var title = document.createElement("span");
    title.className = "rb-lil-title";
    title.textContent = imageCaption(images[0].typeItem, itemno, itemName);

    mainCol.appendChild(closeLink);
    mainCol.appendChild(imgWrapper);
    mainCol.appendChild(title);
    box.appendChild(thumbsCol);
    box.appendChild(mainCol);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    lightboxKeyHandler = function (e) {
      if (e.key === "Escape") { closeLightbox(); return; }
      if (e.key === "ArrowLeft" && lightboxCurrentIndex > 0)
        selectLightboxImage(lightboxCurrentIndex - 1);
      if (e.key === "ArrowRight" && lightboxCurrentIndex < images.length - 1)
        selectLightboxImage(lightboxCurrentIndex + 1);
    };
    document.addEventListener("keydown", lightboxKeyHandler);
  }

  // ── search.page ───────────────────────────────────────────────────────────

  function parseWlJson() {
    var scripts = document.querySelectorAll("script:not([src])");
    for (var i = 0; i < scripts.length; i++) {
      var m = scripts[i].textContent.match(/var wlJson = (\{.+?\});/);
      if (m) {
        try { return JSON.parse(m[1]); } catch (e) { return null; }
      }
    }
    return null;
  }

  function applySearchPageImage() {
    if (document.querySelector(".rb-set-img-header")) return;

    var listName = null;
    var wlJson = parseWlJson();
    if (wlJson && wlJson.wantedListInfo) {
      listName = wlJson.wantedListInfo.name;
    }
    if (!listName) return;

    var setNum = extractSetNumber(listName, currentPattern);
    if (!setNum) return;

    var img = document.createElement("img");
    img.className = "rb-set-img-header";
    img.src = imageUrl(setNum);
    img.alt = setNum;
    img.title = setNum;
    img.addEventListener("error", function () { img.remove(); });
    img.style.cursor = "zoom-in";
    img.addEventListener("click", function () {
      fetchVarImages(setNum, function (result) {
        if (result) showLightbox(result.images, result.itemno, result.itemName);
      });
    });

    var actionBar = document.querySelector(".wanted-action-bar");
    if (actionBar) {
      var title = actionBar.firstElementChild;
      if (!title) return;
      // Wrap the title + image together so they stay grouped within the flex bar
      searchPageWrapper = document.createElement("div");
      searchPageWrapper.className = "rb-set-img-title-wrap";
      actionBar.insertBefore(searchPageWrapper, title);
      searchPageWrapper.appendChild(title);
      searchPageWrapper.appendChild(img);
    }
  }

  function removeSearchPageImage() {
    if (!searchPageWrapper) return;
    var title = searchPageWrapper.firstElementChild;
    if (title && searchPageWrapper.parentElement) {
      searchPageWrapper.parentElement.insertBefore(title, searchPageWrapper);
    }
    searchPageWrapper.remove();
    searchPageWrapper = null;
  }

  // ── Feature ──────────────────────────────────────────────────────────────

  var featureDef = {
    id: "wanted-list-set-image",
    name: "Wanted List Set Images",
    description:
      'Shows a set thumbnail next to wanted lists whose names start with a set number (e.g. "75192-1 Millennium Falcon").',
    enabledByDefault: true,
    section: "Wanted Lists",
    docsUrl: "https://github.com/fantapop/refined-bricklink#wanted-list-set-images",
    settings: [
      {
        name: "rb-set-image-list-page",
        label: "Show on wanted list index",
        type: "boolean",
        default: true,
      },
      {
        name: "rb-set-image-search-page",
        label: "Show on wanted list search page",
        type: "boolean",
        default: true,
      },
      {
        name: "rb-set-image-template",
        label: "Set number pattern",
        description:
          "Use this to customize where in the name the set number is extracted from. {set_number} matches with or without a variant suffix (e.g. 75192 or 75192-1).",
        examples: [
          ["{set_number}", "anywhere in name"],
          ["^{set_number}", "at start of name"],
          ["\\[{set_number}\\]", "within brackets"],
        ],
        type: "textarea",
        default: DEFAULT_TEMPLATE,
      },
    ],

    init: function () {
      chrome.storage.sync.get(
        {
          "rb-set-image-template": DEFAULT_TEMPLATE,
          "rb-set-image-list-page": true,
          "rb-set-image-search-page": true,
        },
        function (stored) {
          currentPattern = stored["rb-set-image-template"] || DEFAULT_TEMPLATE;

          styleEl = document.createElement("style");
          styleEl.textContent = CSS;
          document.head.appendChild(styleEl);

          if (stored["rb-set-image-list-page"] &&
              window.location.pathname.includes("/v2/wanted/list.page")) {
            initListPage();
          }

          if (stored["rb-set-image-search-page"] &&
              window.location.href.includes("/wanted/search.page")) {
            applySearchPageImage();
          }
        }
      );

      storageListener = function (changes) {
        var templateChanged = !!changes["rb-set-image-template"];
        if (templateChanged) {
          currentPattern = changes["rb-set-image-template"].newValue || DEFAULT_TEMPLATE;
        }

        if (window.location.pathname.includes("/v2/wanted/list.page")) {
          var listEnabled = changes["rb-set-image-list-page"]
            ? changes["rb-set-image-list-page"].newValue
            : null;
          if (listEnabled === false) {
            getListRows().forEach(unwrapListRow);
          } else if (listEnabled === true) {
            initListPage();
          } else if (templateChanged) {
            applyListPageImages();
          }
        }

        if (window.location.href.includes("/wanted/search.page")) {
          var searchEnabled = changes["rb-set-image-search-page"]
            ? changes["rb-set-image-search-page"].newValue
            : null;
          if (searchEnabled === false) {
            removeSearchPageImage();
          } else if (searchEnabled === true) {
            applySearchPageImage();
          } else if (templateChanged) {
            removeSearchPageImage();
            applySearchPageImage();
          }
        }
      };
      chrome.storage.onChanged.addListener(storageListener);
    },

    destroy: function () {
      if (tableObserver) {
        tableObserver.disconnect();
        tableObserver = null;
      }
      if (storageListener) {
        chrome.storage.onChanged.removeListener(storageListener);
        storageListener = null;
      }
      getListRows().forEach(unwrapListRow);
      removeSearchPageImage();
      if (styleEl) { styleEl.remove(); styleEl = null; }
      currentPattern = null;
    },
  };

  RefinedBricklink.features.push(featureDef);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = featureDef;
  }
})();
