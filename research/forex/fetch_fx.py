#!/usr/bin/env python3
"""Hourly and daily forex bars from Yahoo Finance for the forex test (PLAN.md), the chart API as
scripts/update_quotes.py uses it. Writes data/<PAIR>_1h.json and data/<PAIR>_1d.json: [[t, o, h, l, c], ...],
oldest first, rows without a full set of prices dropped.
usage: python3 fetch_fx.py"""
import json, os, time, urllib.request

PAIRS = {"EURUSD": "EURUSD=X", "GBPUSD": "GBPUSD=X", "USDJPY": "JPY=X", "AUDUSD": "AUDUSD=X", "NZDUSD": "NZDUSD=X", "USDCAD": "CAD=X",
         "USDCHF": "CHF=X", "EURJPY": "EURJPY=X", "GBPJPY": "GBPJPY=X", "AUDJPY": "AUDJPY=X", "EURGBP": "EURGBP=X"}
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(OUT, exist_ok=True)


def chart(symbol, interval, rng):
    last = None
    for host in ("query1.finance.yahoo.com", "query2.finance.yahoo.com", "query1.finance.yahoo.com"):
        url = "https://%s/v8/finance/chart/%s?interval=%s&range=%s" % (host, symbol, interval, rng)
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=60) as r:
                res = json.load(r)["chart"]["result"][0]
            q = res["indicators"]["quote"][0]
            rows = [[t, o, h, l, c] for t, o, h, l, c in zip(res["timestamp"], q["open"], q["high"], q["low"], q["close"])
                    if None not in (o, h, l, c) and min(o, h, l, c) > 0 and h >= l]
            rows.sort(key=lambda r: r[0])
            return [r for i, r in enumerate(rows) if i == 0 or r[0] > rows[i - 1][0]]
        except Exception as e:  # noqa: BLE001 - next host
            last = e
            time.sleep(3)
    raise last


for pair, sym in PAIRS.items():
    for interval, rng in (("1h", "730d"), ("1d", "10y")):
        rows = chart(sym, interval, rng)
        with open(os.path.join(OUT, "%s_%s.json" % (pair, interval)), "w") as f:
            json.dump(rows, f)
        print("%-7s %-3s %6d bars  %s -> %s" % (pair, interval, len(rows), time.strftime("%Y-%m-%d %H:%M", time.gmtime(rows[0][0])), time.strftime("%Y-%m-%d %H:%M", time.gmtime(rows[-1][0]))))
        time.sleep(1)
