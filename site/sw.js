/* Service worker: app shell precached, pages cached as you read (stale-while-revalidate), offline fallback. */
const V = '__VERSION__';
const SHELL = 'pmkg-shell-' + V, PAGES = 'pmkg-pages';
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    try { const list = await (await fetch('/precache.json', { cache: 'no-store' })).json(); await c.addAll(list); } catch (err) {}
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('pmkg-shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/original/') || url.pathname === '/version.json') return; // always network
  e.respondWith((async () => {
    const shell = await caches.open(SHELL), pages = await caches.open(PAGES);
    const net = fetch(req).then(res => { if (res.ok && (req.mode === 'navigate' || /\/(pagefind|data|assets)\//.test(url.pathname))) pages.put(req, res.clone()); return res; }).catch(() => null);
    // pages and data: network first so a new deploy shows at once; cache only when offline
    if (req.mode === 'navigate' || url.pathname.startsWith('/data/')) { const res = await net; if (res) return res; const c = await pages.match(req, { ignoreSearch: true }); if (c) return c; }
    else { const hit = (await shell.match(req)) || (await pages.match(req)); if (hit) { e.waitUntil(net); return hit; } }
    const res = await net; if (res) return res;
    if (req.mode === 'navigate') return new Response('<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body style="font:16px system-ui;padding:40px;max-width:600px;margin:auto"><h1>You are offline</h1><p>This page has not been saved on this device yet. Pages you have opened before, and modules or sessions you saved for offline, still work.</p><p><a href="/">Go to the home page</a></p>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
    return new Response('', { status: 504 });
  })());
});
