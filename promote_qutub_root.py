"""Make Qutub Haider the tree root; detach Hashim and Khair Awan branches."""

import csv
import json
import shutil
from pathlib import Path

OUT = Path(__file__).parent


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
    path = OUT / "master_tree.json"
    with open(path, encoding="utf-8") as f:
        payload = json.load(f)

    children = payload["tree"].get("children", [])
    qutub = next((c for c in children if c["id"] == "qutub_haider"), None)
    if not qutub:
        raise SystemExit("qutub_haider not found under root")

    removed = [c for c in children if c["id"] != "qutub_haider"]
    with open(OUT / "detached_branches.json", "w", encoding="utf-8") as f:
        json.dump(
            {
                "note": "Hashim and Khair Awan branches removed from main tree",
                "branches": removed,
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    payload["tree"] = qutub
    payload["title_urdu"] = "شجرہ نسب — قطب حیدر شاہ"
    payload["title_en"] = "Qutub Haider Shah Lineage"
    payload.pop("ancient_lineage_note", None)

    rows = walk(qutub)
    payload["stats"] = {
        "total_entries": len(rows),
        "unique_persons": len({r["id"] for r in rows}),
        "max_depth": max(r["depth"] for r in rows),
    }

    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    shutil.copy(path, OUT / "shajrah" / "data" / "master_tree.json")

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

    print(f"Root is now qutub_haider: {payload['stats']['unique_persons']} persons, depth {payload['stats']['max_depth']}")
    print(f"Removed {len(removed)} branches (saved in detached_branches.json)")


if __name__ == "__main__":
    main()
