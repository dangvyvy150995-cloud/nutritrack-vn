// Imported into the generated service worker (see vite.config.ts → workbox.importScripts).
// Tapping a reminder notification focuses an open NutriTrack VN window, or opens one, at the alert's page.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).origin === self.location.origin) {
        await c.focus();
        if ('navigate' in c) { try { await c.navigate(url); } catch (e) { /* cross-origin or not controlled */ } }
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
