#!/usr/bin/env python3
"""Daily closes from FRED (the St. Louis Fed's public data site) for the daily trend-following test.
usage: fetch_fred.py   -> data/<SERIES>.csv (date,value; FRED's own format, blank days dropped)"""
import os, time, urllib.request
SERIES = {
  # US dollar against other currencies, noon buying rates in New York (H.10)
  "DEXUSUK": "GBP", "DEXJPUS": "JPY", "DEXCAUS": "CAD", "DEXSZUS": "CHF", "DEXUSAL": "AUD", "DEXUSNZ": "NZD",
  "DEXUSEU": "EUR", "DEXSDUS": "SEK", "DEXNOUS": "NOK", "DEXDNUS": "DKK", "DEXSIUS": "SGD", "DEXMAUS": "MYR",
  "DEXKOUS": "KRW", "DEXMXUS": "MXN", "DEXINUS": "INR", "DEXTHUS": "THB", "DEXSFUS": "ZAR",
  # commodities and stock indices
  "DCOILWTICO": "WTI oil", "DCOILBRENTEU": "Brent oil", "DHHNGSP": "US natural gas", "NASDAQCOM": "Nasdaq Composite", "NASDAQ100": "Nasdaq 100",
}
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(OUT, exist_ok=True)
for sid in SERIES:
    raw = urllib.request.urlopen("https://fred.stlouisfed.org/graph/fredgraph.csv?id=" + sid, timeout=60).read().decode()
    rows = [l for l in raw.splitlines()[1:] if l and not l.endswith(",") and not l.endswith(",.")]
    with open(os.path.join(OUT, sid + ".csv"), "w") as f: f.write("\n".join(rows) + "\n")
    print(sid.ljust(13), SERIES[sid].ljust(17), len(rows), rows[0], "->", rows[-1])
    time.sleep(1)
