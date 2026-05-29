(function () {
  "use strict";

  const STORAGE_KEY = "shajrah_edit_draft";
  const NODE_W = 18;
  const NODE_H = 120;
  const DURATION = 280;

  let payload = null;
  let rootHierarchy = null;
  let svg, g, zoom, treeLayout;
  let allNodes = [];
  let idToNode = new Map();
  let selectedId = null;
  let dirty = false;
  let rootId = null;

  const els = {
    treeContainer: document.getElementById("tree-container"),
    treeSvg: document.getElementById("tree-svg"),
    editorPanel: document.getElementById("editor-panel"),
    search: document.getElementById("search"),
    searchResults: document.getElementById("search-results"),
    stats: document.getElementById("stats"),
    dirtyBadge: document.getElementById("dirty-badge"),
    statusMsg: document.getElementById("status-msg"),
    btnSave: document.getElementById("btn-save"),
    btnDownload: document.getElementById("btn-download"),
    btnDiscard: document.getElementById("btn-discard"),
  };

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function setStatus(msg, type = "") {
    els.statusMsg.textContent = msg;
    els.statusMsg.className = "status-msg" + (type ? " " + type : "");
  }

  function setDirty(value) {
    dirty = value;
    els.dirtyBadge.classList.toggle("hidden", !dirty);
    els.btnDiscard.classList.toggle("hidden", !dirty);
    if (dirty) saveDraft();
  }

  function saveDraft() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ payload, saved: new Date().toISOString() }));
    } catch (_) {}
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data.payload || null;
    } catch (_) {
      return null;
    }
  }

  function clearDraft() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function flatten(node, parentId = "", depth = 0, list = []) {
    list.push({ node, parentId, depth });
    (node.children || []).forEach((ch) => flatten(ch, node.id, depth + 1, list));
    return list;
  }

  function reindex() {
    allNodes = [];
    idToNode = new Map();
    if (!payload?.tree) return;
    flatten(payload.tree).forEach(({ node, parentId }) => {
      const copy = { ...node, parentRef: parentId };
      allNodes.push(copy);
      idToNode.set(node.id, copy);
    });
    updateStats();
  }

  function updateStats() {
    const rows = flatten(payload.tree);
    const depths = rows.map((r) => r.depth);
    payload.stats = {
      total_entries: rows.length,
      unique_persons: rows.length,
      max_depth: depths.length ? Math.max(...depths) : 0,
    };
    els.stats.textContent = `${payload.stats.unique_persons} نام · گہرائی ${payload.stats.max_depth}`;
  }

  function findInTree(node, id) {
    if (node.id === id) return node;
    for (const ch of node.children || []) {
      const found = findInTree(ch, id);
      if (found) return found;
    }
    return null;
  }

  function findParentNode(childId) {
    const flat = flatten(payload.tree);
    const row = flat.find((r) => r.node.id === childId);
    if (!row?.parentId) return null;
    return findInTree(payload.tree, row.parentId);
  }

  function removeFromTree(id) {
    const parent = findParentNode(id);
    if (!parent?.children) return false;
    const idx = parent.children.findIndex((c) => c.id === id);
    if (idx < 0) return false;
    parent.children.splice(idx, 1);
    if (!parent.children.length) delete parent.children;
    return true;
  }

  function slugId(text, parentId) {
    const base = String(text || "person")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 24);
    let id = (base || "child") + "_" + parentId.slice(0, 12);
    let n = 1;
    while (idToNode.has(id)) {
      id = (base || "child") + "_" + parentId.slice(0, 8) + "_" + n++;
    }
    return id;
  }

  function setupSvg() {
    const w = els.treeContainer.clientWidth || 900;
    const h = els.treeContainer.clientHeight || 500;
    svg = d3.select(els.treeSvg).attr("width", w).attr("height", h);
    svg.selectAll("*").remove();
    g = svg.append("g").attr("transform", "translate(80,48)");
    zoom = d3
      .zoom()
      .scaleExtent([0.15, 2.5])
      .on("zoom", (ev) => g.attr("transform", ev.transform));
    svg.call(zoom);
    treeLayout = d3.tree().nodeSize([NODE_H, NODE_W * 8]);
  }

  function collapseDeep(d, maxDepth) {
    if (d.depth > maxDepth && d.children) {
      d._children = d.children;
      d.children = null;
    }
    (d.children || d._children || []).forEach((ch) => collapseDeep(ch, maxDepth));
  }

  function expandAll(d) {
    if (d._children) {
      d.children = d._children;
      d._children = null;
    }
    (d.children || []).forEach(expandAll);
  }

  function collapseAll(d) {
    if (d.children) {
      d._children = d.children;
      d.children = null;
    }
    (d._children || []).forEach(collapseAll);
  }

  function rebuildHierarchy() {
    reindex();
    rootHierarchy = d3.hierarchy(payload.tree);
    collapseDeep(rootHierarchy, 2);
    update(rootHierarchy);
  }

  function diagonal(s, t) {
    return `M ${s.y} ${s.x} C ${(s.y + t.y) / 2} ${s.x}, ${(s.y + t.y) / 2} ${t.x}, ${t.y} ${t.x}`;
  }

  function hasHidden(d) {
    return !!(d._children || (d.children && d.children.length));
  }

  function update(source) {
    if (!rootHierarchy) return;
    const treeData = treeLayout(rootHierarchy);
    const nodes = treeData.descendants();
    const links = treeData.links();

    const height = Math.max(els.treeContainer.clientHeight, nodes.length * NODE_H + 80);
    const width = Math.max(els.treeContainer.clientWidth, d3.max(nodes, (d) => d.depth) * NODE_W * 8 + 200);
    svg.attr("width", width).attr("height", height);
    nodes.forEach((d) => (d.y = d.depth * NODE_W * 8));

    const node = g.selectAll("g.node").data(nodes, (d) => d.data.id);

    const nodeEnter = node
      .enter()
      .append("g")
      .attr("class", "node")
      .attr("transform", () => `translate(${source.y0 || 0},${source.x0 || 0})`)
      .on("click", (ev, d) => {
        ev.stopPropagation();
        if (hasHidden(d)) toggle(d);
        selectNode(d);
      });

    nodeEnter.append("circle").attr("r", 8);
    nodeEnter
      .append("text")
      .attr("class", "node-label")
      .attr("x", 0)
      .attr("y", -14)
      .text((d) => labelOf(d.data));

    const nodeUpdate = nodeEnter.merge(node);
    nodeUpdate.transition().duration(DURATION).attr("transform", (d) => `translate(${d.y},${d.x})`);
    nodeUpdate.select("circle").attr("r", (d) => (hasHidden(d) ? 10 : 8));
    nodeUpdate.select("text.node-label").text((d) => labelOf(d.data));
    nodeUpdate.classed("selected", (d) => d.data.id === selectedId);
    node.exit().transition().duration(DURATION).remove();

    const link = g.selectAll("path.link").data(links, (d) => d.target.data.id);
    const linkEnter = link
      .enter()
      .insert("path", "g")
      .attr("class", "link")
      .attr("d", () => diagonal({ x: source.x0 || 0, y: source.y0 || 0 }, { x: source.x0 || 0, y: source.y0 || 0 }));
    linkEnter.merge(link).transition().duration(DURATION).attr("d", (d) => diagonal(d.source, d.target));
    link.exit().transition().duration(DURATION).remove();

    nodes.forEach((d) => {
      d.x0 = d.x;
      d.y0 = d.y;
    });
  }

  function toggle(d) {
    if (d.children) {
      d._children = d.children;
      d.children = null;
    } else if (d._children) {
      d.children = d._children;
      d._children = null;
    }
    update(d);
  }

  function labelOf(data) {
    return (data.name_urdu || data.name_en || data.id || "").slice(0, 22);
  }

  function selectNode(id) {
    selectedId = id;
    renderEditor(id);
    g.selectAll("g.node").classed("selected", (d) => d.data.id === id);
  }

  function revealPath(targetId) {
    const path = [];
    let cur = idToNode.get(targetId);
    while (cur) {
      path.unshift(cur.id);
      cur = cur.parentRef ? idToNode.get(cur.parentRef) : null;
    }

    function openTo(d) {
      if (path.includes(d.data.id) && d._children) {
        d.children = d._children;
        d._children = null;
      }
      (d.children || d._children || []).forEach(openTo);
    }
    openTo(rootHierarchy);
    update(rootHierarchy);
    selectNode(targetId);
  }

  function applyField(id, field, value) {
    const node = findInTree(payload.tree, id);
    if (!node) return;
    const trimmed = String(value || "").trim();
    if (trimmed) node[field] = trimmed;
    else delete node[field];
    setDirty(true);
    reindex();
    g.selectAll("g.node").filter((d) => d.data.id === id).select("text.node-label").text(labelOf(node));
    setStatus("تبدیلی ہو گئی — محفوظ کریں دبائیں", "");
  }

  function renderEditor(id) {
    const data = idToNode.get(id);
    if (!data) return;
    const parent = data.parentRef ? idToNode.get(data.parentRef) : null;
    const treeNode = findInTree(payload.tree, id);
    const children = treeNode?.children || [];
    const isRoot = id === rootId;

    els.editorPanel.innerHTML = `
      <h2>${esc(data.name_urdu || data.name_en || data.id)}</h2>
      <div class="id-line">${esc(id)}</div>
      ${
        parent
          ? `<div class="parent-line">والد: ${esc(parent.name_urdu || parent.name_en || parent.id)}</div>`
          : `<div class="parent-line">جڑ (root)</div>`
      }

      <div class="field">
        <label for="f-urdu">نام (اردو)</label>
        <input id="f-urdu" class="urdu" type="text" value="${esc(data.name_urdu || "")}" />
      </div>
      <div class="field">
        <label for="f-en">Name (English)</label>
        <input id="f-en" type="text" dir="ltr" value="${esc(data.name_en || "")}" />
      </div>
      <div class="field-row">
        <div class="field">
          <label for="f-ref">صفحہ (ref)</label>
          <input id="f-ref" type="text" dir="ltr" value="${esc(data.ref || "")}" placeholder="5039" />
        </div>
        <div class="field">
          <label for="f-clan">قبیلہ</label>
          <input id="f-clan" class="urdu" type="text" value="${esc(data.clan || "")}" />
        </div>
      </div>
      <div class="field">
        <label for="f-note">نوٹ</label>
        <input id="f-note" class="urdu" type="text" value="${esc(data.note || "")}" />
      </div>

      <div class="actions">
        <button type="button" id="btn-add-toggle" class="btn-secondary">+ بیٹا / اولاد شامل کریں</button>
        ${
          isRoot
            ? `<button type="button" disabled title="جڑ حذف نہیں ہو سکتی">🗑 حذف (جڑ)</button>`
            : `<button type="button" id="btn-delete" class="btn-danger">🗑 یہ نام حذف کریں</button>`
        }
      </div>

      <div id="add-child-box" class="add-child-box hidden">
        <h3>نیا بیٹا</h3>
        <div class="field">
          <label for="new-urdu">نام (اردو) *</label>
          <input id="new-urdu" class="urdu" type="text" placeholder="مثلاً احمد علی" />
        </div>
        <div class="field">
          <label for="new-en">English</label>
          <input id="new-en" type="text" dir="ltr" />
        </div>
        <button type="button" id="btn-add-child" class="btn-primary">✓ شامل کریں</button>
      </div>

      ${
        children.length
          ? `<div class="children-list"><h3>اولاد (${children.length}) — کلک کریں</h3>${children
              .map(
                (c) =>
                  `<span class="child-chip" data-id="${esc(c.id)}">${esc(c.name_urdu || c.name_en || c.id)}</span>`
              )
              .join("")}</div>`
          : ""
      }
    `;

    const applyLive = (field, elId) => {
      const el = document.getElementById(elId);
      el.addEventListener("change", () => applyField(id, field, el.value));
      el.addEventListener("blur", () => applyField(id, field, el.value));
    };
    applyLive("name_urdu", "f-urdu");
    applyLive("name_en", "f-en");
    applyLive("ref", "f-ref");
    applyLive("clan", "f-clan");
    applyLive("note", "f-note");

    document.getElementById("btn-add-toggle")?.addEventListener("click", () => {
      document.getElementById("add-child-box").classList.toggle("hidden");
      document.getElementById("new-urdu")?.focus();
    });

    document.getElementById("btn-add-child")?.addEventListener("click", () => {
      const urdu = document.getElementById("new-urdu").value.trim();
      const en = document.getElementById("new-en").value.trim();
      if (!urdu) {
        setStatus("اردو نام ضروری ہے", "err");
        return;
      }
      addChild(id, urdu, en);
    });

    document.getElementById("btn-delete")?.addEventListener("click", () => deleteNode(id));

    els.editorPanel.querySelectorAll(".child-chip").forEach((chip) => {
      chip.addEventListener("click", () => selectNode(chip.dataset.id));
    });
  }

  function addChild(parentId, nameUrdu, nameEn) {
    const parent = findInTree(payload.tree, parentId);
    if (!parent) return;
    const child = {
      id: slugId(nameEn || nameUrdu, parentId),
      name_urdu: nameUrdu,
    };
    if (nameEn) child.name_en = nameEn;
    if (!parent.children) parent.children = [];
    parent.children.push(child);
    setDirty(true);
    rebuildHierarchy();
    revealPath(child.id);
    setStatus(`"${nameUrdu}" شامل ہو گیا`, "ok");
  }

  function deleteNode(id) {
    const data = idToNode.get(id);
    const name = data?.name_urdu || data?.name_en || id;
    const childCount = (findInTree(payload.tree, id)?.children || []).length;
    let msg = `"${name}" حذف کریں؟`;
    if (childCount) msg += `\n\n⚠ اس کے ${childCount} بیٹے/اولاد بھی حذف ہو جائیں گے۔`;
    if (!confirm(msg)) return;

    if (!removeFromTree(id)) {
      setStatus("حذف نہیں ہو سکا", "err");
      return;
    }
    selectedId = null;
    els.editorPanel.innerHTML = `<p class="placeholder">← درخت یا تلاش سے کوئی نام منتخب کریں</p>`;
    setDirty(true);
    rebuildHierarchy();
    setStatus(`"${name}" حذف ہو گیا`, "ok");
  }

  async function saveToServer() {
    els.btnSave.disabled = true;
    setStatus("محفوظ ہو رہا ہے…", "");
    try {
      const res = await fetch("/api/save-tree", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Save failed");
      setDirty(false);
      clearDraft();
      setStatus(`✓ محفوظ — ${data.persons} نام · بیک اپ: ${data.backup}`, "ok");
    } catch (err) {
      setStatus(`سرور نہیں ملا (${err.message}) — JSON ڈاؤن لوڈ استعمال کریں`, "err");
      downloadJson();
    } finally {
      els.btnSave.disabled = false;
    }
  }

  function downloadJson() {
    updateStats();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "master_tree.json";
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus("JSON ڈاؤن لوڈ — root folder میں رکھیں → python sync_tree.py", "ok");
  }

  function bindSearch() {
    els.search.addEventListener("input", () => {
      const q = els.search.value.trim();
      if (q.length < 1) {
        els.searchResults.classList.add("hidden");
        return;
      }
      const matches = allNodes
        .filter(
          (n) =>
            (n.name_urdu && n.name_urdu.includes(q)) ||
            (n.name_en && n.name_en.toLowerCase().includes(q.toLowerCase())) ||
            n.id.toLowerCase().includes(q.toLowerCase())
        )
        .slice(0, 25);

      if (!matches.length) {
        els.searchResults.innerHTML = `<button type="button">کوئی نتیجہ نہیں</button>`;
      } else {
        els.searchResults.innerHTML = matches
          .map(
            (n) =>
              `<button type="button" data-id="${esc(n.id)}">${esc(n.name_urdu || n.name_en || n.id)}<span class="sub">${esc(n.id)}</span></button>`
          )
          .join("");
      }
      els.searchResults.classList.remove("hidden");
    });

    els.searchResults.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button[data-id]");
      if (!btn) return;
      revealPath(btn.dataset.id);
      els.searchResults.classList.add("hidden");
      els.search.value = "";
    });

    document.addEventListener("click", (ev) => {
      if (!els.searchResults.contains(ev.target) && ev.target !== els.search) {
        els.searchResults.classList.add("hidden");
      }
    });
  }

  function bindControls() {
    document.getElementById("expand-all").addEventListener("click", () => {
      expandAll(rootHierarchy);
      update(rootHierarchy);
    });
    document.getElementById("collapse-all").addEventListener("click", () => {
      collapseAll(rootHierarchy);
      collapseDeep(rootHierarchy, 1);
      update(rootHierarchy);
    });
    els.btnSave.addEventListener("click", saveToServer);
    els.btnDownload.addEventListener("click", downloadJson);
    els.btnDiscard.addEventListener("click", () => {
      if (!confirm("غیر محفوظ تبدیلیاں ختم کریں؟")) return;
      clearDraft();
      location.reload();
    });
    bindSearch();
  }

  const DATA = (window.SHAJRAH_EDITOR && window.SHAJRAH_EDITOR.data) || "../../shajrah/data/";

  function loadTreeData() {
    return fetch(DATA + "tree_version.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { updated: "" }))
      .catch(() => ({ updated: "" }))
      .then((v) =>
        fetch(`${DATA}master_tree.json?v=${encodeURIComponent(v.updated || Date.now())}`, {
          cache: "no-store",
        }).then((r) => {
          if (!r.ok) throw new Error("Tree data not found");
          return r.json();
        })
      );
  }

  function draftHasOldBakhtawar(draft) {
    function walk(n, parent = "") {
      if (n.id === "bakhtawar" && parent === "hatim") return true;
      return (n.children || []).some((ch) => walk(ch, n.id));
    }
    return draft?.tree ? walk(draft.tree) : false;
  }

  function init() {
    loadTreeData()
      .then((data) => {
        const draft = loadDraft();
        if (draft && !draftHasOldBakhtawar(draft) && confirm("محفوظ شدہ مسودہ (غیر محفوظ تبدیلیاں) ملے — وہ لوڈ کریں؟")) {
          payload = draft;
          dirty = true;
          els.dirtyBadge.classList.remove("hidden");
          els.btnDiscard.classList.remove("hidden");
        } else {
          if (draft && draftHasOldBakhtawar(draft)) {
            clearDraft();
            setStatus("پرانا مسودہ (غلط بختاور) ختم کر دیا — تازہ ڈیٹا لوڈ", "ok");
          }
          payload = data;
        }
        rootId = payload.tree.id;
        reindex();
        setupSvg();
        rootHierarchy = d3.hierarchy(payload.tree);
        collapseDeep(rootHierarchy, 2);
        update(rootHierarchy);
        bindControls();
        setStatus("کلک = منتخب + شاخ کھولیں/بند", "");
      })
      .catch((err) => {
        els.editorPanel.innerHTML = `<p class="placeholder">Error: ${esc(err.message)}</p>`;
      });
  }

  init();
})();
