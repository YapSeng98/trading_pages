// The live answer at the top of the daily, news and risk pages, so every page starts from the same facts the
// report page works from: the current verdict (data/xau-state.json, worked out on spot gold by the market job),
// the price now (api.gold-api.com, every 30 seconds), the price that would change the answer and how far away it
// is, and the next US data release (data/calendar.json). The written text below it is from the 10:10 SGT refresh;
// when that is more than 30 hours old, the page folds it away and shows the data files' facts instead ("old text").
(function () {
  "use strict";
  var host = document.getElementById("gold-bar"); if (!host) return;
  var css = "#gold-bar{grid-column:1/-1;min-width:0}.gbar{display:grid;grid-template-columns:minmax(0,1.3fr) repeat(3,minmax(0,1fr));gap:1px;background:var(--border,#282833);border:1px solid var(--border,#282833);border-radius:16px;overflow:hidden;margin:0 0 22px}" +
    ".gbar>div{background:var(--bg2,#15151C);padding:14px 16px;min-width:0}" +
    ".gbar .k{font-size:11px;color:var(--dim,#8A857E);margin-bottom:5px;letter-spacing:.3px}" +
    ".gbar .v{font:700 17px/1.3 'Space Grotesk','Noto Sans SC',sans-serif;color:var(--white,#F6F5F3)}" +
    ".gbar .v.mono{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}" +
    ".gbar .d{font-size:11.5px;color:var(--text,#C9C4BD);line-height:1.55;margin-top:4px}" +
    ".gbar .tag{display:inline-block;font:700 12px/1 'Space Grotesk','Noto Sans SC',sans-serif;padding:6px 10px;border-radius:999px;margin-right:8px;vertical-align:2px}" +
    ".gbar .tag.none{background:rgba(148,163,184,.14);color:var(--neut,#94A3B8)} .gbar .tag.ready{background:rgba(212,167,44,.14);color:var(--gold-lt,#E6BE55)}" +
    ".gbar .tag.go{background:rgba(52,211,153,.14);color:var(--bull,#34D399)}" +
    ".gbar .up{color:var(--bull,#34D399)} .gbar .dn{color:var(--bear,#F87171)}" +
    ".gbar a{color:var(--gold-lt,#E6BE55);text-decoration:none;font-weight:600} .gbar a:hover{text-decoration:underline}" +
    ".gbar .foot{grid-column:1/-1;font-size:11px;color:var(--dim,#8A857E);padding:9px 16px}@media(max-width:640px){.gbar .foot a{display:inline-block;padding:7px 0}}" +
    "@media(max-width:860px){.gbar{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.gbar>div:first-child,.gbar>div:nth-child(4){grid-column:1/-1}}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  host.innerHTML = '<div class="gbar"><div><div class="k">现在的结论（规则）</div><div class="v" id="gb-v">读取中…</div><div class="d" id="gb-vd"></div></div>' +
    '<div><div class="k">现价 · 现货金</div><div class="v mono" id="gb-p">—</div><div class="d" id="gb-pd"></div></div>' +
    '<div><div class="k">会改变结论的价位</div><div class="v mono" id="gb-w">—</div><div class="d" id="gb-wd"></div></div>' +
    '<div><div class="k">下一个美国数据</div><div class="v" id="gb-e">—</div><div class="d" id="gb-ed"></div></div>' +
    '<div class="foot" id="gb-foot"></div></div>';
  function $(id) { return document.getElementById(id); }
  function num(v) { return typeof v === "number" && isFinite(v) ? v : null; }
  function fmt(v, d) { return v.toLocaleString("en-US", { minimumFractionDigits: d === undefined ? 1 : d, maximumFractionDigits: d === undefined ? 1 : d }); }
  function left(ms) { var m = Math.max(0, Math.round(ms / 60000)); if (m < 60) return m + " 分钟"; var h = Math.floor(m / 60); return h < 48 ? h + " 小时 " + (m % 60) + " 分" : Math.floor(h / 24) + " 天"; }
  var S = { state: null, cal: null, live: null, how: null };
  // When the candle now forming on that timeframe closes, in Singapore time. Candles are cut in broker time
  // (New York + 7 hours), like the report page and most MT5 brokers.
  function nextClose(hours) {
    var now = Date.now(), p = {}; new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(new Date(now)).forEach(function (x) { p[x.type] = x.value; });
    var ny = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute), off = Math.round((ny - now) / 3600000) * 3600000 + 7 * 3600000, step = hours * 3600000;
    var end = Math.floor((now + off) / step) * step + step - off, d = new Date(end + 8 * 3600000);
    return ("0" + d.getUTCHours()).slice(-2) + ":" + ("0" + d.getUTCMinutes()).slice(-2);
  }
  function paint() {
    var s = S.state; if (!s) return;
    var v = s.verdict || {}, lvl = v.level === "go" ? "go" : v.level === "ready" ? "ready" : "none";
    $("gb-v").innerHTML = ""; var tag = document.createElement("span"); tag.className = "tag " + lvl; tag.textContent = v.tag || "—"; $("gb-v").appendChild(tag);
    $("gb-v").appendChild(document.createTextNode((v.title || "").replace(/^先观望：/, "")));
    var tfs = (s.timeframes || []).map(function (t) { return (t.name || t.tf).replace(" ", "") + (t.trend === "向上" ? "↑" : t.trend === "向下" ? "↓" : "–"); }).join(" ");
    // the server's plan is priced at its own run; the report page prices it at the live price
    var at = Date.parse(String(s.updated).replace(" SGT", ":00+08:00").replace(" ", "T")), ageH = isFinite(at) ? (Date.now() - at) / 3600000 : 0, ageTxt = ageH >= 1 ? Math.round(ageH) + " 小时前" : "";
    $("gb-vd").textContent = (ageTxt ? ageTxt + "算的 · " : "") + tfs + (s.plan ? " · 服务器 " + String(s.updated || "").slice(11, 16) + " 按当时价格算的方案：" + s.plan.side + " 入场 " + fmt(s.plan.entry) + "，止损 " + fmt(s.plan.stop) + "，目标 " + fmt(s.plan.target) + "（下单前看 4H 报告的实时价位）" : "");
    var px = num(S.live) !== null ? S.live : num(s.price), prev = num(s.price) !== null && s.today && num(s.today.changeFromPrevClose) !== null ? s.price - s.today.changeFromPrevClose : null;
    $("gb-p").textContent = px !== null ? fmt(px, 2) : "—";
    var ch = px !== null && prev !== null ? px - prev : null;
    $("gb-pd").innerHTML = ""; if (ch !== null) { var c = document.createElement("span"); c.className = ch >= 0 ? "up" : "dn"; c.textContent = (ch >= 0 ? "▲ +" : "▼ −") + fmt(Math.abs(ch)) + "（" + (ch >= 0 ? "+" : "−") + fmt(Math.abs(ch / prev * 100), 2) + "%）"; $("gb-pd").appendChild(c); $("gb-pd").appendChild(document.createTextNode(" 比上一交易日收盘")); }
    var w = (s.watch || [])[0];
    if (w && num(w.price) !== null) {
      // already through the level: what counts is where the candle closes, and when that is
      var below = /跌破/.test(w.text), through = px !== null && (below ? px < w.price : px > w.price), tf = /4 ?小时/.test(w.text) ? 4 : /1 ?小时/.test(w.text) ? 1 : /日线/.test(w.text) ? 24 : null;
      $("gb-w").textContent = fmt(w.price);
      $("gb-wd").textContent = w.text + (px === null ? "" : through ? "。现价已经" + (below ? "低于" : "高于") + "它 " + fmt(Math.abs(px - w.price)) + " 美元，要看收盘" + (tf ? "（这根 K 线 " + nextClose(tf) + " SGT 收盘）" : "") : "（离现价 " + fmt(Math.abs(px - w.price)) + " 美元）");
    }
    else { $("gb-w").textContent = "—"; $("gb-wd").textContent = "暂时没有明确的价位"; }
    var now = Date.now(), ev = S.cal && (S.cal.events || []).filter(function (e) { return !e.allDay && e.ms > now - 30 * 60000; })[0];
    if (ev) { $("gb-e").textContent = (ev.zh || ev.title) + (ev.impact === "high" ? " · 高影响" : ""); $("gb-ed").textContent = ev.date + "（" + ev.weekday + "）" + ev.time + " SGT · " + (ev.ms > now ? "还有 " + left(ev.ms - now) : "刚公布") + (ev.forecast ? " · 预期 " + ev.forecast : ""); }
    else { $("gb-e").textContent = "本周没有了"; $("gb-ed").textContent = "日历上本周剩下没有中高影响的美国数据"; }
    $("gb-foot").innerHTML = "";
    var howTxt = S.how === "spot" ? "现价实时，按现货 1 分钟 K 线校准（买价）" : S.how === "closed" ? "休市中，现价是最后收盘价" : "现价每 30 秒更新（gold-api，可能差 1–2 美元）";
    $("gb-foot").appendChild(document.createTextNode("结论按 " + (s.updated || "").slice(5) + " 的数据（服务器的定时任务常常晚，大约 4–5 小时才算一次）· " + howTxt + " · " + (W.stale ? "下面的文字是 " + ago(W.ageH) + "前写的，已收起" : "下面的文字解读是每天 10:10 写的") + " · "));
    var a = document.createElement("a"); a.href = "report.html"; a.textContent = "实时结论和交易计划看 4H 报告 →"; $("gb-foot").appendChild(a);
    $("gb-foot").appendChild(document.createTextNode(" · "));
    var q = document.createElement("a"); q.href = "report.html#ask"; q.textContent = "按现在的情况问 Claude →"; $("gb-foot").appendChild(q);
    // the page's own live marks (daily.html: what changed since the text was written) follow the same price
    // the header price on the page, if it has one
    if (px !== null) {
      var d = new Date(Date.now() + 8 * 3600000), hm = ("0" + d.getUTCHours()).slice(-2) + ":" + ("0" + d.getUTCMinutes()).slice(-2) + ":" + ("0" + d.getUTCSeconds()).slice(-2);
      [].forEach.call(document.querySelectorAll(".js-live-price"), function (e) { e.textContent = "$" + fmt(px); });
      [].forEach.call(document.querySelectorAll(".js-live-time"), function (e) { e.textContent = hm + " SGT" + (S.how === "spot" ? " · 按现货校准" : S.how === "closed" ? " · 休市" : num(S.live) !== null ? "" : "（服务器价格）"); });
    }
    try { document.dispatchEvent(new CustomEvent("goldbar:update", { detail: { state: s, price: px, live: num(S.live) !== null } })); } catch (e) {}
    if (W.stale && (Date.now() - (S.factsAt || 0) > 60000 || S.factsLive !== (num(S.live) !== null))) { S.factsAt = Date.now(); S.factsLive = num(S.live) !== null; staleFacts(); }
  }
  // ---------- old text ----------
  // The written text is from the daily 10:10 SGT refresh. When that has not run for more than 30 hours (it stopped
  // on 2026-11-01 for 11 days), its prices, plans and calendar read as if they were now. So the page says when it
  // was written, folds the old text away (one click opens it again), and shows the same facts from the data files
  // instead: the five timeframes and the nearest levels (daily), this week's calendar (risk), the live headlines
  // (news, already on the page). The text itself is never changed; the TradingView widgets stay, they are live.
  var STALE_H = 30;
  function writtenAt() {
    var t = (document.querySelector("header .hdate") || {}).textContent || "", dm = t.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/), tm = t.match(/(\d{1,2}):(\d{2})\s*SGT/);
    if (!dm || !tm) { t = (document.querySelector(".disclaimer") || {}).textContent || ""; dm = t.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/); tm = t.match(/(\d{1,2}):(\d{2})\s*SGT/); }
    return dm && tm ? Date.UTC(+dm[1], +dm[2] - 1, +dm[3], +tm[1] - 8, +tm[2]) : null;
  }
  var W = { ms: writtenAt() }; W.ageH = W.ms === null ? 0 : (Date.now() - W.ms) / 3600000; W.stale = W.ageH > STALE_H;
  function ago(h) { return h < 48 ? Math.round(h) + " 小时" : Math.floor(h / 24) + " 天"; }
  function mk(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function staleSetup() {
    var root = document.documentElement, main = document.querySelector("main"); if (!main) return;
    root.classList.add("stale-brief");
    var css = "html.stale-brief:not(.stale-open) main>:not(.stale-keep),html.stale-brief:not(.stale-open) .biasbar,html.stale-brief:not(.stale-open) .secnav,html.stale-brief:not(.stale-open) header .hdate,html.stale-brief:not(.stale-open) header .hprice-chg{display:none!important}" +
      "#stale-note{grid-column:1/-1;min-width:0;background:var(--bg2,#15151C);border:1px solid var(--border,#282833);border-left:3px solid var(--bear,#F87171);border-radius:14px;padding:14px 18px;margin:0 0 22px}" +
      "#stale-note .hd{font-size:14px;font-weight:700;color:var(--white,#F6F5F3);line-height:1.6}#stale-note p{font-size:13px;line-height:1.7;color:var(--text,#C9C4BD);margin:6px 0 0}" +
      "#stale-note .row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:10px}#stale-note button{background:none;border:1px solid var(--border,#282833);color:var(--gold-lt,#E6BE55);border-radius:999px;padding:8px 14px;font:600 12.5px/1 'Noto Sans SC',sans-serif;cursor:pointer;min-height:36px}" +
      "#stale-note a{color:var(--gold-lt,#E6BE55);text-decoration:none;font-weight:600;font-size:13px}#stale-note h4{margin:16px 0 6px;font-size:13px;color:var(--white,#F6F5F3)}#stale-note .ft{font-size:11.5px;color:var(--dim,#8A857E);margin-top:6px}" +
      "#stale-note .tw{overflow-x:auto}#stale-note table{width:100%;border-collapse:collapse;font-size:12.5px}#stale-note th{font-weight:500;color:var(--dim,#8A857E);text-align:left;padding:5px 8px;white-space:nowrap}" +
      "#stale-note td{padding:6px 8px;border-top:1px solid rgba(255,255,255,.06);color:var(--text,#C9C4BD);white-space:nowrap}#stale-note td.n{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}" +
      "#stale-note .up{color:var(--bull,#34D399)}#stale-note .dn{color:var(--bear,#F87171)}#stale-note tr.done td{opacity:.55}#stale-note .hi{color:var(--bear,#F87171);font-weight:700}" +
      "@media(max-width:640px){#stale-note{padding:12px 14px}#stale-note td,#stale-note th{padding:5px 6px;font-size:12px}}";
    var st = mk("style"); st.textContent = css; document.head.appendChild(st);
    var d = new Date(W.ms + 8 * 3600000), when = (d.getUTCMonth() + 1) + " 月 " + d.getUTCDate() + " 日 " + ("0" + d.getUTCHours()).slice(-2) + ":" + ("0" + d.getUTCMinutes()).slice(-2);
    var box = mk("div"); box.id = "stale-note";
    box.appendChild(mk("div", "hd", "⚠ 下面的文字是 " + when + " SGT 写的（" + ago(W.ageH) + "前），已经过期"));
    box.appendChild(mk("p", null, "每天 10:10 的自动更新这段时间没有运行。旧文里的价格、方案和日历都不是现在的情况，所以先收起来了；下面是服务器数据里现在的情况。" + (root.classList.contains("embedded") ? "实时结论和交易计划在本页上方。" : "")));
    var row = mk("div", "row"), btn = mk("button", null, "展开旧文（" + (d.getUTCMonth() + 1) + "/" + d.getUTCDate() + " 写的）");
    btn.type = "button"; btn.addEventListener("click", function () { var on = root.classList.toggle("stale-open"); btn.textContent = on ? "收起旧文" : "展开旧文（" + (d.getUTCMonth() + 1) + "/" + d.getUTCDate() + " 写的）"; });
    row.appendChild(btn);
    if (!root.classList.contains("embedded")) { var a = mk("a", null, "实时结论和交易计划看 4H 报告 →"); a.href = "report.html"; row.appendChild(a); }
    box.appendChild(row);
    box.appendChild(mk("div", null)).id = "stale-facts";
    var after = document.getElementById("since-note") || host;
    after.parentNode.insertBefore(box, after.nextSibling);
    // what stays in view: the live parts
    ["#gold-bar", "#since-note", "#stale-note", "#news-live", "#chart"].forEach(function (q) { var e = main.querySelector(q); if (e && e.parentNode === main) e.classList.add("stale-keep"); });
    [].forEach.call(main.querySelectorAll(":scope>.tradingview-widget-container"), function (e) { e.classList.add("stale-keep"); var p = e.previousElementSibling; if (p && p.classList.contains("sec-eyebrow")) p.classList.add("stale-keep"); });
  }
  // the facts the old text would have given, from the data files (filled once they have loaded)
  function staleFacts() {
    var host2 = document.getElementById("stale-facts"); if (!host2 || !S.state) return;
    host2.innerHTML = "";
    var s = S.state, px = num(S.live) !== null ? S.live : num(s.price), table = function (head, rows) {
      var t = mk("table"), tr = mk("tr"); head.forEach(function (x) { tr.appendChild(mk("th", null, x)); }); t.appendChild(mk("thead")).appendChild(tr);
      var tb = mk("tbody"); rows.forEach(function (r) { tb.appendChild(r); }); t.appendChild(tb); var w = mk("div", "tw"); w.appendChild(t); return w;
    };
    var cell = function (tr, text, cls) { tr.appendChild(mk("td", cls || null, text)); return tr; };
    if (document.querySelector(".lvl-table, .tf-table")) {                     // daily.html
      host2.appendChild(mk("h4", null, "五个周期现在的方向"));
      host2.appendChild(table(["周期", "方向", "从", "RSI", "收盘站上转多", "收盘跌破转空"], (s.timeframes || []).map(function (t) {
        var tr = mk("tr"); cell(tr, t.name || t.tf); cell(tr, t.trend || "—", t.trend === "向上" ? "up" : t.trend === "向下" ? "dn" : "");
        cell(tr, t.since ? t.since.slice(5, 16) : "—", "n"); cell(tr, num(t.rsi) !== null ? fmt(t.rsi) : "—", "n");
        cell(tr, num(t.turnsUpAbove) !== null ? fmt(t.turnsUpAbove) : "—", "n"); cell(tr, num(t.turnsDownBelow) !== null ? fmt(t.turnsDownBelow) : "—", "n"); return tr;
      })));
      if (px !== null) {
        var lv = (s.resistance || []).filter(function (l) { return l.price > px; }).slice(0, 3).reverse().concat((s.support || []).filter(function (l) { return l.price < px; }).slice(0, 3));
        if (lv.length) {
          host2.appendChild(mk("h4", null, "离现价最近的价位"));
          host2.appendChild(table(["价位", "离现价", "是什么"], lv.map(function (l) { var tr = mk("tr"); cell(tr, fmt(l.price), "n " + (l.price > px ? "dn" : "up")); cell(tr, (l.price > px ? "+" : "−") + fmt(Math.abs(l.price - px)), "n"); cell(tr, l.what || ""); return tr; })));
        }
      }
      var t0 = s.today || {}, p0 = s.previousDay || {};
      if (num(t0.high) !== null || num(p0.high) !== null) host2.appendChild(mk("p", null, (num(t0.high) !== null ? "今天（纽约 17:00 换日）开 " + fmt(t0.open) + "，高 " + fmt(t0.high) + "，低 " + fmt(t0.low) + "。" : "") + (num(p0.high) !== null ? "上一交易日 " + p0.date + "：高 " + fmt(p0.high) + "，低 " + fmt(p0.low) + "，收 " + fmt(p0.close) + "。" : "")));
    }
    var wk = function (ms) { return Math.floor((ms - 5 * 3600000 - 3 * 86400000) / 604800000); };   // ForexFactory's week, Sunday to Saturday in New York
    if (document.querySelector("table.cal") && S.cal && !(S.cal.events || []).some(function (e) { return wk(e.ms) === wk(Date.now()); })) host2.appendChild(mk("p", null, "自动日历还没有换到这一周（上次 " + (S.cal.updated || "—") + "）。进场前自己在 ForexFactory 看一眼有没有大数据。"));
    else if (document.querySelector("table.cal") && S.cal) {                     // risk.html
      var now = Date.now();
      host2.appendChild(mk("h4", null, "本周美国数据（自动日历，新加坡时间）"));
      host2.appendChild(table(["日期", "时间", "影响", "事件", "预期 / 前值"], S.cal.events.map(function (e) {
        var tr = mk("tr", !e.allDay && e.ms < now - 30 * 60000 ? "done" : null);
        cell(tr, e.date + "（" + e.weekday + "）"); cell(tr, e.allDay ? "全天" : e.time, "n"); cell(tr, e.impact === "high" ? "高" : e.impact === "medium" ? "中" : "假日", e.impact === "high" ? "hi" : "");
        cell(tr, (!e.allDay && e.ms < now - 30 * 60000 ? "✓ " : "") + (e.zh || e.title)); cell(tr, (e.forecast ? e.forecast : "—") + (e.previous ? " / " + e.previous : ""), "n"); return tr;
      })));
      host2.appendChild(mk("div", "ft", "日历 " + (S.cal.updated || "") + " 取自 ForexFactory；✓ 表示已经公布（公布值看下面的实时日历）。"));
    }
    host2.appendChild(mk("div", "ft", "服务器数据 " + (s.updated || "") + "（定时任务大约 4–5 小时才跑一次）；现价 " + (px !== null ? fmt(px) : "—") + "。"));
  }
  if (W.stale) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", staleSetup); else staleSetup(); }
  function getJson(u) { return fetch(u, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  function live() { return fetch("https://api.gold-api.com/price/XAU", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) { if (d && num(d.price) !== null && d.price > 0) { S.live = d.price; paint(); } }).catch(function () {}); }
  Promise.all([getJson("data/xau-state.json").catch(function () { return null; }), getJson("data/calendar.json").catch(function () { return null; })]).then(function (r) {
    S.state = r[0]; S.cal = r[1];
    if (!S.state) { $("gb-v").textContent = "暂时读不到数据"; return; }
    paint(); setInterval(paint, 60000);
    // the live price: assets/gold-live.js when the page loads it (PAXG ticks calibrated on spot minutes), else gold-api
    if (window.GoldLive) GoldLive.on(function (p) { S.live = p.price; S.how = p.how; paint(); });
    else { live(); setInterval(live, 30000); }
  });
})();
