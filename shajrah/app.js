(function () {
  "use strict";

  const MOBILE = window.matchMedia("(max-width: 900px)").matches;
  const NODE_W = MOBILE ? 14 : 18;
  const NODE_H = MOBILE ? 88 : 120;
  const NODE_R = MOBILE ? 14 : 10;
  const LABEL_SIZE = MOBILE ? 13 : 12;
  const DURATION = 300;

  let payload, rootHierarchy, svg, g, zoom, treeLayout;
  let allNodes = [];
  let searchIndex = [];
  let idToNode = new Map();
  let selectedId = null;
  let searchHighlightId = null;

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

  /** Normalize Urdu/English for flexible matching. */
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

  function setupSvg() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || Math.max(320, window.innerHeight * 0.45);
    svg = d3.select(svgEl).attr("width", w).attr("height", h);
    svg.selectAll("*").remove();
    g = svg.append("g").attr("transform", `translate(${MOBILE ? 48 : 80},56)`);

    zoom = d3
      .zoom()
      .scaleExtent([0.15, 3])
      .filter(zoomFilter)
      .on("zoom", (ev) => g.attr("transform", ev.transform));

    svg.call(zoom);
    treeLayout = d3.tree().nodeSize([NODE_H, NODE_W * 8]);

    if (MOBILE) {
      svg.call(zoom.transform, d3.zoomIdentity.translate(40, 40).scale(0.85));
    }
  }

  function zoomFilter(event) {
    if (event.type === "wheel") return true;
    if (event.ctrlKey || event.metaKey) return true;
    const target = event.target;
    if (target.closest && target.closest("g.node")) return false;
    return event.type === "mousedown" || event.type === "touchstart";
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

  function hasHidden(d) {
    return !!(d._children || (d.children && d.children.length));
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

  function selectNode(d, options = {}) {
    selectedId = d.data.id;
    if (options.fromSearch) {
      searchHighlightId = selectedId;
    } else if (!options.keepHighlight) {
      searchHighlightId = null;
    }
    showDetail(d.data, options);
    g.selectAll("g.node")
      .classed("selected", (n) => n.data.id === selectedId)
      .classed("highlight", (n) => n.data.id === searchHighlightId);
  }

  function onNodeActivate(ev, d) {
    ev.preventDefault();
    ev.stopPropagation();
    if (hasHidden(d)) toggle(d);
    selectNode(d, { fromTree: true });
  }

  function update(source) {
    const treeData = treeLayout(rootHierarchy);
    const nodes = treeData.descendants();
    const links = treeData.links();

    const height = Math.max(container.clientHeight || 320, nodes.length * NODE_H + 100);
    const width = Math.max(
      container.clientWidth || 320,
      (d3.max(nodes, (d) => d.depth) || 0) * NODE_W * 8 + (MOBILE ? 120 : 200)
    );
    svg.attr("width", width).attr("height", height);

    nodes.forEach((d) => (d.y = d.depth * NODE_W * 8));

    const node = g.selectAll("g.node").data(nodes, (d) => d.data.id);

    const nodeEnter = node
      .enter()
      .append("g")
      .attr("class", (d) => "node" + (hasHidden(d) ? " has-children" : ""))
      .attr("transform", () => `translate(${source.y0 || 0},${source.x0 || 0})`)
      .on("click", onNodeActivate);

    nodeEnter.append("circle").attr("class", "hit").attr("r", NODE_R + 8).attr("cy", 0);
    nodeEnter.append("circle").attr("class", "dot").attr("r", NODE_R).attr("cy", 0);
    nodeEnter
      .append("text")
      .attr("class", "node-label")
      .attr("x", 0)
      .attr("y", -(NODE_R + 6))
      .attr("text-anchor", "middle")
      .style("font-size", LABEL_SIZE + "px")
      .text((d) => labelText(d.data));

    const nodeUpdate = nodeEnter.merge(node);
    nodeUpdate
      .transition()
      .duration(DURATION)
      .attr("transform", (d) => `translate(${d.y},${d.x})`);
    nodeUpdate.attr("class", (d) => "node" + (hasHidden(d) ? " has-children" : ""));
    nodeUpdate.select("circle.hit").attr("r", NODE_R + 8);
    nodeUpdate.select("circle.dot").attr("r", (d) => (hasHidden(d) ? NODE_R + 2 : NODE_R));
    nodeUpdate
      .select("text.node-label")
      .attr("y", -(NODE_R + 6))
      .text((d) => labelText(d.data));
    nodeUpdate.classed("selected", (d) => d.data.id === selectedId);
    nodeUpdate.classed("highlight", (d) => d.data.id === searchHighlightId);

    node.exit().transition().duration(DURATION).remove();

    const link = g.selectAll("path.link").data(links, (d) => d.target.data.id);
    const linkEnter = link
      .enter()
      .insert("path", "g")
      .attr("class", "link")
      .attr("d", () =>
        diagonal({ x: source.x0 || 0, y: source.y0 || 0 }, { x: source.x0 || 0, y: source.y0 || 0 })
      );

    linkEnter.merge(link).transition().duration(DURATION).attr("d", (d) => diagonal(d.source, d.target));
    link.exit().transition().duration(DURATION).remove();

    nodes.forEach((d) => {
      d.x0 = d.x;
      d.y0 = d.y;
    });

    return nodes;
  }

  function labelText(data) {
    const name = data.name_urdu || data.name_en || data.id || "";
    const max = MOBILE ? 18 : 24;
    return name.length > max ? name.slice(0, max) + "…" : name;
  }

  function diagonal(s, t) {
    return `M ${s.y} ${s.x} C ${(s.y + t.y) / 2} ${s.x}, ${(s.y + t.y) / 2} ${t.x}, ${t.y} ${t.x}`;
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
      <dl>
        <dt>شناخت</dt><dd dir="ltr">${esc(data.id)}</dd>
        ${data.ref ? `<dt>صفحہ</dt><dd>${esc(data.ref)}</dd>` : ""}
        ${data.clan ? `<dt>قبیلہ</dt><dd>${esc(data.clan)}</dd>` : ""}
        ${parent ? `<dt>والد</dt><dd>${esc(parent.name_urdu || parent.name_en || parent.id)}</dd>` : ""}
        ${data.note ? `<dt>نوٹ</dt><dd>${esc(data.note)}</dd>` : ""}
      </dl>
      <div class="ancestors">
        <h3>سلسلہ</h3>
        <p class="ancestor-chain">${chain.map(esc).join(" ← ")}</p>
      </div>
    `;

    const backBtn = document.getElementById("back-to-tree");
    if (backBtn) {
      backBtn.addEventListener("click", () => scrollToTreePanel(true));
    }

    // Never auto-jump away from tree on search — user scrolls to details themselves
    if (options.fromTree && MOBILE && !options.fromSearch) {
      detailPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function scrollToTreePanel(smooth) {
    if (treePanel) {
      treePanel.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    }
    window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
  }

  /** Pan/zoom so the node sits in the centre of the tree view. */
  function focusOnNode(d) {
    if (!d || !svg || !zoom) return;

    if (treePanel) {
      treePanel.scrollIntoView({ behavior: "auto", block: "nearest" });
    }

    const panelW = container.clientWidth;
    const panelH = container.clientHeight;
    const k = MOBILE ? 1.15 : 1.25;
    const tx = panelW / 2 - k * d.y;
    const ty = panelH / 2 - k * d.x;
    const transform = d3.zoomIdentity.translate(tx, ty).scale(k);

    const centerScroll = () => {
      const nodeX = k * d.y + tx;
      const nodeY = k * d.x + ty;
      container.scrollLeft = Math.max(0, nodeX - panelW / 2);
      container.scrollTop = Math.max(0, nodeY - panelH / 2);
    };

    svg
      .interrupt()
      .transition()
      .duration(500)
      .call(zoom.transform, transform)
      .on("end", () => {
        centerScroll();
        requestAnimationFrame(centerScroll);
      });
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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

    const found = rootHierarchy.descendants().find((d) => d.data.id === targetId);
    if (!found) return;

    selectedId = targetId;
    update(rootHierarchy);
    selectNode(found, { fromSearch: true });

    setTimeout(() => focusOnNode(found), DURATION + 80);
  }

  function resetView() {
    scrollToTreePanel(true);
    const t = MOBILE
      ? d3.zoomIdentity.translate(40, 40).scale(0.85)
      : d3.zoomIdentity.translate(80, 56);
    svg.transition().duration(400).call(zoom.transform, t);
    container.scrollTop = 0;
    container.scrollLeft = 0;
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
    document.getElementById("reset-view").addEventListener("click", resetView);

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
      revealPath(btn.dataset.id);
      searchResults.classList.add("hidden");
      searchInput.value = person ? person.name_urdu || person.name_en || person.id : "";
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
        update(rootHierarchy);
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
        setupSvg();
        rootHierarchy = d3.hierarchy(data.tree);
        collapseDeep(rootHierarchy, 1);
        update(rootHierarchy);
        bindControls();
      })
      .catch((err) => {
        detailPanel.innerHTML = `<p class="detail-placeholder">Error: ${esc(err.message)}</p>`;
      });
  }

  init();
})();
