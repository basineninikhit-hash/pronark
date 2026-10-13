self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = typeof data.title === 'string' ? data.title : 'Pronark update';
  const body = typeof data.body === 'string' ? data.body : 'Open Pronark for your latest progress.';
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/';
  event.waitUntil(self.registration.showNotification(title, { body, data: { url }, icon: '/icon.svg' }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const match = list.find(client => client.url === url);
    return match ? match.focus() : clients.openWindow(url);
  }));
});
