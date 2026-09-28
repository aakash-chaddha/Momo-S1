// Cross-origin isolation for hosts that cannot set response headers.
//
// The wasm engine is a pthread build: it needs SharedArrayBuffer, which the browser only exposes
// once the document is cross-origin isolated (Cross-Origin-Opener-Policy + Cross-Origin-Embedder-
// Policy). `npm run preview` and Netlify/Vercel/Cloudflare Pages set those headers themselves and
// this file is never registered there. GitHub Pages sends neither header and offers no way to add
// one, so there this worker adds them to the responses it controls, and the page reloads once to
// pick them up. Without it the engine still runs, but single threaded.
//
// Only same-origin responses are rewritten. Cross-origin requests pass through untouched: the
// model download from huggingface.co must keep the exact response it asked for.

const COOP = 'Cross-Origin-Opener-Policy';
const COEP = 'Cross-Origin-Embedder-Policy';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const request = event.request;
  // an only-if-cached request that is not same-origin is one the browser refuses to let us fetch
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

  event.respondWith(
    fetch(request).then((response) => {
      // status 0 is an opaque response: it has no headers we are allowed to read or rewrite
      if (response.status === 0 || response.type === 'opaque') return response;
      if (new URL(request.url).origin !== self.location.origin) return response;
      // 204/205/304 carry no body, and constructing one for them throws
      if (response.status === 204 || response.status === 205 || response.status === 304) return response;

      const headers = new Headers(response.headers);
      headers.set(COOP, 'same-origin');
      headers.set(COEP, 'require-corp');

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    })
  );
});
