#!/usr/bin/env python3
"""Binance spot 15-minute klines from Binance's public data archive (data.binance.vision) -> one file per year,
for testing the rule on markets it was never chosen on.
usage: download_binance15.py <SYMBOL> <first year> <scale>
   -> data/bn15/<symbol>_<year>.bin, records of 5 x little-endian int32: unix time (s), open, high, low, close,
      prices multiplied by <scale> (1000 for coins above about $50, 1000000 for cheap ones)."""
import io, os, struct, sys, zipfile, json, time, urllib.request, datetime as dt
from concurrent.futures import ThreadPoolExecutor
SYM, Y0, SCALE = sys.argv[1].upper(), int(sys.argv[2]), int(sys.argv[3])
OUT = os.path.join(os.environ.get("XAU_REPLAY_DATA") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "data"), "bn15")

def get(url, tries=5):
    for a in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=60) as r: return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
        except Exception:
            pass
        time.sleep(2 + 2 * a)
    raise RuntimeError("failed " + url)

def rec(t, o, h, l, c):
    return struct.pack("<5i", t, round(float(o) * SCALE), round(float(h) * SCALE), round(float(l) * SCALE), round(float(c) * SCALE))

def month(ym):
    y, m = ym
    raw = get("https://data.binance.vision/data/spot/monthly/klines/%s/15m/%s-15m-%04d-%02d.zip" % (SYM, SYM, y, m))
    if raw is None: return ym, None
    out = bytearray()
    for line in zipfile.ZipFile(io.BytesIO(raw)).read(zipfile.ZipFile(io.BytesIO(raw)).namelist()[0]).decode().splitlines():
        p = line.split(",")
        if not p[0].isdigit(): continue
        t = int(p[0]); t = t // 1000000 if t > 10**14 else t // 1000
        out += rec(t, p[1], p[2], p[3], p[4])
    return ym, bytes(out)

def tail(start_s):
    out = bytearray(); t = start_s * 1000
    while True:
        rows = json.loads(get("https://data-api.binance.vision/api/v3/klines?symbol=%s&interval=15m&limit=1000&startTime=%d" % (SYM, t)))
        if not rows: break
        for k in rows:
            if k[6] < time.time() * 1000: out += rec(k[0] // 1000, k[1], k[2], k[3], k[4])
        if len(rows) < 1000: break
        t = rows[-1][0] + 900000
    return bytes(out)

os.makedirs(OUT, exist_ok=True)
today = dt.date.today(); months = []; y, m = Y0, 1
while (y, m) < (today.year, today.month): months.append((y, m)); m += 1; y, m = (y + 1, 1) if m > 12 else (y, m)
with ThreadPoolExecutor(max_workers=6) as ex: parts = dict(ex.map(month, months))
have = [ym for ym in months if parts[ym]]
last = have[-1]; nxt = (last[0] + 1, 1) if last[1] == 12 else (last[0], last[1] + 1)
blob = bytearray(); [blob.extend(parts[ym]) for ym in have]; blob.extend(tail(int(dt.datetime(nxt[0], nxt[1], 1, tzinfo=dt.timezone.utc).timestamp())))
years = {}
for i in range(0, len(blob), 20): years.setdefault(dt.datetime.utcfromtimestamp(struct.unpack_from("<i", blob, i)[0]).year, bytearray()).extend(blob[i:i + 20])
for yy in sorted(years):
    with open("%s/%s_%d.bin" % (OUT, SYM.lower(), yy), "wb") as f: f.write(years[yy])
print(SYM, "years", sorted(years), "bars", len(blob) // 20, "first month with data", have[0])
