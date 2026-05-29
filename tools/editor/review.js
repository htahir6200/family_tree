(function () {
  "use strict";

  let imageIndex = {};
  let allPersons = [];
  let corrections = { persons: {}, pages: {} };
  let currentPhoto = null;

  const imageSelect = document.getElementById("image-select");
  const photoEl = document.getElementById("photo");
  const photoLabel = document.getElementById("photo-label");
  const namesList = document.getElementById("names-list");
  const filterInput = document.getElementById("filter");

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

  const DATA = (window.SHAJRAH_EDITOR && window.SHAJRAH_EDITOR.data) || "../../shajrah/data/";
  const PHOTOS = (window.SHAJRAH_EDITOR && window.SHAJRAH_EDITOR.photos) || "../../";

  function loadTreeData() {
    return fetch(DATA + "tree_version.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { updated: "" }))
      .catch(() => ({ updated: "" }))
      .then((v) =>
        fetch(`${DATA}master_tree.json?v=${encodeURIComponent(v.updated || Date.now())}`, {
          cache: "no-store",
        }).then((r) => r.json())
      );
  }

  function load() {
    return Promise.all([
      fetch(DATA + "image_index.json", { cache: "no-store" }).then((r) => r.json()),
      loadTreeData(),
    ]).then(([idx, treeData]) => {
      imageIndex = idx;
      allPersons = walk(treeData.tree);
      populateImageSelect();
      const first = Object.keys(imageIndex)[0];
      if (first) selectPhoto(first);
    });
  }

  function populateImageSelect() {
    imageSelect.innerHTML = Object.entries(imageIndex)
      .sort((a, b) => (a[1].refs[0] || "").localeCompare(b[1].refs[0] || ""))
      .map(([file, meta]) => {
        const mark = meta.reviewed ? " ✓" : "";
        const refs = (meta.refs || []).join(", ");
        return `<option value="${file}">${refs} — ${meta.label || file}${mark}</option>`;
      })
      .join("");
  }

  function selectPhoto(file) {
    currentPhoto = file;
    imageSelect.value = file;
    const meta = imageIndex[file];
    photoEl.src = `${PHOTOS}${file}`;
    photoLabel.textContent = `${(meta.refs || []).join(" / ")} — ${meta.label || ""}`;
    renderNamesForRefs(meta.refs || []);
  }

  function renderNamesForRefs(refs) {
    const q = filterInput.value.trim().toLowerCase();
    let persons = allPersons.filter((p) => refs.some((r) => String(p.ref) === String(r)));

    if (q) {
      persons = persons.filter(
        (p) =>
          (p.name_urdu && p.name_urdu.includes(q)) ||
          (p.name_en && p.name_en.toLowerCase().includes(q)) ||
          p.id.toLowerCase().includes(q)
      );
    }

    if (!persons.length) {
      namesList.innerHTML = `<p class="empty-msg">اس صفحے کے لیے کوئی نام نہیں ملا (ref: ${refs.join(", ")})</p>`;
      return;
    }

    const parentOptions = allPersons
      .map((p) => `<option value="${p.id}">${p.name_urdu || p.name_en || p.id}</option>`)
      .join("");

    namesList.innerHTML = persons
      .map((p) => {
        const c = corrections.persons[p.id] || {};
        const urdu = c.name_urdu ?? p.name_urdu;
        const en = c.name_en ?? p.name_en;
        const parent = c.parent_id ?? p.parent_id;
        return `
          <div class="name-card" data-id="${p.id}">
            <h3>${p.name_urdu || p.id}</h3>
            <label>اردو نام<input type="text" data-field="name_urdu" value="${esc(urdu)}" /></label>
            <label>English<input type="text" data-field="name_en" value="${esc(en)}" dir="ltr" /></label>
            <label>والد<select data-field="parent_id">${parentOptions.replace(`value="${parent}"`, `value="${parent}" selected`)}</select></label>
            <p class="meta">id: ${p.id} · ref: ${p.ref || "—"} · والد: ${p.parent_id}</p>
          </div>`;
      })
      .join("");

    namesList.querySelectorAll(".name-card input, .name-card select").forEach((el) => {
      el.addEventListener("change", onFieldChange);
    });
  }

  function onFieldChange(ev) {
    const card = ev.target.closest(".name-card");
    const id = card.dataset.id;
    if (!corrections.persons[id]) corrections.persons[id] = { id };
    corrections.persons[id][ev.target.dataset.field] = ev.target.value;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  imageSelect.addEventListener("change", () => selectPhoto(imageSelect.value));
  filterInput.addEventListener("input", () => {
    if (currentPhoto) selectPhoto(currentPhoto);
  });

  document.getElementById("mark-reviewed").addEventListener("click", () => {
    if (!currentPhoto) return;
    imageIndex[currentPhoto].reviewed = true;
    corrections.pages[currentPhoto] = { reviewed: true };
    populateImageSelect();
  });

  document.getElementById("download-json").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(corrections, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "corrections.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  load().catch((err) => {
    namesList.innerHTML = `<p class="empty-msg">Error: ${err.message}</p>`;
  });
})();
