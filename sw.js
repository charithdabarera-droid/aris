// Network-first SW that also adds COOP/COEP headers (enables cross-origin isolation -> multithreaded WASM for the AI voice).
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{const r=e.request;if(r.cache==='only-if-cached'&&r.mode!=='same-origin')return;
  if(new URL(r.url).origin!==location.origin)return;
  e.respondWith(fetch(r).then(res=>{if(res.status===0)return res;const h=new Headers(res.headers);h.set('Cross-Origin-Embedder-Policy','credentialless');h.set('Cross-Origin-Opener-Policy','same-origin');
    return new Response(res.body,{status:res.status,statusText:res.statusText,headers:h})}).catch(()=>caches.match(r)))});
