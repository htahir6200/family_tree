"""Merge duplicate Bakhtawar: move Hatim's bakhtawar subtree under Muhammad Ali."""

import json
import shutil
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).parent


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


def main():
    tree_path = ROOT / "master_tree.json"
    backup_dir = ROOT / "backups"
    backup_dir.mkdir(exist_ok=True)
    ts = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    shutil.copy2(tree_path, backup_dir / f"master_tree_{ts}.json")

    with open(tree_path, encoding="utf-8") as f:
        payload = json.load(f)

    tree = payload["tree"]

    bakhtawar = remove_node(tree, "bakhtawar")
    if not bakhtawar:
        raise SystemExit("bakhtawar node not found")

    stub = remove_node(tree, "child_muhammad_ali")
    if stub:
        print("Removed stub child_muhammad_ali placeholder")

    muhammad_ali = find_node(tree, "muhammad_ali_hatim")
    if not muhammad_ali:
        raise SystemExit("muhammad_ali_hatim not found")

    bakhtawar["name_urdu"] = "بختاور یا بہادر بن محمد علی"
    bakhtawar["name_en"] = "Bakhtawar bin Muhammad Ali"
    bakhtawar["ref"] = "5050"
    bakhtawar["clan"] = "ملتان میر"
    bakhtawar.pop("note", None)

    muhammad_ali.setdefault("children", []).append(bakhtawar)

    # Hatim should now have only Jamal + Muhammad Ali (not Bakhtawar as direct son)
    hatim = find_node(tree, "hatim")
    if hatim:
        sons = [c.get("id") for c in hatim.get("children") or []]
        print("Hatim sons now:", sons)

    with open(tree_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    import sync_tree

    sync_tree.main()
    print("Done: Bakhtawar + Kalu tree now under Muhammad Ali bin Hatim")


if __name__ == "__main__":
    main()
