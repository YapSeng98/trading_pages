// Alerts for the gold, Bitcoin and forex pages: one way to send them, one record of what was sent, and a picture of
// the chart with each one. Owner, 2026-11-18: "not clear why notification can show the chart pattern for every single
// alert no matter gold, bitcoin or forex. i need to be clear for user and also need to improve the alert fast when that
// have potential bullish or bearish based on 1D and 4H".
//
// AlertKit.send(a) -> the record kept, or null when a.key was already sent (from any tab of this site)
//   a.market "xau" | "btc" | "fx"; a.name the market's name; a.kind one of KIND below; a.chip what it is, when not
//   the kind's own words (Bitcoin's signals are watch-only, forex's lost money in the replay)
//   a.title; a.lines: what happened, what it means, what to do, the chart pattern (empty ones are dropped)
//   a.key: sent once per key, across tabs; a.tag: a newer notification with the same tag replaces the older one;
//   a.chart: see draw(); a.quiet: kept in the record without a notification, a.nolog: a notification not kept (a page
//   that sends many at once as a few and a summary)
// Every alert carries a picture of its chart: the candles of the timeframe it is about, the prices it names (turning
// close, break level, stop, target, the visitor's own level), the price now, and the chart pattern on that timeframe
// when there is one. Windows shows it as the notification's picture, a Mac as its small picture on the right, and the
// page's record (AlertKit.view) full size.
// Delivery goes through the service worker (sw.js) when it is there, since phones allow only that way, and a click
// brings the page forward and opens that alert in its record; otherwise new Notification, as before.
// The record is this browser's own (localStorage "alerts.log"), newest first, 60 at most, a picture on the newest 12.
// Each alert keeps the words it was sent with; its kind is named in the page's language when shown.
(function () {
  "use strict";
  var EN = window.LANG === "en", tr = function (zh, en) { return EN ? en : zh; };
  var LOG = "alerts.log", SENT = "alerts.sent", WATCH = "alerts.watch", MAXLOG = 60, PICS = 12, ICON = "assets/icon-192.png";
  // kind: [its name in the record, what it is (the notification's first words)]
  var KIND = {
    signal: [tr("信号", "Signal"), tr("规则的信号", "the rule's signal")],
    soon: [tr("快出信号", "Signal soon"), tr("预警 · 还不是信号", "heads-up · not a signal yet")],
    pre: [tr("可能转向", "May turn"), tr("预警 · 还没收盘", "heads-up · not closed yet")],
    turn: [tr("转向", "Turned"), tr("收盘确认", "confirmed at the close")],
    answer: [tr("结论", "Answer"), tr("结论变了", "the answer changed")],
    pattern: [tr("形态", "Pattern"), tr("参考 · 不是信号", "reference · not a signal")],
    price: [tr("你的价位", "Your level"), tr("你设的价位 · 不是信号", "your own level · not a signal")],
    more: [tr("汇总", "Summary"), tr("另外几条", "more alerts")],
    test: [tr("测试", "Test"), tr("测试", "test")]
  };
  function rd(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function wr(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function fin(v) { return typeof v === "number" && isFinite(v); }

  // ---------- sent once ----------
  function sent() { var s = rd(SENT, {}); return s && typeof s === "object" && !Array.isArray(s) ? s : {}; }
  function keep(s) { var now = Date.now(), ks = Object.keys(s); if (ks.length > 400) ks.forEach(function (k) { if (now - s[k] > 6 * 86400000) delete s[k]; }); wr(SENT, s); }
  function once(key) { if (!key) return true; var s = sent(); if (s[key]) return false; s[key] = Date.now(); keep(s); return true; }
  function recent(key, ms) { var t = sent()[key]; return fin(t) && Date.now() - t < ms; }
  function mark(key) { var s = sent(); s[key] = Date.now(); keep(s); }

  // ---------- the picture ----------
  // c.rows: closed candles [openMs, o, h, l, c, …], oldest first; c.bar: the one still forming; c.live: the price now
  // (c.liveWord its name: 现价, or 最新 on forex where it is the last 15-minute close); c.levels: [{ v, label, kind }]
  // with kind flip | need | trig | stop | tgt | entry | own; c.geo and c.dir: a chart pattern (xau-engine.js `geo`,
  // times are the candles' open times) and the way it points; c.title, c.tag (second line, in colour), c.sub (top
  // right); c.fmt: price to text. All prices in the same units as the rows.
  var FONT = "-apple-system,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans SC',sans-serif", MONO = "'IBM Plex Mono',Menlo,Consolas,monospace";
  var C = { bg: "#0B0E1A", grid: "rgba(255,255,255,.06)", bull: "#0AB074", bear: "#DB2943", gold: "#D4A72C", violet: "#A78BFA", ink: "#F3F1EC", dim: "#9A97A8" };
  var LVC = { flip: C.gold, need: C.gold, trig: C.gold, stop: C.bear, tgt: C.bull, entry: C.ink, own: C.violet };
  function rgba(hex, a) { var n = parseInt(hex.slice(1), 16); return "rgba(" + (n >> 16 & 255) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + a + ")"; }
  function geoStart(geo) {
    if (!geo) return null; var t = Infinity;
    (geo.pts || []).forEach(function (q) { if (fin(q.t)) t = Math.min(t, q.t); });
    (geo.lines || []).forEach(function (l) { if (fin(l.t0)) t = Math.min(t, l.t0); });
    if (geo.box && fin(geo.box.t0)) t = Math.min(t, geo.box.t0);
    return t === Infinity ? null : t;
  }
  function fit(g, s, w) { s = String(s); if (g.measureText(s).width <= w) return s; while (s.length > 1 && g.measureText(s + "…").width > w) s = s.slice(0, -1); return s + "…"; }
  function paint(c, W, H, small) {
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var g = cv.getContext && cv.getContext("2d"); if (!g) return null;
    var rows = (c.rows || []).filter(function (r) { return r && fin(r[1]) && fin(r[2]) && fin(r[3]) && fin(r[4]); });
    if (rows.length < 8) return null;
    var first = rows.length - (small ? 34 : 64), gs = small ? null : geoStart(c.geo);
    if (gs !== null) for (var i0 = rows.length - 1; i0 >= 0; i0--) if (rows[i0][0] <= gs) { first = Math.min(first, i0 - 4); break; }
    first = Math.max(0, first, rows.length - 140);
    var R = rows.slice(first), bar = c.bar && fin(c.bar[1]) && fin(c.bar[2]) && fin(c.bar[3]) && fin(c.bar[4]) && c.bar[0] > R[R.length - 1][0] ? c.bar : null;
    if (bar) R = R.concat([bar]);
    var n = R.length, formed = bar ? n - 1 : n, f = c.fmt || function (v) { return String(Math.round(v * 100) / 100); };
    var L = small ? 6 : 12, RG = small ? 10 : 116, T = small ? 10 : 54, B = small ? 10 : 14, xR = W - RG;
    var lo = Infinity, hi = -Infinity; R.forEach(function (r) { lo = Math.min(lo, r[3]); hi = Math.max(hi, r[2]); });
    var rng = hi - lo || Math.abs(hi) * 0.002 || 1, lv = (c.levels || []).filter(function (l) { return l && fin(l.v); }), live = fin(c.live) ? c.live : null;
    lv.forEach(function (l) { lo = Math.min(lo, Math.max(l.v, lo - 0.7 * rng)); hi = Math.max(hi, Math.min(l.v, hi + 0.7 * rng)); });   // a far level may stretch the scale by 70% at most
    if (live !== null) { lo = Math.min(lo, Math.max(live, lo - rng)); hi = Math.max(hi, Math.min(live, hi + rng)); }
    var pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    var cw = (W - L - RG) / (n + 1.2), X = function (i) { return L + (i + 0.5) * cw; };
    var Y = function (v) { return T + (hi - v) / (hi - lo) * (H - T - B); }, clampY = function (y) { return Math.max(T - 2, Math.min(H - B + 2, y)); };
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    g.strokeStyle = C.grid; g.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach(function (k) { var y = Math.round(T + k * (H - T - B)) + 0.5; g.beginPath(); g.moveTo(L, y); g.lineTo(xR, y); g.stroke(); });
    // the chart pattern's area, behind the candles
    var idx = {}; R.forEach(function (r, i) { idx[r[0]] = i; });
    var at = function (t) { return idx[t] === undefined ? null : idx[t]; }, geo = c.geo || null, gcol = c.dir > 0 ? C.bull : c.dir < 0 ? C.bear : C.gold;
    var lineAt = function (l, i) { var i1 = at(l.t1); return i1 === null ? null : l.p1 + (l.m || 0) * (i - i1); }, ext = n - 1;
    if (geo) {
      var lastI = at(geo.last); if (lastI === null) lastI = formed - 1;
      ext = Math.min(n - 0.4, lastI + Math.max(3, Math.round(n * 0.08)));
      var up = (geo.lines || []).filter(function (l) { return l.k === "upper"; })[0], dn = (geo.lines || []).filter(function (l) { return l.k === "lower"; })[0];
      if (up && dn && at(up.t1) !== null && at(dn.t1) !== null) {
        var a0 = Math.max(0, at(up.t0) === null ? 0 : at(up.t0));
        g.fillStyle = rgba(gcol, 0.13); g.beginPath();
        g.moveTo(X(a0), Y(lineAt(up, a0))); g.lineTo(X(ext), Y(lineAt(up, ext))); g.lineTo(X(ext), Y(lineAt(dn, ext))); g.lineTo(X(a0), Y(lineAt(dn, a0))); g.closePath(); g.fill();
      }
      if (geo.box) {
        var b0 = at(geo.box.t0), b1 = at(geo.box.t1);
        if (b0 !== null && b1 !== null) { var by = Y(geo.box.hi), bh = Math.max(2, Y(geo.box.lo) - by); g.fillStyle = rgba(C.gold, 0.1); g.fillRect(X(b0) - cw / 2, by, (b1 - b0 + 1) * cw, bh); g.setLineDash([3, 3]); g.strokeStyle = C.gold; g.strokeRect(X(b0) - cw / 2, by, (b1 - b0 + 1) * cw, bh); g.setLineDash([]); }
      }
    }
    // the candles; the one still forming is hollow
    var bw = Math.max(1, Math.min(small ? 5 : 9, cw * 0.64));
    R.forEach(function (r, i) {
      var x = X(i), col = r[4] >= r[1] ? C.bull : C.bear, y0 = Y(Math.max(r[1], r[4])), y1 = Y(Math.min(r[1], r[4]));
      g.strokeStyle = col; g.lineWidth = 1; g.beginPath(); g.moveTo(x, Y(r[2])); g.lineTo(x, Y(r[3])); g.stroke();
      if (i >= formed) { g.lineWidth = 1.4; g.strokeRect(x - bw / 2, y0, bw, Math.max(1, y1 - y0)); }
      else { g.fillStyle = col; g.fillRect(x - bw / 2, y0, bw, Math.max(1, y1 - y0)); }
    });
    // the pattern's lines and points, over the candles
    if (geo) {
      (geo.lines || []).forEach(function (l) {
        var i0 = at(l.t0); if (i0 === null) i0 = 0;
        var pole = l.k === "pole", iE = pole ? at(l.t1) : ext; if (iE === null) return;
        var p0 = pole ? l.p0 : lineAt(l, i0), p1 = pole ? l.p1 : lineAt(l, iE); if (!fin(p0) || !fin(p1)) return;
        g.strokeStyle = pole ? rgba(gcol, 0.75) : C.gold; g.lineWidth = pole ? (small ? 3 : 4) : (small ? 2 : 2.2); g.lineCap = "round";
        g.beginPath(); g.moveTo(X(i0), Y(p0)); g.lineTo(X(iE), Y(p1)); g.stroke();
      });
      (geo.pts || []).forEach(function (q) {
        var i = at(q.t); if (i === null || q.k === "pole") return;
        g.beginPath(); g.arc(X(i), Y(q.p), small ? 2.6 : 4.2, 0, 2 * Math.PI); g.fillStyle = C.bg; g.fill(); g.strokeStyle = C.gold; g.lineWidth = 2; g.stroke();
      });
    }
    // the prices it names: dashed across, name and price in the right margin, pushed apart so none overlap
    var labs = [], seen = {};
    lv.forEach(function (l) {
      var k = (l.kind || "") + Math.round(l.v * 1e4); if (seen[k]) return; seen[k] = 1;
      var col = LVC[l.kind] || C.gold, y0 = Y(l.v), y = clampY(y0);
      g.strokeStyle = col; g.lineWidth = 1.5; g.setLineDash(l.kind === "entry" ? [] : l.kind === "stop" || l.kind === "tgt" ? [2, 3] : [6, 4]);
      g.beginPath(); g.moveTo(L, y); g.lineTo(xR + (small ? 0 : 4), y); g.stroke(); g.setLineDash([]);
      if (!small) labs.push({ y: y, a: (l.label || "") + (y !== y0 ? (l.v > hi ? " ↑" : " ↓") : ""), b: f(l.v), col: col });
    });
    if (live !== null) {
      var ly0 = Y(live), ly = clampY(ly0), lx = bar ? X(n - 1) : X(n - 1) + cw;
      g.strokeStyle = rgba(C.ink, 0.55); g.setLineDash([1, 3]); g.lineWidth = 1; g.beginPath(); g.moveTo(lx, ly); g.lineTo(xR + 4, ly); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.arc(lx, ly, small ? 3.5 : 4.6, 0, 2 * Math.PI); g.fillStyle = C.ink; g.fill();
      if (!small) labs.push({ y: ly, a: c.liveWord || tr("现价", "now"), b: f(live) + (ly !== ly0 ? (live > hi ? " ↑" : " ↓") : ""), col: C.ink, now: true });
    }
    if (!small) {
      labs.sort(function (a, b) { return a.y - b.y; });
      for (var k = 1; k < labs.length; k++) if (labs[k].y - labs[k - 1].y < 34) labs[k].y = labs[k - 1].y + 34;
      var over = labs.length ? labs[labs.length - 1].y + 18 - H : 0; if (over > 0) labs.forEach(function (l) { l.y -= over; });
      labs.forEach(function (l) {
        g.font = "600 14px " + FONT; g.fillStyle = l.col; g.fillText(fit(g, l.a, RG - 12), xR + 9, l.y - 3);
        g.font = (l.now ? "700" : "600") + " 15px " + MONO; g.fillStyle = C.ink; g.fillText(fit(g, l.b, RG - 12), xR + 9, l.y + 14);
      });
      g.font = "700 19px " + FONT; g.fillStyle = C.ink; g.fillText(fit(g, c.title || "", W - 170), L, 26);
      if (c.tag) { g.font = "600 14px " + FONT; g.fillStyle = c.tagCol || gcol; g.fillText(fit(g, c.tag, W - 24), L, 46); }
      if (c.sub) { g.font = "500 13px " + FONT; g.fillStyle = C.dim; g.textAlign = "right"; g.fillText(c.sub, W - 10, 24); g.textAlign = "left"; }
    }
    return cv;
  }
  // -> { image (the notification's picture), icon (its small square one), thumb (the record's copy) } or null
  function draw(c) {
    if (!c) return null;
    try {
      var big = paint(c, 640, 320, false), small = big && paint(c, 192, 192, true);
      if (!big || !small) return null;
      return { image: big.toDataURL("image/png"), icon: small.toDataURL("image/png"), thumb: big.toDataURL("image/jpeg", 0.8) };
    } catch (e) { return null; }
  }

  // ---------- sending ----------
  function can() { return "Notification" in window && Notification.permission === "granted"; }
  var regP = null;
  function sw() {
    if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return Promise.resolve(null);
    if (!regP) regP = navigator.serviceWorker.register("sw.js").then(function () { return navigator.serviceWorker.ready; }).catch(function () { return null; });
    return Promise.race([regP, new Promise(function (ok) { setTimeout(function () { ok(null); }, 2500); })]);
  }
  function page() { return location.pathname.split("/").pop() || "index.html"; }
  function deliver(title, body, tag, pic, rec) {
    if (!can()) return Promise.resolve(false);
    var o = { body: body, tag: tag, renotify: true, requireInteraction: true, silent: false, icon: pic ? pic.icon : ICON, badge: ICON, data: { id: rec.id, url: rec.page + "#al-" + rec.id } };
    if (pic) o.image = pic.image;
    var plain = function () {
      try { var n = new Notification(title, o); n.onclick = function () { try { window.focus(); } catch (e) {} n.close(); open(rec.id); }; return true; } catch (e) { return false; }
    };
    return sw().then(function (reg) { return reg && reg.showNotification ? reg.showNotification(title, o).then(function () { return true; }, plain) : plain(); }, plain);
  }
  function send(a) {
    if (!a || (a.key && !once(a.key))) return null;
    var K = KIND[a.kind] || KIND.test, chip = a.chip || K[1], lines = (a.lines || []).filter(function (x) { return x; }), pic = a.chart ? draw(a.chart) : null;
    var rec = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: Date.now(), market: a.market || "", name: a.name || "", kind: K === KIND.test ? "test" : a.kind,
      chip: chip, title: a.title || "", lines: lines, page: a.page || page(), img: pic ? pic.thumb : null };
    if (!a.nolog) remember(rec);
    rec.shown = !a.quiet && can();
    if (rec.shown) deliver(rec.title, (EN ? "[" + chip + "] " : "【" + chip + "】") + lines.join("\n"), a.tag || rec.market + "-" + rec.kind, pic, rec);
    return rec;
  }
  function remember(rec) {
    var list = rd(LOG, []); if (!Array.isArray(list)) list = [];
    list.unshift(rec); list = list.slice(0, MAXLOG);
    list.forEach(function (r, i) { if (i >= PICS) r.img = null; });
    while (!wr(LOG, list) && list.some(function (r) { return r.img; })) { for (var i = list.length - 1; i >= 0; i--) if (list[i].img) { list[i].img = null; break; } }   // storage full: the oldest pictures go first
    redraw();
  }

  // ---------- the record ----------
  var views = [], hook = null, subs = [];
  function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); return e; }
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { var v = attrs[k]; if (v === null || v === undefined || v === false) return; if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); });
    (kids || []).forEach(function (c) { if (c !== null && c !== undefined && c !== false) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  var DTF = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  function when(ms) {
    var p = {}; DTF.formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; }); if (p.hour === "24") p.hour = "00";
    var t = p.hour + ":" + p.minute, q = {}; DTF.formatToParts(new Date()).forEach(function (x) { q[x.type] = x.value; });
    return p.month === q.month && p.day === q.day ? t : p.month + "/" + p.day + " " + t;
  }
  var PAGES = { xau: ["report.html", tr("黄金", "Gold")], btc: ["btc.html", tr("比特币", "Bitcoin")], fx: ["forex.html", tr("外汇", "Forex")] };
  function list(markets) { var l = rd(LOG, []); return (Array.isArray(l) ? l : []).filter(function (r) { return r && r.id && (!markets || markets.indexOf(r.market) >= 0); }); }
  // o.markets: whose alerts (default all); o.limit; o.others: link each one to its page (the home page);
  // o.empty: the words when there are none
  function paintLog(v) {
    var el = v.el, o = v.o, rows = list(o.markets), shown = rows.slice(0, o.limit || 20), openId = (location.hash.match(/^#al-([a-z0-9]+)$/) || [])[1] || v.openId;
    clear(el);
    var head = h("div", { class: "al-h" }, [h("b", { text: tr("提醒记录", "Alert record") }), h("span", { text: rows.length ? (EN ? rows.length + " on this device" : "这台设备 " + rows.length + " 条") : tr("这台设备", "this device") })]);
    if (rows.length && !o.noClear) {
      var cb = h("button", { type: "button", class: "al-clr", text: tr("清空", "Clear") });
      cb.addEventListener("click", function () {
        if (!cb.classList.contains("sure")) { cb.classList.add("sure"); cb.textContent = tr("再点一次清空", "Tap again to clear"); setTimeout(function () { cb.classList.remove("sure"); cb.textContent = tr("清空", "Clear"); }, 4000); return; }
        wr(LOG, list().filter(function (r) { return o.markets && o.markets.indexOf(r.market) < 0; })); redraw();
      });
      head.appendChild(cb);
    }
    el.appendChild(head);
    if (!shown.length) { el.appendChild(h("p", { class: "al-none", text: o.empty || tr("还没有提醒。提醒弹出时会同时记在这里，带上那一刻的图，错过了也能回来看。", "No alerts yet. Each one is also kept here with its chart at that moment, so a missed one can still be read.") })); return; }
    var ul = h("ul", { class: "al-list" });
    shown.forEach(function (r) {
      var K = KIND[r.kind] || KIND.test, pg = PAGES[r.market];
      var body = h("div", { class: "al-b" }, [h("p", { class: "al-chip", text: r.chip })].concat((r.lines || []).map(function (x) { return h("p", { text: x }); })));
      if (r.img) body.appendChild(h("img", { src: r.img, alt: r.title, loading: "lazy", width: "640", height: "320" }));
      if (o.others && pg) body.appendChild(h("a", { class: "al-go", href: pg[0] + "#al-" + r.id, text: (EN ? "Open the " + pg[1] + " page" : "打开" + pg[1] + "页") + " →" }));
      var d = h("details", { class: "al-it k-" + r.kind, id: "al-" + r.id }, [h("summary", null, [h("span", { class: "al-t", text: when(r.at) }), h("span", { class: "al-k", text: K[0] }), h("span", { class: "al-ti", text: r.title })]), body]);
      if (r.id === openId) d.open = true;
      ul.appendChild(h("li", null, [d]));
    });
    el.appendChild(ul);
    if (rows.length > shown.length) el.appendChild(h("p", { class: "al-none", text: EN ? "The newest " + shown.length + " shown; " + rows.length + " kept." : "显示最新 " + shown.length + " 条，共存 " + rows.length + " 条。" }));
  }
  function view(el, o) {
    if (!el) return; var v = { el: el, o: o || {} }; views.push(v); paintLog(v);
    var m = location.hash.match(/^#al-([a-z0-9]+)$/); if (m && document.getElementById("al-" + m[1])) setTimeout(function () { open(m[1]); }, 400);
  }
  function redraw() { views.forEach(function (v) { if (v.el.isConnected) paintLog(v); }); subs.forEach(function (fn) { try { fn(); } catch (e) {} }); }
  window.addEventListener("storage", function (e) { if (e.key === LOG) redraw(); });
  // a click on a notification: the page first opens what holds the record (onOpen), then the record shows that alert
  function open(id) {
    if (hook) try { hook(id); } catch (e) {}
    views.forEach(function (v) { v.openId = id; }); redraw();
    var el = document.getElementById("al-" + id); if (!el) return;
    el.open = true; el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", function (e) { var d = e.data || {}; if (d.type === "alert-open" && d.id) { try { window.focus(); } catch (x) {} open(d.id); } });
  // which pages are open and checking: the home page's status card reads it
  function watching(market, info) { var w = rd(WATCH, {}); if (!w || typeof w !== "object" || Array.isArray(w)) w = {}; w[market] = Object.assign({ at: Date.now(), page: page() }, info || {}); wr(WATCH, w); }
  if (can()) sw();                                                               // ready before the first alert

  // ---------- words the gold, Bitcoin and forex pages share (P: XauPlan; f: price to text) ----------
  function bias(p) { return p.bias === "bullish" ? tr("（偏多）", " (bullish)") : p.bias === "bearish" ? tr("（偏空）", " (bearish)") : tr("（没有方向）", " (no direction)"); }
  // The chart pattern an alert names, from the engine's answer E: the one on the alert's own timeframe first, then the
  // daily, 4-hour and 1-hour (the ones the pages show); one that has broken before one still forming. only: that
  // timeframe alone (for the picture). -> { tf, p, plan (XauPlan.patternPlan at price), way, dir } or null
  function pat(P, E, tf, only, price) {
    if (!E || !E.tfs) return null;
    var order = only ? [tf] : (["D", "4H", "1H"].indexOf(tf) >= 0 ? [tf] : []).concat(["D", "4H", "1H"]), out = null;
    order.some(function (t) {
      var T = E.tfs[t]; if (!T || T.error) return false;
      var ps = (T.patterns || []).filter(function (p) { return p.geo; }).sort(function (a, b) { return (P.patternWay(b) ? 1 : 0) - (P.patternWay(a) ? 1 : 0); });
      if (!ps.length) return false;
      var p = ps[0], pl = P.patternPlan(p, price), way = P.patternWay(p);
      out = { tf: t, p: p, plan: pl, way: way, dir: pl ? pl.dir : way || (p.bias === "bullish" ? 1 : p.bias === "bearish" ? -1 : 0) };
      return true;
    });
    return out;
  }
  function patName(P, q) { var n = P.patternText(q.p); return EN ? P.TF_ZH[q.tf] + " " + n.charAt(0).toLowerCase() + n.slice(1) + bias(q.p) : P.TF_ZH[q.tf] + n + bias(q.p); }
  // "形态（参考）：4 小时熊旗（偏空）· 收盘跌破 3,848.7 算突破 · 失效 3,880.2 · 目标 3,790.0"
  function patLine(P, q, f) {
    if (!q) return "";
    var pl = q.plan, bits = [];
    if (pl) bits.push(pl.done ? (EN ? "broke " + (pl.dir > 0 ? "up" : "down") : "已" + (pl.dir > 0 ? "向上" : "向下") + "突破") : (EN ? "breaks on a close " + (pl.dir > 0 ? "above " : "below ") + f(pl.trigger) : "收盘" + (pl.dir > 0 ? "站上 " : "跌破 ") + f(pl.trigger) + " 算突破"), tr("失效 ", "fails ") + f(pl.stop), tr("目标 ", "target ") + f(pl.target));
    else if (fin(q.p.upper) && fin(q.p.lower)) bits.push(tr("上沿 ", "upper edge ") + f(q.p.upper), tr("下沿 ", "lower edge ") + f(q.p.lower));
    else bits.push(P.statusText(q.p.status));
    return tr("形态（参考）：", "Chart pattern (reference): ") + patName(P, q) + " · " + bits.join(" · ");
  }
  // What the daily and 4-hour say together (the owner's "potential bullish or bearish based on 1D and 4H") and what the
  // weekly adds: the rule needs all three.
  function d4(dirs) {
    var d = dirs.D, k = dirs["4H"], w = dirs.W, way = function (v) { return v > 0 ? tr("向上", "up") : v < 0 ? tr("向下", "down") : tr("不明", "unclear"); };
    if (d && d === k) return EN ? "Daily and 4-hour both " + way(d) + ": leaning " + (d > 0 ? "bullish" : "bearish") + (w === d ? "; the weekly is " + way(w) + " too, so the three big trends agree and the rule waits for the 1-hour and 15-min." : "; the weekly is " + way(w) + ", and the rule needs it too.")
      : "日线和 4 小时都" + way(d) + "：" + (d > 0 ? "偏多" : "偏空") + (w === d ? "；周线也" + way(w) + "，三大周期一致，规则等 1 小时和 15 分钟。" : "；周线" + way(w) + "，规则还要等周线。");
    return EN ? "Daily " + way(d) + ", 4-hour " + way(k) + ": the two do not agree yet." : "日线" + way(d) + "、4 小时" + way(k) + "：两个还不同向。";
  }

  var st = document.createElement("style");
  st.textContent = ".al-log{margin-top:10px}.al-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;color:var(--dim)}.al-h b{color:var(--ink);font-size:13px}" +
    ".al-clr{margin-left:auto;border:1px solid var(--border);background:none;color:var(--dim);font:500 11.5px/1 inherit;padding:5px 9px;border-radius:999px;cursor:pointer}.al-clr.sure{border-color:rgba(219,41,67,.6);color:#fca5a5}" +
    ".al-none{margin:6px 0 0;font-size:12px;color:var(--dim);line-height:1.6}.al-list{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:6px}" +
    ".al-it{border:1px solid var(--border);border-radius:10px;background:rgba(255,255,255,.025);overflow:hidden}.al-it[open]{background:rgba(255,255,255,.04)}" +
    ".al-it>summary{display:flex;gap:8px;align-items:baseline;padding:8px 10px;cursor:pointer;list-style:none;font-size:12.5px;line-height:1.5}.al-it>summary::-webkit-details-marker{display:none}" +
    ".al-t{font:500 11.5px 'IBM Plex Mono',monospace;color:var(--dim);flex:none}.al-k{flex:none;font-size:11px;line-height:1.5;padding:0 7px;border-radius:999px;border:1px solid rgba(255,255,255,.18);color:var(--text)}" +
    ".k-signal .al-k{color:#6EE7B7;border-color:rgba(52,211,153,.5)}.k-soon .al-k,.k-pre .al-k{color:var(--gold-lt,#F0D27A);border-color:rgba(212,167,44,.55)}.k-turn .al-k,.k-answer .al-k{color:#93C5FD;border-color:rgba(147,197,253,.45)}" +
    ".k-pattern .al-k,.k-price .al-k{color:#C4B5FD;border-color:rgba(167,139,250,.5)}.al-ti{color:var(--ink);min-width:0}" +
    ".al-b{padding:0 10px 10px;font-size:12.5px;line-height:1.7;color:var(--text)}.al-b p{margin:0 0 3px}.al-b .al-chip{color:var(--dim);font-size:11.5px}" +
    ".al-b img{display:block;width:100%;max-width:640px;height:auto;border-radius:8px;margin-top:8px;border:1px solid var(--border)}.al-go{display:inline-block;margin-top:8px;color:var(--gold-lt,#F0D27A);font-size:12px}" +
    ".al-it.flash{animation:alflash 1.4s ease 2}@keyframes alflash{50%{box-shadow:0 0 0 2px rgba(212,167,44,.75)}}" +
    ".al-grp{margin-top:10px;display:grid;gap:8px}.al-g{border:1px solid var(--border);border-radius:10px;padding:9px 11px;background:rgba(255,255,255,.02)}" +
    ".al-gh{display:flex;flex-wrap:wrap;gap:4px 8px;align-items:baseline;margin-bottom:5px}.al-gh b{color:var(--ink);font-size:12.5px}.al-gh span{color:var(--dim);font-size:11.5px}" +
    ".al-o{display:flex;gap:8px;align-items:flex-start;font-size:12.5px;line-height:1.55;color:var(--text);cursor:pointer;padding:2px 0}.al-o input{margin-top:3px;flex:none;accent-color:#D4A72C}.al-o small{display:block;color:var(--dim);font-size:11.5px}" +
    ".al-wrap{margin-top:12px;padding:10px 14px;border:1px solid var(--border);border-radius:var(--r-md,14px);background:rgba(255,255,255,.02)}.al-wrap>summary{cursor:pointer;font-size:12.5px;color:var(--dim);line-height:1.6;list-style:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".al-wrap>summary::-webkit-details-marker{display:none}.al-wrap>summary b{color:var(--ink)}.al-wrap[open]>summary{white-space:normal}.al-pic{margin:8px 0 0;font-size:12px;color:var(--dim);line-height:1.6}" +
    "@media(max-width:640px){.al-it>summary{flex-wrap:wrap;row-gap:2px}.al-ti{flex-basis:100%}.al-o small,.al-none,.al-h span,.al-gh span{font-size:11.5px}}";
  document.head.appendChild(st);

  window.AlertKit = { send: send, draw: draw, once: once, recent: recent, mark: mark, can: can, sw: sw, view: view, open: open, list: list, watching: watching,
    watched: function () { var w = rd(WATCH, {}); return w && typeof w === "object" ? w : {}; }, onOpen: function (fn) { hook = fn; }, onChange: function (fn) { subs.push(fn); }, KIND: KIND,
    words: { bias: bias, pat: pat, patName: patName, patLine: patLine, d4: d4 } };
})();
