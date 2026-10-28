/* data/widget.json: gold and Bitcoin in one small file for the phone and desktop widgets (widgets/), written at the
   end of the market job from the two state files it has just written. Everything is display-ready: the answer, the
   trend arrows, the two levels that change it, the plan when there is a signal, and gold's 哪个先到 odds. The widgets
   add the live price themselves, so this file only has to be as fresh as the answer.
   usage: node scripts/update_widget.js */
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, ".."), SITE = "https://yapseng98.github.io/trading_pages/";
const readJson = f => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")); } catch (e) { return null; } };
const TFS = { "周线": "周", "日线": "日", "4 小时": "4H", "1 小时": "1H", "15 分钟": "15M" };
const ARROW = { "向上": "↑", "向下": "↓" };

function market(st, o) {
  if (!st || !st.verdict) return null;
  const v = st.verdict, tf = st.timeframes || [], dirOf = name => { const t = tf.find(x => x.name === name); return t ? t.trend : null; };
  const big = ["周线", "日线", "4 小时"].map(dirOf), bigDir = big[0] && big.every(d => d === big[0]) ? (big[0] === "向上" ? "up" : big[0] === "向下" ? "down" : null) : null;
  const side = st.plan ? (st.plan.side === "做多" ? "long" : "short") : null;
  const short = t => String(t || "").split(/[，（：]/)[0].replace("这里", "").replace(/1 小时|4 小时|15 分钟/g, m => ({ "1 小时": "1H ", "4 小时": "4H ", "15 分钟": "15M " })[m]).replace(/^(周线|日线)/, "$1 ").replace(/\s+/g, " ").trim();
  return {
    name: o.name, sym: o.sym, icon: o.icon, url: SITE + o.page, observe: !!o.observe,
    updated: st.updated, price: st.price, priceTime: String(st.priceTime || "").slice(11, 16),
    chg: st.today ? st.today.changeFromPrevClose : null, chgPct: st.today ? st.today.changePct : null,
    level: v.level, side, bigDir, tag: v.tag, title: v.title,
    arrows: tf.map(t => (TFS[t.name] || t.name) + (ARROW[t.trend] || "–")).join(" "),
    lines: (st.watch || []).slice(0, 2).map(w => ({ dir: w.dir || (w.price > st.price ? "up" : "down"), price: w.price, text: short(w.text) })),
    plan: st.plan ? { side: st.plan.side, entry: st.plan.entry, stop: st.plan.stop, target: st.plan.target } : null,
    odds: st.odds || null
  };
}
const out = {
  updated: new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 16).replace("T", " ") + " SGT",
  gold: market(readJson("data/xau-state.json"), { name: "黄金", sym: "XAUUSD", icon: "🥇", page: "report.html" }),
  btc: market(readJson("data/btc-state.json"), { name: "比特币", sym: "BTCUSD", icon: "₿", page: "btc.html", observe: true })
};
if (!out.gold && !out.btc) { console.error("no state file could be read; data/widget.json left as it is"); process.exit(1); }
// rewrite only when what a widget shows has changed (the time stamp alone is not a change)
const file = path.join(ROOT, "data", "widget.json"), old = readJson("data/widget.json"), strip = w => w && JSON.stringify({ g: w.gold, b: w.btc });
if (old && strip(old) === strip(out)) { console.log("widget data unchanged"); process.exit(0); }
fs.writeFileSync(file, JSON.stringify(out, null, 1) + "\n");
console.log("Wrote data/widget.json | gold " + (out.gold ? out.gold.price + " " + out.gold.tag : "—") + " | btc " + (out.btc ? out.btc.price + " " + out.btc.tag : "—"));
