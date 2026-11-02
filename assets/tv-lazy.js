// TradingView widgets are the heaviest thing on a page (up to about 300 KB and a live connection each). One written as
// <script type="application/json" data-tv-lazy="embed-widget-..."> starts only when it is about to be seen; its height is
// held meanwhile, so nothing below it jumps. Anything in a tab that is not open waits until that tab is.
(function () {
  "use strict";
  [].forEach.call(document.querySelectorAll("script[data-tv-lazy]"), function (cfg) {
    var host = cfg.parentNode, text = cfg.textContent, hgt = 0;
    try { hgt = parseInt(JSON.parse(text).height, 10) || 0; } catch (e) {}
    if (hgt) host.style.minHeight = hgt + "px";
    var go = function () { var sc = document.createElement("script"); sc.src = "https://s3.tradingview.com/external-embedding/" + cfg.getAttribute("data-tv-lazy") + ".js"; sc.async = true; sc.textContent = text; host.appendChild(sc); };
    if (!("IntersectionObserver" in window)) { go(); return; }
    var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); go(); } }, { rootMargin: "400px 0px" });
    io.observe(host);
  });
})();
