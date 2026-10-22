// daily.html in the browser: the written analysis is from the 10:10 SGT refresh, the market keeps moving. This keeps
// the text honest without touching it:
// - "写完之后" note: when the text was written and at what price, how far price has moved since, which of the page's
//   own levels it has crossed, which timeframes have turned (server data, data/xau-state.json) and whether the rule's
//   answer is still the one the text gives.
// - S/R table: distance to each level from the live price, levels crossed since writing marked, the current-price row
//   moved to where price is now. Multi-timeframe table: what each timeframe is now, when it differs from the text.
// - Page furniture: section links, folding cards (remembered per browser), long header lines clamped, the
//   TradingView chart loaded only when opened.
// Prices come from assets/gold-bar.js ("goldbar:update" events), so the page makes no requests of its own.
(function () {
  "use strict";
  var css = "#since-note{min-width:0}" +
    ".since{background:var(--bg2,#15151C);border:1px solid var(--border,#282833);border-left:3px solid var(--gold,#D4A72C);border-radius:14px;padding:14px 18px}" +
    ".since .hd{font-size:13.5px;color:var(--white,#F6F5F3);line-height:1.6}" +
    ".since .hd b{font-family:'IBM Plex Mono',monospace;font-weight:600}" +
    ".since ul{list-style:none;margin:8px 0 0;padding:0}" +
    ".since li{position:relative;padding:5px 0 5px 18px;font-size:13px;line-height:1.65;color:var(--text,#C9C4BD);border-top:1px solid rgba(255,255,255,.05)}" +
    ".since li::before{content:'›';position:absolute;left:4px;top:4px;color:var(--gold,#D4A72C);font-weight:700}" +
    ".since li.hot{color:var(--white,#F6F5F3)} .since li.hot::before{content:'!';color:var(--bear,#F87171)}" +
    ".since .ft{font-size:11.5px;color:var(--dim,#8A857E);margin-top:8px}" +
    ".since .up,.lv-tag.up,.tf-now.up{color:var(--bull,#34D399)} .since .dn,.lv-tag.dn,.tf-now.dn{color:var(--bear,#F87171)}" +
    ".lv-tag{display:inline-block;font:600 10.5px/1 'Noto Sans SC',sans-serif;padding:3px 7px;border-radius:999px;margin-left:6px;vertical-align:1px;background:rgba(255,255,255,.06)}" +
    ".lv-tag.dn{background:rgba(248,113,113,.13)} .lv-tag.up{background:rgba(52,211,153,.13)} .lv-tag.near{color:var(--gold-lt,#E6BE55);background:rgba(212,167,44,.12)}" +
    ".lvl-table tr.lv-now td{background:rgba(212,167,44,.09)} .lvl-table tr.lv-now .lvl-price{color:var(--gold-lt,#E6BE55)}" +
    ".lvl-table tr.lv-crossed .lvl-price{opacity:.75}" +
    ".tf-now{display:block;font:600 11px/1.4 'Noto Sans SC',sans-serif;margin-top:6px;white-space:nowrap}" +
    ".tf-now.same{color:var(--dim,#8A857E);font-weight:500}" +
    ".tf-table tr.tf-turned td{background:rgba(248,113,113,.06)}" +
    "@media(max-width:760px){.lvl-table tr.lv-now{background:rgba(212,167,44,.09);border-radius:8px}.tf-table tr.tf-turned{background:rgba(248,113,113,.06);border-radius:8px}" +
    ".lvl-table tr.lv-now td,.tf-table tr.tf-turned td{background:none}.biasbar.short .badge:not(.biaslabel + .badge){display:none}}" +
    ".bias-more{grid-column:1/-1;justify-self:start;background:none;border:0;color:var(--gold-lt,#E6BE55);font:600 12px/1 'Noto Sans SC',sans-serif;cursor:pointer;padding:2px 0}" +
    "@media(min-width:761px){.bias-more{display:none}}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  function num(v) { return typeof v === "number" && isFinite(v) ? v : null; }
  function fmt(v, d) { d = d === undefined ? 1 : d; return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function money(s) { var m = String(s || "").replace(/,/g, "").match(/\d+(?:\.\d+)?/g); if (!m) return null; var a = m.map(Number); return a.reduce(function (x, y) { return x + y; }, 0) / a.length; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function sgtParts(ms) { var d = new Date(ms + 8 * 3600000); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: ("0" + d.getUTCHours()).slice(-2), mm: ("0" + d.getUTCMinutes()).slice(-2) }; }
  function stamp(ms) { var p = sgtParts(ms); return p.m + "/" + p.d + " " + p.hh + ":" + p.mm; }
  function parseSgt(s) { var m = String(s || "").match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 8, +m[5]) : null; }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null"); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }

  // ── what the text says ──────────────────────────────────────────────────────────────────────────────────────────
  var W = { price: null, ms: null, verdict: null, rows: [], tfs: [] };
  (function readText() {
    var hd = document.querySelector("header .hdate"), t = hd ? hd.textContent : "";
    var dm = t.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/), tm = t.match(/(\d{1,2}):(\d{2})\s*SGT/);
    if (!dm || !tm) { var dc = document.querySelector(".disclaimer"); t = dc ? dc.textContent : ""; dm = t.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/); tm = t.match(/(\d{1,2}):(\d{2})\s*SGT/); }
    if (dm && tm) W.ms = Date.UTC(+dm[1], +dm[2] - 1, +dm[3], +tm[1] - 8, +tm[2]);
    var vb = document.querySelector(".biaslabel + .badge"), vm = vb && vb.textContent.match(/结论[：:]\s*([^—\-，。；,;（(\s]+)/);
    if (vm) W.verdict = vm[1];
    [].forEach.call(document.querySelectorAll(".lvl-table tbody tr"), function (tr) {
      var tag = tr.querySelector(".lvl-type"), pc = tr.querySelector(".lvl-price"), dc = tr.querySelector(".dist-tag"), cells = tr.children;
      if (!tag || !pc) return;
      var lv = money(pc.textContent); if (lv === null) return;
      var cur = /\bP\b/.test(tag.className);
      if (cur) W.price = lv;
      W.rows.push({ tr: tr, name: tag.textContent.trim(), level: lv, cur: cur, dist: dc, priceCell: pc, why: cells[cells.length - 1], why0: cells[cells.length - 1] ? cells[cells.length - 1].textContent : "" });
    });
    [].forEach.call(document.querySelectorAll(".tf-table tbody tr"), function (tr) {
      var n = tr.querySelector(".tf"), sg = tr.querySelector(".sig");
      if (n && sg) W.tfs.push({ tr: tr, key: n.textContent.replace(/\s+/g, ""), trend: /向上/.test(sg.textContent) ? "向上" : /向下/.test(sg.textContent) ? "向下" : "", cell: sg.parentNode });
    });
  })();
  var sorted = W.rows.filter(function (r) { return !r.cur; }).every(function (r, i, a) { return i === 0 || a[i - 1].level >= r.level; });

  // ── live marks ──────────────────────────────────────────────────────────────────────────────────────────────────
  function markLevels(L) {
    var others = W.rows.filter(function (r) { return !r.cur; });
    var above = others.filter(function (r) { return r.level > L; }).sort(function (a, b) { return a.level - b.level; })[0];
    var below = others.filter(function (r) { return r.level <= L; }).sort(function (a, b) { return b.level - a.level; })[0];
    others.forEach(function (r) {
      var d = r.level - L, crossed = W.price !== null && (r.level - W.price) * d < 0;
      r.tr.classList.toggle("lv-crossed", crossed);
      if (!r.dist) return;
      r.dist.textContent = (d >= 0 ? "+$" : "−$") + fmt(Math.abs(d));
      if (crossed) r.dist.appendChild(el("span", "lv-tag " + (d > 0 ? "dn" : "up"), d > 0 ? "已跌破" : "已突破"));
      if (r === above) r.dist.appendChild(el("span", "lv-tag near", "最近压力"));
      if (r === below) r.dist.appendChild(el("span", "lv-tag near", "最近支撑"));
    });
    var cur = W.rows.filter(function (r) { return r.cur; })[0];
    if (!cur) return;
    cur.tr.classList.add("lv-now");
    cur.priceCell.textContent = "$" + fmt(L);
    if (cur.dist) cur.dist.textContent = "实时";
    if (cur.why) cur.why.textContent = "现价（实时，每 30 秒）· 写稿时 $" + fmt(W.price) + (W.ms ? "（" + stamp(W.ms) + " SGT）" : "");
    if (sorted) {   // put the current-price row where price is now
      var tb = cur.tr.parentNode, next = others.filter(function (r) { return r.level < L; })[0];
      tb.insertBefore(cur.tr, next ? next.tr : null);
    }
  }
  function markTimeframes(state, fresh) {
    var out = [];
    W.tfs.forEach(function (w) {
      var old = w.cell.querySelector(".tf-now"); if (old) old.remove();
      w.tr.classList.remove("tf-turned");
      if (!fresh) return;
      var s = (state.timeframes || []).filter(function (t) { return String(t.name || t.tf).replace(/\s+/g, "") === w.key; })[0];
      if (!s || !s.trend) return;
      var since = parseSgt(s.since), turned = w.trend && s.trend !== w.trend;
      var tag = el("span", "tf-now " + (turned ? (s.trend === "向上" ? "up" : "dn") : "same"), turned ? "现在" + s.trend + (since ? " · " + stamp(since) + " 起" : "") : "现在仍" + s.trend);
      w.cell.appendChild(tag);
      if (turned) { w.tr.classList.add("tf-turned"); out.push(w.key.replace(/(\d)(小时|分钟)/, "$1 $2") + "：文中写" + w.trend + "，现在" + s.trend + (since ? "（" + stamp(since) + " SGT 起）" : "")); }
    });
    return out;
  }
  function note(state, L, isLive) {
    var host = document.getElementById("since-note"); if (!host || W.price === null) return;
    var upd = parseSgt(state && state.updated), fresh = upd !== null && W.ms !== null && upd > W.ms + 20 * 60000;
    var turned = markTimeframes(state || {}, fresh);
    var d = L - W.price, pct = d / W.price * 100, now = Date.now();
    var crossed = W.rows.filter(function (r) { return !r.cur && (r.level - W.price) * (r.level - L) < 0; })
      .sort(function (a, b) { return d < 0 ? b.level - a.level : a.level - b.level; });
    var box = el("div", "since"), hd = el("div", "hd");
    hd.appendChild(document.createTextNode("下面的文字写于 " + (W.ms ? stamp(W.ms) + " SGT" : "今早") + "，当时 "));
    hd.appendChild(el("b", null, "$" + fmt(W.price)));
    hd.appendChild(document.createTextNode("。现在 "));
    hd.appendChild(el("b", null, "$" + fmt(L)));
    hd.appendChild(document.createTextNode("，"));
    hd.appendChild(el("b", d >= 0 ? "up" : "dn", (d >= 0 ? "▲ +$" : "▼ −$") + fmt(Math.abs(d)) + "（" + (d >= 0 ? "+" : "−") + fmt(Math.abs(pct), 2) + "%）"));
    if (W.ms && now - W.ms > 26 * 3600000) hd.appendChild(el("b", "dn", " · 文字已是 " + Math.floor((now - W.ms) / 86400000) + " 天前写的"));
    box.appendChild(hd);
    var ul = el("ul");
    function li(text, hot) { var x = el("li", hot ? "hot" : null, text); ul.appendChild(x); }
    var sv = state && state.verdict && state.verdict.tag;
    if (sv && W.verdict) {
      if (sv !== W.verdict) li("规则的结论变了：文中写「" + W.verdict + "」，服务器 " + String(state.updated).slice(11, 16) + " 算出来是「" + sv + "」。以上面的实时栏和 4H 报告为准。", true);
      else li("规则的结论没变：仍是「" + sv + "」（服务器 " + String(state.updated).slice(11, 16) + " 的数据）。");
    }
    if (crossed.length) li("之后" + (d < 0 ? "跌破" : "突破") + "了文中的 " + crossed.map(function (r) { return r.name + " $" + fmt(r.level); }).join("、") + (d < 0 ? "：这些价位现在在现价上方，变成压力。" : "：这些价位现在在现价下方，变成支撑。"), true);
    turned.forEach(function (t) { li(t, true); });
    var w = state && (state.watch || [])[0];
    if (w && num(w.price) !== null) {
      var below = /跌破/.test(w.text), through = below ? L < w.price : L > w.price;
      li((through ? "现价已经" + (below ? "低于" : "高于") + "关键价 $" + fmt(w.price) + "，但要看收盘：" : "关键价 $" + fmt(w.price) + "（离现价 $" + fmt(Math.abs(L - w.price)) + "）：") + w.text + "。", through);
    }
    if (!crossed.length && !turned.length && Math.abs(d) < 15) li("价格变化不大，文中的价位和场景仍然适用。");
    box.appendChild(ul);
    box.appendChild(el("div", "ft", "价位表的距离和“已跌破 / 已突破”按实时价格标注；周期表的“现在”来自服务器 " + (state && state.updated ? String(state.updated).slice(5) : "") + " 的数据。" + (isLive ? "" : "（实时价格暂时读不到，用的是服务器价格）")));
    host.innerHTML = ""; host.appendChild(box);
  }
  document.addEventListener("goldbar:update", function (e) {
    var dt = e.detail || {}, L = num(dt.price); if (L === null) return;
    [].forEach.call(document.querySelectorAll(".js-live-price"), function (x) { x.textContent = "$" + fmt(L); });
    var p = sgtParts(Date.now());
    [].forEach.call(document.querySelectorAll(".js-live-time"), function (x) { x.textContent = p.hh + ":" + p.mm + " SGT" + (dt.live ? "" : "（服务器价格）"); });
    if (W.price !== null) { markLevels(L); note(dt.state, L, dt.live); }
  });

  // ── page furniture ──────────────────────────────────────────────────────────────────────────────────────────────
  var nav = document.querySelector(".navbar");
  function navH() { document.documentElement.style.setProperty("--navh", (nav ? nav.offsetHeight : 0) + "px"); }
  navH(); window.addEventListener("resize", navH);

  // long header lines: three lines, then "展开"
  [].forEach.call(document.querySelectorAll("header .hdate, header .hprice-chg"), function (x) {
    x.classList.add("clamp");
    if (x.scrollHeight <= x.clientHeight + 4) { x.classList.remove("clamp"); return; }
    var b = el("button", "more-btn", "展开全文 ▾");
    b.addEventListener("click", function () { var open = x.classList.toggle("clamp"); b.textContent = open ? "展开全文 ▾" : "收起 ▴"; });
    x.parentNode.insertBefore(b, x.nextSibling);
  });

  // bias bar on a phone: the written conclusion only, the per-timeframe lines on request
  var bias = document.querySelector(".biasbar"), extra = bias ? bias.querySelectorAll(".badge").length - 1 : 0;
  if (extra > 0) {
    bias.classList.add("short");
    var bm = el("button", "bias-more", "看各周期的文字说明（" + extra + " 条）▾"); bm.type = "button";
    bm.addEventListener("click", function () { var s = bias.classList.toggle("short"); bm.textContent = s ? "看各周期的文字说明（" + extra + " 条）▾" : "收起 ▴"; });
    bias.appendChild(bm);
  }

  // snapshot cells: short figures big, long sentences across the row
  [].forEach.call(document.querySelectorAll(".snap-cell"), function (c) {
    var v = c.querySelector(".snap-val"), n = v ? v.textContent.trim().length : 0;
    if (v && n <= 14) v.classList.add("num");
    if (n > 150) c.classList.add("wide");
  });

  // TradingView only when the chart is opened
  function loadChart(card) {
    var host = card && card.querySelector(".tv-host"); if (!host || host.dataset.loaded) return;
    host.dataset.loaded = "1";
    var box = el("div", "tradingview-widget-container"), inner = el("div", "tradingview-widget-container__widget");
    box.style.height = "100%"; inner.style.height = "100%"; box.appendChild(inner);
    var sc = document.createElement("script"); sc.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"; sc.async = true;
    sc.textContent = JSON.stringify({ autosize: true, symbol: host.dataset.symbol || "OANDA:XAUUSD", interval: host.dataset.interval || "60", timezone: "Asia/Singapore", theme: "dark", style: "1", locale: "en", backgroundColor: "#15151C", hide_side_toolbar: false, allow_symbol_change: true, support_host: "https://www.tradingview.com" });
    box.appendChild(sc); host.appendChild(box);
  }

  // folding cards: data-fold="open|closed" is the default, the visitor's choice is remembered
  var folds = store("daily.fold") || {};
  function setFold(card, closed, save) {
    card.classList.toggle("folded", closed);
    var b = card.querySelector(".fold-btn"); if (b) { b.textContent = closed ? "展开 ▾" : "收起 ▴"; b.setAttribute("aria-expanded", String(!closed)); }
    if (!closed) loadChart(card);
    if (save) { folds[card.id] = closed; store("daily.fold", folds); }
  }
  [].forEach.call(document.querySelectorAll(".card[data-fold]"), function (card) {
    var eb = card.querySelector(".card-eyebrow"); if (!eb || !card.id) return;
    var b = el("button", "fold-btn"); b.type = "button"; eb.appendChild(b);
    var toggle = function (ev) { if (ev.target.closest("a")) return; setFold(card, !card.classList.contains("folded"), true); };
    eb.addEventListener("click", toggle);
    var h2 = card.querySelector(":scope > h2"); if (h2) h2.addEventListener("click", toggle);
    setFold(card, typeof folds[card.id] === "boolean" ? folds[card.id] : card.getAttribute("data-fold") === "closed", false);
  });

  // section links: open a folded card when jumped to, light up the section in view
  var links = [].slice.call(document.querySelectorAll(".secnav a[href^='#']"));
  links.forEach(function (a) {
    a.addEventListener("click", function () { var t = document.querySelector(a.getAttribute("href")); if (t && t.classList.contains("folded")) setFold(t, false, true); });
  });
  if ("IntersectionObserver" in window && links.length) {
    var byId = {}; links.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting || !byId[e.target.id]) return;
        links.forEach(function (a) { a.classList.remove("on"); });
        var a = byId[e.target.id]; a.classList.add("on");
        var bar = a.parentNode; if (bar.scrollWidth > bar.clientWidth) bar.scrollTo({ left: a.offsetLeft - 16, behavior: "smooth" });
      });
    }, { rootMargin: "-30% 0px -60% 0px" });
    Object.keys(byId).forEach(function (id) { var t = document.getElementById(id); if (t) io.observe(t); });
  }
})();
