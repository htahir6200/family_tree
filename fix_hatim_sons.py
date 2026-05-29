"""Add Hatim's three sons per page 5039: Jamal, Muhammad Ali, Bakhtawar."""

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


def remove_child_by_id(node, child_id):
    children = node.get("children")
    if not children:
        return None
    for i, ch in enumerate(children):
        if ch.get("id") == child_id:
            return children.pop(i)
    for ch in children:
        removed = remove_child_by_id(ch, child_id)
        if removed:
            return removed
    return None


def walk(node, parent_id="", depth=0, rows=None):
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
        walk(ch, node["id"], depth + 1, rows)
    return rows


def write_csv(path_obj, fieldnames, data_rows):
    try:
        with open(path_obj, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            w.writerows(data_rows)
    except PermissionError:
        alt = path_obj.with_stem(path_obj.stem + "_new")
        with open(alt, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            w.writerows(data_rows)
        print(f"Could not write {path_obj.name} -> wrote {alt.name}")


def main():
    tree_path = OUT / "master_tree.json"
    detached_path = OUT / "detached_branches.json"

    with open(tree_path, encoding="utf-8") as f:
        payload = json.load(f)

    with open(detached_path, encoding="utf-8") as f:
        detached = json.load(f)

    hashim = next(b for b in detached["branches"] if b["id"] == "hashim_nasir")
    jamal_h = next(c for c in hashim["children"] if c["id"] == "jamal_h")

    tree = payload["tree"]
    hatim = find_node(tree, "hatim")
    if not hatim:
        raise SystemExit("hatim node not found")

    muhammad_ali = find_node(hatim, "muhammad_ali_hatim")
    if not muhammad_ali:
        raise SystemExit("muhammad_ali_hatim not found under hatim")

    bakhtawar = remove_child_by_id(muhammad_ali, "bakhtawar")
    if not bakhtawar:
        raise SystemExit("bakhtawar not found under muhammad_ali_hatim")

    bakhtawar["name_urdu"] = "بختاور یا بہادر بن حاتم"
    bakhtawar["name_en"] = "Bakhtawar ya Bahadur bin Hatim"
    bakhtawar["ref"] = "5050"
    bakhtawar["clan"] = "ملتان میر"
    bakhtawar.pop("note", None)

    jamal_copy = deepcopy(jamal_h)
    jamal_copy["ref"] = "5039"
    jamal_copy["note"] = "ملکان مری — شاخ جمال"

    hatim["children"] = [
        jamal_copy,
        muhammad_ali,
        bakhtawar,
    ]

    rows = walk(tree)
    payload["tree"] = tree
    payload["stats"] = {
        "total_entries": len(rows),
        "unique_persons": len({r["id"] for r in rows}),
        "max_depth": max(r["depth"] for r in rows),
    }

    with open(tree_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    shutil.copy(tree_path, OUT / "shajrah" / "data" / "master_tree.json")

    review_rows = [{
        "status": "pending",
        "id": r["id"],
        "name_urdu": r["name_urdu"],
        "name_en": r["name_en"],
        "parent_id": r["parent_id"],
        "parent_urdu": next((x["name_urdu"] for x in rows if x["id"] == r["parent_id"]), ""),
        "ref": r["ref"],
        "clan": r["clan"],
        "depth": r["depth"],
        "note": r["note"],
        "corrected_urdu": "",
        "corrected_en": "",
        "corrected_parent_id": "",
        "reviewer_notes": "",
    } for r in rows]

    write_csv(OUT / "review_sheet.csv", list(review_rows[0].keys()), review_rows)
    write_csv(OUT / "all_names_full.csv", list(rows[0].keys()), rows)

    sons = [c["name_urdu"] for c in hatim["children"]]
    print(f"Hatim now has {len(sons)} sons:")
    for s in sons:
        print(f"  - {s}")
    print(f"Total: {payload['stats']['unique_persons']} persons")


if __name__ == "__main__":
    main()
