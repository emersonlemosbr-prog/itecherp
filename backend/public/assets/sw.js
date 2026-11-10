// Não armazena páginas nem dados pessoais em cache.
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { /* Exibir fallback mesmo para payload inválido. */ }
  event.waitUntil(self.registration.showNotification(payload.title || 'Atualização da OS', {
    body: payload.body || 'Abra o acompanhamento para consultar sua OS.',
    icon: payload.icon || '/assets/logo.png', tag: payload.tag,
    data: { url: payload.url || '/' },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL(event.notification.data?.url || '/', self.location.origin);
    if (url.origin !== self.location.origin) return;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).pathname === url.pathname) {
        await client.focus();
        return;
      }
    }
    await self.clients.openWindow(url.href);
  })());
});
