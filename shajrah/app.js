(function () {
  "use strict";

  const MOBILE = window.matchMedia("(max-width: 900px)").matches;
  const NODE_R = MOBILE ? 12 : 10;
  const LABEL_SIZE = MOBILE ? 13 : 12;
  const ROW_H = MOBILE ? 76 : 92;
  const CHILD_ROW_H = MOBILE ? 52 : 58;
  const ANCESTOR_DEFAULT = 2;
  const DURATION = 280;

  let payload, svg, g;
  let allNodes = [];
  let searchIndex = [];
  let idToNode = new Map();
  let selectedId = null;
  let searchHighlightId = null;
  let focusId = null;
  let ancestorReveal = ANCESTOR_DEFAULT;

  const container = document.getElementById("tree-container");
  const svgEl = document.getElementById("tree-svg");
  const detailPanel = document.getElementById("detail-panel");
  const searchInput = document.getElementById("search");
  const searchResults = document.getElementById("search-results");
  const treePanel = document.querySelector(".tree-panel");

  function loadTreeData() {
    return fetch("data/tree_version.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { updated: "" }))
      .catch(() => ({ updated: "" }))
      .then((v) =>
        fetch(`data/master_tree.json?v=${encodeURIComponent(v.updated || Date.now())}`, {
          cache: "no-store",
        })
      )
      .then((r) => {
        if (!r.ok) throw new Error("Could not load tree data");
        return r.json();
      });
  }

  function normalizeText(s) {
    return String(s || "")
      .replace(/[\u0640\u200c\u200d\ufeff]/g, "")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/[یيى]/g, "ی")
      .replace(/ة/g, "ه")
      .replace(/[\u064B-\u065F\u0670]/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const row = [];
    for (let j = 0; j <= b.length; j++) row[j] = j;
    for (let i = 1; i <= a.length; i++) {
      let prev = i - 1;
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const val =
          a[i - 1] === b[j - 1]
            ? prev
            : Math.min(prev, row[j], row[j - 1]) + 1;
        prev = row[j];
        row[j] = val;
      }
    }
    return row[b.length];
  }

  function fuzzyWordScore(query, word) {
    if (!query || !word) return 0;
    if (word.includes(query)) return 100;
    if (word.startsWith(query)) return 95;
    const maxDist = query.length <= 3 ? 1 : query.length <= 6 ? 2 : 3;
    const dist = levenshtein(query, word.slice(0, query.length + 2));
    if (dist <= maxDist && word.length >= query.length - 1) {
      return 70 - dist * 10;
    }
    if (word.length >= query.length) {
      for (let i = 0; i <= word.length - query.length; i++) {
        const slice = word.slice(i, i + query.length + 1);
        if (levenshtein(query, slice.slice(0, query.length)) <= maxDist) {
          return 55 - dist * 5;
        }
      }
    }
    return 0;
  }

  function scorePerson(person, queryRaw) {
    const q = normalizeText(queryRaw);
    if (!q) return 0;

    const qTokens = q.split(/\s+/).filter(Boolean);
    const fields = [
      { text: person.name_urdu, weight: 1.0 },
      { text: person.name_en, weight: 0.85 },
      { text: person.id.replace(/_/g, " "), weight: 0.5 },
    ];

    let best = 0;

    for (const { text, weight } of fields) {
      const n = normalizeText(text);
      if (!n) continue;

      if (n.includes(q)) best = Math.max(best, 100 * weight);

      const allTokensMatch = qTokens.every((tok) =>
        n.split(/\s+/).some((w) => fuzzyWordScore(tok, w) >= 50)
      );
      if (allTokensMatch && qTokens.length > 1) best = Math.max(best, 88 * weight);

      for (const tok of qTokens) {
        for (const word of n.split(/\s+/)) {
          best = Math.max(best, fuzzyWordScore(tok, word) * weight);
        }
        best = Math.max(best, fuzzyWordScore(tok, n) * weight * 0.9);
      }
    }

    return best;
  }

  function parentLabel(person, lang) {
    if (!person.parentRef) return "";
    const p = idToNode.get(person.parentRef);
    if (!p) return "";
    if (lang === "en") return p.name_en || p.name_urdu || p.id.replace(/_/g, " ");
    return p.name_urdu || p.name_en || p.id.replace(/_/g, " ");
  }

  function formatSearchResult(person) {
    const name = person.name_urdu || person.name_en || person.id.replace(/_/g, " ");
    const nameEn = person.name_en || person.id.replace(/_/g, " ");
    const parent = parentLabel(person, "urdu");
    const parentEn = parentLabel(person, "en");

    const primary = parent ? `${parent} ← ${name}` : name;
    let enLine = nameEn;
    if (parentEn) enLine = `${parentEn} ← ${nameEn}`;

    return { primary, enLine };
  }

  function buildSearchIndex() {
    searchIndex = allNodes.map((n) => ({
      person: n,
      urdu: normalizeText(n.name_urdu),
      en: normalizeText(n.name_en),
    }));
  }

  function searchPersons(query) {
    const q = query.trim();
    const minLen = /[\u0600-\u06FF]/.test(q) ? 1 : 2;
    if (q.length < minLen) return [];

    return searchIndex
      .map((entry) => ({ person: entry.person, score: scorePerson(entry.person, q) }))
      .filter((r) => r.score >= 45)
      .sort((a, b) => b.score - a.score)
      .slice(0, 25);
  }

  function buildIndex(node, parent = null) {
    const copy = { ...node, parentRef: parent };
    allNodes.push(copy);
    idToNode.set(node.id, copy);
    (node.children || []).forEach((ch) => buildIndex(ch, node.id));
  }

  function getChain(id) {
    const chain = [];
    let cur = idToNode.get(id);
    while (cur) {
      chain.unshift(cur);
      cur = cur.parentRef ? idToNode.get(cur.parentRef) : null;
    }
    return chain;
  }

  function getChildren(person) {
    return (person.children || [])
      .map((ch) => idToNode.get(ch.id))
      .filter(Boolean);
  }

  function childCount(person) {
    return (person.children || []).length;
  }

  function setupSvg() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || 420;
    svg = d3.select(svgEl).attr("width", w).attr("height", h);
    svg.selectAll("*").remove();
    g = svg.append("g");
  }

  /** Compact layout: up to N ancestors + focus + children list. */
  function buildLayout() {
    const chain = getChain(focusId);
    const focusIdx = chain.length - 1;
    const focus = chain[focusIdx];
    const maxAbove = Math.min(ancestorReveal, focusIdx);
    const skip = Math.max(0, focusIdx - maxAbove);
    const hiddenAbove = skip;
    const ancestors = chain.slice(skip, focusIdx);
    const children = getChildren(focus);

    const nodes = [];
    const links = [];
    let y = 0;

    if (hiddenAbove > 0) {
      nodes.push({
        id: "__more_up__",
        kind: "more-up",
        x: 0,
        y,
        label: `↑ ${hiddenAbove} مزید آباء`,
        sub: "Click for more ancestors",
      });
      y += ROW_H * 0.75;
    }

    ancestors.forEach((person) => {
      nodes.push({
        id: person.id,
        kind: "ancestor",
        data: person,
        x: 0,
        y,
        hasKids: childCount(person) > 0,
      });
      y += ROW_H;
    });

    const focusY = y;
    nodes.push({
      id: focus.id,
      kind: "focus",
      data: focus,
      x: 0,
      y: focusY,
      hasKids: children.length > 0,
    });
    y += ROW_H + 12;

    const childX = MOBILE ? 28 : 36;
    children.forEach((person) => {
      nodes.push({
        id: person.id,
        kind: "child",
        data: person,
        x: childX,
        y,
        hasKids: childCount(person) > 0,
      });
      links.push({
        id: `${focus.id}->${person.id}`,
        sx: 0,
        sy: focusY + NODE_R,
        tx: childX,
        ty: y,
      });
      y += CHILD_ROW_H;
    });

    if (children.length) {
      nodes.push({
        id: "__children_label__",
        kind: "label",
        x: childX,
        y: focusY + ROW_H * 0.55,
        label: `اولاد (${children.length})`,
      });
    }

    const contentH = y + 48;
    const width = container.clientWidth || 320;
    const height = Math.max(container.clientHeight || 320, contentH);

    return { nodes, links, width, height, focusY };
  }

  function labelText(data) {
    const name = data.name_urdu || data.name_en || data.id || "";
    const max = MOBILE ? 22 : 28;
    return name.length > max ? name.slice(0, max) + "…" : name;
  }

  function linkPath(l) {
    const midY = (l.sy + l.ty) / 2;
    return `M ${l.sx} ${l.sy} C ${l.sx} ${midY}, ${l.tx} ${midY}, ${l.tx} ${l.ty}`;
  }

  function renderView() {
    if (!focusId || !g) return;

    const { nodes, links, width, height } = buildLayout();
    const offsetX = width / 2;

    svg.attr("width", width).attr("height", height);
    g.attr("transform", `translate(${offsetX}, 32)`);

    const linkSel = g.selectAll("path.link").data(links, (d) => d.id);
    linkSel
      .enter()
      .append("path")
      .attr("class", "link")
      .merge(linkSel)
      .attr("d", linkPath);
    linkSel.exit().remove();

    const nodeSel = g.selectAll("g.node").data(nodes, (d) => d.id);

    const nodeEnter = nodeSel
      .enter()
      .append("g")
      .attr("class", (d) => {
        let c = "node";
        if (d.kind === "more-up") c += " node-more";
        if (d.kind === "focus") c += " node-focus";
        if (d.kind === "child") c += " node-child";
        if (d.kind === "label") c += " node-label-only";
        if (d.hasKids) c += " has-children";
        return c;
      })
      .attr("transform", (d) => `translate(${d.x},${d.y})`)
      .on("click", onNodeActivate);

    nodeEnter.filter((d) => d.kind !== "label").append("circle").attr("class", "hit").attr("r", NODE_R + 10);
    nodeEnter
      .filter((d) => d.kind !== "label")
      .append("circle")
      .attr("class", "dot")
      .attr("r", (d) => (d.hasKids ? NODE_R + 2 : NODE_R));

    nodeEnter
      .append("text")
      .attr("class", (d) => (d.kind === "label" ? "section-label" : "node-label"))
      .attr("x", (d) => (d.kind === "child" ? 14 : 0))
      .attr("y", (d) => (d.kind === "label" ? 0 : -(NODE_R + 8)))
      .attr("text-anchor", (d) => (d.kind === "child" ? "start" : "middle"))
      .style("font-size", (d) => (d.kind === "label" ? "11px" : LABEL_SIZE + "px"))
      .text((d) => {
        if (d.kind === "more-up") return d.label;
        if (d.kind === "label") return d.label;
        return labelText(d.data);
      });

    nodeEnter
      .filter((d) => d.kind === "more-up")
      .append("title")
      .text("مزید آباء دکھائیں");

    const nodeUpdate = nodeEnter.merge(nodeSel);
    nodeUpdate.attr("transform", (d) => `translate(${d.x},${d.y})`);
    nodeUpdate
      .select("text.node-label")
      .text((d) => {
        if (d.kind === "more-up") return d.label;
        return labelText(d.data);
      });

    nodeUpdate
      .classed("selected", (d) => d.id === selectedId)
      .classed("highlight", (d) => d.id === searchHighlightId);

    nodeSel.exit().remove();
  }

  function navigateTo(id, options = {}) {
    focusId = id;
    ancestorReveal = ANCESTOR_DEFAULT;
    selectedId = id;

    if (options.fromSearch) {
      searchHighlightId = id;
    } else if (!options.keepHighlight) {
      searchHighlightId = null;
    }

    renderView();

    const data = idToNode.get(id);
    if (data) showDetail(data, options);
  }

  function onNodeActivate(ev, d) {
    ev.preventDefault();
    ev.stopPropagation();

    if (d.kind === "label") return;

    if (d.kind === "more-up") {
      const chain = getChain(focusId);
      const maxPossible = chain.length - 1;
      ancestorReveal = Math.min(ancestorReveal + 1, maxPossible);
      renderView();
      return;
    }

    navigateTo(d.id, { fromTree: true });
  }

  function showDetail(data, options = {}) {
    const parent = data.parentRef ? idToNode.get(data.parentRef) : null;
    const chain = [];
    let cur = data;
    while (cur) {
      chain.unshift(cur.name_urdu || cur.name_en || cur.id);
      cur = cur.parentRef ? idToNode.get(cur.parentRef) : null;
    }

    detailPanel.innerHTML = `
      ${MOBILE ? '<button type="button" class="back-to-tree" id="back-to-tree">↑ درخت پر واپس</button>' : ""}
      <h2>${esc(data.name_urdu || data.id)}</h2>
      <p class="en-name">${esc(data.name_en || "")}</p>
      ${
        parent || data.note
          ? `<dl>
        ${parent ? `<dt>والد</dt><dd>${esc(parent.name_urdu || parent.name_en || parent.id)}</dd>` : ""}
        ${data.note ? `<dt>نوٹ</dt><dd>${esc(data.note)}</dd>` : ""}
      </dl>`
          : ""
      }
      <div class="ancestors">
        <h3>سلسلہ</h3>
        <p class="ancestor-chain">${chain.map(esc).join(" ← ")}</p>
      </div>
    `;

    const backBtn = document.getElementById("back-to-tree");
    if (backBtn) {
      backBtn.addEventListener("click", () => scrollToTreePanel(true));
    }

    if (options.fromTree && MOBILE && !options.fromSearch) {
      detailPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function scrollToTreePanel(smooth) {
    if (treePanel) {
      treePanel.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    }
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function goToRoot() {
    navigateTo(payload.tree.id, { fromTree: true });
    scrollToTreePanel(true);
  }

  function bindControls() {
    document.getElementById("go-root").addEventListener("click", goToRoot);

    document.getElementById("more-ancestors").addEventListener("click", () => {
      const chain = getChain(focusId);
      const maxPossible = chain.length - 1;
      if (ancestorReveal >= maxPossible) return;
      ancestorReveal = Math.min(ancestorReveal + 1, maxPossible);
      renderView();
    });

    document.getElementById("reset-view").addEventListener("click", () => {
      ancestorReveal = ANCESTOR_DEFAULT;
      renderView();
      scrollToTreePanel(true);
    });

    searchInput.addEventListener("input", () => {
      const q = searchInput.value.trim();
      const minLen = /[\u0600-\u06FF]/.test(q) ? 1 : 2;
      if (q.length < minLen) {
        searchResults.classList.add("hidden");
        return;
      }

      const matches = searchPersons(q);

      if (!matches.length) {
        searchResults.innerHTML = `<button type="button" disabled>کوئی نتیجہ نہیں — املا یا جزو نام آزمائیں</button>`;
      } else {
        searchResults.innerHTML = matches
          .map(({ person: n }) => {
            const { primary, enLine } = formatSearchResult(n);
            return `<button type="button" data-id="${esc(n.id)}">${esc(primary)}<span class="en">${esc(enLine)}</span></button>`;
          })
          .join("");
      }
      searchResults.classList.remove("hidden");
    });

    searchResults.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button[data-id]");
      if (!btn) return;
      const person = idToNode.get(btn.dataset.id);
      navigateTo(btn.dataset.id, { fromSearch: true });
      searchResults.classList.add("hidden");
      searchInput.value = person ? person.name_urdu || person.name_en || person.id : "";
      scrollToTreePanel(false);
    });

    document.addEventListener("click", (ev) => {
      if (!searchResults.contains(ev.target) && ev.target !== searchInput) {
        searchResults.classList.add("hidden");
      }
    });

    window.addEventListener(
      "resize",
      debounce(() => {
        if (!payload) return;
        setupSvg();
        renderView();
      }, 250)
    );
  }

  function debounce(fn, ms) {
    let t;
    return () => {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  function init() {
    loadTreeData()
      .then((data) => {
        payload = data;
        document.getElementById("title-urdu").textContent = data.title_urdu || "شجرہ نسب";
        document.getElementById("title-en").textContent = data.title_en || "";
        const footerTitle = document.getElementById("footer-title");
        if (footerTitle) footerTitle.textContent = data.title_urdu || "شجرہ نسب";
        document.getElementById("stats").textContent =
          `${data.stats?.unique_persons || "?"} نام · گہرائی ${data.stats?.max_depth || "?"}`;

        buildIndex(data.tree);
        buildSearchIndex();
        focusId = data.tree.id;
        ancestorReveal = ANCESTOR_DEFAULT;
        setupSvg();
        renderView();
        showDetail(idToNode.get(focusId), {});
        bindControls();
      })
      .catch((err) => {
        detailPanel.innerHTML = `<p class="detail-placeholder">Error: ${esc(err.message)}</p>`;
      });
  }

  init();
})();
