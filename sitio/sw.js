/* Service worker: páginas y datos primero de internet (con copia para usar sin conexión);
   three.js, estilos y scripts desde la copia guardada, actualizándose por detrás. */
const CACHE = "llave-v1";
const BASE = ["./", "index.html", "offline.html", "css/estilos.css", "favicon.svg"];
self.addEventListener("install", e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).catch(() => {})); });
self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const esDato = e.request.mode === "navigate" || url.pathname.endsWith(".json") || url.pathname.endsWith(".html");
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (esDato){
      try { const r = await fetch(e.request, { cache: "no-cache" }); if (r.ok) cache.put(e.request, r.clone()); return r; }
      catch { return (await cache.match(e.request)) || (e.request.mode === "navigate" ? cache.match("offline.html") : Response.error()); }
    }
    const guardada = await cache.match(e.request);
    const red = fetch(e.request).then(r => { if (r.ok) cache.put(e.request, r.clone()); return r; }).catch(() => guardada);
    return guardada || red;
  })());
});
