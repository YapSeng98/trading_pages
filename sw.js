// The site's service worker, for notifications only (assets/alert-kit.js). Phones show a page's notifications only
// through a service worker, and a click on one should bring the page that sent it forward and open that alert in its
// record. There is no fetch handler: nothing is cached and every request goes to the network exactly as before.
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var d = e.notification.data || {}, url = new URL(d.url || "./", self.registration.scope).href, base = url.split("#")[0];
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.split("#")[0].split("?")[0] !== base.split("?")[0]) continue;
      list[i].postMessage({ type: "alert-open", id: d.id });
      return list[i].focus();
    }
    return self.clients.openWindow(url);
  }));
});
