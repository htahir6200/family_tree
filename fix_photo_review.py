"""
Fix Hatim's 3 sons (page 5039) and related photo-verified structure errors.
"""

import csv
import json
import shutil
from copy import deepcopy
from pathlib import Path

OUT = Path(__file__).parent


def find_node(node, node_id):
    if node.get("id") == node_id:
        return node
    for ch in node.get("children") or []:
        found = find_node(ch, node_id)
        if found:
            return found
    return None


def remove_node(node, node_id):
    children = node.get("children")
    if not children:
        return None
    for i, ch in enumerate(children):
        if ch.get("id") == node_id:
            return children.pop(i)
    for ch in children:
        removed = remove_node(ch, node_id)
        if removed:
            return removed
    return None


def flatten(node, parent_id="", depth=0, rows=None):
    if rows is None:
        rows = []
    rows.append({
        "id": node["id"],
        "name_urdu": node.get("name_urdu", ""),
        "name_en": node.get("name_en", ""),
        "ref": node.get("ref", ""),
        "clan": node.get("clan", ""),
        "parent_id": parent_id,
        "depth": depth,
        "note": node.get("note", ""),
        "la_walad": node.get("la_walad", False),
    })
    for ch in node.get("children") or []:
        flatten(ch, node["id"], depth + 1, rows)
    return rows


def write_csv(path, fieldnames, rows):
    try:
        with open(path, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            w.writerows(rows)
    except PermissionError:
        alt = path.with_stem(path.stem + "_applied")
        with open(alt, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            w.writerows(rows)
        print(f"Could not write {path.name} -> {alt.name}")


def export_all(tree):
    rows = flatten(tree)
    all_rows = [{
        "id": r["id"], "name_urdu": r["name_urdu"], "name_en": r["name_en"],
        "ref": r["ref"], "clan": r["clan"], "parent_id": r["parent_id"],
        "depth": r["depth"], "note": r["note"], "la_walad": r["la_walad"],
    } for r in rows]
    review_rows = [{
        "status": "pending", "id": r["id"], "name_urdu": r["name_urdu"],
        "name_en": r["name_en"], "parent_id": r["parent_id"],
        "parent_urdu": next((x["name_urdu"] for x in rows if x["id"] == r["parent_id"]), ""),
        "ref": r["ref"], "clan": r["clan"], "depth": r["depth"], "note": r["note"],
        "corrected_urdu": "", "corrected_en": "", "corrected_parent_id": "", "reviewer_notes": "",
    } for r in rows]
    write_csv(OUT / "all_names_full.csv", list(all_rows[0].keys()), all_rows)
    write_csv(OUT / "all_names_full_new.csv", list(all_rows[0].keys()), all_rows)
    write_csv(OUT / "review_sheet.csv", list(review_rows[0].keys()), review_rows)


def main():
    path = OUT / "master_tree.json"
    with open(path, encoding="utf-8") as f:
        payload = json.load(f)

    tree = payload["tree"]
    fixes = []

    # --- 1. Hatim: three sons per page 5039 (Jamal, Muhammad Ali, Bakhtawar) ---
    hatim = find_node(tree, "hatim")
    hatim["name_urdu"] = "حاتم بن نامہ"
    hatim["name_en"] = "Hatim bin Nama"

    bakhtawar = remove_node(tree, "bakhtawar")
    if bakhtawar:
        bakhtawar["name_urdu"] = "بختاور یا بہادر بن حاتم"
        bakhtawar["name_en"] = "Bakhtawar ya Bahadur bin Hatim"
        bakhtawar["ref"] = "5050"
        bakhtawar["clan"] = "ملتان میر"
        bakhtawar.pop("note", None)
        fixes.append("Moved Bakhtawar to Hatim (3rd son, page 5039/5050)")

    mir_sultan = remove_node(tree, "mir_sultan_mk")
    if mir_sultan:
        abdul_rehman_jd = find_node(tree, "abdul_rehman_jd")
        if abdul_rehman_jd is not None:
            abdul_rehman_jd["children"] = [mir_sultan]
            fixes.append("Moved Mir Sultan under Abdul Rahman (Jamaluddin branch, page 5049/5046)")
        else:
            ma = find_node(tree, "muhammad_ali_hatim")
            if ma:
                ma.setdefault("children", []).append(mir_sultan)
            fixes.append("WARN: abdul_rehman_jd not found; Mir Sultan left under Muhammad Ali")

    jamal = find_node(tree, "jamal_h")
    muhammad_ali = find_node(tree, "muhammad_ali_hatim")
    if hatim:
        sons = []
        if jamal:
            sons.append(jamal)
        if muhammad_ali:
            sons.append(muhammad_ali)
        if bakhtawar:
            sons.append(bakhtawar)
        hatim["children"] = sons

    # Muhammad Ali direct sons: Nadir, Jamaluddin, Ahmad Gul only (page 5041)
    if muhammad_ali:
        muhammad_ali["name_urdu"] = "محمد علی بن حاتم"
        allowed = {"nadir", "jamaluddin", "ahmad_gul"}
        muhammad_ali["children"] = [
            ch for ch in muhammad_ali.get("children", []) if ch.get("id") in allowed
        ]

    # --- 2. Jamaluddin: 5 sons per page 5049 ---
    jamaluddin = find_node(tree, "jamaluddin")
    if jamaluddin:
        # Pull misplaced nodes out of nested ahmad_ali_jd wrapper
        ahmad_ali_jd = find_node(tree, "ahmad_ali_jd")
        extracted = {}
        if ahmad_ali_jd:
            kids = ahmad_ali_jd.get("children") or []
            for kid in kids:
                extracted[kid["id"]] = kid
            # Shah Wali line stays under Ahmad Ali
            shahwali = extracted.get("shahwali")
            if shahwali:
                ahmad_ali_jd["children"] = [shahwali]
            else:
                ahmad_ali_jd["children"] = []

        mai_wali = extracted.get("mayoli") or {
            "id": "mayoli", "name_urdu": "مای ولی", "name_en": "Mai Wali", "children": []
        }
        mai_wali["name_urdu"] = "مای ولی"
        mai_wali["name_en"] = "Mai Wali"
        mai_children = []
        for cid in ("khadim_ahmad", "haji_ahmad"):
            if cid in extracted:
                mai_children.append(extracted[cid])
        if mai_children:
            mai_wali["children"] = mai_children

        abdul_rehman_jd = find_node(tree, "abdul_rehman_jd") or extracted.get("abdul_rehman_jd")
        if abdul_rehman_jd and mir_sultan:
            abdul_rehman_jd["children"] = [mir_sultan]

        new_children = []
        for cid in ("gul_jd",):
            if cid in extracted:
                new_children.append(extracted[cid])
        if abdul_rehman_jd:
            new_children.append(abdul_rehman_jd)
        new_children.append(mai_wali)
        if "qasim_ali" in extracted:
            new_children.append(extracted["qasim_ali"])
        if ahmad_ali_jd:
            new_children.append(ahmad_ali_jd)

        # Remove bashir_ahmad wrongly placed under jamaluddin (belongs under Faiz Alam / Kalu)
        jamaluddin["children"] = [c for c in new_children if c.get("id") != "bashir_ahmad_jd"]
        remove_node(tree, "bashir_ahmad_jd")
        fixes.append("Restructured Jamaluddin sons per page 5049")

    # --- 3. Jamal branch: Kamal Khan spelling (5039) ---
    kale = find_node(tree, "kale_khan")
    if kale:
        kale["name_urdu"] = "کمال خان"
        kale["name_en"] = "Kamal Khan"

    rows = flatten(tree)
    payload["tree"] = tree
    payload["stats"] = {
        "total_entries": len(rows),
        "unique_persons": len({r["id"] for r in rows}),
        "max_depth": max(r["depth"] for r in rows),
    }
    payload["photo_review_note"] = "2026-05-28: Hatim 3 sons; Mir Sultan under Jamaluddin; Jamaluddin sons fixed"

    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    shutil.copy(path, OUT / "shajrah" / "data" / "master_tree.json")
    export_all(tree)

    hatim_sons = [c["id"] for c in find_node(tree, "hatim").get("children", [])]
    ma_sons = [c["id"] for c in find_node(tree, "muhammad_ali_hatim").get("children", [])]

    print("Fixes applied:")
    for fx in fixes:
        print(f"  - {fx}")
    print(f"Hatim sons: {hatim_sons}")
    print(f"Muhammad Ali sons: {ma_sons}")
    print(f"Total persons: {payload['stats']['unique_persons']}")


if __name__ == "__main__":
    main()
