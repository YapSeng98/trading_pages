// What tends to happen next, from the replayed engine states (states_full.bin, every 15-minute close 2011-02 to
// 2026-10), for the situation gold is in now. Descriptive only: no rule is fitted to these numbers.
//   situation: the weekly, daily and 4-hour trends agree, and the 1-hour runs against them (a bounce in a downtrend,
//   a pullback in an uptrend). Two ways out: the 1-hour turns back (with the 15-minute too, that is the rule's
//   signal), or the big three stop agreeing first. Also: price after 1, 5 and 10 days, against the base rates.
// usage: node scenario_check.js [--write]   (--write keeps the result in data/xau-scenarios.json)
const fs = require("fs"), path = require("path"), L = require("./lib"), S = require("./sim");
const st = S.loadStates("full"), a = st.a, C = 40, n = st.n, DAY = 86400;
const T = i => a[i * C], P = i => a[i * C + 38], col = (i, k) => a[i * C + k];
const big = i => { const w = col(i, 1), d = col(i, 2), h4 = col(i, 3); return w === d && d === h4 && d !== 0 && !Number.isNaN(d) ? d : 0; };
const dAtr = i => col(i, 9);
const at = t => { let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (T(m) < t) lo = m + 1; else hi = m; } return lo; };

// ---- the episodes: runs of rows where the big three agree (direction b) and the 1-hour runs against them ----
const eps = [];
for (let i = 1; i < n; i++) {
  const b = big(i), on = b && col(i, 4) === -b, was = big(i - 1) === b && col(i - 1, 4) === -b && T(i) - T(i - 1) <= 3 * DAY;
  if (on && !was) eps.push({ i, b, t: T(i), p: P(i), atr: dAtr(i) });
}
// the race from the start of each episode: 1-hour back first, or the big three break first (10-day limit)
for (const e of eps) {
  e.out = "timeout";
  for (let j = e.i + 1; j < n && T(j) - e.t <= 10 * DAY; j++) {
    if (big(j) !== e.b) { e.out = "break"; e.j = j; break; }
    if (col(j, 4) === e.b) { e.out = "back"; e.j = j; break; }
  }
  if (e.j) { e.hours = (T(e.j) - e.t) / 3600; e.moveAtr = (P(e.j) - e.p) * e.b / e.atr; e.lowAtr = 0; for (let k = e.i; k <= e.j; k++) e.lowAtr = Math.min(e.lowAtr, (P(k) - e.p) * e.b / e.atr); }
  if (e.out === "back") {                                   // did the rule's signal (1-hour and 15-minute both back) follow?
    for (let j = e.j; j < n && T(j) - T(e.j) <= 2 * DAY; j++) { if (big(j) !== e.b) break; if (col(j, 4) === e.b && col(j, 5) === e.b) { e.go = true; break; } }
  }
  for (const d of [1, 5, 10]) { const k = at(e.t + d * DAY); e["f" + d] = k < n ? (P(k) / e.p - 1) * 100 * e.b : NaN; }   // % in the big direction
}
// base rates: every row whose big three agree (any 1-hour), and every row at all (up = positive)
function fwd(filter, dirOf) {
  const out = { 1: [], 5: [], 10: [] };
  for (let i = 0; i < n; i += 4) {                       // hourly sampling is plenty for base rates
    if (!filter(i)) continue; const dir = dirOf(i);
    for (const d of [1, 5, 10]) { const k = at(T(i) + d * DAY); if (k < n) out[d].push((P(k) / P(i) - 1) * 100 * dir); }
  }
  return out;
}
const q = (arr, p) => { const s = arr.filter(v => !Number.isNaN(v)).sort((x, y) => x - y); if (!s.length) return NaN; const k = (s.length - 1) * p, f = Math.floor(k); return s[f] + (s[Math.min(f + 1, s.length - 1)] - s[f]) * (k - f); };
const share = (arr, fn) => { const s = arr.filter(v => !Number.isNaN(v)); return s.length ? s.filter(fn).length / s.length * 100 : NaN; };
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
function summary(list) {
  const N = list.length, back = list.filter(e => e.out === "back"), brk = list.filter(e => e.out === "break");
  const o = { n: N, back: r1(back.length / N * 100), break: r1(brk.length / N * 100), timeout: r1(list.filter(e => e.out === "timeout").length / N * 100),
    goAfterBack: r1(back.filter(e => e.go).length / Math.max(1, back.length) * 100),
    hoursBack: r1(q(back.map(e => e.hours), 0.5)), hoursBreak: r1(q(brk.map(e => e.hours), 0.5)),
    bounceAtrBack: r2(q(back.map(e => -e.lowAtr), 0.5)), bounceAtrBack80: r2(q(back.map(e => -e.lowAtr), 0.8)), bounceAtrBreak: r2(q(brk.map(e => -e.lowAtr), 0.5)) };
  for (const d of [1, 5, 10]) { const v = list.map(e => e["f" + d]); o["f" + d] = { median: r2(q(v, 0.5)), withTrend: r1(share(v, x => x > 0)), p25: r2(q(v, 0.25)), p75: r2(q(v, 0.75)) }; }
  return o;
}
// once a bounce has already gone k daily ATR against the trend (as the current one has), what came next, from that moment
for (const e of eps) {
  e.reach = {};
  const end = e.j || at(e.t + 10 * DAY);
  for (let k = e.i; k <= end && k < n; k++) {
    const adv = -(P(k) - e.p) * e.b / e.atr;
    for (const lv of [0.25, 0.5, 0.75, 1]) if (adv >= lv && e.reach[lv] === undefined) e.reach[lv] = k;
  }
}
function byExtent(list) {
  return [0.25, 0.5, 0.75, 1].map(lv => {
    const hit = list.filter(e => e.reach[lv] !== undefined && e.out !== "timeout");
    const f = d => hit.map(e => { const k0 = e.reach[lv], k = at(T(k0) + d * DAY); return k < n ? (P(k) / P(k0) - 1) * 100 * e.b : NaN; });
    return { atr: lv, n: hit.length, break: r1(hit.filter(e => e.out === "break").length / Math.max(1, hit.length) * 100), back: r1(hit.filter(e => e.out === "back").length / Math.max(1, hit.length) * 100),
      f5: { withTrend: r1(share(f(5), x => x > 0)), median: r2(q(f(5), 0.5)) }, f10: { withTrend: r1(share(f(10), x => x > 0)), median: r2(q(f(10), 0.5)) } };
  });
}
const down = eps.filter(e => e.b < 0), up = eps.filter(e => e.b > 0);
const res = { tested: new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10), from: new Date(T(0) * 1000).toISOString().slice(0, 10), to: new Date(T(n - 1) * 1000).toISOString().slice(0, 10),
  downtrendBounce: summary(down), uptrendPullback: summary(up), both: summary(eps) };
const fb = fwd(i => big(i) !== 0, i => big(i)), fa = fwd(() => true, () => 1);
res.downtrendBounce.byExtent = byExtent(down); res.uptrendPullback.byExtent = byExtent(up); res.both.byExtent = byExtent(eps);
res.base = { bigThreeAgree: {}, anyTime: {} };
for (const d of [1, 5, 10]) { res.base.bigThreeAgree["f" + d] = { median: r2(q(fb[d], 0.5)), withTrend: r1(share(fb[d], x => x > 0)) }; res.base.anyTime["f" + d] = { median: r2(q(fa[d], 0.5)), up: r1(share(fa[d], x => x > 0)) }; }

const show = (name, s) => {
  console.log("\n" + name + ": " + s.n + " episodes");
  console.log("  first way out (10-day limit): 1-hour turns back " + s.back + "% · big three break " + s.break + "% · neither " + s.timeout + "%");
  console.log("  when it turns back: the rule's signal followed within 2 days " + s.goAfterBack + "% of the time (" + s.n + " episodes); median " + s.hoursBack + " h; the bounce reached a median " + s.bounceAtrBack + " daily ATR against the trend (80% of cases within " + s.bounceAtrBack80 + ")");
  console.log("  when the big three break first: median " + s.hoursBreak + " h; bounce reached " + s.bounceAtrBreak + " daily ATR");
  for (const d of [1, 5, 10]) console.log("  after " + d + " day" + (d > 1 ? "s" : "") + ": price moved with the big trend " + s["f" + d].withTrend + "% of the time; median " + s["f" + d].median + "% (middle half " + s["f" + d].p25 + "% to " + s["f" + d].p75 + "%)");
};
console.log("Replayed gold states " + res.from + " to " + res.to + ". Situation: the big three agree, the 1-hour runs against them.");
show("Bounce in a downtrend (now)", res.downtrendBounce); show("Pullback in an uptrend (mirror)", res.uptrendPullback); show("Both together", res.both);
for (const [name, rows] of [["downtrend bounces", res.downtrendBounce.byExtent], ["uptrend pullbacks", res.uptrendPullback.byExtent], ["both directions", res.both.byExtent]]) {
  console.log("\nOnce the bounce has gone this far against the trend (" + name + "): what came first, and price 5 / 10 days after that moment");
  for (const r of rows) console.log("  >= " + r.atr.toFixed(2) + " daily ATR: " + String(r.n).padStart(3) + " cases · big three break " + r.break + "% · 1-hour back " + r.back + "% · after 5 days with the trend " + r.f5.withTrend + "% (median " + r.f5.median + "%) · after 10 days " + r.f10.withTrend + "% (median " + r.f10.median + "%)");
}
console.log("\nBase rates, price in the big three's direction: " + [1, 5, 10].map(d => d + "d " + res.base.bigThreeAgree["f" + d].withTrend + "%").join(" · ") + "   |   any time, price up: " + [1, 5, 10].map(d => d + "d " + res.base.anyTime["f" + d].up + "%").join(" · "));
if (process.argv.includes("--write")) { fs.writeFileSync(path.join(L.REPO, "data/xau-scenarios.json"), JSON.stringify(res, null, 1) + "\n"); console.log("wrote data/xau-scenarios.json"); }
