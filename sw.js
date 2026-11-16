/* Offline support for the calculators. Bump VERSION to force a refresh. */
var VERSION = 'ep-v2';
var CORE = ['./', 'assets/style.css', 'assets/calc.js', 'assets/app.js', 'assets/rates.json', 'en/', 'ar/'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (k) { return Promise.all(k.filter(function (n) { return n !== VERSION; }).map(function (n) { return caches.delete(n); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== self.location.origin) return;
  if (r.mode === 'navigate' || /rates\.json$/.test(r.url)) {
    e.respondWith(fetch(r).then(function (res) { var cp = res.clone(); caches.open(VERSION).then(function (c) { c.put(r, cp); }); return res; }).catch(function () { return caches.match(r).then(function (m) { return m || caches.match('./'); }); }));
    return;
  }
  e.respondWith(caches.match(r).then(function (m) { return m || fetch(r).then(function (res) { var cp = res.clone(); caches.open(VERSION).then(function (c) { c.put(r, cp); }); return res; }); }));
});
