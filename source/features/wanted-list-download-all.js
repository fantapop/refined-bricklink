(function () {
  var observer = null;
  var bodyObserver = null;
  var styleEl = null;
  var CSS = /* @inline */``;
  var archiveBtn = null;
  var onInputHandler = null;
  var lastBtnText = "";
  var isInserting = false;

  // ── CRC-32 ─────────────────────────────────────────────────────────

  var crcTable = (function () {
    var t = new Uint32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var j = 0; j < 8; j++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      t[i] = c;
    }
    return t;
  })();

  function crc32(buf) {
    var crc = 0xffffffff;
    for (var i = 0; i < buf.length; i++) {
      crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  // ── ZIP builder (uncompressed/stored) ──────────────────────────────

  function buildZip(files) {
    var enc = new TextEncoder();
    var now = new Date();
    var dosTime =
      (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    var dosDate =
      ((now.getFullYear() - 1980) << 9) |
      ((now.getMonth() + 1) << 5) |
      now.getDate();

    function w16(dv, off, v) {
      dv.setUint16(off, v, true);
    }
    function w32(dv, off, v) {
      dv.setUint32(off, v, true);
    }

    var localParts = [];
    var cdEntries = [];
    var cdOffset = 0;

    for (var f of files) {
      var nameBytes = enc.encode(f.name);
      var data = f.data;
      var crc = crc32(data);

      // Local file header
      var lh = new DataView(new ArrayBuffer(30 + nameBytes.length));
      w32(lh, 0, 0x04034b50); // signature
      w16(lh, 4, 20); // version needed
      w16(lh, 6, 0); // flags
      w16(lh, 8, 0); // compression: stored
      w16(lh, 10, dosTime);
      w16(lh, 12, dosDate);
      w32(lh, 14, crc);
      w32(lh, 18, data.length); // compressed size
      w32(lh, 22, data.length); // uncompressed size
      w16(lh, 26, nameBytes.length);
      w16(lh, 28, 0); // extra length
      new Uint8Array(lh.buffer, 30).set(nameBytes);

      var lhBytes = new Uint8Array(lh.buffer);
      var localOffset = cdOffset;
      localParts.push(lhBytes, data);
      cdOffset += lhBytes.length + data.length;

      // Central directory entry
      var cd = new DataView(new ArrayBuffer(46 + nameBytes.length));
      w32(cd, 0, 0x02014b50); // signature
      w16(cd, 4, 20); // version made by
      w16(cd, 6, 20); // version needed
      w16(cd, 8, 0); // flags
      w16(cd, 10, 0); // compression
      w16(cd, 12, dosTime);
      w16(cd, 14, dosDate);
      w32(cd, 16, crc);
      w32(cd, 20, data.length); // compressed size
      w32(cd, 24, data.length); // uncompressed size
      w16(cd, 28, nameBytes.length);
      w16(cd, 30, 0); // extra length
      w16(cd, 32, 0); // comment length
      w16(cd, 34, 0); // disk start
      w16(cd, 36, 0); // internal attrs
      w32(cd, 38, 0); // external attrs
      w32(cd, 42, localOffset);
      new Uint8Array(cd.buffer, 46).set(nameBytes);
      cdEntries.push(new Uint8Array(cd.buffer));
    }

    // End of central directory
    var cdSize = cdEntries.reduce(function (s, e) {
      return s + e.length;
    }, 0);
    var eocd = new DataView(new ArrayBuffer(22));
    w32(eocd, 0, 0x06054b50); // signature
    w16(eocd, 4, 0); // disk number
    w16(eocd, 6, 0); // start disk
    w16(eocd, 8, files.length); // entries on disk
    w16(eocd, 10, files.length); // total entries
    w32(eocd, 12, cdSize); // central dir size
    w32(eocd, 16, cdOffset); // central dir offset
    w16(eocd, 20, 0); // comment length

    var parts = localParts.concat(cdEntries, [new Uint8Array(eocd.buffer)]);
    var total = parts.reduce(function (s, p) {
      return s + p.length;
    }, 0);
    var out = new Uint8Array(total);
    var pos = 0;
    for (var p of parts) {
      out.set(p, pos);
      pos += p.length;
    }
    return out;
  }

  // ── Helpers ────────────────────────────────────────────────────────

  function getVisibleLists() {
    var table = document.querySelector("table.wl-overview-list-table:not(.compact)");
    if (!table) return [];
    var hideEnabled = document.body.classList.contains("rb-hide-enabled");
    var showHidden = document.body.classList.contains("rb-show-hidden");
    return Array.from(table.querySelectorAll("tr"))
      .filter(function (r) {
        if (!r.querySelector("td")) return false;
        if (hideEnabled && !showHidden && r.dataset.rbHidden === "true") return false;
        return true;
      })
      .map(function (row) {
        var link = row.querySelector("a");
        if (!link) return null;
        var href = link.getAttribute("href") || "";
        var qs = href.includes("?") ? href.split("?")[1] : "";
        var id = new URLSearchParams(qs).get("wantedMoreID");
        var name = link.textContent.trim();
        return id ? { id: id, name: name } : null;
      })
      .filter(Boolean);
  }

  function isFiltered() {
    var input = document.querySelector("input.search-query");
    return input ? input.value.trim() !== "" : false;
  }

  function updateButton() {
    if (!archiveBtn) return;
    var labelEl = archiveBtn.querySelector(".rb-dl-all-label");
    if (!labelEl) return;
    var lists = getVisibleLists();
    var filtered = isFiltered();
    var hasHiddenLists = document.body.classList.contains("rb-has-hidden-lists");
    var showHidden = document.body.classList.contains("rb-show-hidden");
    var text;
    if (filtered) {
      text = "(" + lists.length + ")";
    } else if (hasHiddenLists && !showHidden) {
      text = "Visible (" + lists.length + ")";
    } else if (hasHiddenLists && showHidden) {
      text = "All (" + lists.length + ")";
    } else {
      text = "All";
    }
    if (text !== lastBtnText) {
      lastBtnText = text;
      labelEl.textContent = text;
    }
  }

  async function downloadArchive() {
    var lists = getVisibleLists();
    if (lists.length === 0) return;

    // Single list — download directly as XML, same as the per-row Download button.
    if (lists.length === 1) {
      var single = lists[0];
      var a = document.createElement("a");
      a.href =
        "/files/clone/wanted/downloadXML.file?wantedMoreID=" +
        single.id +
        "&wlName=" +
        encodeURIComponent(single.name);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    var filtered = isFiltered();
    var iconEl = archiveBtn.querySelector("i");
    if (iconEl) iconEl.className = "fas fa-spinner fa-spin";
    archiveBtn.disabled = true;

    var enc = new TextEncoder();
    var files = [];
    for (var list of lists) {
      try {
        var url =
          "/files/clone/wanted/downloadXML.file?wantedMoreID=" +
          list.id +
          "&wlName=" +
          encodeURIComponent(list.name);
        var res = await fetch(url);
        var text = await res.text();
        var safeName = list.name.replace(/[/\\?%*:|"<>]/g, "-") + ".xml";
        files.push({ name: safeName, data: enc.encode(text) });
      } catch (e) {
        console.error("[wanted-list-download-all] Failed to fetch:", list.name, e);
      }
    }

    if (files.length > 0) {
      var zipData = buildZip(files);
      var blob = new Blob([zipData], { type: "application/zip" });
      var blobUrl = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = blobUrl;
      a.download = filtered ? "wanted-lists-filtered.zip" : "wanted-lists.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    }

    var iconEl = archiveBtn.querySelector("i");
    if (iconEl) iconEl.className = "fas fa-download";
    archiveBtn.disabled = false;
    lastBtnText = "";
    updateButton();
  }

  // ── Feature ─────────────────────────────────────────────────────────

  function insertBtn() {
    if (isInserting) return;
    if (archiveBtn && document.body.contains(archiveBtn)) return;
    archiveBtn = null;
    lastBtnText = "";

    var searchGroup = document.querySelector(".search-group");
    if (!searchGroup) return;

    isInserting = true;
    archiveBtn = document.createElement("button");
    archiveBtn.className = "bl-btn rb-dl-all-btn";
    archiveBtn.title = "Download as ZIP";
    var icon = document.createElement("i");
    icon.className = "fas fa-download";
    var label = document.createElement("span");
    label.className = "rb-dl-all-label";
    label.textContent = "All";
    archiveBtn.appendChild(icon);
    archiveBtn.appendChild(document.createTextNode("\u00a0")); // non-breaking space
    archiveBtn.appendChild(label);
    archiveBtn.addEventListener("click", downloadArchive);
    // Insert after .search-group (as a sibling in .l-flex.l-split) so it
    // sits in the same flex row without pushing the search input to overflow.
    searchGroup.insertAdjacentElement("afterend", archiveBtn);
    isInserting = false;

    updateButton();
  }

  var featureDef = {
    id: "wanted-list-download-all",
    name: "Wanted List Download All",
    description:
      "Adds a Download All button next to the search bar on the Wanted Lists page to bulk-download all (or filtered) lists as a ZIP file.",
    enabledByDefault: true,
    section: "Wanted Lists",
    docsUrl: "https://github.com/fantapop/refined-bricklink#wanted-list-download-all",

    init() {
      if (!window.location.pathname.includes("/v2/wanted/list.page")) return;

      styleEl = document.createElement("style");
      styleEl.textContent = CSS;
      document.head.appendChild(styleEl);

      insertBtn();

      observer = new MutationObserver(function () {
        insertBtn();
        updateButton();
      });
      observer.observe(document.querySelector("main") || document.body, {
        childList: true,
        subtree: true,
      });

      onInputHandler = function (e) {
        if (e.target.classList.contains("search-query")) updateButton();
      };
      document.addEventListener("input", onInputHandler);

      // Update button label when wanted-list-hide changes body classes
      bodyObserver = new MutationObserver(function () {
        updateButton();
      });
      bodyObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"],
      });
    },

    destroy() {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (bodyObserver) {
        bodyObserver.disconnect();
        bodyObserver = null;
      }
      if (styleEl) {
        styleEl.remove();
        styleEl = null;
      }
      if (archiveBtn) {
        archiveBtn.remove();
        archiveBtn = null;
      }
      if (onInputHandler) {
        document.removeEventListener("input", onInputHandler);
        onInputHandler = null;
      }
      lastBtnText = "";
      isInserting = false;
    },
  };

  RefinedBricklink.features.push(featureDef);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = featureDef;
  }
})();
