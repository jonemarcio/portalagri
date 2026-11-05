// Service worker: a tela de leitura abre sem internet, e a fila é enviada quando a conexão volta.
// Todos os caminhos são relativos ao local do sw.js, para funcionar em subpasta (GitHub Pages).
const CACHE = 'atto-amostras-v4';
const BASE = new URL('.', self.location.href).href;
const ARQUIVOS = [
  './', 'index.html', 'leitura/index.html',
  'js/api.js', 'js/fila.js', 'js/leitura.js', 'css/app.css', 'manifest.webmanifest',
];

importScripts(new URL('js/fila.js', BASE).href, new URL('js/api.js', BASE).href);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS.map(p => new URL(p, BASE).href))));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // A API (script.google.com) é outra origem: passa direto pela rede, sem cache.
  if (url.origin !== self.location.origin) return;

  // Navegação (inclui leitura/?id=...): rede primeiro, cópia local se faltar sinal
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match(new URL('leitura/index.html', BASE).href)));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});

// Envio em segundo plano: o navegador dispara quando a conexão volta (Android).
self.addEventListener('sync', (e) => {
  if (e.tag === 'enviar-fila') {
    e.waitUntil(sincronizar());
  }
});
