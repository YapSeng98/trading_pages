// Forex round 2: the tests written down in PLAN.md (2026-10-30, before any of them was run). usage: node edges_test.js
// Data: data/ (fetch_edges.py: FRED noon rates, the Fed's meeting days, stock indices), ../data (Yahoo hourly bars,
// ../fetch_fx.py) and ../../world/data (interest rates, ../../world/fetch_world.py).
const fs = require("fs"), path = require("path");
const L = require(path.join(__dirname, "../../xau-replay/lib"));
const D = path.join(__dirname, "data"), HD = path.join(__dirname, "../data"), WD = path.join(__dirname, "../../world/data");
const DAY = 86400, NB = 10000, out = { tested: new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10) };
const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN), sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const bp = v => (Number.isNaN(v) ? "—" : (v >= 0 ? "+" : "") + (v * 1e4).toFixed(1) + " bp"), r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
const ymd = t => new Date(t * 1000).toISOString().slice(0, 10), Y = t => new Date(t * 1000).getUTCFullYear();

// ---------- bootstrap: share of resampled means at or below zero (one-sided p) ----------
function bootGroups(groups, seed) {      // resample whole groups (events, weeks, months)
  const rnd = L.rng(seed); let le = 0;
  for (let b = 0; b < NB; b++) { let s = 0, n = 0; for (let i = 0; i < groups.length; i++) { const g = groups[(rnd() * groups.length) | 0]; for (const v of g) { s += v; n++; } } if (s / n <= 0) le++; }
  return le / NB;
}
function bootBlocks(v, len, seed) {      // moving blocks of len consecutive values
  const rnd = L.rng(seed); let le = 0;
  for (let b = 0; b < NB; b++) { let s = 0, n = 0; while (n < v.length) { const st = (rnd() * (v.length - len + 1)) | 0; for (let k = 0; k < len && n < v.length; k++) { s += v[st + k]; n++; } } if (s / n <= 0) le++; }
  return le / NB;
}

// ---------- time zones: the UTC second of a whole local hour, and local parts of a UTC second ----------
const FMT = {};
function parts(zone, tSec) {
  const f = FMT[zone] || (FMT[zone] = new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" }));
  const o = {}; for (const p of f.formatToParts(new Date(tSec * 1000))) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour, wd: o.weekday };
}
function zoned(zone, y, m, d, h) {
  const want = Date.UTC(y, m - 1, d, h) / 1000; let t = want;
  for (let i = 0; i < 3; i++) { const p = parts(zone, t); t += want - Date.UTC(p.y, p.m - 1, p.d, p.h) / 1000; }
  return t;
}
const LON = "Europe/London", NY = "America/New_York", TKY = "Asia/Tokyo", SYD = "Australia/Sydney";

// ---------- data ----------
const csv = id => fs.readFileSync(path.join(D, id + ".csv"), "utf8").trim().split("\n").map(l => { const [d, v] = l.split(","); return [Date.parse(d + "T00:00:00Z") / 1000, +v]; }).filter(r => isFinite(r[1]) && r[1] > 0);
const mIdx = t => { const d = new Date(t * 1000); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
function rateSeries(...ids) {            // the monthly rate known on day t: last month's, the last value carried forward
  const m = new Map();
  for (const id of ids.slice().reverse()) for (const l of fs.readFileSync(path.join(WD, id + ".csv"), "utf8").trim().split("\n")) { const [d, v] = l.split(","); if (isFinite(+v) && v !== "") m.set(mIdx(Date.parse(d + "T00:00:00Z") / 1000), +v); }
  const keys = [...m.keys()].sort((a, b) => a - b);
  return t => { const want = mIdx(t) - 1; let lo = 0, hi = keys.length; while (lo < hi) { const md = (lo + hi) >> 1; if (keys[md] <= want) lo = md + 1; else hi = md; } return lo ? m.get(keys[lo - 1]) : null; };
}
const USR = rateSeries("IR3TIB01USM156N");
const G9 = [ // name, FRED series, true when quoted in dollars per unit, rate series, cost a side (bp)
  ["EUR", "DEXUSEU", true, rateSeries("IR3TIB01EZM156N"), 1], ["JPY", "DEXJPUS", false, rateSeries("IR3TIB01JPM156N", "IRSTCI01JPM156N"), 1],
  ["GBP", "DEXUSUK", true, rateSeries("IR3TIB01GBM156N"), 1], ["CHF", "DEXSZUS", false, rateSeries("IR3TIB01CHM156N", "IRSTCI01CHM156N"), 1],
  ["CAD", "DEXCAUS", false, rateSeries("IR3TIB01CAM156N"), 1], ["AUD", "DEXUSAL", true, rateSeries("IR3TIB01AUM156N"), 1],
  ["NZD", "DEXUSNZ", true, rateSeries("IR3TIB01NZM156N"), 1], ["NOK", "DEXNOUS", false, rateSeries("IR3TIB01NOM156N"), 2.5],
  ["SEK", "DEXSDUS", false, rateSeries("IR3TIB01SEM156N"), 2.5],
].map(([name, id, direct, rate, cost]) => { const d = csv(id), px = new Map(d.map(r => [r[0], direct ? r[1] : 1 / r[1]])); return { name, rate, cost, px, t: d.map(r => r[0]) }; });
const lastFred = Math.min(...G9.map(c => c.t[c.t.length - 1]));
const fredDays = [...new Set(G9.flatMap(c => c.t))].sort((a, b) => a - b);
const hourly = pair => { const H = JSON.parse(fs.readFileSync(path.join(HD, pair + "_1h.json"))).filter(r => r[0] % 3600 === 0); return { H, close: new Map(H.map(r => [r[0] + 3600, r[4]])) }; };   // close at the end of each hour
const PAIRS = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF", "EURJPY", "GBPJPY", "AUDJPY", "EURGBP"], HR = {};
PAIRS.forEach(p => { HR[p] = hourly(p); });

// ============ A1 Fed announcement days ============
let fomc = JSON.parse(fs.readFileSync(path.join(D, "fomc.json"))).map(d => Date.parse(d + "T00:00:00Z") / 1000);
fomc = fomc.filter((t, i) => !(i + 1 < fomc.length && fomc[i + 1] - t <= 2 * DAY));   // 2003-09-15/16 is one meeting
function window2(t) {                    // noon of the business day before t to noon of the business day after
  let lo = 0, hi = fredDays.length; while (lo < hi) { const md = (lo + hi) >> 1; if (fredDays[md] < t) lo = md + 1; else hi = md; }
  const b = fredDays[lo - 1], a = fredDays[fredDays[lo] === t ? lo + 1 : lo];
  return b && a ? [b, a] : null;
}
function basket(t, pick) {               // short the dollar against the currencies with prices at both ends
  const w = window2(t); if (!w || w[1] > lastFred) return null;
  const [b, a] = w, fin = 0.01 * (a - b) / DAY / 365, legs = [];
  for (const c of G9) { const p0 = c.px.get(b), p1 = c.px.get(a); if (p0 && p1) legs.push({ c, g: p1 / p0 - 1, net: p1 / p0 - 1 - 2 * c.cost / 1e4 - fin, rd: (c.rate(t) ?? NaN) - (USR(t) ?? NaN) }); }
  if (legs.length < 6) return null;
  const use = pick ? pick(legs) : legs;
  return { t, gross: mean(use.map(x => x.g)), net: mean(use.map(x => x.net)), legs };
}
const top3 = legs => legs.filter(x => !Number.isNaN(x.rd)).sort((a, b) => b.rd - a.rd).slice(0, 3);
const T11 = Date.UTC(2011, 0, 1) / 1000, T19 = Date.UTC(2019, 0, 1) / 1000;
const ev = fomc.map(t => basket(t)).filter(Boolean), oos = ev.filter(e => e.t >= T11), ins = ev.filter(e => e.t < T11);
const A1 = { n: oos.length, from: ymd(oos[0].t), to: ymd(oos[oos.length - 1].t), avgBp: r2(mean(oos.map(e => e.net)) * 1e4), grossBp: r2(mean(oos.map(e => e.gross)) * 1e4), win: Math.round(oos.filter(e => e.net > 0).length / oos.length * 100) };
A1.p = bootGroups(oos.map(e => [e.net]), 11);
A1.h1 = r2(mean(oos.filter(e => e.t < T19).map(e => e.net)) * 1e4); A1.h2 = r2(mean(oos.filter(e => e.t >= T19).map(e => e.net)) * 1e4);
A1.paperYears = { n: ins.length, avgBp: r2(mean(ins.map(e => e.net)) * 1e4), grossBp: r2(mean(ins.map(e => e.gross)) * 1e4), p: bootGroups(ins.map(e => [e.net]), 12) };
const hiR = fomc.map(t => basket(t, top3)).filter(e => e && e.t >= T11);
A1.highRate3 = { n: hiR.length, avgBp: r2(mean(hiR.map(e => e.net)) * 1e4) };
const near = t => fomc.some(f => Math.abs(f - t) <= 3 * DAY), ctl = fredDays.filter(t => t >= T11 && !near(t)).map(t => basket(t)).filter(Boolean);
A1.otherDays = { n: ctl.length, avgBp: r2(mean(ctl.map(e => e.net)) * 1e4), grossBp: r2(mean(ctl.map(e => e.gross)) * 1e4) };
A1.byCurrency = {}; for (const c of G9) A1.byCurrency[c.name] = r2(mean(oos.map(e => e.legs.find(x => x.c === c)).filter(Boolean).map(x => x.g)) * 1e4);
A1.byYear = {}; for (let y = 2011; y <= 2026; y++) { const e = oos.filter(x => Y(x.t) === y); if (e.length) A1.byYear[y] = r2(mean(e.map(x => x.net)) * 1e4); }
// the paper's own window on the Yahoo hourly bars, 4pm ET the business day before to 4pm ET on the day (information)
const USDP = [["EURUSD", 1], ["GBPUSD", 1], ["AUDUSD", 1], ["NZDUSD", 1], ["USDJPY", -1], ["USDCAD", -1], ["USDCHF", -1]], hy = [];
for (const t of fomc) {
  const d = new Date(t * 1000), prev = new Date(t * 1000 - (d.getUTCDay() === 1 ? 3 : 1) * DAY * 1000);
  const t0 = zoned(NY, prev.getUTCFullYear(), prev.getUTCMonth() + 1, prev.getUTCDate(), 16), t1 = zoned(NY, d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 16), r = [];
  for (const [p, s] of USDP) { const a = HR[p].close.get(t0), b = HR[p].close.get(t1); if (a && b) r.push(s > 0 ? b / a - 1 : a / b - 1); }
  if (r.length === USDP.length) hy.push(mean(r));
}
A1.hourly4pm = { n: hy.length, grossBp: r2(mean(hy) * 1e4) };
console.log("==== A1 Fed announcement days: short the dollar against 9 currencies, noon the day before to noon the day after ====");
console.log("  2011-" + A1.to.slice(0, 4) + ": " + A1.n + " announcements  net " + bp(A1.avgBp / 1e4) + " (gross " + bp(A1.grossBp / 1e4) + ")  wins " + A1.win + "%  p " + A1.p.toFixed(3) + "  | 2011-2018 " + bp(A1.h1 / 1e4) + "  2019-2026 " + bp(A1.h2 / 1e4));
console.log("  information: 1994-2010 (the paper's years) " + A1.paperYears.n + " announcements net " + bp(A1.paperYears.avgBp / 1e4) + " (gross " + bp(A1.paperYears.grossBp / 1e4) + ", p " + A1.paperYears.p.toFixed(3) + ")");
console.log("  information: 3 highest-rate currencies " + bp(A1.highRate3.avgBp / 1e4) + "  · same windows on other days " + bp(A1.otherDays.avgBp / 1e4) + " (" + A1.otherDays.n + ")  · paper's 4pm window on hourly bars 2024-26: " + bp(A1.hourly4pm.grossBp / 1e4) + " gross (" + A1.hourly4pm.n + ")");
console.log("  by currency (gross): " + Object.entries(A1.byCurrency).map(([k, v]) => k + " " + (v >= 0 ? "+" : "") + v).join("  ") + "\n  by year (net bp): " + Object.entries(A1.byYear).map(([k, v]) => k + " " + (v >= 0 ? "+" : "") + v.toFixed(0)).join("  "));

// ============ A2 time of day ============
function sessions(pair, legs) {          // legs: [zone, start hour, end hour, side, endZone?] per leg, one day's trades
  const C = HR[pair].close, H = HR[pair].H, days = [];
  const d0 = Date.UTC(new Date(H[0][0] * 1000).getUTCFullYear(), new Date(H[0][0] * 1000).getUTCMonth(), new Date(H[0][0] * 1000).getUTCDate()) / 1000;
  for (let t = d0 + DAY; t < H[H.length - 1][0]; t += DAY) {
    const d = new Date(t * 1000), wd = d.getUTCDay(); if (wd === 0 || wd === 6) continue;
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, dd = d.getUTCDate(), r = [];
    for (const [z0, h0, z1, h1, side] of legs) { const a = C.get(zoned(z0, y, m, dd, h0)), b = C.get(zoned(z1, y, m, dd, h1)); if (!a || !b) { r.length = 0; break; } r.push(side * (b / a - 1)); }
    if (r.length === legs.length) days.push({ t, legs: r, gross: r.reduce((s, v) => s + v, 0) });
  }
  return days;
}
const weekOf = t => Math.floor((t / DAY + 3) / 7);    // Monday-based week number
function weekGroups(days, f) { const m = new Map(); for (const d of days) { const k = weekOf(d.t); (m.get(k) || m.set(k, []).get(k)).push(f(d)); } return [...m.values()]; }
const EU = [[LON, 7, NY, 8, -1], [NY, 8, NY, 16, 1]];   // EUR/USD: short 07:00 London -> 08:00 New York, long 08:00 -> 16:00 New York
const eu = sessions("EURUSD", EU), netOf = (d, c) => d.gross - d.legs.length * c / 1e4, half = Math.floor(eu.length / 2);
const A2 = { days: eu.length, from: ymd(eu[0].t), to: ymd(eu[eu.length - 1].t), avgBp: r2(mean(eu.map(d => netOf(d, 1))) * 1e4), grossBp: r2(mean(eu.map(d => d.gross)) * 1e4) };
A2.p = bootGroups(weekGroups(eu, d => netOf(d, 1)), 21);
A2.h1 = r2(mean(eu.slice(0, half).map(d => netOf(d, 1))) * 1e4); A2.h2 = r2(mean(eu.slice(half).map(d => netOf(d, 1))) * 1e4);
A2.at2bp = r2(mean(eu.map(d => netOf(d, 2))) * 1e4); A2.breakEvenBpPerTrade = r2(A2.grossBp / 2);
A2.legs = { europeShort: r2(mean(eu.map(d => d.legs[0])) * 1e4), usLong: r2(mean(eu.map(d => d.legs[1])) * 1e4) };
A2.yearly = r2(mean(eu.map(d => netOf(d, 1))) * 252 * 100);
const OTH = { GBPUSD: [[LON, 7, NY, 8, -1], [NY, 8, NY, 16, 1]], USDCHF: [[LON, 7, NY, 8, 1], [NY, 8, NY, 16, -1]], USDJPY: [[TKY, 8, TKY, 15, 1], [NY, 8, NY, 16, -1]], AUDUSD: [[SYD, 10, SYD, 16, -1], [NY, 8, NY, 16, 1]] };
A2.otherPairs = {}; for (const [p, lg] of Object.entries(OTH)) { const s = sessions(p, lg); A2.otherPairs[p] = { days: s.length, grossBp: r2(mean(s.map(d => d.gross)) * 1e4), netBp: r2(mean(s.map(d => netOf(d, 1.5))) * 1e4) }; }
console.log("\n==== A2 time of day, EUR/USD: short 07:00 London -> 08:00 New York, long 08:00 -> 16:00 New York ====");
console.log("  " + A2.days + " weekdays " + A2.from + " -> " + A2.to + ": net " + bp(A2.avgBp / 1e4) + " a day at 1 bp a trade (gross " + bp(A2.grossBp / 1e4) + ")  p " + A2.p.toFixed(3) + "  | halves " + bp(A2.h1 / 1e4) + " / " + bp(A2.h2 / 1e4) + "  | about " + A2.yearly.toFixed(1) + "% a year unlevered");
console.log("  information: at 2 bp a trade " + bp(A2.at2bp / 1e4) + " a day; breaks even at " + A2.breakEvenBpPerTrade.toFixed(2) + " bp a trade; legs: Europe short " + bp(A2.legs.europeShort / 1e4) + ", US long " + bp(A2.legs.usLong / 1e4));
console.log("  information, other pairs at 1.5 bp a trade: " + Object.entries(A2.otherPairs).map(([k, v]) => k + " gross " + bp(v.grossBp / 1e4) + " net " + bp(v.netBp / 1e4)).join(" · "));

// ============ A3 currency momentum: long the 3 strongest, short the 3 weakest, monthly ============
const months = []; { let cur = null; for (const t of fredDays) { const k = mIdx(t); if (cur && cur.k !== k) months.push(cur); cur = { k, t }; } }   // last noon rate of each finished month
function exRet(c, a, b) {                // a currency's excess return against the dollar from month-end a to month-end b
  const p0 = c.px.get(a.t), p1 = c.px.get(b.t); if (!p0 || !p1) return NaN;
  const rf = c.rate(b.t), ru = USR(b.t); return p1 / p0 - 1 + (rf !== null && ru !== null ? (rf - ru) / 100 / 12 : 0);
}
const mom = []; let w = new Map();
for (let i = 1; i + 1 < months.length; i++) {
  const live = G9.map(c => ({ c, r: exRet(c, months[i - 1], months[i]) })).filter(x => !Number.isNaN(x.r));
  if (live.length < 6) { w = new Map(); continue; }
  live.sort((a, b) => b.r - a.r);
  const nw = new Map(); live.slice(0, 3).forEach(x => nw.set(x.c, 1 / 3)); live.slice(-3).forEach(x => nw.set(x.c, -1 / 3));
  let cost = 0; for (const c of G9) cost += Math.abs((nw.get(c) || 0) - (w.get(c) || 0)) * 1.5 / 1e4;
  let ret = 0, ok = true; for (const [c, wt] of nw) { const r = exRet(c, months[i], months[i + 1]); if (Number.isNaN(r)) ok = false; else ret += wt * r; }
  w = nw; if (!ok) continue;
  mom.push({ t: months[i + 1].t, k: months[i + 1].k, net: ret - cost - 2 * 0.01 / 12, gross: ret });
}
const mo = mom.filter(x => x.t >= T11 && x.t < Date.UTC(2026, 9, 1) / 1000), mi = mom.filter(x => x.t < T11 && x.t >= Date.UTC(1976, 0, 1) / 1000);
const A3 = { months: mo.length, from: ymd(mo[0].t).slice(0, 7), to: ymd(mo[mo.length - 1].t).slice(0, 7), avgPct: r3(mean(mo.map(x => x.net)) * 100), grossPct: r3(mean(mo.map(x => x.gross)) * 100), sharpe: r2(mean(mo.map(x => x.net)) / sd(mo.map(x => x.net)) * Math.sqrt(12)) };
A3.p = bootBlocks(mo.map(x => x.net), 3, 31);
A3.h1 = r3(mean(mo.filter(x => x.t < T19).map(x => x.net)) * 100); A3.h2 = r3(mean(mo.filter(x => x.t >= T19).map(x => x.net)) * 100);
A3.before2011 = { months: mi.length, avgPct: r3(mean(mi.map(x => x.net)) * 100), sharpe: r2(mean(mi.map(x => x.net)) / sd(mi.map(x => x.net)) * Math.sqrt(12)) };
console.log("\n==== A3 currency momentum: each month long the 3 strongest, short the 3 weakest of 9 (past month, with interest) ====");
console.log("  " + A3.from + " -> " + A3.to + ": " + A3.months + " months, net " + (A3.avgPct >= 0 ? "+" : "") + A3.avgPct.toFixed(3) + "% a month (gross " + A3.grossPct.toFixed(3) + "%), Sharpe " + A3.sharpe + "  p " + A3.p.toFixed(3) + "  | 2011-2018 " + A3.h1.toFixed(3) + "%  2019-2026 " + A3.h2.toFixed(3) + "%");
console.log("  information: 1976-2010 " + A3.before2011.months + " months, net " + A3.before2011.avgPct.toFixed(3) + "% a month, Sharpe " + A3.before2011.sharpe);

// ---------- Holm across family A ----------
const fam = [["A1", A1], ["A2", A2], ["A3", A3]].sort((a, b) => a[1].p - b[1].p); let stop = false;
fam.forEach(([k, o], i) => { const lim = 0.05 / (fam.length - i); o.holmLimit = r3(lim); o.holmOk = !stop && o.p <= lim; if (!o.holmOk) stop = true; });
A1.passed = A1.holmOk && A1.avgBp > 0 && A1.h1 > 0 && A1.h2 > 0;
A2.passed = A2.holmOk && A2.avgBp > 0 && A2.h1 > 0 && A2.h2 > 0;
A3.passed = A3.holmOk && A3.avgPct > 0 && A3.h1 > 0 && A3.h2 > 0;
console.log("\n  Holm (family A): " + fam.map(([k, o]) => k + " p " + o.p.toFixed(3) + " vs " + o.holmLimit.toFixed(3)).join(" · ") + "\n  verdicts: A1 " + (A1.passed ? "PASSES" : "FAILS") + " · A2 " + (A2.passed ? "PASSES" : "FAILS") + " · A3 " + (A3.passed ? "PASSES" : "FAILS"));

// ============ B1 London breakout of the Asian range ============
const B1 = { pairs: {} }, allT = [];
for (const pair of PAIRS) {
  const H = HR[pair].H, at = new Map(H.map((r, i) => [r[0], i])), cost = /USD/.test(pair) ? 1 : 2, tr = [];
  const d0 = Date.UTC(new Date(H[0][0] * 1000).getUTCFullYear(), new Date(H[0][0] * 1000).getUTCMonth(), new Date(H[0][0] * 1000).getUTCDate()) / 1000;
  for (let t = d0 + DAY; t < H[H.length - 1][0]; t += DAY) {
    const d = new Date(t * 1000), wd = d.getUTCDay(); if (wd === 0 || wd === 6) continue;
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, dd = d.getUTCDate(), h0 = zoned(LON, y, m, dd, 0);
    let hi = -Infinity, lo = Infinity, cnt = 0;
    for (let k = 0; k < 7; k++) { const i = at.get(h0 + k * 3600); if (i !== undefined) { hi = Math.max(hi, H[i][2]); lo = Math.min(lo, H[i][3]); cnt++; } }
    if (cnt < 6 || !(hi > lo)) continue;
    let dir = 0, ei = -1;
    for (let k = 7; k <= 10 && !dir; k++) { const i = at.get(h0 + k * 3600); if (i === undefined) continue; if (H[i][4] > hi) dir = 1; else if (H[i][4] < lo) dir = -1; if (dir) ei = at.get(h0 + (k + 1) * 3600) ?? -1; }
    if (!dir || ei < 0) continue;
    const entry = H[ei][1], stopPx = dir > 0 ? lo : hi, target = entry + dir * (hi - lo), risk = (entry - stopPx) * dir, endT = h0 + 15 * 3600;
    if (!(risk > 0)) continue;
    let exit = null;
    for (let i = ei; i < H.length && H[i][0] <= endT; i++) {
      if (dir > 0 ? H[i][3] <= stopPx : H[i][2] >= stopPx) { exit = stopPx; break; }
      if (dir > 0 ? H[i][2] >= target : H[i][3] <= target) { exit = target; break; }
      exit = H[i][4];
    }
    if (exit === null) continue;
    tr.push({ t, R: ((exit - entry) * dir - entry * 2 * cost / 1e4) / risk });
  }
  B1.pairs[pair] = { n: tr.length, avgR: r3(mean(tr.map(x => x.R))), win: Math.round(tr.filter(x => x.R > 0).length / tr.length * 100) };
  allT.push(...tr);
}
{
  const by = new Map(); allT.forEach(x => { const k = mIdx(x.t); (by.get(k) || by.set(k, []).get(k)).push(x.R); });
  const ts = allT.map(x => x.t).sort((a, b) => a - b), mid = ts[Math.floor(ts.length / 2)];
  Object.assign(B1, { n: allT.length, avgR: r3(mean(allT.map(x => x.R))), win: Math.round(allT.filter(x => x.R > 0).length / allT.length * 100), p: bootGroups([...by.values()], 41), positive: Object.values(B1.pairs).filter(p => p.avgR > 0).length, h1: r3(mean(allT.filter(x => x.t < mid).map(x => x.R))), h2: r3(mean(allT.filter(x => x.t >= mid).map(x => x.R))) });
  B1.passed = B1.avgR > 0 && B1.p < 0.05 && B1.positive >= 7 && B1.h1 > 0 && B1.h2 > 0;
}
console.log("\n==== B1 London breakout of the Asian range, 11 pairs, stop the other side, target one range, out at 16:00 London ====");
console.log("  " + Object.entries(B1.pairs).map(([k, v]) => k + " " + v.n + " " + (v.avgR >= 0 ? "+" : "") + v.avgR.toFixed(2) + "R").join(" · "));
console.log("  all: " + B1.n + " trades, win " + B1.win + "%, avg " + (B1.avgR >= 0 ? "+" : "") + B1.avgR.toFixed(3) + "R  p " + B1.p.toFixed(3) + "  pairs positive " + B1.positive + "/11  halves " + B1.h1.toFixed(3) + " / " + B1.h2.toFixed(3) + "R  -> " + (B1.passed ? "PASSES" : "FAILS"));

// ============ information: the month-end fix (Melvin & Prins) ============
// each index dated by its own market's local day (Yahoo stamps a day by its opening time in UTC: Sydney's falls on the day before)
const EQZ = { US: NY, EUR: "Europe/Berlin", GBP: LON, JPY: TKY, CAD: "America/Toronto", AUD: SYD, CHF: "Europe/Zurich", NZD: "Pacific/Auckland" }, EQ = {};
for (const c of Object.keys(EQZ)) EQ[c] = JSON.parse(fs.readFileSync(path.join(D, "EQ_" + c + ".json"))).map(r => { const q = parts(EQZ[c], r[0]); return [Date.UTC(q.y, q.m - 1, q.d) / 1000, r[1]]; });
const eqAt = (c, t) => { const a = EQ[c]; let v = null; for (const r of a) { if (r[0] <= t) v = r[1]; else break; } return v; };     // last close on or before day t
const FXP = { EUR: ["EURUSD", 1], GBP: ["GBPUSD", 1], JPY: ["USDJPY", -1], CAD: ["USDCAD", -1], AUD: ["AUDUSD", 1], CHF: ["USDCHF", -1], NZD: ["NZDUSD", 1] };
const fixRows = [], fixTrades = [];
for (let k = mIdx(HR.EURUSD.H[0][0]) + 1; k <= mIdx(HR.EURUSD.H[HR.EURUSD.H.length - 1][0]) - 1; k++) {
  const y = Math.floor(k / 12), m = k % 12 + 1, wdays = [];
  for (let d = 1; d <= 31; d++) { const t = Date.UTC(y, m - 1, d) / 1000; if (new Date(t * 1000).getUTCMonth() !== m - 1) break; const wd = new Date(t * 1000).getUTCDay(); if (wd && wd !== 6) wdays.push(t); }
  const T = wdays[wdays.length - 1], T1 = wdays[wdays.length - 2], prevEnd = Date.UTC(y, m - 1, 0) / 1000;
  const dT = new Date(T * 1000), a = zoned(LON, dT.getUTCFullYear(), dT.getUTCMonth() + 1, dT.getUTCDate(), 15), b = a + 3600;
  const eq = {}, fx = { USD: 0 }; let ok = true;
  for (const c of Object.keys(EQ)) { const p0 = eqAt(c, prevEnd), p1 = eqAt(c, T1); if (!p0 || !p1) ok = false; else eq[c] = p1 / p0 - 1; }
  for (const [c, [p, s]] of Object.entries(FXP)) { const x0 = HR[p].close.get(a), x1 = HR[p].close.get(b); if (!x0 || !x1) ok = false; else fx[c] = s > 0 ? x1 / x0 - 1 : x0 / x1 - 1; }
  if (!ok) continue;
  const ccy = ["USD", ...Object.keys(FXP)], eqk = c => (c === "USD" ? "US" : c), me = mean(ccy.map(c => eq[eqk(c)])), mf = mean(ccy.map(c => fx[c]));
  for (const c of ccy) fixRows.push([eq[eqk(c)] - me, fx[c] - mf]);
  for (const c of Object.keys(FXP)) { const rel = eq[c] - eq.US; if (rel) fixTrades.push(-Math.sign(rel) * fx[c] - 2 / 1e4); }
}
{ const mx = mean(fixRows.map(r => r[0])), my = mean(fixRows.map(r => r[1])), sxy = fixRows.reduce((s, r) => s + (r[0] - mx) * (r[1] - my), 0), sxx = fixRows.reduce((s, r) => s + (r[0] - mx) ** 2, 0);
  out.monthEnd = { monthEnds: fixRows.length / 8, slope: r3(sxy / sxx), paperSlope: -0.0142, tradeNetBp: r2(mean(fixTrades) * 1e4), trades: fixTrades.length, win: Math.round(fixTrades.filter(v => v > 0).length / fixTrades.length * 100) };
  console.log("\n==== information: month-end fix hour (15:00-16:00 London, last weekday), 2024-2026 ====\n  " + out.monthEnd.monthEnds + " month-ends: slope " + out.monthEnd.slope + " (paper " + out.monthEnd.paperSlope + "); trading each currency against the dollar on its stocks vs US stocks: " + out.monthEnd.trades + " trades, net " + bp(out.monthEnd.tradeNetBp / 1e4) + ", wins " + out.monthEnd.win + "%"); }

Object.assign(out, { A1, A2, A3, B1, passed: [A1.passed && "A1", A2.passed && "A2", A3.passed && "A3", B1.passed && "B1"].filter(Boolean) });
fs.writeFileSync(path.join(__dirname, "result.json"), JSON.stringify(out, null, 1) + "\n");
console.log("\npassed: " + (out.passed.length ? out.passed.join(", ") : "none"));
