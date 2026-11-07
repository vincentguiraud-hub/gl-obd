#!/usr/bin/env python3
"""Convertit la base communautaire OBDb (https://github.com/OBDb, licence CC BY-SA 4.0)
en fichiers compacts pour G&L Diag : data/obdb/index.json + data/obdb/<Marque-Modèle>.json.gz
Usage : python3 tools/build-obdb.py <dossier contenant les dépôts OBDb clonés>"""
import json, glob, gzip, os, re, sys

src = sys.argv[1]
out = os.path.join(os.path.dirname(__file__), "..", "data", "obdb")
os.makedirs(out, exist_ok=True)
index = []
total = 0
for repo in sorted(os.listdir(src)):
    files = sorted(glob.glob(os.path.join(src, repo, "signalsets", "v3", "*.json")))
    if not files:
        continue
    cmds = []
    for f in files:
        try:
            d = json.load(open(f))
        except Exception:
            continue
        for c in d.get("commands", []):
            svc, did = next(iter(c["cmd"].items()))
            hdr = c["hdr"].upper()
            if not (len(hdr) == 3 or (len(hdr) == 4 and hdr.startswith("DA"))):
                continue  # adressages non gérés par l'ELM327 standard
            sigs = []
            for s in c.get("signals", []):
                fm = s["fmt"]
                sigs.append([s["id"], s.get("name", s["id"]), s.get("path", ""), fm.get("bix", 0), fm["len"],
                             1 if fm.get("sign") else 0, 1 if fm.get("blsb") else 0, fm.get("mul", 1), fm.get("div", 1),
                             fm.get("add", 0), fm.get("unit", ""),
                             {k: v.get("description", v.get("value")) for k, v in fm["map"].items()} if "map" in fm else None,
                             fm.get("nullmin"), fm.get("nullmax"), fm.get("min", 0), fm.get("max")])
            if not sigs:
                continue
            flt = c.get("filter") or None
            cmds.append({"h": hdr, "r": (c.get("rax") or "").upper() or None, "s": svc, "d": did.upper(), "f": flt, "x": sigs})
    if not cmds:
        continue
    total += sum(len(c["x"]) for c in cmds)
    gens = []
    gy = os.path.join(src, repo, "generations.yaml")
    if os.path.exists(gy):
        for m in re.finditer(r"start_year:\s*(\d+)\s*\n\s*end_year:\s*(\w+)", open(gy).read()):
            gens.append([int(m.group(1)), int(m.group(2)) if m.group(2).isdigit() else None])
    make, _, model = repo.partition("-")
    index.append({"id": repo, "make": make, "model": model.replace("-", " ") or None, "gens": gens, "n": sum(len(c["x"]) for c in cmds)})
    with gzip.open(os.path.join(out, repo + ".json.gz"), "wt", encoding="utf-8") as g:
        json.dump(cmds, g, separators=(",", ":"))
json.dump(index, open(os.path.join(out, "index.json"), "w"), ensure_ascii=False, separators=(",", ":"))
print(len(index), "véhicules,", total, "signaux")
