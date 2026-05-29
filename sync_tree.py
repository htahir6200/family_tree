"""
Sync master_tree.json (project root) -> website + CSV exports.

Edit ONLY:  master_tree.json
Then run:   python sync_tree.py
Then:       Ctrl+F5 in browser

The website loads shajrah/data/master_tree.json — not the root file directly.
Running apply_corrections.py also syncs, but CSV values can overwrite your JSON edits.
Use sync_tree.py after direct JSON edits to push changes to the site and refresh CSVs.
"""

import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

# Reuse export helpers from apply_corrections
sys.path.insert(0, str(Path(__file__).parent))
from apply_corrections import export_all_files  # noqa: E402

ROOT = Path(__file__).parent
SOURCE = ROOT / "master_tree.json"
TARGET = ROOT / "shajrah" / "data" / "master_tree.json"


def main():
    if not SOURCE.exists():
        raise SystemExit(f"Missing {SOURCE}")

    with open(SOURCE, encoding="utf-8") as f:
        payload = json.load(f)

    tree = payload["tree"]
    rows = []
    from apply_corrections import flatten

    flat = flatten(tree)
    payload["stats"] = {
        "total_entries": len(flat),
        "unique_persons": len({r["id"] for r in flat}),
        "max_depth": max(r["depth"] for r in flat),
    }

    with open(SOURCE, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(SOURCE, TARGET)
    export_all_files(tree)

    bakhtawar_parent = next((r["parent_id"] for r in flat if r["id"] == "bakhtawar"), None)
    version = {
        "updated": datetime.now().strftime("%Y-%m-%dT%H%M%S"),
        "persons": payload["stats"]["unique_persons"],
        "bakhtawar_parent": bakhtawar_parent,
    }
    version_path = TARGET.parent / "tree_version.json"
    with open(version_path, "w", encoding="utf-8") as f:
        json.dump(version, f, ensure_ascii=False, indent=2)

    print(f"Synced -> {TARGET.relative_to(ROOT)}")
    print(f"Tree version: bakhtawar parent = {bakhtawar_parent}")
    print("Updated all_names_full.csv, all_names_full_new.csv, review_sheet.csv")
    print("Refresh browser: http://localhost:8080/shajrah/  (Ctrl+F5)")


if __name__ == "__main__":
    main()
