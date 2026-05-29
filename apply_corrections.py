"""
Apply edits from CSV or link JSON into master_tree.json (then refresh browser).

Sources:
  python apply_corrections.py                          # review_sheet.csv
  python apply_corrections.py all_names_full_new.csv   # all-names file
  python apply_corrections.py link_corrections.json    # interactive link editor
"""

import csv
import json
import shutil
import sys
from pathlib import Path

OUT = Path(__file__).parent


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
        "node": node,
    })
    for ch in node.get("children") or []:
        flatten(ch, node["id"], depth + 1, rows)
    return rows


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
        print(f"Could not overwrite {path.name} (close Excel?) -> wrote {alt.name}")


def export_all_files(tree):
    rows = [{k: v for k, v in r.items() if k != "node"} for r in flatten(tree)]

    all_names_rows = [{
        "id": r["id"],
        "name_urdu": r["name_urdu"],
        "name_en": r["name_en"],
        "ref": r["ref"],
        "clan": r["clan"],
        "parent_id": r["parent_id"],
        "depth": r["depth"],
        "note": r["note"],
        "la_walad": r["la_walad"],
    } for r in rows]

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

    write_csv(OUT / "all_names_full.csv", list(all_names_rows[0].keys()), all_names_rows)
    write_csv(OUT / "all_names_full_new.csv", list(all_names_rows[0].keys()), all_names_rows)
    write_csv(OUT / "review_sheet.csv", list(review_rows[0].keys()), review_rows)


def parse_row(row, is_review):
    urdu = (row.get("corrected_urdu") or "").strip() if is_review else ""
    en = (row.get("corrected_en") or "").strip() if is_review else ""
    parent = (row.get("corrected_parent_id") or "").strip() if is_review else ""

    return {
        "id": (row.get("id") or "").strip(),
        "name_urdu": urdu or (row.get("name_urdu") or "").strip(),
        "name_en": en or (row.get("name_en") or "").strip(),
        "parent_id": parent or (row.get("parent_id") or "").strip(),
        "ref": (row.get("ref") or "").strip(),
        "clan": (row.get("clan") or "").strip(),
        "note": (row.get("note") or "").strip(),
    }


def apply_parent_moves(tree, parent_map):
    """parent_map: child_id -> new_parent_id (skip empty values)."""
    parent_updates = 0
    for pid, new_parent in parent_map.items():
        if not pid or not new_parent:
            continue

        flat = flatten(tree)
        by_id = {r["id"]: r for r in flat}
        if pid not in by_id:
            print(f"WARN: unknown child '{pid}' — skipped")
            continue

        cur_parent = by_id[pid]["parent_id"]
        if new_parent == cur_parent:
            continue
        if new_parent not in by_id:
            print(f"WARN: unknown parent_id '{new_parent}' for {pid} — skipped")
            continue
        if new_parent == pid:
            print(f"WARN: {pid} cannot be its own parent — skipped")
            continue

        detached = remove_node(tree, pid)
        if not detached:
            print(f"WARN: could not detach {pid}")
            continue

        parent_node = find_node(tree, new_parent)
        if not parent_node:
            print(f"WARN: parent node '{new_parent}' not found for {pid}")
            continue

        parent_node.setdefault("children", []).append(detached)
        parent_updates += 1
        print(f"Moved {pid} -> parent {new_parent}")

    return parent_updates


def main():
    source_name = sys.argv[1] if len(sys.argv) > 1 else "review_sheet.csv"
    source_path = OUT / source_name
    tree_path = OUT / "master_tree.json"

    if not source_path.exists():
        raise SystemExit(f"Missing {source_path}")

    with open(tree_path, encoding="utf-8") as f:
        payload = json.load(f)

    tree = payload["tree"]
    name_updates = 0
    parent_updates = 0

    if source_path.suffix.lower() == ".json":
        with open(source_path, encoding="utf-8") as f:
            data = json.load(f)
        parent_map = data.get("parents") or data.get("parent") or {}
        parent_updates = apply_parent_moves(tree, parent_map)
    else:
        is_review = "review" in source_path.stem
        with open(source_path, encoding="utf-8-sig") as f:
            sheet = [parse_row(r, is_review) for r in csv.DictReader(f)]

        flat = flatten(tree)
        by_id = {r["id"]: r for r in flat}

        for row in sheet:
            pid = row["id"]
            if not pid or pid not in by_id:
                continue

            node = by_id[pid]["node"]
            cur = by_id[pid]
            changed = False

            for field, key in (
                ("name_urdu", "name_urdu"),
                ("name_en", "name_en"),
                ("ref", "ref"),
                ("clan", "clan"),
                ("note", "note"),
            ):
                val = row[field]
                if val and val != (cur.get(key) or node.get(key) or ""):
                    node[key] = val
                    changed = True

            if changed:
                name_updates += 1

        parent_map = {row["id"]: row["parent_id"] for row in sheet if row.get("parent_id")}
        parent_updates = apply_parent_moves(tree, parent_map)

    rows = [{k: v for k, v in r.items() if k != "node"} for r in flatten(tree)]
    payload["stats"] = {
        "total_entries": len(rows),
        "unique_persons": len({r["id"] for r in rows}),
        "max_depth": max(r["depth"] for r in rows),
    }

    with open(tree_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    shutil.copy2(tree_path, web_copy)

    version = {
        "updated": datetime.now().isoformat(timespec="seconds"),
        "persons": payload["stats"]["unique_persons"],
        "bakhtawar_parent": next(
            (r["parent_id"] for r in flat if r["id"] == "bakhtawar"),
            None,
        ),
    }
    version_path = ROOT / "shajrah" / "data" / "tree_version.json"
    with open(version_path, "w", encoding="utf-8") as f:
        json.dump(version, f, ensure_ascii=False, indent=2)

    print(f"Synced -> {TARGET.relative_to(ROOT)}")
    print(f"Updated names/metadata: {name_updates} person(s)")
    print(f"Moved branches: {parent_updates}")
    print("Refresh browser: http://localhost:8080/shajrah/  (Ctrl+F5)")
    if name_updates == 0 and parent_updates == 0:
        print("No differences found between CSV and tree.")


if __name__ == "__main__":
    main()
