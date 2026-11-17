#!/usr/bin/env python3
"""What gold is moving with: data/drivers.json for the gold page's "驱动因素 · What's moving gold" card.

Daily closes of the usual gold drivers (US dollar index, US 10-year yield, 10-year real yield, oil, silver, S&P 500)
next to gold's: the latest close, the change over 1 day, 1 week (5 trading days) and 1 month (21), and how gold's daily
moves lined up with each over the last 60 and 250 trading days (correlation of daily changes, matched by date).
Context, not a signal: research/world (T4) found that trading the gold rule only when real yields agreed did not help.

Sources: Yahoo Finance's chart API (same method as update_quotes.py: closes only, today's bar is dropped while the
exchange is still trading; a run that fails keeps the previous file's values) and FRED's DFII10 for the real yield.
Gold is COMEX futures (GC=F) here, close to spot day to day; the card says so.

While a market is trading, its row also carries `now`: the price at this run, its time, and the change since the last
close ("盘中" on the card). It is as fresh as the job that runs this script (the market job); the closes, the changes
over a week and a month and the correlations stay on closes only.

Runs in the market job, which may come round every 15 minutes: it asks the sources at most about once an hour (the file's
own `updated` time), and at the weekend only until Friday's closes are in. DRIVERS_FORCE=1 asks regardless.
"""
import json
import math
import os
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

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


def zone(meta):
    """The exchange's own time zone, summer time included. Dating bars with `gmtoffset` (today's offset) put every
    futures bar from before the clocks changed a day early: they are stamped at midnight New York, and midnight in
    summer is 23:00 the day before in winter time. Gold then met the 10-year yield, the real yield and the S&P 500
    (stamped later in the day, so dated right) a day out of step, which pulled those correlations towards zero."""
    try:
        return ZoneInfo(meta.get("exchangeTimezoneName") or "")
    except Exception:  # noqa: BLE001 - no usable name: the offset Yahoo gives
        return timezone(timedelta(seconds=meta.get("gmtoffset", 0)))


def unpublished(ts, closes, last_t, bar_t, at, tz):
    """The session whose close Yahoo has not published yet, when the live price comes after it: Monday's gold, oil,
    silver and dollar-index settlements were still empty at 07:30-09:30 SGT on 2026-11-17, hours after the 17:00 New
    York close. Until they come, the last close is two sessions back and the move since it is not today's."""
    day = (datetime.fromtimestamp(at, tz) + timedelta(hours=6)).date()   # futures: the session from 18:00 New York is the next day's
    while day.weekday() >= 5:
        day += timedelta(days=1)
    prev = day - timedelta(days=1)
    while prev.weekday() >= 5:
        prev -= timedelta(days=1)
    last = datetime.fromtimestamp(last_t, tz).date()
    if last >= prev:
        return None
    empty = any(c is None and last < datetime.fromtimestamp(t, tz).date() <= prev and datetime.fromtimestamp(t, tz).weekday() < 5 for t, c in zip(ts, closes))
    carried = bar_t != at and datetime.fromtimestamp(bar_t, tz).date() <= prev   # that session's own bar still taking the new prices
    return prev.isoformat() if empty or carried else None   # neither: a holiday, and the last close is the right one


def yahoo(symbol):
    last = None
    for attempt in range(2):  # both hosts, twice: shared runners are sometimes rate-limited
        for host in HOSTS:
            try:
                res = json.loads(get("https://%s/v8/finance/chart/%s?interval=1d&range=2y" % (host, symbol)))["chart"]["result"][0]
                ts, closes = res["timestamp"], res["indicators"]["quote"][0]["close"]
                bars = [(t, c) for t, c in zip(ts, closes) if c is not None]
                reg = (res["meta"].get("currentTradingPeriod") or {}).get("regular") or {}
                tz = zone(res["meta"])
                live = None
                if bars and reg.get("start") and reg.get("end") and bars[-1][0] >= reg["start"] and time.time() < reg["end"] + 600:
                    live, bars = bars[-1], bars[:-1]  # today's bar while the exchange is still trading: not a close yet
                    at = res["meta"].get("regularMarketTime") or live[0]   # when that price traded (only the time is taken from meta)
                    wait = unpublished(ts, closes, bars[-1][0], live[0], at, tz) if bars else None
                    live = (at, live[1], wait) if 0 <= time.time() - at < 3 * 3600 else None   # no trade for hours (a holiday session): not a price "now"
                return [(datetime.fromtimestamp(t, tz).strftime("%Y-%m-%d"), c) for t, c in bars], live
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


def due(prev):
    """Whether to ask the sources on this run: not when the file is under 55 minutes old, and at the weekend (Saturday
    07:00 to Monday 05:00 SGT, nothing trades) only while Friday's closes are still missing."""
    if os.environ.get("DRIVERS_FORCE") == "1" or not prev:
        return True
    sgt = timezone(timedelta(hours=8))
    now = datetime.now(sgt)
    try:
        age = (now - datetime.strptime(prev.get("updated", ""), "%Y-%m-%d %H:%M SGT").replace(tzinfo=sgt)).total_seconds() / 60
    except ValueError:
        return True
    if 0 <= age < 55:
        print("Updated %d minutes ago: not asking again yet." % age)
        return False
    wd, hm = now.weekday(), now.hour * 60 + now.minute           # Monday is 0
    if (wd == 5 and hm >= 7 * 60) or wd == 6 or (wd == 0 and hm < 5 * 60):
        friday = (now - timedelta(days={5: 1, 6: 2, 0: 3}[wd])).strftime("%Y-%m-%d")
        gold = [r for r in prev.get("series", []) if r.get("id") == "gold"]
        if gold and gold[0].get("date", "") >= friday and not any("now" in r for r in prev.get("series", [])):
            print("Weekend, and Friday's closes are in: nothing to ask.")
            return False
    return True


def main():
    try:
        with open(OUT, encoding="utf-8") as f:
            prev = json.load(f)
    except (OSError, ValueError):
        prev = {}
    if not due(prev):
        return 0
    old = {s["id"]: s for s in prev.get("series", [])}
    data, failed = {}, []
    for sid, src, sym, kind in SERIES:
        try:
            bars, live = yahoo(sym) if src == "yahoo" else (fred(sym), None)
            if len(bars) < 260:
                raise ValueError("only %d closes" % len(bars))
            data[sid] = (bars, kind, src, sym, live)
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
        bars, kind, src, sym, live = data[sid]
        row = {"id": sid, "symbol": sym, "source": "FRED" if src == "fred" else "Yahoo Finance", "kind": kind,
               "last": round(bars[-1][1], 4), "date": bars[-1][0],
               "chg1d": change(bars, 1, kind), "chg1w": change(bars, 5, kind), "chg1m": change(bars, 21, kind),
               "spark": [round(v, 4) for _, v in bars[-60:]]}
        if live:  # trading now: the price at this run and the move since the last close
            a, b = bars[-1][1], live[1]
            row["now"] = {"price": round(b, 4), "at": datetime.fromtimestamp(live[0], timezone(timedelta(hours=8))).strftime("%Y-%m-%d %H:%M SGT"),
                          "chg": round(b - a, 3) if kind == "pp" else round((b / a - 1) * 100, 2)}
            if live[2]:  # the close of that session is not out yet: `chg` runs from `date`'s close, so it is more than today's move
                row["now"]["wait"] = live[2]
        if sid != "gold":
            row["corr60"] = corr(gold, bars, kind, 60)
            row["corr250"] = corr(gold, bars, kind, 250)
        if sid in old and row["date"] < old[sid].get("date", ""):
            row = dict(old[sid])  # a close never goes back in time
            row.pop("now", None)
        out.append(row)
        print("%-8s %-9s %10.3f  %s  1w %s  corr60 %s" % (sid, sym, row["last"], row["date"], row["chg1w"], row.get("corr60")))
    if old and [dict(r) for r in out] == [old.get(r["id"]) for r in out] and not failed:
        print("Nothing changed: file left as it is.")
        return 0
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"updated": datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d %H:%M SGT"), "failed": failed, "series": out},
                  f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
