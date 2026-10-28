// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: yellow; icon-glyph: chart-line;
//
// 黄金 + 比特币 widget for iPhone (Scriptable). The answer, trend arrows and the two levels that change it come from
// the site's data/widget.json (written every 15 minutes by the market job); the price is fetched live here.
// Sizes: small (gold; widget parameter "btc" shows Bitcoin), medium (both), large (both, more detail), and the lock
// screen (rectangular / inline). Tap a market to open its page. Setup: widgets/README.md.
const SITE = "https://yapseng98.github.io/trading_pages/";
const C = {
  bg: Color.dynamic(new Color("#FFFFFF"), new Color("#15171D")),
  ink: Color.dynamic(new Color("#1C1E24"), new Color("#ECEDF0")),
  dim: Color.dynamic(new Color("#6B707B"), new Color("#9AA0AB")),
  buy: Color.dynamic(new Color("#0F8A5F"), new Color("#34D399")),
  sell: Color.dynamic(new Color("#C93A33"), new Color("#F87171")),
  wait: Color.dynamic(new Color("#9A7206"), new Color("#E6BE55")),
  line: Color.dynamic(new Color("#E6E8EC"), new Color("#2A2E37"))
};
const fmt = (v, d) => (typeof v === "number" && isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");
async function json(url) { const r = new Request(url); r.timeoutInterval = 12; return r.loadJSON(); }
async function liveGold() {
  try { const d = await json("https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/XAU/USD"); const b = d[0].spreadProfilePrices[0].bid; if (b > 0) return b; } catch (e) {}
  try { const d = await json("https://api.gold-api.com/price/XAU"); if (d.price > 0) return d.price; } catch (e) {}
  return null;
}
async function liveBtc() { try { const d = await json("https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT"); return +d.price || null; } catch (e) { return null; } }
// the answer in a few words and its colour: a signal is green or red, waiting with a big direction is amber, else grey
function state(m) {
  if (m.level === "go") return { word: m.side === "long" ? "可以做多" : "可以做空", color: m.side === "long" ? C.buy : C.sell };
  if (m.level === "ready") return { word: m.tag, color: C.wait };
  return { word: m.tag || "先观望", color: C.dim };
}
function ageMin(s) { const t = Date.parse(String(s).replace(" SGT", ":00+08:00").replace(" ", "T")); return isFinite(t) ? (Date.now() - t) / 60000 : null; }

function block(parent, m, live, detail) {
  const st = state(m), d = m.sym === "BTCUSD" ? 0 : 1, px = live || m.price, prev = m.chg !== null ? m.price - m.chg : null;
  const box = parent.addStack(); box.layoutVertically(); box.spacing = 2; box.url = m.url;
  const head = box.addStack(); head.centerAlignContent();
  const nm = head.addText(m.icon + " " + m.name); nm.font = Font.semiboldSystemFont(12); nm.textColor = C.dim;
  head.addSpacer();
  if (prev) { const c = px - prev, t = head.addText((c >= 0 ? "+" : "") + fmt(c / prev * 100, 2) + "%"); t.font = Font.mediumMonospacedSystemFont(11); t.textColor = c >= 0 ? C.buy : C.sell; }
  const p = box.addText(fmt(px, d)); p.font = Font.boldMonospacedSystemFont(detail ? 22 : 19); p.textColor = C.ink; p.minimumScaleFactor = 0.6; p.lineLimit = 1;
  const tg = box.addText((m.observe && m.level === "go" ? "仅观察 · " : "") + st.word); tg.font = Font.boldSystemFont(12); tg.textColor = st.color; tg.lineLimit = 1; tg.minimumScaleFactor = 0.7;
  const ar = box.addText(m.arrows); ar.font = Font.regularMonospacedSystemFont(10); ar.textColor = C.dim; ar.lineLimit = 1; ar.minimumScaleFactor = 0.6;
  if (m.plan) {
    const pl = box.addText((m.plan.side === "做多" ? "买 " : "卖 ") + fmt(m.plan.entry, d) + " 止损 " + fmt(m.plan.stop, d) + " 目标 " + fmt(m.plan.target, d));
    pl.font = Font.mediumMonospacedSystemFont(10); pl.textColor = st.color; pl.lineLimit = 2; pl.minimumScaleFactor = 0.6;
  }
  (m.lines || []).slice(0, detail ? 2 : 1).forEach(l => {
    const gap = l.price - px, t = box.addText((l.dir === "up" ? "▲ " : "▼ ") + fmt(l.price, d) + " " + l.text + " · 差 " + fmt(Math.abs(gap), d));
    t.font = Font.regularSystemFont(10); t.textColor = C.ink; t.lineLimit = 1; t.minimumScaleFactor = 0.6;
  });
  if (m.odds && detail) {
    const o = m.odds, t = box.addText("先到：" + (o.dir < 0 ? "做空信号 " : "做多信号 ") + Math.round(o.back) + "% · 大方向转折 " + Math.round(o.brk) + "%");
    t.font = Font.regularSystemFont(10); t.textColor = C.dim; t.lineLimit = 1; t.minimumScaleFactor = 0.6;
  }
  const now = new Date(), hm = ("0" + now.getHours()).slice(-2) + ":" + ("0" + now.getMinutes()).slice(-2), age = ageMin(m.updated);
  const ft = box.addText((live ? "价格 " + hm : "价格 " + m.priceTime + "（未更新）") + " · 结论 " + String(m.updated).slice(11, 16) + (age !== null && age > 120 ? " 较旧" : ""));
  ft.font = Font.regularSystemFont(9); ft.textColor = age !== null && age > 120 ? C.wait : C.dim;
}

async function build() {
  const fam = config.widgetFamily || "medium", w = new ListWidget(); w.backgroundColor = C.bg;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60000);
  let data = null; try { data = await json(SITE + "data/widget.json?t=" + Math.floor(Date.now() / 60000)); } catch (e) {}
  if (!data) { const t = w.addText("读取失败：连上网后会自动重试"); t.font = Font.systemFont(12); t.textColor = C.dim; return w; }
  const [g, b] = await Promise.all([liveGold(), liveBtc()]);
  const only = String(args.widgetParameter || "").toLowerCase().includes("btc") ? "btc" : "gold";
  if (fam === "accessoryInline" || fam === "accessoryRectangular") {          // lock screen
    const m = data[only], px = (only === "btc" ? b : g) || m.price, st = state(m);
    if (fam === "accessoryInline") { w.addText(m.icon + " " + fmt(px, only === "btc" ? 0 : 1) + " " + st.word); return w; }
    const a = w.addText(m.icon + " " + fmt(px, only === "btc" ? 0 : 1)); a.font = Font.boldSystemFont(14);
    const c = w.addText(st.word); c.font = Font.systemFont(12);
    if (m.lines && m.lines[0]) { const l = m.lines[0], e = w.addText((l.dir === "up" ? "▲ " : "▼ ") + fmt(l.price, only === "btc" ? 0 : 1) + " " + l.text); e.font = Font.systemFont(11); }
    w.url = m.url; return w;
  }
  if (fam === "small") { w.setPadding(12, 12, 12, 12); block(w, data[only], only === "btc" ? b : g, false); w.url = data[only].url; return w; }
  w.setPadding(12, 14, 12, 14);
  const row = w.addStack(); row.layoutHorizontally(); row.spacing = 12;
  block(row, data.gold, g, fam !== "medium");
  block(row, data.btc, b, fam !== "medium");
  if (fam !== "medium") {
    w.addSpacer(8);
    const n = w.addText("历史比例和信号都按网站的规则算：只在周线、日线、4 小时同向时才做，比特币只作观察。");
    n.font = Font.regularSystemFont(10); n.textColor = C.dim;
  }
  return w;
}
const widget = await build();
if (config.runsInWidget) Script.setWidget(widget); else await widget.presentMedium();
Script.complete();
