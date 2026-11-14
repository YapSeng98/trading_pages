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
  var EN_DONE = "首页和这个设置已经有英文；盈亏日历、黄金、比特币、外汇、策略、股票和每日分析还是中文，会陆续加上。";
  var UI = {
    zh: { title: "设置", lang: "语言 · Language", note: EN_DONE, top: "回到顶部", gear: "设置", close: "关闭" },
    en: { title: "Settings", lang: "Language · 语言", note: "In English so far: the home page and these settings. The P&L Journal, gold, Bitcoin, forex, strategy, stocks and the daily briefs are still in Chinese; they will follow, the journal first.", top: "Back to top", gear: "Settings", close: "Close" }
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
  window.SiteSettings = { lang: pick, choose: choose };
})();
