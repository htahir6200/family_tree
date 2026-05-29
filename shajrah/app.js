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
  let idToNode = new Map();
  let selectedId = null;

  const container = document.getElementById("tree-container");
  const svgEl = document.getElementById("tree-svg");
  const detailPanel = document.getElementById("detail-panel");
  const searchInput = document.getElementById("search");
  const searchResults = document.getElementById("search-results");

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

  /** Pan/zoom on empty background only — taps on nodes expand/select. */
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

  function selectNode(d) {
    selectedId = d.data.id;
    showDetail(d.data);
    g.selectAll("g.node").classed("selected", (n) => n.data.id === selectedId);
    if (MOBILE && detailPanel) {
      detailPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function onNodeActivate(ev, d) {
    ev.preventDefault();
    ev.stopPropagation();
    if (hasHidden(d)) toggle(d);
    selectNode(d);
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
  }

  function labelText(data) {
    const name = data.name_urdu || data.name_en || data.id || "";
    const max = MOBILE ? 18 : 24;
    return name.length > max ? name.slice(0, max) + "…" : name;
  }

  function diagonal(s, t) {
    return `M ${s.y} ${s.x} C ${(s.y + t.y) / 2} ${s.x}, ${(s.y + t.y) / 2} ${t.x}, ${t.y} ${t.x}`;
  }

  function showDetail(data) {
    const parent = data.parentRef ? idToNode.get(data.parentRef) : null;
    const chain = [];
    let cur = data;
    while (cur) {
      chain.unshift(cur.name_urdu || cur.name_en || cur.id);
      cur = cur.parentRef ? idToNode.get(cur.parentRef) : null;
    }

    detailPanel.innerHTML = `
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
    update(rootHierarchy);

    const found = rootHierarchy.descendants().find((d) => d.data.id === targetId);
    if (found) {
      selectNode(found);
      g.selectAll("g.node").classed("highlight", (d) => d.data.id === targetId);
      setTimeout(() => g.selectAll("g.node").classed("highlight", false), 2500);
    }
  }

  function resetView() {
    const t = MOBILE
      ? d3.zoomIdentity.translate(40, 40).scale(0.85)
      : d3.zoomIdentity.translate(80, 56);
    svg.transition().duration(400).call(zoom.transform, t);
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
      const q = searchInput.value.trim().toLowerCase();
      if (q.length < 2) {
        searchResults.classList.add("hidden");
        return;
      }
      const matches = allNodes
        .filter(
          (n) =>
            (n.name_urdu && n.name_urdu.includes(q)) ||
            (n.name_en && n.name_en.toLowerCase().includes(q)) ||
            n.id.toLowerCase().includes(q)
        )
        .slice(0, 20);

      searchResults.innerHTML = matches.length
        ? matches
            .map(
              (n) =>
                `<button type="button" data-id="${esc(n.id)}">${esc(n.name_urdu || n.name_en)}<span class="en">${esc(n.name_en || n.id)}</span></button>`
            )
            .join("")
        : `<button type="button">کوئی نتیجہ نہیں</button>`;
      searchResults.classList.remove("hidden");
    });

    searchResults.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button[data-id]");
      if (!btn) return;
      revealPath(btn.dataset.id);
      searchResults.classList.add("hidden");
      searchInput.value = "";
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
        setupSvg();
        rootHierarchy = d3.hierarchy(data.tree);
        collapseDeep(rootHierarchy, MOBILE ? 1 : 1);
        update(rootHierarchy);
        bindControls();
      })
      .catch((err) => {
        detailPanel.innerHTML = `<p class="detail-placeholder">Error: ${esc(err.message)}</p>`;
      });
  }

  init();
})();
