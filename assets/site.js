/* Trading Hub: what every page shares (loaded with defer): the settings panel behind the gear in the navbar, the
   language setting, and the back-to-top button. Settings stay in this browser (localStorage "site.v1").
   Language: assets/i18n.js (in <head>) applies it; this file lets the visitor choose. The navbar follows the choice
   on every page; a page without an English version yet says so in one line under the navbar, with a way back to
   Chinese. Inside the gold page's frames (html.embedded) nothing is added. */
(function () {
  "use strict";
  var KEY = "site.v1", root = document.documentElement, S = {};
  try { S = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  var pick = S.lang === "en" ? "en" : "zh", hasEn = !!document.querySelector('meta[name="i18n"][content~="en"]');
  var LANGS = [{ id: "zh", name: "中文", note: "原文 · Original" }, { id: "en", name: "English", note: "英文" }];
  var NAV_EN = { "report.html": "Gold", "btc.html": "Bitcoin", "forex.html": "Forex", "journal.html": "P&L Journal", "strategy.html": "Strategy", "stocks.html": "Stocks", "potential.html": "High Potential" };
  var EN_DONE = "每一页都有英文版。每日分析的正文由每天的自动更新用中文写成，过期收起时也是中文。";
  var UI = {
    zh: { title: "设置", lang: "语言 · Language", note: EN_DONE, top: "回到顶部", gear: "设置", close: "关闭", bell: "提醒", on: " · 已开", fresh: " 条新", all: "🔔 提醒 · 这台设备", sub: "黄金 · 比特币 · 外汇", rec: "提醒记录", pages: "哪些页在提醒", none: "还没有提醒。打开黄金、比特币或外汇页，点导航栏的 🔔 开启提醒；每条提醒都会记在这里，带上那一刻的图。" },
    en: { title: "Settings", lang: "Language · 语言", note: "Every page is in English. The daily brief's written analysis is produced in Chinese by the daily update; while it is out of date it stays folded.", top: "Back to top", gear: "Settings", close: "Close", bell: "Alerts", on: " · on", fresh: " new", all: "🔔 Alerts · this device", sub: "Gold · Bitcoin · Forex", rec: "Record", pages: "Pages alerting", none: "No alerts yet. Open the gold, Bitcoin or forex page and turn its alerts on from the 🔔 in the navbar; each alert is kept here with its chart at that moment." }
  };
  var T = UI[pick], embedded = root.classList.contains("embedded"), NS = "http://www.w3.org/2000/svg";
  function icon(d) { var s = document.createElementNS(NS, "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); s.innerHTML = d; return s; }
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) { var v = attrs[k]; if (v === null || v === undefined || v === false) continue; if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); }
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function choose(id) { if (id === pick) { close(); return; } S.lang = id; save(); location.reload(); }

  // ---------- the navbar: names in the chosen language, the gear, and the "still in Chinese" line ----------
  var nav = document.querySelector(".navbar"), panel = null, gear = null;
  if (nav && !embedded) {
    if (pick === "en") {
      [].forEach.call(nav.querySelectorAll("a.nl"), function (a) {
        var nm = NAV_EN[a.getAttribute("href")]; if (!nm) return;
        var last = a.lastChild; if (last && last.nodeType === 3) last.textContent = nm; else a.appendChild(document.createTextNode(nm));
      });
      var small = nav.querySelector(".brand small"); if (small) small.textContent = "";
      if (!hasEn) nav.insertAdjacentElement("afterend", h("div", { class: "lang-note", role: "note" }, [
        h("span", { text: "This page is still in Chinese — English is on its way. " }),
        h("button", { type: "button", text: "切换到中文 · Switch to Chinese", onclick: function () { choose("zh"); } })]));
    }
    gear = h("button", { type: "button", class: "nav-gear", "aria-label": T.gear, "aria-haspopup": "dialog", "aria-expanded": "false", title: T.gear }, [
      icon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
      h("span", { class: "nav-lang", text: pick === "en" ? "EN" : "中" })]);
    gear.addEventListener("click", function (ev) { ev.stopPropagation(); if (panel) close(); else open(); });
    nav.appendChild(gear);
  }
  // ---------- 🔔 alerts: the same bell on every page ----------
  // Owner, 2026-11-18: "can make the alert related into one popup page? like one button for user to click and view so
  // that will not make the page so confuse", then "fir all not only gold". On the gold, Bitcoin and forex pages the bell
  // opens that page's alerts popup (settings, price alerts, record: window.AlertPopup, set by market-page.js and
  // fx-page.js); the home page's opens its record of every market; elsewhere it loads assets/alert-kit.js on the first
  // click and opens the record of every market with which pages are checking. A red number: alerts not yet seen (that
  // market's on a market page, all of them elsewhere); a green dot: that page's alerts are on.
  var bell = null, gpop = null, kit = null, MK = { "report.html": "xau", "btc.html": "btc", "forex.html": "fx" }[location.pathname.split("/").pop()] || null;
  function unseen() {
    try { var l = JSON.parse(localStorage.getItem("alerts.log")) || [], s = JSON.parse(localStorage.getItem("alerts.seen")) || {};
      return l.filter(function (r) { return r && (!MK || r.market === MK) && r.at > (s[r.market] || 0); }).length; } catch (e) { return 0; }
  }
  function paintBell() {
    if (!bell) return;
    var st = window.AlertPopup && AlertPopup.state ? AlertPopup.state() : null, n = st && typeof st.n === "number" ? st.n : unseen(), b = bell.lastChild;
    b.hidden = !n; b.textContent = n > 99 ? "99+" : String(n);
    bell.classList.toggle("mk", !!(st && typeof st.on === "boolean")); bell.classList.toggle("on", !!(st && st.on));
    bell.title = T.bell + (st && st.on ? T.on : "") + (n ? " · " + n + T.fresh : ""); bell.setAttribute("aria-label", bell.title);
  }
  function bellSetup() {
    bell = h("button", { type: "button", class: "nav-bell", "aria-haspopup": "dialog" }, [icon('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'), h("span", { class: "nav-bd" }), h("span", { class: "nav-bn", hidden: true })]);
    bell.addEventListener("click", function (ev) { ev.stopPropagation(); close(); openAlerts(); });
    nav.insertBefore(bell, gear);
    paintBell(); setInterval(paintBell, 30000);
    window.addEventListener("storage", function (e) { if (/^alerts\./.test(e.key || "")) paintBell(); });
    document.addEventListener("alerts:change", paintBell);
    if (/^#al-/.test(location.hash) && !MK && !window.AlertPopup) openAlerts();  // a notification opened on a page without its own popup
  }
  function openAlerts() {
    if (window.AlertPopup) { AlertPopup.open(); return; }
    (window.AlertKit ? Promise.resolve() : kit || (kit = new Promise(function (ok, no) { var sc = document.createElement("script"); sc.src = "assets/alert-kit.js?v=5"; sc.onload = ok; sc.onerror = no; document.head.appendChild(sc); }))).then(function () {
      if (!gpop) {
        var log = h("div", { class: "al-log" }), st = h("div", { class: "al-st" });
        gpop = AlertKit.popup({ id: "site-al-dlg", title: T.all, sub: T.sub, markets: ["xau", "btc", "fx"], tabs: [{ id: "log", label: T.rec, el: log }, { id: "pages", label: T.pages, el: st }] });
        AlertKit.view(log, { limit: 30, others: true, noClear: true, empty: T.none });
        AlertKit.onChange(paintBell); gpop.st = st;
      }
      AlertKit.status(gpop.st); gpop.open(unseen() ? "log" : null);
    }).catch(function () { location.href = "index.html#hub-al"; });
  }
  if (nav && !embedded) bellSetup();                                             // after the variables above are set
  function open() {
    if (panel) return;
    var list = h("div", { class: "set-langs", role: "radiogroup", "aria-label": T.lang });
    LANGS.forEach(function (l) {
      list.appendChild(h("button", { type: "button", role: "radio", "aria-checked": String(l.id === pick), class: "set-lang", onclick: function () { choose(l.id); } }, [
        h("span", { class: "dot" }), h("b", { text: l.name }), h("small", { text: l.note })]));
    });
    panel = h("div", { class: "set-panel", role: "dialog", "aria-label": T.title }, [
      h("div", { class: "set-h" }, [h("b", { text: T.title }), h("button", { type: "button", class: "set-x", "aria-label": T.close, text: "×", onclick: close })]),
      h("div", { class: "set-k", text: T.lang }), list, h("p", { class: "set-note", text: T.note })]);
    document.body.appendChild(panel);
    panel.style.top = Math.round(gear.getBoundingClientRect().bottom + 8) + "px";
    gear.setAttribute("aria-expanded", "true");
    var cur = panel.querySelector('[aria-checked="true"]'); if (cur) cur.focus();
  }
  function close() { if (!panel) return; panel.remove(); panel = null; if (gear) { gear.setAttribute("aria-expanded", "false"); gear.focus(); } }
  document.addEventListener("click", function (ev) { if (panel && !panel.contains(ev.target)) close(); });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") close(); });

  // ---------- back to top, on long pages ----------
  if (!embedded) {
    var top = h("button", { type: "button", class: "to-top", "aria-label": T.top, title: T.top, onclick: function () { window.scrollTo({ top: 0, behavior: "smooth" }); } }, [icon('<path d="M12 19V5M5 12l7-7 7 7"/>')]);
    document.body.appendChild(top);
    var raf = 0, check = function () { raf = 0; top.classList.toggle("on", window.scrollY > window.innerHeight * 1.5); };
    window.addEventListener("scroll", function () { if (!raf) raf = requestAnimationFrame(check); }, { passive: true });
  }
  // ---------- gold's answer in the navbar, on the pages that do not already show it (wide screens only, see site.css) ----------
  // From data/xau-state.json: the price of the last 15-minute close, the rule's answer and how old it is. The home page,
  // the gold page and the briefs carry the answer themselves.
  var here = location.pathname.split("/").pop() || "index.html";
  if (nav && !embedded && !/^(index|report|daily|news|risk)\.html$/.test(here) && window.fetch) {
    fetch("data/xau-state.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (st) {
      if (!st || !st.verdict || typeof st.price !== "number") return;
      var en = pick === "en", v = st.verdict, tfs = (st.timeframes || []).slice(0, 3).map(function (t) { return t.trend; });
      var dir = v.level === "go" ? (st.plan && st.plan.side === "做多" ? 1 : -1) : tfs.length === 3 && tfs.every(function (w) { return w === "向上"; }) ? 1 : tfs.length === 3 && tfs.every(function (w) { return w === "向下"; }) ? -1 : 0;
      var word = v.level === "go" ? (dir > 0 ? (en ? "Buy signal" : "可做多") : (en ? "Sell signal" : "可做空")) : v.level === "ready" && dir ? (en ? "waiting" : "等小周期") : (en ? "Wait" : "观望");
      var closed = /休市/.test(v.tag || ""), at = Date.parse(String(st.updated || "").replace(" SGT", ":00+08:00").replace(" ", "T")), ageH = isFinite(at) ? Math.round((Date.now() - at) / 3600000) : 0;
      var tail = closed ? (en ? " · closed" : " · 休市") : ageH >= 3 ? (en ? " · " + ageH + "h ago" : " · " + ageH + " 小时前") : "";
      var pill = h("a", { class: "nav-pill " + (v.level === "go" ? "go" : v.level === "ready" ? "ready" : "none"), href: "report.html",
        title: (en ? "Gold: the rule's answer from the data of " : "黄金：规则的结论，数据 ") + (st.updated || "") + (en ? ". Open the gold page for the live answer and plan." : "。打开黄金页看实时结论和计划。") }, [
        h("span", { class: "k", text: "XAU" }), h("b", { text: st.price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }),
        h("span", { class: "s" + (dir > 0 ? " up" : dir < 0 ? " dn" : ""), text: (dir > 0 ? "▲ " : dir < 0 ? "▼ " : "") + word + tail })]);
      var brand = nav.querySelector(".brand"); if (brand) { brand.insertAdjacentElement("afterend", pill); nav.classList.add("has-pill"); }
    }).catch(function () {});
  }
  window.SiteSettings = { lang: pick, choose: choose };
})();
