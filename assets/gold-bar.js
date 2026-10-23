// The live answer at the top of the daily, news and risk pages, so every page starts from the same facts the
// report page works from: the current verdict (data/xau-state.json, worked out on spot gold by the market job),
// the price now (api.gold-api.com, every 30 seconds), the price that would change the answer and how far away it
// is, and the next US data release (data/calendar.json). The written text below it is from the 10:10 SGT refresh.
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
    ".gbar .foot{grid-column:1/-1;font-size:11px;color:var(--dim,#8A857E);padding:9px 16px}" +
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
    $("gb-vd").textContent = tfs + (s.plan ? " · 服务器 " + String(s.updated || "").slice(11, 16) + " 按当时价格算的方案：" + s.plan.side + " 入场 " + fmt(s.plan.entry) + "，止损 " + fmt(s.plan.stop) + "，目标 " + fmt(s.plan.target) + "（下单前看 4H 报告的实时价位）" : "");
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
    $("gb-foot").appendChild(document.createTextNode("结论按 " + (s.updated || "").slice(5) + " 的数据（服务器每 3–4 小时用现货算一次）· " + howTxt + " · 下面的文字解读是每天 10:10 写的 · "));
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
  }
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
