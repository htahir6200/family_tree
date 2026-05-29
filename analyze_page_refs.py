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
        l.append({"id": n["id"], "ref": str(n.get("ref", "")), "parent": p})
    for c in n.get("children") or []:
        walk(c, n["id"], l)
    return l


persons = walk(tree)
by = {p["id"]: p for p in persons}
children = defaultdict(list)
for p in persons:
    if p["parent"]:
        children[p["parent"]].append(p["id"])

all_primary_refs = set()
for m in idx.values():
    for r in m.get("refs", []):
        all_primary_refs.add(str(r))


def auto_stubs(current_file, expand_refs):
    stubs = set()
    for f, m in idx.items():
        if f == current_file:
            continue
        for r in m.get("refs", []):
            rs = str(r)
            if rs not in expand_refs:
                stubs.add(rs)
    return stubs


def collect(meta, current_file, deep=False):
    refs = [str(r) for r in meta.get("refs", [])]
    cross = [str(r) for r in meta.get("cross_refs", [])]
    expand = set(refs + cross)
    stubs = set(str(r) for r in meta.get("stub_refs", [])) | auto_stubs(current_file, expand)

    ids = set(p["id"] for p in persons if p["ref"] in expand)
    roots = [i for i in ids if not any(by[i]["parent"] == a for a in ids)]

    def add_desc(id, inside_stub=False):
        for ch in children.get(id, []):
            ids.add(ch)
            ch_ref = str(by[ch]["ref"])
            if deep:
                add_desc(ch, False)
                continue
            if not inside_stub and ch_ref and ch_ref in stubs:
                for gc in children.get(ch, []):
                    ids.add(gc)
                continue
            if inside_stub:
                continue
            if not ch_ref or ch_ref in expand:
                add_desc(ch, False)

    for r in roots:
        add_desc(r)
    for r in roots:
        cur = by[r]["parent"]
        for _ in range(2):
            if cur:
                ids.add(cur)
                cur = by[cur]["parent"]
    return len(ids)


for f in sorted(idx, key=lambda x: idx[x]["refs"][0]):
    meta = dict(idx[f])
    if f.endswith("25_3.jpg"):
        meta["cross_refs"] = ["5040"]
    old = collect(meta, f, deep=False)
    new = collect(meta, f, deep=False)
    print(f"{idx[f]['refs']} | {f[-20:]:20} | {old} names")

print("5039 with cross:", collect({**idx['PHOTO-2025-10-11-21-12-25_3.jpg'], 'cross_refs': ['5040']}, 'PHOTO-2025-10-11-21-12-25_3.jpg'))
print("5041:", collect(idx['PHOTO-2025-10-11-21-12-25_2.jpg'], 'PHOTO-2025-10-11-21-12-25_2.jpg'))
