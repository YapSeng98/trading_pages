#!/usr/bin/env python3
"""What gold is moving with: data/drivers.json for the gold page's "驱动因素 · What's moving gold" card.

Daily closes of the usual gold drivers (US dollar index, US 10-year yield, 10-year real yield, oil, silver, S&P 500)
next to gold's: the latest close, the change over 1 day, 1 week (5 trading days) and 1 month (21), and how gold's daily
moves lined up with each over the last 60 and 250 trading days (correlation of daily changes, matched by date).
Context, not a signal: research/world (T4) found that trading the gold rule only when real yields agreed did not help.

Sources: Yahoo Finance's chart API (same method as update_quotes.py: closes only, today's bar is dropped while the
exchange is still trading; a run that fails keeps the previous file's values) and FRED's DFII10 for the real yield.
Gold is COMEX futures (GC=F) here, close to spot day to day; the card says so.
"""
import json
import math
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone

OUT = "data/drivers.json"
FRED_AGENT = "trading_pages-drivers/1.0 (+https://github.com/YapSeng98/trading_pages)"   # FRED turns away a bare "Mozilla/5.0"
HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]
# id, source, symbol, kind ("pct": % change; "pp": change in percentage points, shown as basis points)
SERIES = [
    ("gold", "yahoo", "GC=F", "pct"),
    ("dxy", "yahoo", "DX-Y.NYB", "pct"),
    ("us10y", "yahoo", "^TNX", "pp"),
    ("real10y", "fred", "DFII10", "pp"),
    ("oil", "yahoo", "CL=F", "pct"),
    ("silver", "yahoo", "SI=F", "pct"),
    ("spx", "yahoo", "^GSPC", "pct"),
]


def get(url, timeout=25, agent="Mozilla/5.0"):
    req = urllib.request.Request(url, headers={"User-Agent": agent})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def yahoo(symbol):
    last = None
    for attempt in range(2):  # both hosts, twice: shared runners are sometimes rate-limited
        for host in HOSTS:
            try:
                res = json.loads(get("https://%s/v8/finance/chart/%s?interval=1d&range=2y" % (host, symbol)))["chart"]["result"][0]
                ts, closes = res["timestamp"], res["indicators"]["quote"][0]["close"]
                bars = [(t, c) for t, c in zip(ts, closes) if c is not None]
                reg = (res["meta"].get("currentTradingPeriod") or {}).get("regular") or {}
                if bars and reg.get("start") and reg.get("end") and bars[-1][0] >= reg["start"] and time.time() < reg["end"] + 600:
                    bars = bars[:-1]  # today's bar while the exchange is still trading: not a close yet
                tz = timezone(timedelta(seconds=res["meta"].get("gmtoffset", 0)))
                return [(datetime.fromtimestamp(t, tz).strftime("%Y-%m-%d"), c) for t, c in bars]
            except Exception as e:  # noqa: BLE001 - try the next host, then report
                last = e
                time.sleep(2 + 4 * attempt)
    raise last


def fred(sid):
    start = (datetime.now(timezone.utc) - timedelta(days=760)).strftime("%Y-%m-%d")   # two years is enough, and much faster
    last = None
    for attempt in range(3):
        try:
            rows = get("https://fred.stlouisfed.org/graph/fredgraph.csv?id=%s&cosd=%s" % (sid, start), timeout=60, agent=FRED_AGENT).decode().splitlines()[1:]
            break
        except Exception as e:  # noqa: BLE001 - FRED is sometimes slow
            last = e
            time.sleep(3 + 5 * attempt)
    else:
        raise last
    out = []
    for r in rows:
        d, _, v = r.partition(",")
        try:
            out.append((d, float(v)))
        except ValueError:
            pass  # holidays are blank
    return out[-520:]


def change(bars, n, kind):
    if len(bars) <= n:
        return None
    a, b = bars[-1 - n][1], bars[-1][1]
    return round(b - a, 3) if kind == "pp" else round((b / a - 1) * 100, 2)


def corr(gold, other, kind, n):
    """Correlation of daily changes over the last n days both series have, matched by date."""
    g = dict(gold)
    pairs, prev = [], None
    for d, v in other:
        if d in g and prev is not None and prev[0] in g:
            gd = g[d] / g[prev[0]] - 1
            od = (v - prev[1]) if kind == "pp" else (v / prev[1] - 1)
            pairs.append((gd, od))
        prev = (d, v)
    pairs = pairs[-n:]
    if len(pairs) < n * 0.8:
        return None
    mx = sum(p[0] for p in pairs) / len(pairs)
    my = sum(p[1] for p in pairs) / len(pairs)
    sxy = sum((a - mx) * (b - my) for a, b in pairs)
    sx = math.sqrt(sum((a - mx) ** 2 for a, _ in pairs))
    sy = math.sqrt(sum((b - my) ** 2 for _, b in pairs))
    return round(sxy / (sx * sy), 2) if sx and sy else None


def main():
    try:
        with open(OUT, encoding="utf-8") as f:
            old = {s["id"]: s for s in json.load(f).get("series", [])}
    except (OSError, ValueError):
        old = {}
    data, failed = {}, []
    for sid, src, sym, kind in SERIES:
        try:
            bars = yahoo(sym) if src == "yahoo" else fred(sym)
            if len(bars) < 260:
                raise ValueError("only %d closes" % len(bars))
            data[sid] = (bars, kind, src, sym)
        except Exception as e:  # noqa: BLE001 - keep the old values for this one
            failed.append(sid)
            print("%-8s %-9s FAILED: %s" % (sid, sym, e), file=sys.stderr)
        time.sleep(1)
    if "gold" not in data:
        print("gold failed: keeping the old file", file=sys.stderr)
        return 1
    gold = data["gold"][0]
    out = []
    for sid, src, sym, kind in SERIES:
        if sid not in data:
            if sid in old:
                out.append(dict(old[sid], stale=True))
            continue
        bars, kind, src, sym = data[sid]
        row = {"id": sid, "symbol": sym, "source": "FRED" if src == "fred" else "Yahoo Finance", "kind": kind,
               "last": round(bars[-1][1], 4), "date": bars[-1][0],
               "chg1d": change(bars, 1, kind), "chg1w": change(bars, 5, kind), "chg1m": change(bars, 21, kind),
               "spark": [round(v, 4) for _, v in bars[-60:]]}
        if sid != "gold":
            row["corr60"] = corr(gold, bars, kind, 60)
            row["corr250"] = corr(gold, bars, kind, 250)
        if sid in old and row["date"] < old[sid].get("date", ""):
            row = dict(old[sid])  # a close never goes back in time
        out.append(row)
        print("%-8s %-9s %10.3f  %s  1w %s  corr60 %s" % (sid, sym, row["last"], row["date"], row["chg1w"], row.get("corr60")))
    if old and [dict(r) for r in out] == [old.get(r["id"]) for r in out] and not failed:
        print("No close changed: file left as it is.")
        return 0
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"updated": datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d %H:%M SGT"), "failed": failed, "series": out},
                  f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
