#!/usr/bin/env python3
"""FRED series for the world-strategy tests (PLAN.md): interest rates for carry, real yields, the Nikkei.
Prices for currencies, oil and the Nasdaq come from ../trend-daily/data (fetch_fred.py there).
usage: fetch_world.py   -> data/<SERIES>.csv"""
import os, time, urllib.request
SERIES = ["IR3TIB01USM156N", "IR3TIB01GBM156N", "IR3TIB01JPM156N", "IRSTCI01JPM156N", "IR3TIB01CAM156N", "IR3TIB01CHM156N", "IRSTCI01CHM156N",
          "IR3TIB01AUM156N", "IR3TIB01NZM156N", "IR3TIB01EZM156N", "IR3TIB01SEM156N", "IR3TIB01NOM156N", "IR3TIB01DKM156N", "IR3TIB01MXM156N",
          "IR3TIB01ZAM156N", "IR3TIB01KRM156N", "DFII10", "NIKKEI225"]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data"); os.makedirs(OUT, exist_ok=True)
for sid in SERIES:
    raw = urllib.request.urlopen("https://fred.stlouisfed.org/graph/fredgraph.csv?id=" + sid, timeout=60).read().decode()
    rows = [l for l in raw.splitlines()[1:] if l and not l.endswith(",") and not l.endswith(",.")]
    open(os.path.join(OUT, sid + ".csv"), "w").write("\n".join(rows) + "\n")
    print(sid.ljust(17), len(rows), rows[0], "->", rows[-1]); time.sleep(0.7)
