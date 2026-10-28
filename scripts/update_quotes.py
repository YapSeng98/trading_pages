#!/usr/bin/env python3
"""Fetch daily market data for every stock on stocks.html and write it where the page can read it.

Outputs (same data in both):
    data/quotes.json   for people, agents and tests
    data/quotes.js     `window.STOCK_QUOTES = {...}`, loaded by stocks.html before it renders

The stock list is read from the `.tk` tickers in stocks.html, so adding a card there is enough.
    NVDA        -> NVDA       (US)
    SGX:D05     -> D05.SI     (Singapore)
    KLSE:1155   -> 1155.KL    (Malaysia)

Data source: Yahoo Finance chart API, one year of daily bars plus dividends (free, no key).
Price and % change come from the last two non-null daily closes, never from the `meta` fields,
which can carry a stale baseline. A day still trading is left out until 10 minutes after its session ends
(Yahoo's currentTradingPeriod), so a run during market hours never records a mid-session price as a close:
on 2026-10-27 a late 23:32 SGT run had saved MSFT at +0.01% for a day that closed -0.24%.
If a ticker fails, its previous entry is kept and marked stale; if Yahoo blanks a day it had before, the
newer close already in the file is kept (a close never goes back in time).

Runs in GitHub Actions on a schedule (.github/workflows/quotes.yml); also fine to run by hand:
    python3 scripts/update_quotes.py
"""
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.join(ROOT, "stocks.html")
OUT_JSON = os.path.join(ROOT, "data", "quotes.json")
OUT_JS = os.path.join(ROOT, "data", "quotes.js")
HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]
SGT = timezone(timedelta(hours=8))
MARKETS = {"SGX": ("SG", "S$", ".SI"), "KLSE": ("MY", "RM", ".KL")}


def tickers():
    """Tickers exactly as the page shows them, in page order, without duplicates."""
    with open(PAGE, encoding="utf-8") as f:
        html = f.read()
    seen = []
    for tk in re.findall(r'<span class="tk">([^<]+)</span>', html):
        tk = tk.strip()
        if tk and tk not in seen:
            seen.append(tk)
    return seen


def yahoo_symbol(tk):
    if ":" in tk:
        exch, code = tk.split(":", 1)
        market, cur, suffix = MARKETS[exch]
        return code + suffix, market, cur
    return tk, "US", "$"


def fetch(symbol):
    last = None
    for attempt in range(2):  # both hosts, twice: shared runners are sometimes rate-limited
        for host in HOSTS:
            url = "https://%s/v8/finance/chart/%s?interval=1d&range=1y&events=div" % (host, symbol)
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            try:
                with urllib.request.urlopen(req, timeout=25) as r:
                    return json.load(r)["chart"]["result"][0]
            except Exception as e:  # noqa: BLE001 - try the next host, then report
                last = e
                time.sleep(2 + 4 * attempt)
    raise last


def analyse(res):
    ts = res["timestamp"]
    q = res["indicators"]["quote"][0]
    bars = [(t, c, h, l) for t, c, h, l in zip(ts, q["close"], q["high"], q["low"]) if c is not None]
    reg = (res["meta"].get("currentTradingPeriod") or {}).get("regular") or {}
    if bars and reg.get("start") and reg.get("end") and bars[-1][0] >= reg["start"] and time.time() < reg["end"] + 600:
        bars = bars[:-1]  # today's bar while the exchange is still trading: not a close yet
    if len(bars) < 30:
        raise ValueError("only %d daily bars" % len(bars))
    price, prev = bars[-1][1], bars[-2][1]
    hi = max(h for _, _, h, _ in bars if h is not None)
    lo = min(l for _, _, _, l in bars if l is not None)
    tz = timezone(timedelta(seconds=res["meta"].get("gmtoffset", 0)))
    day = datetime.fromtimestamp(bars[-1][0], tz)

    def ret(n):  # % change over the last n trading days
        return round((price / bars[-1 - n][1] - 1) * 100, 2) if len(bars) > n else None

    year_start = [c for t, c, _, _ in bars if datetime.fromtimestamp(t, tz).year == day.year]
    cutoff = bars[-1][0] - 365 * 86400
    divs = (res.get("events") or {}).get("dividends") or {}
    div_ttm = sum(d["amount"] for d in divs.values() if d.get("date", 0) >= cutoff)
    return {
        "price": round(price, 4),
        "prev": round(prev, 4),
        "chg": round((price / prev - 1) * 100, 2),
        "date": day.strftime("%Y-%m-%d"),
        "hi52": round(hi, 4),
        "lo52": round(lo, 4),
        "pos52": round((price - lo) / (hi - lo) * 100) if hi > lo else None,
        "r1m": ret(21),
        "r3m": ret(63),
        "ytd": round((price / year_start[0] - 1) * 100, 2) if year_start else None,
        "divTtm": round(div_ttm, 4),
        "yield": round(div_ttm / price * 100, 2) if price else None,
    }


def main():
    try:
        with open(OUT_JSON, encoding="utf-8") as f:
            old = json.load(f).get("quotes", {})
    except (OSError, ValueError):
        old = {}

    quotes, failed = {}, []
    for tk in tickers():
        symbol, market, cur = yahoo_symbol(tk)
        try:
            row = analyse(fetch(symbol))
            row.update(symbol=symbol, market=market, cur=cur)
            if tk in old and row["date"] < old[tk].get("date", ""):
                print("%-12s %-9s Yahoo now ends at %s; keeping the newer close of %s" % (tk, symbol, row["date"], old[tk]["date"]))
                row = dict(old[tk])  # a close never goes back in time (Yahoo sometimes blanks a day it had)
            quotes[tk] = row
            print("%-12s %-9s %10.3f %+6.2f%%  %s  52w %s%%  yield %s%%" % (tk, symbol, row["price"], row["chg"], row["date"], row["pos52"], row["yield"]))
        except Exception as e:  # noqa: BLE001 - keep the old value for this one ticker
            failed.append(tk)
            if tk in old:
                quotes[tk] = dict(old[tk], stale=True)
            print("%-12s %-9s FAILED: %s" % (tk, symbol, e), file=sys.stderr)
        time.sleep(1)

    fresh = len(quotes) - len([t for t in failed if t in quotes])
    if fresh == 0:
        print("No ticker could be fetched; leaving the data files untouched.", file=sys.stderr)
        return 1

    if not failed and quotes == old:
        print("No price has changed since the last run; data files left as they are.")
        return 0

    data = {
        "updated": datetime.now(SGT).strftime("%Y-%m-%d %H:%M SGT"),
        "source": "Yahoo Finance chart API, daily bars",
        "failed": failed,
        "quotes": quotes,
    }
    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")
    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write("// Written by scripts/update_quotes.py. Do not edit by hand.\n")
        f.write("window.STOCK_QUOTES = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print("Wrote %d quotes (%d fresh, %d failed) at %s" % (len(quotes), fresh, len(failed), data["updated"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
