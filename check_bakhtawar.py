import json
from pathlib import Path
from collections import defaultdict

root = Path(__file__).parent
tree = json.load(open(root / "master_tree.json", encoding="utf-8"))["tree"]
idx = json.load(open(root / "shajrah/data/image_index.json", encoding="utf-8"))


def walk(n, p="", l=None):
    if l is None:
        l = []
    if n["id"] != "root":
        l.append({"id": n["id"], "ref": str(n.get("ref", "")), "parent": p, "name": n.get("name_urdu", "")})
    for c in n.get("children") or []:
        walk(c, n["id"], l)
    return l


persons = walk(tree)
by = {p["id"]: p for p in persons}
children = defaultdict(list)
for p in persons:
    if p["parent"]:
        children[p["parent"]].append(p["id"])

ref_to_photo = {}
for f, m in idx.items():
    for r in m.get("refs", []):
        ref_to_photo[str(r)] = f


def collect(meta, current_file):
    refs = [str(r) for r in meta.get("refs", [])]
    cross = [str(r) for r in meta.get("cross_refs", [])]
    expand = set(refs + cross)
    stubs = set()
    for f, m in idx.items():
        if f == current_file:
            continue
        for r in m.get("refs", []):
            rs = str(r)
            if rs not in expand:
                stubs.add(rs)

    ids = set(p["id"] for p in persons if p["ref"] in expand)
    roots = [i for i in ids if not any(by[i]["parent"] == a for a in ids)]

    def desc(id):
        for ch in children.get(id, []):
            ids.add(ch)
            ch_ref = str(by[ch]["ref"])
            if ch_ref and ch_ref in stubs:
                for gc in children.get(ch, []):
                    ids.add(gc)
                continue
            if not ch_ref or ch_ref in expand:
                desc(ch)

    for r in roots:
        desc(r)
    return ids


meta = idx["PHOTO-2025-10-11-21-12-25_3.jpg"]
ids = collect(meta, "PHOTO-2025-10-11-21-12-25_3.jpg")
bak = [i for i in ids if "bakhtawar" in i or "bakh" in by[i]["name"].lower()]
lines = [f"5039 page: {len(ids)} names", f"bakhtawar-related on 5039: {len(bak)}"]
for i in bak:
    lines.append(f"  {i} parent={by[i]['parent']} name={by[i]['name']}")

# count bakhtawar ids in entire tree
all_bak = [p for p in persons if p["id"] == "bakhtawar" or "بختاور" in p["name"]]
lines.append(f"Total bakhtawar nodes in tree: {len(all_bak)}")
for p in all_bak:
    lines.append(f"  {p['id']} parent={p['parent']}")

Path(root / "bakhtawar_check.txt").write_text("\n".join(lines), encoding="utf-8")
