// Cross-origin isolation for static hosts that cannot set headers (GitHub Pages): this service worker adds
// COOP/COEP to every same-origin response, so the page gets SharedArrayBuffer and onnxruntime-web can use several
// threads (measured on a 6-core laptop: about 0.7 s per photo instead of 2.1 s, same labels at every point).
// Same idea as the MIT "coi-serviceworker" by Guido Zuidhof, written here in a few lines.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.cache === "only-if-cached" && request.mode !== "same-origin") return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request).then((response) => {
      if (response.status === 0) return response;
      const headers = new Headers(response.headers);
      headers.set("Cross-Origin-Embedder-Policy", "require-corp");
      headers.set("Cross-Origin-Opener-Policy", "same-origin");
      headers.set("Cross-Origin-Resource-Policy", "same-origin");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    })
  );
});
