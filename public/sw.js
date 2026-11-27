/* Service worker da Draw (10.6).
 * - Precache do app shell e da página offline.
 * - Estáticos (/_next/static, ícones, fontes): cache-first (imutáveis por hash).
 * - Navegação: network-first; sem rede, última versão em cache ou /offline.
 * - API (/api/*): SEMPRE rede, nunca cacheada (sem dados sensíveis em cache).
 * - Atualização: nova versão espera; o app mostra "Nova versão disponível" e manda SKIP_WAITING.
 * - Preparado para Web Push (VAPID) — ativação futura.
 */
const VERSION = "v1-2026-11-21";
const STATIC_CACHE = `draw-static-${VERSION}`;
const PAGES_CACHE = `draw-pages-${VERSION}`;
const PRECACHE = ["/offline", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {}));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("draw-") && ![STATIC_CACHE, PAGES_CACHE].includes(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // rede sempre

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || /\.(woff2?|png|svg|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok && !url.pathname.startsWith("/nf/") && !url.pathname.startsWith("/c/")) (await caches.open(PAGES_CACHE)).put(req, res.clone());
          return res;
        } catch {
          const cached = await caches.match(req);
          return cached || (await caches.match("/offline")) || Response.error();
        }
      })(),
    );
  }
});

/* Web Push — preparado, ativação futura (exige VAPID e, no iOS, 16.4+ com app instalado). */
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : { title: "Draw", body: "Você tem novidades." };
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url: data.url || "/caixa-de-entrada" } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.url || "/"));
});
