(function () {
  "use strict";

  const STORAGE_KEY = "shajrah_link_corrections";

  let imageIndex = {};
  let allPersons = [];
  let byId = {};
  let photoFiles = [];
  let photoIndex = 0;
  let currentPhoto = null;
  let pageRefs = [];
  let pageCrossRefs = [];
  let pageStubRefs = [];
  let deepExpand = false;
  let pagePersonIds = new Set();
  /** @type {Record<string, string[]>} */
  let childrenMap = {};

  /** @type {Record<string, string>} childId -> parentId */
  let parentOverrides = {};

  let selectedChildId = null;
  let pickParentMode = false;

  const els = {
    photoSelect: document.getElementById("photo-select"),
    photo: document.getElementById("photo"),
    caption: document.getElementById("photo-caption"),
    pageInfo: document.getElementById("page-info"),
    linkStatus: document.getElementById("link-status"),
    statusStep: document.getElementById("status-step"),
    statusText: document.getElementById("status-text"),
    btnCancel: document.getElementById("btn-cancel"),
    selectionBox: document.getElementById("selection-box"),
    selectionName: document.getElementById("selection-name"),
    clickToast: document.getElementById("click-toast"),
    personGrid: document.getElementById("person-grid"),
    miniSvg: document.getElementById("mini-svg"),
    filter: document.getElementById("filter"),
    parentSearch: document.getElementById("parent-search"),
    parentSearchResults: document.getElementById("parent-search-results"),
    changesList: document.getElementById("changes-list"),
    changeCount: document.getElementById("change-count"),
    nameCount: document.getElementById("name-count"),
    deepExpand: document.getElementById("deep-expand"),
    photoLoading: document.getElementById("photo-loading"),
    photoError: document.getElementById("photo-error"),
    graphNote: document.getElementById("graph-note"),
    miniSvgWrap: document.getElementById("mini-svg-wrap"),
  };

  let toastTimer = null;

  function walk(node, parentId = "", list = []) {
    if (node.id !== "root") {
      list.push({
        id: node.id,
        name_urdu: node.name_urdu || "",
        name_en: node.name_en || "",
        ref: node.ref || "",
        parent_id: parentId,
      });
    }
    (node.children || []).forEach((ch) => walk(ch, node.id, list));
    return list;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function getParentId(id) {
    if (Object.prototype.hasOwnProperty.call(parentOverrides, id)) {
      return parentOverrides[id];
    }
    return byId[id]?.parent_id || "";
  }

  function getDisplayName(p) {
    if (!p) return "";
    return p.name_urdu || p.name_en || p.id;
  }

  function loadStored() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        parentOverrides = data.parents || {};
      }
    } catch (_) {
      parentOverrides = {};
    }
  }

  function saveStored() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ parents: parentOverrides, updated: new Date().toISOString() })
    );
  }

  function exportJson() {
    const out = {
      _help: "Parent links from link editor. Apply: python apply_corrections.py link_corrections.json",
      parents: { ...parentOverrides },
      pages_reviewed: {},
    };
    Object.entries(imageIndex).forEach(([file, meta]) => {
      if (meta.reviewed) out.pages_reviewed[file] = true;
    });
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "link_corrections.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function showToast(msg, type = "child") {
    els.clickToast.textContent = msg;
    els.clickToast.classList.remove("hidden", "toast-parent");
    if (type === "parent") els.clickToast.classList.add("toast-parent");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.clickToast.classList.add("hidden"), 2200);
  }

  function setStatus(step, text, mode = "idle") {
    els.statusStep.textContent = step;
    els.statusText.textContent = text;
    els.linkStatus.className = "link-status link-status-" + mode;
  }

  function updateSelectionUI() {
    if (selectedChildId && pickParentMode) {
      const child = byId[selectedChildId];
      els.selectionBox.classList.remove("hidden");
      els.selectionName.textContent = getDisplayName(child);
      els.btnCancel.classList.remove("hidden");
      setStatus("مرحلہ ۲", `والد منتخب کریں — بیٹا: ${getDisplayName(child)}`, "parent");
    } else {
      els.selectionBox.classList.add("hidden");
      els.btnCancel.classList.add("hidden");
      setStatus("مرحلہ ۱", "بیٹا منتخب کرنے کے لیے نیچے کسی نام پر کلک کریں", "idle");
    }
  }

  function clearSelection() {
    selectedChildId = null;
    pickParentMode = false;
    updateSelectionUI();
  }

  function assignParent(childId, parentId) {
    if (!childId) return;
    if (childId === parentId) {
      setStatus("!", "بیٹا اور والد ایک ہی نہیں ہو سکتے", "idle");
      return;
    }
    const original = byId[childId]?.parent_id || "";
    if (parentId === original) {
      delete parentOverrides[childId];
    } else {
      parentOverrides[childId] = parentId;
    }
    saveStored();
    clearSelection();
    renderAll();
    const child = byId[childId];
    const parent = byId[parentId];
    setStatus("✓ ہو گیا", `${getDisplayName(child)} ← والد: ${parent ? getDisplayName(parent) : "—"}`, "done");
    showToast(`✓ رابطہ محفوظ: ${getDisplayName(child)}`, "parent");
  }

  function onPersonClick(id) {
    const p = byId[id];
    const label = getDisplayName(p);

    if (!pickParentMode) {
      selectedChildId = id;
      pickParentMode = true;
      showToast(`✓ بیٹا منتخب: ${label}`, "child");
      updateSelectionUI();
      renderPersonGrid();
      renderMiniGraph();
      return;
    }

    if (selectedChildId === id) {
      clearSelection();
      showToast("منسوخ", "child");
      renderPersonGrid();
      renderMiniGraph();
      return;
    }

    if (selectedChildId) {
      assignParent(selectedChildId, id);
    }
  }

  function autoStubRefs(currentFile, expandRefs) {
    const stubs = new Set();
    Object.entries(imageIndex).forEach(([file, meta]) => {
      if (file === currentFile) return;
      (meta.refs || []).forEach((r) => {
        const rs = String(r);
        if (!expandRefs.has(rs)) stubs.add(rs);
      });
    });
    return stubs;
  }

  /** Collect names visible on a photo page (refs, cross-page subtrees, shallow stub links). */
  function collectPagePersons(meta, currentFile) {
    const ids = new Set();
    const refs = (meta.refs || []).map(String);
    const crossRefs = (meta.cross_refs || []).map(String);
    const expandRefs = new Set([...refs, ...crossRefs]);
    const stubRefs = new Set([
      ...(meta.stub_refs || []).map(String),
      ...autoStubRefs(currentFile, expandRefs),
    ]);

    allPersons.forEach((p) => {
      if (p.ref && expandRefs.has(String(p.ref))) ids.add(p.id);
    });

    const roots = [...ids].filter((id) => {
      let cur = getParentId(id);
      while (cur) {
        if (ids.has(cur)) return false;
        cur = getParentId(cur);
      }
      return true;
    });

    function addDescendants(id) {
      (childrenMap[id] || []).forEach((ch) => {
        ids.add(ch);
        const chRef = String(byId[ch]?.ref || "");
        if (deepExpand) {
          addDescendants(ch);
          return;
        }
        // Linked branch on another page: show node + its direct children (e.g. Muhammad Ali → Nadir)
        if (chRef && stubRefs.has(chRef)) {
          (childrenMap[ch] || []).forEach((gc) => ids.add(gc));
          return;
        }
        if (!chRef || expandRefs.has(chRef)) {
          addDescendants(ch);
        }
      });
    }

    roots.forEach(addDescendants);

    roots.forEach((id) => {
      let cur = getParentId(id);
      for (let i = 0; i < 2 && cur; i++) {
        if (byId[cur]) ids.add(cur);
        cur = getParentId(cur);
      }
    });

    return ids;
  }

  function depthOf(id) {
    let d = 0;
    let cur = getParentId(id);
    const seen = new Set();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      d++;
      cur = getParentId(cur);
    }
    return d;
  }

  function graphNodeIds() {
    if (selectedChildId) {
      const ids = new Set([selectedChildId]);
      const pid = getParentId(selectedChildId);
      if (pid) ids.add(pid);
      pagePersonIds.forEach((id) => {
        if (getParentId(id) === pid) ids.add(id);
      });
      return [...ids];
    }
    // No selection: show roots + their children only (max ~15)
    const ids = [...pagePersonIds].slice(0, 15);
    return ids;
  }

  function renderPersonGrid() {
    const q = els.filter.value.trim().toLowerCase();
    let ids = [...pagePersonIds];
    if (q) {
      ids = ids.filter((id) => {
        const p = byId[id];
        return (
          id.includes(q) ||
          (p.name_urdu && p.name_urdu.includes(q)) ||
          (p.name_en && p.name_en.toLowerCase().includes(q))
        );
      });
    }

    if (!ids.length) {
      els.personGrid.innerHTML = `<p class="empty-msg">اس صفحے کے نام نہیں ملے</p>`;
      return;
    }

    ids.sort((a, b) => {
      const da = depthOf(a);
      const db = depthOf(b);
      if (da !== db) return da - db;
      return (byId[a].name_urdu || "").localeCompare(byId[b].name_urdu || "");
    });

    els.personGrid.innerHTML = ids
      .map((id) => {
        const p = byId[id];
        const parentId = getParentId(id);
        const parent = byId[parentId];
        const changed = Object.prototype.hasOwnProperty.call(parentOverrides, id);
        const isChild = selectedChildId === id;
        const cls = [
          "person-card",
          isChild ? "selected-child" : "",
          pickParentMode && !isChild ? "pick-parent-mode" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return `
          <div class="${cls}" data-id="${esc(id)}" role="button" tabindex="0">
            <div class="name">${esc(p.name_urdu || p.name_en || id)}</div>
            <span class="badge ${changed ? "changed" : "ok"}">${changed ? "تبدیل" : "موجود"}</span>
            ${isChild ? '<div class="pick-hint-child">★ یہ بیٹا منتخب ہے — اب والد پر کلک کریں</div>' : ""}
            ${pickParentMode && !isChild ? '<div class="pick-hint">← والد کے طور پر کلک کریں</div>' : ""}
            <div class="parent-line">والد: ${esc(parent ? getDisplayName(parent) : parentId || "—")}</div>
            <div class="meta">${esc(id)} · ref ${esc(p.ref || "—")}</div>
          </div>`;
      })
      .join("");

    els.personGrid.querySelectorAll(".person-card").forEach((card) => {
      card.addEventListener("click", () => onPersonClick(card.dataset.id));
      card.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          onPersonClick(card.dataset.id);
        }
      });
    });
  }

  function renderMiniGraph() {
    const ids = graphNodeIds();
    els.graphNote.classList.add("hidden");

    if (!ids.length) {
      els.miniSvg.innerHTML = "";
      els.graphNote.textContent = "پہلے کوئی نام (بیٹا) منتخب کریں";
      els.graphNote.classList.remove("hidden");
      return;
    }

    if (!selectedChildId && pagePersonIds.size > 15) {
      els.miniSvg.innerHTML = "";
      els.graphNote.textContent = `${pagePersonIds.size} نام — خاکہ دکھانے کے لیے کوئی بیٹا منتخب کریں`;
      els.graphNote.classList.remove("hidden");
      return;
    }

    const nodes = ids.map((id) => ({
      id,
      label: (byId[id].name_urdu || byId[id].name_en || id).slice(0, 14),
      parent: getParentId(id),
    }));

    const idSet = new Set(ids);
    const edges = nodes
      .filter((n) => n.parent && idSet.has(n.parent))
      .map((n) => ({
        from: n.parent,
        to: n.id,
        changed: Object.prototype.hasOwnProperty.call(parentOverrides, n.id),
      }));

    const depth = {};
    function d(id, seen = new Set()) {
      if (depth[id] !== undefined) return depth[id];
      if (seen.has(id)) return 0;
      seen.add(id);
      const p = getParentId(id);
      if (!p || !idSet.has(p)) {
        depth[id] = 0;
        return 0;
      }
      depth[id] = d(p, seen) + 1;
      return depth[id];
    }
    nodes.forEach((n) => d(n.id));

    const maxDepth = Math.max(0, ...nodes.map((n) => depth[n.id] || 0));
    const byLevel = {};
    nodes.forEach((n) => {
      const lv = depth[n.id] || 0;
      if (!byLevel[lv]) byLevel[lv] = [];
      byLevel[lv].push(n);
    });

    const boxW = 110;
    const boxH = 40;
    const gapX = 16;
    const gapY = 64;
    const pad = 24;

    const pos = {};
    Object.keys(byLevel).forEach((lv) => {
      const row = byLevel[lv];
      const startX = pad + boxW / 2;
      row.forEach((n, i) => {
        pos[n.id] = {
          x: startX + i * (boxW + gapX),
          y: pad + Number(lv) * gapY + boxH / 2,
        };
      });
    });

    const width = Math.max(280, ...Object.values(pos).map((p) => p.x + boxW / 2 + pad));
    const height = Math.max(180, pad * 2 + (maxDepth + 1) * gapY);

    els.miniSvg.setAttribute("width", String(width));
    els.miniSvg.setAttribute("height", String(height));
    els.miniSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    els.miniSvg.style.width = width + "px";
    els.miniSvg.style.height = height + "px";

    let svg = "";
    edges.forEach((e) => {
      const a = pos[e.from];
      const b = pos[e.to];
      if (!a || !b) return;
      const cls = e.changed ? "link-line new-link" : "link-line";
      svg += `<path class="${cls}" d="M ${a.x} ${a.y + boxH / 2} L ${b.x} ${b.y - boxH / 2}" />`;
    });

    nodes.forEach((n) => {
      const p = pos[n.id];
      if (!p) return;
      const hl = selectedChildId === n.id ? " highlight" : "";
      svg += `<rect class="node-box${hl}" x="${p.x - boxW / 2}" y="${p.y - boxH / 2}" width="${boxW}" height="${boxH}" rx="6" />`;
      svg += `<text class="node-label" x="${p.x}" y="${p.y + 4}">${esc(n.label)}</text>`;
    });

    els.miniSvg.innerHTML = svg;
  }

  function renderChangesList() {
    const entries = Object.entries(parentOverrides);
    els.changeCount.textContent = String(entries.length);
    if (!entries.length) {
      els.changesList.innerHTML = "<li>ابھی کوئی تبدیلی نہیں</li>";
      return;
    }
    els.changesList.innerHTML = entries
      .map(([childId, parentId]) => {
        const c = byId[childId];
        const p = byId[parentId];
        return `<li><strong>${esc(getDisplayName(c))}</strong> ← ${esc(p ? getDisplayName(p) : parentId || "—")}</li>`;
      })
      .join("");
  }

  function renderAll() {
    renderPersonGrid();
    renderMiniGraph();
    renderChangesList();
  }

  function selectPhoto(file) {
    currentPhoto = file;
    photoIndex = photoFiles.indexOf(file);
    const meta = imageIndex[file];
    pageRefs = meta.refs || [];
    pageCrossRefs = meta.cross_refs || [];
    pageStubRefs = meta.stub_refs || [];

    els.photoLoading.classList.remove("hidden");
    els.photoError.classList.add("hidden");
    els.photo.classList.remove("hidden");
    els.photo.onload = () => {
      els.photoLoading.classList.add("hidden");
      els.photoError.classList.add("hidden");
      els.photo.classList.remove("hidden");
    };
    els.photo.onerror = () => {
      els.photoLoading.classList.add("hidden");
      els.photo.classList.add("hidden");
      els.photoError.classList.remove("hidden");
    };
    els.photo.src = `${PHOTOS}${file}`;

    const refLabel = [...pageRefs, ...pageCrossRefs.map((r) => r + "*")].join(" / ");
    els.caption.textContent = `${refLabel} — ${meta.label || ""}`;
    els.pageInfo.textContent = `صفحہ ${photoIndex + 1} / ${photoFiles.length}${meta.reviewed ? " ✓" : ""}`;
    els.photoSelect.value = file;
    pagePersonIds = collectPagePersons(meta, file);
    const modeHint = deepExpand ? " (گہرا)" : "";
    els.nameCount.textContent = `${pagePersonIds.size} نام${modeHint}`;
    clearSelection();
    renderAll();
  }

  function populatePhotoSelect() {
    photoFiles = Object.keys(imageIndex).sort(
      (a, b) => (imageIndex[a].refs[0] || "").localeCompare(imageIndex[b].refs[0] || "")
    );
    els.photoSelect.innerHTML = photoFiles
      .map((file) => {
        const m = imageIndex[file];
        const mark = m.reviewed ? " ✓" : "";
        return `<option value="${file}">${(m.refs || []).join(",")} — ${m.label || file}${mark}</option>`;
      })
      .join("");
  }

  function renderParentSearch() {
    const q = els.parentSearch.value.trim().toLowerCase();
    if (!pickParentMode || !selectedChildId || q.length < 2) {
      els.parentSearchResults.innerHTML = "";
      return;
    }
    const matches = allPersons
      .filter(
        (p) =>
          p.id !== selectedChildId &&
          ((p.name_urdu && p.name_urdu.includes(q)) ||
            (p.name_en && p.name_en.toLowerCase().includes(q)) ||
            p.id.toLowerCase().includes(q))
      )
      .slice(0, 15);

    els.parentSearchResults.innerHTML = matches
      .map(
        (p) =>
          `<button type="button" data-id="${esc(p.id)}">${esc(getDisplayName(p))} <span style="color:#888;font-size:0.8rem">${esc(p.id)}</span></button>`
      )
      .join("");

    els.parentSearchResults.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        assignParent(selectedChildId, btn.dataset.id);
        els.parentSearch.value = "";
        els.parentSearchResults.innerHTML = "";
      });
    });
  }

  function initEvents() {
    els.photoSelect.addEventListener("change", () => selectPhoto(els.photoSelect.value));
    els.filter.addEventListener("input", renderPersonGrid);
    els.parentSearch.addEventListener("input", renderParentSearch);
    if (els.deepExpand) {
      els.deepExpand.addEventListener("change", () => {
        deepExpand = els.deepExpand.checked;
        if (currentPhoto) {
          pagePersonIds = collectPagePersons(imageIndex[currentPhoto], currentPhoto);
          els.nameCount.textContent = `${pagePersonIds.size} نام${deepExpand ? " (گہرا)" : ""}`;
          renderAll();
        }
      });
    }

    document.getElementById("btn-prev").addEventListener("click", () => {
      if (photoIndex > 0) selectPhoto(photoFiles[photoIndex - 1]);
    });
    document.getElementById("btn-next").addEventListener("click", () => {
      if (photoIndex < photoFiles.length - 1) selectPhoto(photoFiles[photoIndex + 1]);
    });

    document.getElementById("btn-mark-reviewed").addEventListener("click", () => {
      if (!currentPhoto) return;
      imageIndex[currentPhoto].reviewed = true;
      populatePhotoSelect();
      els.pageInfo.textContent = `صفحہ ${photoIndex + 1} / ${photoFiles.length} ✓`;
    });

    document.getElementById("btn-save").addEventListener("click", exportJson);

    els.btnCancel.addEventListener("click", () => {
      clearSelection();
      renderPersonGrid();
      renderMiniGraph();
    });

    document.getElementById("btn-clear-page").addEventListener("click", () => {
      pagePersonIds.forEach((id) => delete parentOverrides[id]);
      saveStored();
      clearSelection();
      renderAll();
    });

    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") clearSelection();
    });

    // Right-click or double-click: remove parent (root)
    els.personGrid.addEventListener("contextmenu", (ev) => {
      const card = ev.target.closest(".person-card");
      if (!card) return;
      ev.preventDefault();
      if (pickParentMode && selectedChildId) {
        assignParent(selectedChildId, "");
      }
    });
  }

  const DATA = (window.SHAJRAH_EDITOR && window.SHAJRAH_EDITOR.data) || "../../shajrah/data/";
  const PHOTOS = (window.SHAJRAH_EDITOR && window.SHAJRAH_EDITOR.photos) || "../../";

  function load() {
    loadStored();
    const loadTree = fetch(DATA + "tree_version.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { updated: "" }))
      .catch(() => ({ updated: "" }))
      .then((v) =>
        fetch(`${DATA}master_tree.json?v=${encodeURIComponent(v.updated || Date.now())}`, {
          cache: "no-store",
        }).then((r) => r.json())
      );
    return Promise.all([
      fetch(DATA + "image_index.json", { cache: "no-store" }).then((r) => r.json()),
      loadTree,
    ]).then(([idx, treeData]) => {
      imageIndex = idx;
      allPersons = walk(treeData.tree);
      byId = Object.fromEntries(allPersons.map((p) => [p.id, p]));
      childrenMap = {};
      allPersons.forEach((p) => {
        const pid = p.parent_id;
        if (pid) {
          if (!childrenMap[pid]) childrenMap[pid] = [];
          childrenMap[pid].push(p.id);
        }
      });
      populatePhotoSelect();
      initEvents();
      if (photoFiles.length) selectPhoto(photoFiles[0]);
    });
  }

  load().catch((err) => {
    els.personGrid.innerHTML = `<p class="empty-msg">Error: ${esc(err.message)}</p>`;
  });
})();
