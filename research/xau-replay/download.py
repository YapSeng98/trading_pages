#!/usr/bin/env python3
"""Real spot XAU/USD 1-minute bars (bid or ask) from Dukascopy's chart feed, paged backwards.
usage: download.py BID|ASK <first year> [year to stop before]
   -> data/duk/<SIDE>_<year>.bin, records of 5 x int32: unix time, open, high, low, close (prices in 1/1000 USD)
About 20,000 bars per request, one request a second: a year takes under a minute. Minutes with no trades are left out."""
import json, os, struct, sys, time, urllib.request, datetime as dt
OUT = os.path.join(os.environ.get("XAU_REPLAY_DATA") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "data"), "duk")
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      "Referer": "https://freeserv.dukascopy.com/2.0/?path=chart/index"}
def page(side, ts, limit=20000):
    url = ("https://freeserv.dukascopy.com/2.0/?path=chart/json3&instrument=XAU/USD&offer_side=%s&interval=1MIN&splits=true&limit=%d&time_direction=P&timestamp=%d&jsonp=cb" % (side[0], limit, ts))
    for a in range(10):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                b = r.read().decode()
            return json.loads(b[b.index("(") + 1:b.rindex(")")])
        except Exception as e:
            print("  retry", a, repr(e)[:70], flush=True); time.sleep(5 + 5 * a)
    raise RuntimeError("gave up at %d" % ts)
def main():
    os.makedirs(OUT, exist_ok=True)
    side, stop_year = sys.argv[1], int(sys.argv[2])
    stop = int(dt.datetime(stop_year, 1, 1, tzinfo=dt.timezone.utc).timestamp() * 1000)
    ts = int(dt.datetime(int(sys.argv[3]), 1, 1, tzinfo=dt.timezone.utc).timestamp() * 1000) if len(sys.argv) > 3 else int(time.time() * 1000); bars = {}; n = 0
    while ts > stop:
        rows = page(side, ts)
        if not rows: break
        for r in rows:
            if r[5] > 0 and r[0] >= stop: bars[r[0] // 1000] = r
        oldest = min(r[0] for r in rows)
        if oldest >= ts: break
        ts = oldest; n += 1
        if n % 10 == 0: print(n, "pages, back to", dt.datetime.utcfromtimestamp(ts / 1000), "bars", len(bars), flush=True)
        time.sleep(0.8)
    years = {}
    for t in sorted(bars):
        r = bars[t]; years.setdefault(dt.datetime.utcfromtimestamp(t).year, bytearray()).extend(struct.pack("<5i", t, round(r[1] * 1000), round(r[2] * 1000), round(r[3] * 1000), round(r[4] * 1000)))
    for y in sorted(years):
        with open("%s/%s_%d.bin" % (OUT, side, y), "wb") as f: f.write(years[y])
        print(y, side, "bars", len(years[y]) // 20, flush=True)
    print("DONE", side, len(bars))
main()
