#!/usr/bin/env python3
"""Downloads for the forex round-2 tests (PLAN.md) into data/ (not kept in git):
  FRED noon buying rates (H.10) for the G10 currencies -> data/<SERIES>.csv (date,value)
  the Fed's scheduled FOMC meetings, announcement day = the meeting's last day -> data/fomc.json
  Yahoo daily stock indices for the month-end check -> data/EQ_<NAME>.json [[t, close], ...]
The hourly forex bars come from ../data (python3 ../fetch_fx.py), the interest rates from ../../world/data.
usage: python3 fetch_edges.py"""
import json, os, re, time, urllib.request

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(OUT, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0"}


def get(url, ua=True):
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA if ua else {}), timeout=60) as r:
                return r.read().decode("utf-8", "ignore")
        except Exception:  # noqa: BLE001 - try again
            if i == 2:
                raise
            time.sleep(3)


# ---------- FRED ----------
# (FRED stalls on a browser user agent and answers plain requests; it no longer serves the daily Deutsche mark, DEXGEUS)
for sid in ("DEXUSEU", "DEXJPUS", "DEXUSUK", "DEXSZUS", "DEXCAUS", "DEXUSAL", "DEXUSNZ", "DEXNOUS", "DEXSDUS"):
    raw = get("https://fred.stlouisfed.org/graph/fredgraph.csv?id=" + sid, ua=False)
    rows = [l for l in raw.splitlines()[1:] if l and not l.endswith(",") and not l.endswith(",.")]
    with open(os.path.join(OUT, sid + ".csv"), "w") as f:
        f.write("\n".join(rows) + "\n")
    print(sid.ljust(8), len(rows), rows[0], "->", rows[-1])
    time.sleep(1)

# ---------- FOMC: scheduled meetings ----------
MON = {m: i + 1 for i, m in enumerate("January February March April May June July August September October November December".split())}
MON.update({m[:3]: v for m, v in list(MON.items())})


def last_day(year, months, days):
    """'January 31-February 1' / 'Jan/Feb 31-1' / 'March 17-18' / 'May 15' -> the meeting's last day."""
    m = [MON[x] for x in months]
    d = [int(x) for x in days]
    mm = m[-1] if len(m) > 1 else m[0]
    return "%04d-%02d-%02d" % (year, mm, d[-1])


dates = []
for y in range(1994, 2021):
    t = get("https://www.federalreserve.gov/monetarypolicy/fomchistorical%d.htm" % y)
    for h in re.findall(r"<h5[^>]*>(.*?)</h5>", t, re.S):
        h = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", h)).strip()
        if "Meeting" not in h or re.search(r"unscheduled|cancelled|notation|Conference", h, re.I):
            continue
        m = re.match(r"^([A-Z][a-z]+)(?:/([A-Z][a-z]+))? (\d{1,2})(?:-(?:([A-Z][a-z]+) )?(\d{1,2}))? Meeting - (\d{4})$", h)
        if not m:
            raise SystemExit("unexpected heading: " + h)
        mon1, mon2, d1, mon3, d2, yr = m.groups()
        months = [x for x in (mon1, mon2 or mon3) if x]
        dates.append(last_day(int(yr), months, [x for x in (d1, d2) if x]))
    time.sleep(0.5)
t = get("https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm")
for yr in range(2021, 2031):
    i = t.find("%d FOMC Meetings" % yr)
    if i < 0:
        continue
    j = t.find("FOMC Meetings", i + 20)
    seg = t[i:j if j > 0 else i + 20000]
    for mon, day in re.findall(r"fomc-meeting__month[^>]*>(.*?)</div>.*?fomc-meeting__date[^>]*>(.*?)</div>", seg, re.S):
        mon, day = re.sub(r"<[^>]+>", "", mon).strip(), re.sub(r"<[^>]+>", "", day).strip()
        if re.search(r"unscheduled|cancelled|notation", day, re.I):
            continue
        dd = re.findall(r"\d{1,2}", day)
        dates.append(last_day(yr, mon.split("/"), dd))
dates = sorted(set(dates))
with open(os.path.join(OUT, "fomc.json"), "w") as f:
    json.dump(dates, f)
by = {}
for d in dates:
    by[d[:4]] = by.get(d[:4], 0) + 1
print("FOMC scheduled announcement days:", len(dates), dates[0], "->", dates[-1], "| per year:", " ".join("%s:%d" % kv for kv in sorted(by.items())))

# ---------- Yahoo daily stock indices ----------
for name, sym in (("US", "^GSPC"), ("EUR", "^STOXX50E"), ("GBP", "^FTSE"), ("JPY", "^N225"), ("CAD", "^GSPTSE"), ("AUD", "^AXJO"), ("CHF", "^SSMI"), ("NZD", "^NZ50")):
    res = json.loads(get("https://query1.finance.yahoo.com/v8/finance/chart/%s?interval=1d&range=5y" % urllib.request.quote(sym)))["chart"]["result"][0]
    c = res["indicators"]["quote"][0]["close"]
    rows = [[ts, v] for ts, v in zip(res["timestamp"], c) if v]
    with open(os.path.join(OUT, "EQ_%s.json" % name), "w") as f:
        json.dump(rows, f)
    print("EQ", name.ljust(4), sym.ljust(10), len(rows), time.strftime("%Y-%m-%d", time.gmtime(rows[0][0])), "->", time.strftime("%Y-%m-%d", time.gmtime(rows[-1][0])))
    time.sleep(1)
