self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = typeof data.title === 'string' ? data.title : 'Pronark update';
  const body = typeof data.body === 'string' ? data.body : 'Open Pronark for your latest progress.';
  const url = self.registration.scope;
  event.waitUntil(self.registration.showNotification(title, { body, data: { url }, icon: new URL('icon.svg', self.registration.scope).href }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || self.registration.scope, self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const match = list.find(client => client.url === url);
    return match ? match.focus() : clients.openWindow(url);
  }));
});
