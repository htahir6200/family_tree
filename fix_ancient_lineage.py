"""
Rebuild ancient lineage (Qutub Haider → Hatim) per user correction,
attach Muhammad Ali bin Hatim under Hatim, preserve Barkhurdar descendants.
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


def extract_subtree(node, node_id):
    n = find_node(node, node_id)
    return deepcopy(n) if n else None


def n(_id, urdu, english="", ref="", note=""):
    d = {"id": _id, "name_urdu": urdu, "name_en": english}
    if ref:
        d["ref"] = ref
    if note:
        d["note"] = note
    return d


def branch(base, children=None):
    out = dict(base)
    if children:
        out["children"] = children
    return out


def build_ancient_lineage(barkhurdar_children, muhammad_ali_hatim_subtree):
    """User-verified chain: 1–21 then Muhammad Ali bin Hatim."""
    return branch(
        n("qutub_haider", "قطب حیدر شاہ (ملک غازی)", "Qutub Haider Shah", "5038"),
        [
            branch(n("muzammal_ali", "موزمل علی", "Muzammal Ali"), [
                branch(n("karam_ali", "کرم علی", "Karam Ali"), [
                    branch(n("salamat_ali", "سلامت علی", "Salamat Ali"), [
                        branch(n("jalal", "جلال", "Jalal"), [
                            branch(n("badal_jaral", "بدل جرعل", "Badal Jaral", note="گوشہ جرعل"), [
                                branch(n("sair", "سیر", "Sair"), [
                                    branch(n("ladha", "لدھا", "Ladha"), [
                                        branch(n("momin", "مومن", "Momin"), [
                                            branch(n("tota", "طوطا", "Toota"), [
                                                branch(n("bin_a", "بن", "Bin"), [
                                                    branch(n("qull", "قل", "Qull"), [
                                                        branch(n("joogi", "جوگی", "Joogi"), [
                                                            branch(n("makhan", "مکھن", "Makhan"), [
                                                                branch(n("lasso", "لاسو", "Lasso"), [
                                                                    branch(n("saddo", "صدو", "Saddo"), [
                                                                        branch(n("kala", "کالا", "Kala"), [
                                                                            branch(n("khushhal", "خوشحال (عرف کشال)", "Khushhal"), [
                                                                                branch(n("misri", "مصری", "Misri"), [
                                                                                    branch(n("nama", "نامہ", "Nama"), [
                                                                                        branch(
                                                                                            n("hatim", "حاتم", "Hatim", "5039"),
                                                                                            [muhammad_ali_hatim_subtree] if muhammad_ali_hatim_subtree else [],
                                                                                        )
                                                                                    ])
                                                                                ])
                                                                            ]),
                                                                            branch(
                                                                                n("barkhurdar", "برخوردار (عرف پرخورہ)", "Barkhurdar", "5059"),
                                                                                barkhurdar_children or [],
                                                                            ),
                                                                        ])
                                                                    ])
                                                                ])
                                                            ])
                                                        ])
                                                    ])
                                                ])
                                            ])
                                        ])
                                    ])
                                ]),
                                branch(n("mabban", "مبن", "Mabban"), []),
                            ])
                        ])
                    ]),
                    branch(n("malik_muhammad_mehr", "ملک محمد مہر", "Malik Muhammad Mehr"), []),
                ])
            ])
        ],
    )


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


def walk(node, parent_id=None, depth=0, rows=None):
    if rows is None:
        rows = []
    rows.append({
        "id": node["id"],
        "name_urdu": node.get("name_urdu", ""),
        "name_en": node.get("name_en", ""),
        "ref": node.get("ref", ""),
        "clan": node.get("clan", ""),
        "parent_id": parent_id or "",
        "depth": depth,
        "note": node.get("note", ""),
        "la_walad": node.get("la_walad", False),
    })
    for ch in node.get("children") or []:
        walk(ch, node["id"], depth + 1, rows)
    return rows


def main():
    path = OUT / "master_tree.json"
    with open(path, encoding="utf-8") as f:
        payload = json.load(f)

    tree = payload["tree"]

    barkhurdar_node = extract_subtree(tree, "barkhurdar")
    barkhurdar_children = barkhurdar_node.get("children", []) if barkhurdar_node else []

    muhammad_ali = remove_child_by_id(tree, "muhammad_ali_hatim")
    if not muhammad_ali:
        muhammad_ali = extract_subtree(tree, "muhammad_ali_hatim")

    # Replace first root child (qutub lineage)
    for i, ch in enumerate(tree.get("children", [])):
        if ch.get("id") == "qutub_haider":
            tree["children"][i] = build_ancient_lineage(barkhurdar_children, muhammad_ali)
            break

    rows = walk(tree)
    payload["tree"] = tree
    payload["stats"] = {
        "total_entries": len(rows),
        "unique_persons": len({r["id"] for r in rows}),
        "max_depth": max(r["depth"] for r in rows),
    }
    payload["ancient_lineage_note"] = "Corrected 2026-05-28: Qutub Haider → Hatim → Muhammad Ali bin Hatim"

    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

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
            print(f"Could not write {path_obj.name} (file open?) -> wrote {alt.name}")

    write_csv(OUT / "all_names_full.csv", list(rows[0].keys()), rows)

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
    } for r in rows if r["id"] != "root"]
    write_csv(OUT / "review_sheet.csv", list(review_rows[0].keys()), review_rows)

    shajrah = OUT / "shajrah" / "data" / "master_tree.json"
    if shajrah.parent.exists():
        shutil.copy(path, shajrah)

    print(f"Ancient lineage rebuilt. {payload['stats']['unique_persons']} persons, depth {payload['stats']['max_depth']}")
    print("Chain: qutub_haider -> ... -> hatim -> muhammad_ali_hatim")


if __name__ == "__main__":
    main()
