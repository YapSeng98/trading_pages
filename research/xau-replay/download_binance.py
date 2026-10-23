#!/usr/bin/env python3
"""Binance spot 1-minute klines for any symbol -> one compact file per year (data/<symbol>/<symbol>_<year>.bin).
Used for the Bitcoin replay (BTCUSDT); download_paxg.py is the same for PAXG.
usage: download_binance.py <SYMBOL> <first year>
Record: 6 x little-endian int32 = unix time (s), open, high, low, close (1/1000 USD), number of trades."""
import io, os, struct, sys, zipfile, json, time, urllib.request, datetime as dt
from concurrent.futures import ThreadPoolExecutor
SYM = sys.argv[1].upper()
OUT = os.path.join(os.environ.get("XAU_REPLAY_DATA") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "data"), SYM.lower())

def get(url, tries=5):
    for a in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
        except Exception:
            pass
        time.sleep(2 + 2 * a)
    raise RuntimeError("failed " + url)

def month(ym):
    y, m = ym
    raw = get("https://data.binance.vision/data/spot/monthly/klines/%s/1m/%s-1m-%04d-%02d.zip" % (SYM, SYM, y, m))
    if raw is None: return ym, None
    z = zipfile.ZipFile(io.BytesIO(raw)); out = bytearray()
    for line in z.read(z.namelist()[0]).decode().splitlines():
        p = line.split(",")
        if not p[0].isdigit(): continue
        t = int(p[0]); t = t // 1000000 if t > 10**14 else t // 1000
        out += struct.pack("<6i", t, round(float(p[1]) * 1000), round(float(p[2]) * 1000), round(float(p[3]) * 1000), round(float(p[4]) * 1000), int(p[8]))
    return ym, bytes(out)

def api_tail(start_s):
    out = bytearray(); t = start_s * 1000
    while True:
        rows = json.loads(get("https://data-api.binance.vision/api/v3/klines?symbol=%s&interval=1m&limit=1000&startTime=%d" % (SYM, t)))
        if not rows: break
        for k in rows:
            if k[6] < time.time() * 1000:   # closed bars only
                out += struct.pack("<6i", k[0] // 1000, round(float(k[1]) * 1000), round(float(k[2]) * 1000), round(float(k[3]) * 1000), round(float(k[4]) * 1000), int(k[8]))
        if len(rows) < 1000: break
        t = rows[-1][0] + 60000
    return bytes(out)

def main():
    os.makedirs(OUT, exist_ok=True)
    y0 = int(sys.argv[2]); today = dt.date.today(); months = []
    y, m = y0, 1
    while (y, m) < (today.year, today.month): months.append((y, m)); m += 1; y, m = (y + 1, 1) if m > 12 else (y, m)
    parts = {}
    with ThreadPoolExecutor(max_workers=8) as ex:
        for ym, blob in ex.map(month, months): parts[ym] = blob
    missing = [ym for ym in months if parts[ym] is None]
    have = [ym for ym in months if parts[ym] is not None]
    last = have[-1]; nxt = (last[0] + 1, 1) if last[1] == 12 else (last[0], last[1] + 1)
    tail = api_tail(int(dt.datetime(nxt[0], nxt[1], 1, tzinfo=dt.timezone.utc).timestamp()))
    years = {}
    for ym in have: years.setdefault(ym[0], bytearray()).extend(parts[ym])
    # tail may span a year boundary: split by timestamp
    for i in range(0, len(tail), 24):
        t = struct.unpack_from("<i", tail, i)[0]; years.setdefault(dt.datetime.utcfromtimestamp(t).year, bytearray()).extend(tail[i:i + 24])
    for y in sorted(years):
        with open("%s/%s_%d.bin" % (OUT, SYM.lower(), y), "wb") as f: f.write(years[y])
        n = len(years[y]) // 24; a = struct.unpack_from("<6i", years[y], 0); b = struct.unpack_from("<6i", years[y], (n - 1) * 24)
        print(y, "bars", n, dt.datetime.utcfromtimestamp(a[0]), a[4] / 1000, "->", dt.datetime.utcfromtimestamp(b[0]), b[4] / 1000)
    print("missing months", missing, "tail bars", len(tail) // 24)
main()
