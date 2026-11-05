const CACHE_NAME = "tabletop-armies-shell-v5";
const OFFLINE_SHELL = "/offline-play.html";
const SHELL_ASSETS = [OFFLINE_SHELL, "/offline-play.js", "/offline-play.css"];
const WORLDS = ["sigmar", "crisis", "legion", "saga", "gotham"];

function cacheableStaticResponse(path, response) {
  if (!response.ok || response.type !== "basic" || response.redirected) return false;
  const contentType = (response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  if (path === OFFLINE_SHELL) return contentType === "text/html";
  if (path.endsWith(".css")) return contentType === "text/css";
  if (path.endsWith(".js")) return contentType === "text/javascript" || contentType === "application/javascript";
  if (/^\/theme\/backgrounds\/(sigmar|crisis|legion|saga|gotham)\/field-(1200|2400)\.webp$/.test(path)) return contentType === "image/webp";
  if (!path.startsWith("/_next/static/")) return false;
  return /^(application\/(javascript|ecmascript|json|wasm|octet-stream|font-woff)|text\/(javascript|ecmascript|css)|font\/|image\/)/.test(contentType);
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const path of SHELL_ASSETS) {
      const response = await fetch(path);
      if (!cacheableStaticResponse(path, response)) throw new Error(`Offline shell asset failed validation: ${path}`);
      await cache.put(path, response);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("tabletop-armies-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (data?.type === "clear-owner-cache" && typeof data.owner === "string") {
    // Private game data lives in owner-keyed IndexedDB; the worker stores only the generic offline shell/static assets.
    event.ports[0]?.postMessage({ ok: true });
  }
  if (data?.type === "cache-play-background" && WORLDS.includes(data.world)) {
    event.waitUntil(caches.open(CACHE_NAME).then(async (cache) => {
      for (const width of [1200, 2400]) {
        const path = `/theme/backgrounds/${data.world}/field-${width}.webp`;
        if (!await cache.match(path)) {
          try { const response = await fetch(path); if (cacheableStaticResponse(path, response)) await cache.put(path, response); } catch { /* keep offline play available without the plate */ }
        }
      }
    }));
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate" && url.pathname === "/play") {
    event.respondWith(fetch(request).catch(async () => (await caches.match(OFFLINE_SHELL)) || Response.error()));
    return;
  }

  // Cache only versioned build assets and public static files. Never cache navigations, RSC, Server Function results,
  // authentication responses or any page HTML.
  const isBuildAsset = url.pathname.startsWith("/_next/static/");
  const isPublicShellAsset = url.pathname === OFFLINE_SHELL || url.pathname === "/offline-play.js" || url.pathname === "/offline-play.css";
  const isFieldPlate = /^\/theme\/backgrounds\/(sigmar|crisis|legion|saga|gotham)\/field-(1200|2400)\.webp$/.test(url.pathname);
  if (!isBuildAsset && !isPublicShellAsset && !isFieldPlate) return;
  event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (cacheableStaticResponse(url.pathname, response)) await cache.put(request, response.clone());
    return response;
  }));
});
