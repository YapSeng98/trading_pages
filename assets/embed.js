// daily.html, news.html and risk.html are also shown inside the gold page (report.html, "分析 · 消息 · 日历").
// Opened there, a page drops the site furniture the gold page already has (navbar, live bar, section links), opens
// its links in the whole window, and tells the gold page how tall it is so the frame fits without its own scrollbar.
// Opened on its own, nothing changes. Load it in <head>, before the page renders.
(function () {
  "use strict";
  var inFrame = false; try { inFrame = window.self !== window.top && window.parent.location.origin === location.origin; } catch (e) { inFrame = false; }
  if (!inFrame) return;
  var root = document.documentElement; root.classList.add("embedded");
  var st = document.createElement("style");
  st.textContent = ".embedded .navbar,.embedded .topstrip,.embedded #gold-bar,.embedded .secnav,.embedded .mesh{display:none!important}" +
    ".embedded body::before{display:none}.embedded,.embedded body{background:transparent!important}";
  document.head.appendChild(st);
  var base = document.createElement("base"); base.target = "_top"; document.head.appendChild(base);
  var last = 0;
  function send() {
    var hgt = Math.ceil(Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0));
    if (Math.abs(hgt - last) < 2) return; last = hgt;
    try { window.parent.postMessage({ embedH: hgt, page: location.pathname.split("/").pop() }, location.origin); } catch (e) {}
  }
  document.addEventListener("DOMContentLoaded", function () {
    send();
    if ("ResizeObserver" in window) new ResizeObserver(send).observe(document.body);
    else setInterval(send, 1500);
  });
  window.addEventListener("load", send);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(send);
})();
