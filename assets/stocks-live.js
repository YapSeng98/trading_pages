// stocks.html live layer. data/quotes.js (written by scripts/update_quotes.py) is loaded just before this
// file and defines window.STOCK_QUOTES. This script is in <head>, so its DOMContentLoaded handler runs
// before the page's own chart scripts: it first writes the fresh numbers into the existing markup, and
// everything the page derives from that markup (movers, 52-week bars, glance boards) picks them up
// unchanged. A second pass, after those scripts, builds the review table and the rankings.
// If the data file is missing the page simply keeps the numbers written in its HTML.
(function () {
  "use strict";
  var META = window.STOCK_QUOTES || null, Q = (META && META.quotes) || {};
  var FLAG = { US: "🇺🇸", SG: "🇸🇬", MY: "🇲🇾" }, MKT = { US: "美国", SG: "新加坡", MY: "马来西亚" }, ORDER = { US: 0, SG: 1, MY: 2 };
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem("stocks." + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("stocks." + k, JSON.stringify(v)); } catch (e) {} }
  };

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }
  function txt(el) { return el ? el.textContent.replace(/\s+/g, " ").trim() : ""; }
  function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); return e; }
  function h(tag, attrs, kids) {
    var e = document.createElement(tag), k;
    for (k in (attrs || {})) {
      var v = attrs[k]; if (v === null || v === undefined || v === false) continue;
      if (k === "class") e.className = v; else if (k === "text") e.textContent = v;
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v);
    }
    (kids || []).forEach(function (c) { if (c === null || c === undefined || c === false) return; e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function money(q, v) { var d = Math.abs(v) < 1 ? 3 : 2; return q.cur + v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function pct(v, d) { return !isNum(v) ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d === undefined ? 2 : d) + "%"; }
  function dir(v) { return v > 0 ? "up" : v < 0 ? "down" : "flat"; }
  function md(date) { var p = String(date || "").split("-"); return p.length === 3 ? +p[1] + "/" + +p[2] : ""; }
  function posWord(p) { return p >= 70 ? "高位" : p <= 30 ? "低位" : "中段"; }
  function shortTk(tk) { return tk.indexOf(":") >= 0 ? tk.split(":")[1] : tk; }
  // Momentum on the radar's 0-10 scale, from the last one and three months of price change.
  window.stockMomentum = function (tk, fallback) {
    var q = Q[tk]; if (!q || !isNum(q.r1m) || !isNum(q.r3m)) return fallback;
    return Math.max(0, Math.min(10, Math.round(5 + q.r1m * 0.25 + q.r3m * 0.1)));
  };

  // ---------- pass 1: write fresh numbers into the existing markup ----------
  function applyQuotes() {
    if (!META) return;
    $$(".q-card[data-symbol]").forEach(function (c) {
      var q = Q[c.getAttribute("data-symbol")]; if (!q) return;
      var p = $(".q-px", c), g = $(".q-chg", c);
      if (p) p.textContent = money(q, q.price);
      // plain "+0.27%" / "-0.45%": the page's movers chart parses this text
      if (g) { g.className = "q-chg " + dir(q.chg); g.textContent = (q.chg > 0 ? "+" : "") + q.chg.toFixed(2) + "%"; }
    });
    [["SG", ".js-sg-time"], ["MY", ".js-my-time"]].forEach(function (m) {
      var d = marketDate(m[0]); if (d) $$(m[1]).forEach(function (el) { el.textContent = d + " 收盘价"; });
    });

    $$(".deep").forEach(function (card) {
      var q = Q[txt($(".deep-nm", card)).split("·")[0].trim()]; if (!q) return;
      var dp = $(".deep-px", card); if (dp) dp.textContent = money(q, q.price);
      $$(".deep-stats .ds", card).forEach(function (ds) {
        var k = $(".k", ds), v = $(".v", ds); if (!k || !v) return;
        if (k.textContent.indexOf("52周低") >= 0) v.textContent = money(q, q.lo52);
        else if (k.textContent.indexOf("52周高") >= 0) v.textContent = money(q, q.hi52);
        else if (k.textContent.indexOf("股息率") >= 0 && isNum(q.yield)) { k.textContent = "股息率（近12月）"; v.textContent = q.yield.toFixed(2) + "%"; }
      });
      var r = $(".range52", card);
      if (r && isNum(q.pos52)) {
        var f = $(".fill", r), pin = $(".pin", r), rk = $$(".rk span", r), caps = $$(".cap span", r);
        if (f) f.style.width = q.pos52 + "%"; if (pin) pin.style.left = q.pos52 + "%";
        if (rk[1]) rk[1].textContent = "现价在一年区间的 " + q.pos52 + "% 处：" + (q.pos52 >= 70 ? "接近一年高位，追高要谨慎" : q.pos52 <= 30 ? "接近一年低位，留意是否止跌" : "处于一年区间中段");
        if (caps[0]) caps[0].textContent = money(q, q.lo52); if (caps[1]) caps[1].textContent = money(q, q.hi52);
      }
      if (!$(".deep-fresh", card)) card.appendChild(h("div", { class: "deep-fresh", text: "价格、52 周区间和股息率是 " + md(q.date) + " 收盘的行情数据；市值、P/E 和文字分析是上次深度复核时写下的，可能已经变化。" }));
    });

    $$(".stock").forEach(function (card) {
      var q = Q[txt($(".tk", card))], top = $(".stock-top", card); if (!q || !top || $(".px-row", card)) return;
      top.parentNode.insertBefore(priceRow(q), top.nextSibling);
    });

    var stamp = $(".upd-stamp"), latest = latestDate();
    if (stamp && latest) stamp.textContent = stamp.textContent.replace(/价格更新 · \d{4}-\d{2}-\d{2}/, "价格更新 · " + latest);
  }
  function priceRow(q) {
    return h("div", { class: "px-row" }, [
      h("b", { text: money(q, q.price) }),
      h("span", { class: "pc " + dir(q.chg), text: (q.chg > 0 ? "▲ " : q.chg < 0 ? "▼ " : "") + pct(q.chg) }),
      isNum(q.pos52) ? h("span", { text: "一年区间 " + q.pos52 + "%（" + posWord(q.pos52) + "）" }) : null,
      isNum(q.r1m) ? h("span", { text: "近 1 月 " + pct(q.r1m, 1) }) : null,
      q.yield > 0.05 ? h("span", { text: "股息率 " + q.yield.toFixed(1) + "%" }) : null
    ]);
  }
  function marketDate(m) { var d = ""; Object.keys(Q).forEach(function (k) { if (Q[k].market === m && Q[k].date > d) d = Q[k].date; }); return d; }
  function latestDate() { var d = ""; Object.keys(Q).forEach(function (k) { if (Q[k].date > d) d = Q[k].date; }); return d; }

  // ---------- the stocks as the page describes them ----------
  function rows() {
    return $$(".stock").map(function (card) {
      var tk = txt($(".tk", card)), pane = card.closest(".tabpane"), col = card.closest(".col"), rt = $(".risk-tag", card);
      if (!tk || !pane) return null;
      return { tk: tk, name: txt($(".nm", card)), market: pane.id.replace("tab-", "").toUpperCase(), type: col && col.classList.contains("growth") ? "growth" : "divi",
        risk: txt(rt), riskCls: rt ? (/\bhi\b/.test(rt.className) ? "hi" : /\bmd\b/.test(rt.className) ? "md" : "lo") : "", point: txt($(".metric", card)),
        score: parseFloat(txt($(".score-v", card))) || null, q: Q[tk] || null, el: card };
    }).filter(Boolean);
  }
  function goTo(r) {
    var id = r.market.toLowerCase(); if ((location.hash || "").replace("#", "") !== id) location.hash = id;   // the page's tab script follows the hash
    setTimeout(function () { r.el.scrollIntoView({ behavior: "smooth", block: "center" }); r.el.classList.remove("flash"); void r.el.offsetWidth; r.el.classList.add("flash"); }, 120);
  }

  // ---------- freshness bar ----------
  function buildFresh(R) {
    var el = document.getElementById("fresh"); if (!el) return;
    clear(el); el.appendChild(h("span", { class: "dot" }));
    if (!META) { el.className = "fresh none"; el.appendChild(h("span", null, [h("b", { text: "行情数据没有载入。" }), " 页面显示的是写在页面里的旧数字，可能已经过期。"])); return; }
    var now = Date.now(), oldest = 0;
    ["US", "SG", "MY"].forEach(function (m, i) {
      var d = marketDate(m); if (!d) return;
      oldest = Math.max(oldest, (now - Date.parse(d + "T00:00:00+08:00")) / 86400000);
      if (i) el.appendChild(h("span", { class: "sep", text: "|" }));
      el.appendChild(h("span", null, [MKT[m] + " ", h("b", { text: md(d) + " 收盘" })]));
    });
    el.className = "fresh" + (oldest > 5 ? " old" : "");
    var stale = (META.failed || []).length;
    el.appendChild(h("span", { class: "when", text: (oldest > 5 ? "行情已超过 5 天没更新 · " : "") + (stale ? stale + " 只没取到新数据 · " : "") + "数据抓取于 " + META.updated }));
  }

  // ---------- review table ----------
  var RV = { market: LS.get("rv.market", "ALL"), type: LS.get("rv.type", "ALL"), sort: LS.get("rv.sort", null), seen: LS.get("rv.seen", {}) };
  var COLS = [
    { k: "chg", label: "当日", cls: "", get: function (r) { return r.q ? r.q.chg : null; } },
    { k: "r1m", label: "近 1 月", cls: "c-m1", get: function (r) { return r.q ? r.q.r1m : null; } },
    { k: "ytd", label: "今年以来", cls: "c-ytd", get: function (r) { return r.q ? r.q.ytd : null; } },
    { k: "pos", label: "一年区间位置", cls: "c-pos", get: function (r) { return r.q ? r.q.pos52 : null; } },
    { k: "yld", label: "股息率", cls: "", get: function (r) { return r.q ? r.q.yield : null; } },
    { k: "score", label: "评分", cls: "", get: function (r) { return r.score; } }
  ];
  function buildReview(R) {
    var host = document.getElementById("review"); if (!host) return;
    clear(host);
    var sec = h("section", { class: "rv", "aria-label": "逐只复核" });
    sec.appendChild(h("div", { class: "rv-head" }, [h("h2", null, ["逐只复核", h("small", { text: R.length + " 只 · 点一行看详细分析" })])]));
    sec.appendChild(h("p", { class: "rv-intro", text: "一张表看完所有股票的最新行情。价格、涨跌、一年区间位置和股息率来自行情数据，每个交易日更新；评分和风险是编辑评估。点表头可以排序，看完一只就点左边的圆圈打勾。" }));

    // four things worth a first look
    var withQ = R.filter(function (r) { return r.q; });
    if (withQ.length) {
      var by = function (f) { return withQ.slice().sort(function (a, b) { return f(b) - f(a); }); };
      var up = by(function (r) { return r.q.chg; })[0], dn = by(function (r) { return -r.q.chg; })[0];
      var low = by(function (r) { return -(isNum(r.q.pos52) ? r.q.pos52 : 999); })[0], yl = by(function (r) { return r.q.yield || 0; })[0];
      var hi = h("div", { class: "rv-hi" }), card = function (k, r, v, c) { hi.appendChild(h("button", { type: "button", class: "rv-hc", onclick: function () { goTo(r); } }, [h("span", { class: "hk", text: k }), h("span", { class: "hn", text: FLAG[r.market] + " " + r.name }), h("span", { class: "hv " + c, text: v })])); };
      card("当日涨最多", up, pct(up.q.chg), dir(up.q.chg)); card("当日跌最多", dn, pct(dn.q.chg), dir(dn.q.chg));
      card("离一年低点最近", low, "区间 " + low.q.pos52 + "%", "gold"); card("股息率最高（近 12 月）", yl, (yl.q.yield || 0).toFixed(1) + "%", "gold");
      sec.appendChild(hi);
    }

    var bar = h("div", { class: "rv-bar" });
    var seg = function (key, opts) {
      var g = h("div", { class: "rv-seg", role: "group" });
      opts.forEach(function (o) { g.appendChild(h("button", { type: "button", "aria-pressed": String(RV[key] === o[0]), text: o[1], onclick: function () { RV[key] = o[0]; LS.set("rv." + key, o[0]); buildReview(R); } })); });
      return g;
    };
    bar.appendChild(seg("market", [["ALL", "全部"], ["US", "🇺🇸 美国"], ["SG", "🇸🇬 新加坡"], ["MY", "🇲🇾 马来西亚"]]));
    bar.appendChild(seg("type", [["ALL", "全部类型"], ["growth", "成长"], ["divi", "股息"]]));
    var seenN = R.filter(function (r) { return RV.seen[r.tk]; }).length, fill = h("i"); fill.style.width = (R.length ? seenN / R.length * 100 : 0) + "%";
    bar.appendChild(h("div", { class: "rv-prog" }, [h("span", { text: "已看 " + seenN + " / " + R.length }), h("span", { class: "track" }, [fill]),
      seenN ? h("button", { type: "button", text: "重新开始", onclick: function () { RV.seen = {}; LS.set("rv.seen", RV.seen); buildReview(R); } }) : null]));
    sec.appendChild(bar);

    var list = R.filter(function (r) { return (RV.market === "ALL" || r.market === RV.market) && (RV.type === "ALL" || r.type === RV.type); });
    var sc = RV.sort && COLS.filter(function (c) { return c.k === RV.sort.k; })[0];
    if (sc) list.sort(function (a, b) { var x = sc.get(a), y = sc.get(b); if (!isNum(x)) return 1; if (!isNum(y)) return -1; return RV.sort.d * (x - y); });
    else list.sort(function (a, b) { return (ORDER[a.market] - ORDER[b.market]) || (a.type === b.type ? 0 : a.type === "growth" ? -1 : 1) || ((b.score || 0) - (a.score || 0)); });

    var head = h("tr", null, [h("th", { class: "l", scope: "col", "aria-label": "已看" }), h("th", { class: "l", scope: "col", text: "股票" }), h("th", { scope: "col", text: "现价" })]);
    COLS.forEach(function (c) {
      var on = RV.sort && RV.sort.k === c.k;
      var th = h("th", { scope: "col", class: c.cls, "aria-sort": on ? (RV.sort.d < 0 ? "descending" : "ascending") : null }, [h("button", { type: "button", title: "按这一列排序", text: c.label + (on ? (RV.sort.d < 0 ? " ↓" : " ↑") : ""), onclick: function () {
        RV.sort = !on ? { k: c.k, d: -1 } : RV.sort.d < 0 ? { k: c.k, d: 1 } : null; LS.set("rv.sort", RV.sort); buildReview(R);
      } })]);
      head.appendChild(th);
    });
    head.appendChild(h("th", { scope: "col", class: "c-risk", text: "风险" }));
    var tb = h("tbody");
    list.forEach(function (r) {
      var q = r.q, seen = !!RV.seen[r.tk];
      var tr = h("tr", { class: seen ? "seen" : "" });
      tr.appendChild(h("td", { class: "l c-chk" }, [h("button", { type: "button", class: "rv-chk", "aria-pressed": String(seen), "aria-label": (seen ? "取消已看：" : "标为已看：") + r.name, text: seen ? "✓" : "", onclick: function (ev) { ev.stopPropagation(); if (seen) delete RV.seen[r.tk]; else RV.seen[r.tk] = 1; LS.set("rv.seen", RV.seen); buildReview(R); } })]));
      tr.appendChild(h("td", { class: "l" }, [h("div", { class: "rv-nm" }, [h("span", { class: "fl", text: FLAG[r.market] || "" }), h("div", null, [h("b", null, [r.name, h("span", { class: "ty " + r.type, text: r.type === "growth" ? "成长" : "股息" })]), h("span", { class: "sub", text: shortTk(r.tk) + (r.point ? " · " + r.point : "") })])])]));
      tr.appendChild(h("td", { class: "rv-px" }, [h("b", { text: q ? money(q, q.price) : "—" })]));
      tr.appendChild(h("td", { class: "num " + (q ? dir(q.chg) : "flat"), text: q ? pct(q.chg) : "—" }));
      tr.appendChild(h("td", { class: "num c-m1 " + (q && isNum(q.r1m) ? dir(q.r1m) : "flat"), text: q ? pct(q.r1m, 1) : "—" }));
      tr.appendChild(h("td", { class: "num c-ytd " + (q && isNum(q.ytd) ? dir(q.ytd) : "flat"), text: q ? pct(q.ytd, 1) : "—" }));
      var pos = h("td", { class: "c-pos" });
      if (q && isNum(q.pos52)) { var pin = h("i"); pin.style.left = q.pos52 + "%"; pos.appendChild(h("span", { class: "rv-pos", title: "一年最低 " + money(q, q.lo52) + "，最高 " + money(q, q.hi52) }, [h("span", { class: "t" }, [pin]), h("span", { class: "num", text: q.pos52 + "%" }), h("span", { class: "w", text: posWord(q.pos52) })])); } else pos.textContent = "—";
      tr.appendChild(pos);
      tr.appendChild(h("td", { class: "num", text: q && q.yield > 0.05 ? q.yield.toFixed(1) + "%" : "—" }));
      tr.appendChild(h("td", null, [h("span", { class: "rv-sc " + (r.score >= 85 ? "a" : r.score >= 75 ? "b" : "c"), text: r.score === null ? "—" : String(Math.round(r.score)) })]));
      tr.appendChild(h("td", { class: "c-risk" }, [r.risk ? h("span", { class: "risk-tag " + r.riskCls, text: r.risk }) : null]));
      tr.addEventListener("click", function () { goTo(r); });
      tb.appendChild(tr);
    });
    if (!list.length) tb.appendChild(h("tr", null, [h("td", { colspan: "10", class: "rv-empty", text: "这个筛选下没有股票。" })]));
    sec.appendChild(h("div", { class: "rv-wrap" }, [h("table", { class: "rv-t" }, [h("thead", null, [head]), tb])]));
    sec.appendChild(h("p", { class: "rv-note", text: "一年区间位置：现价在过去一年最低价和最高价之间的位置，0% 是一年最低，100% 是一年最高。股息率：过去 12 个月实际派发的股息 ÷ 现价，和研究文字里引用的预期收益率可能不同。评分 85 以上为绿色，75 到 84 为金色，75 以下为红色。" }));
    host.appendChild(sec);
  }

  // ---------- rankings and totals on the overview, from the same rows ----------
  function vrow(flag, name, cls, width, val) { var f = h("div", { class: "vfill " + cls }); f.style.width = Math.max(2, Math.min(100, width)) + "%"; return h("div", { class: "vrow" }, [h("span", { class: "vflag", text: flag }), h("span", { class: "vname", text: name }), h("div", { class: "vtrack" }, [f]), h("span", { class: "vval", text: val })]); }
  function buildRankings(R) {
    var rs = document.getElementById("rankScore"), ry = document.getElementById("rankYield"), scored = R.filter(function (r) { return r.score !== null; });
    if (rs && scored.length) { clear(rs); scored.slice().sort(function (a, b) { return b.score - a.score; }).slice(0, 8).forEach(function (r) { rs.appendChild(vrow(FLAG[r.market], r.name, r.market.toLowerCase(), r.score, String(Math.round(r.score)))); }); }
    var payers = R.filter(function (r) { return r.q && r.q.yield > 0.05; }).sort(function (a, b) { return b.q.yield - a.q.yield; }).slice(0, 8);
    if (ry && payers.length) { clear(ry); var top = payers[0].q.yield; payers.forEach(function (r) { ry.appendChild(vrow(FLAG[r.market], r.name, "amber", r.q.yield / top * 100, r.q.yield.toFixed(1) + "%")); }); }

    var avg = function (a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : null; };
    ["US", "SG", "MY"].forEach(function (m) {
      var mine = R.filter(function (r) { return r.market === m; }), sc = avg(mine.filter(function (r) { return r.score !== null; }).map(function (r) { return r.score; }));
      var yl = avg(mine.filter(function (r) { return r.type === "divi" && r.q && isNum(r.q.yield); }).map(function (r) { return r.q.yield; }));
      var set = function (id, w, t) { var f = document.getElementById(id + "F"), v = document.getElementById(id + "V"); if (f) f.style.width = Math.max(2, Math.min(100, w)) + "%"; if (v) v.textContent = t; };
      if (sc !== null) set("mc" + m + "s", sc, sc.toFixed(1));
      if (yl !== null) set("mc" + m + "y", yl / 7 * 100, yl.toFixed(1) + "%");
    });
    var setText = function (id, t) { var e = document.getElementById(id); if (e) e.textContent = t; };
    var cnt = function (m) { return R.filter(function (r) { return r.market === m; }).length; };
    setText("stCount", String(R.length)); setText("stCountD", "美 " + cnt("US") + " · 新 " + cnt("SG") + " · 马 " + cnt("MY"));
    if (scored.length) { var best = scored.slice().sort(function (a, b) { return b.score - a.score; })[0]; setText("stAvg", avg(scored.map(function (r) { return r.score; })).toFixed(1)); setText("stAvgD", "最高 " + best.name + " " + Math.round(best.score)); }
    var dy = R.filter(function (r) { return r.type === "divi" && r.q && isNum(r.q.yield); }).map(function (r) { return r.q.yield; });
    if (dy.length) { setText("stYield", avg(dy).toFixed(1) + "%"); setText("stYieldD", "股息类 " + dy.length + " 只 · 近 12 月实际派息"); }
    ["lo", "md", "hi"].forEach(function (k) { var n = R.filter(function (r) { return r.riskCls === k; }).length, bar = document.getElementById("stRisk-" + k), lab = document.getElementById("stRiskL-" + k); if (bar) bar.style.flex = String(n); if (lab) { lab.style.flex = String(n); lab.textContent = (k === "lo" ? "低 " : k === "md" ? "中 " : "高 ") + n; } });
    var d = latestDate();
    $$(".js-mv-date").forEach(function (el) { el.textContent = d ? md(d) + " 收盘" : ""; });
  }
  // US glance cards are built by the page without a price; add one.
  function enrichUsBoard() {
    $$("#usBoard .q-card").forEach(function (c) {
      var q = Q[txt($(".q-tk", c))], nm = $(".q-nm", c); if (!q || !nm || $(".q-px", c)) return;
      var g = h("div", { class: "q-chg " + dir(q.chg), text: (q.chg > 0 ? "+" : "") + q.chg.toFixed(2) + "%" });
      nm.parentNode.insertBefore(g, nm.nextSibling); nm.parentNode.insertBefore(h("div", { class: "q-px", text: money(q, q.price) }), g);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    applyQuotes();
    setTimeout(function () {                       // after the page's own DOMContentLoaded scripts
      var R = rows();
      buildFresh(R); buildReview(R); buildRankings(R); enrichUsBoard();
    }, 0);
  });
})();
