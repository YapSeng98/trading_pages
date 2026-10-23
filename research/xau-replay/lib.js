// Shared helpers for the XAU replay: load 1-minute bars, cut candles in broker time, load the page's own code.
const fs = require("fs"), vm = require("vm"), path = require("path");
const REPO = path.resolve(__dirname, "../..");
const DATA = process.env.XAU_REPLAY_DATA || path.join(__dirname, "data");       // 1-minute history and replay output live here (not in git)

// ---- 1-minute bars ----
// files: compact int32 records (t, o, h, l, c[, extra]); prices in 1/1000 USD.
function loadBars(files, recInts) {
  const chunks = files.filter(f => fs.existsSync(f)).map(f => { const b = fs.readFileSync(f); return new Int32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); });
  let n = 0; chunks.forEach(iv => { n += iv.length / recInts; });
  const t = new Float64Array(n), o = new Float64Array(n), h = new Float64Array(n), l = new Float64Array(n), c = new Float64Array(n), x = new Float64Array(n);
  let k = 0;
  for (const iv of chunks) for (let i = 0; i < iv.length; i += recInts) { t[k] = iv[i]; o[k] = iv[i + 1] / 1000; h[k] = iv[i + 2] / 1000; l[k] = iv[i + 3] / 1000; c[k] = iv[i + 4] / 1000; x[k] = recInts > 5 ? iv[i + 5] : 1; k++; }
  for (let i = 1; i < n; i++) if (t[i] <= t[i - 1]) throw new Error("bars not ascending at " + i + " in " + files[0]);
  return { t, o, h, l, c, x, n };
}
function years(a, b) { const r = []; for (let y = a; y <= b; y++) r.push(y); return r; }
function source(name, y0, y1) {
  if (name === "duk") return loadBars(years(y0, y1).map(y => DATA + "/duk/BID_" + y + ".bin"), 5);
  if (name === "dukask") return loadBars(years(y0, y1).map(y => DATA + "/duk/ASK_" + y + ".bin"), 5);
  if (name === "paxg") return loadBars(years(y0, y1).map(y => DATA + "/paxg/paxg_" + y + ".bin"), 6);
  if (name === "btc") return loadBars(years(y0, y1).map(y => DATA + "/btcusdt/btcusdt_" + y + ".bin"), 6);   // Binance BTCUSDT (download_binance.py)
  throw new Error("unknown source " + name);
}
// index of the first bar with t >= ts
function lowerBound(t, ts) { let a = 0, b = t.length; while (a < b) { const m = (a + b) >> 1; if (t[m] < ts) a = m + 1; else b = m; } return a; }

// ---- time ----
// US daylight time: second Sunday of March 07:00 UTC to first Sunday of November 06:00 UTC.
const dstCache = {};
function usDst(tSec) {
  const y = new Date(tSec * 1000).getUTCFullYear();
  let r = dstCache[y];
  if (!r) {
    const mar1 = new Date(Date.UTC(y, 2, 1)).getUTCDay(), nov1 = new Date(Date.UTC(y, 10, 1)).getUTCDay();
    const start = Date.UTC(y, 2, 1 + ((7 - mar1) % 7) + 7, 7) / 1000, end = Date.UTC(y, 10, 1 + ((7 - nov1) % 7), 6) / 1000;
    r = dstCache[y] = [start, end];
  }
  return tSec >= r[0] && tSec < r[1];
}
// "Server time" used by most MT4/MT5 gold brokers: New York + 7h, so the day rolls at 17:00 New York. Offset in seconds.
function serverOff(tSec) { return (usDst(tSec) ? 3 : 2) * 3600; }
// Spot gold is shut from Friday 17:00 to Sunday 18:00 New York.
function spotClosed(tSec) {
  const loc = tSec + serverOff(tSec) - 7 * 3600;          // New York wall clock as if UTC
  const d = new Date(loc * 1000), wd = d.getUTCDay(), hr = d.getUTCHours();
  return wd === 6 || (wd === 5 && hr >= 17) || (wd === 0 && hr < 18);
}

// ---- candles ----
const DUR = { "15M": 900, "1H": 3600, "4H": 14400, "D": 86400, "W": 604800 };
// align "ny": cut 4-hour, daily and weekly candles in broker server time (the page does the same). "utc": plain UTC.
function bucket(tSec, tf, align) {
  const dur = DUR[tf], off = align === "ny" && dur > 3600 ? serverOff(tSec) : 0, loc = tSec + off;
  const s = tf === "W" ? Math.floor((loc - 345600) / 604800) * 604800 + 345600 : Math.floor(loc / dur) * dur;
  return s - off;
}
function aggregate(B, tf, align, skip) {
  const out = [], dur = DUR[tf]; let cur = null, start = -1;
  for (let i = 0; i < B.n; i++) {
    const ts = B.t[i]; if (skip && skip(ts)) continue;
    const s = bucket(ts, tf, align);
    if (s !== start) { start = s; cur = [s * 1000, B.o[i], B.h[i], B.l[i], B.c[i], 0, (s + dur) * 1000 - 1]; out.push(cur); }
    else { if (B.h[i] > cur[2]) cur[2] = B.h[i]; if (B.l[i] < cur[3]) cur[3] = B.l[i]; cur[4] = B.c[i]; }
  }
  return out;
}

// ---- the page's own code ----
function loadEngine(file) {
  const ctx = { console, Math, Date, isFinite, Promise, fetch: () => Promise.reject(new Error("no network in replay")) };
  vm.createContext(ctx); vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: path.basename(file) });
  return ctx;
}
function loadPlan(file) { delete require.cache[require.resolve(file)]; return require(file); }

// ---- small stats ----
function mean(a) { let s = 0; for (const v of a) s += v; return a.length ? s / a.length : NaN; }
function sd(a) { const m = mean(a); let s = 0; for (const v of a) s += (v - m) * (v - m); return a.length > 1 ? Math.sqrt(s / (a.length - 1)) : NaN; }
function quant(a, q) { if (!a.length) return NaN; const s = Float64Array.from(a).sort(), p = (s.length - 1) * q, i = Math.floor(p); return s[i] + (s[Math.min(i + 1, s.length - 1)] - s[i]) * (p - i); }
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

module.exports = { REPO, DATA, loadBars, source, lowerBound, usDst, serverOff, spotClosed, DUR, bucket, aggregate, loadEngine, loadPlan, mean, sd, quant, rng, years };
