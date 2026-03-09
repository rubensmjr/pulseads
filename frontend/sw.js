self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const title = data.title || 'Nova venda! 🎉';
  const options = {
    body: data.body || 'Uma nova transação chegou',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    vibrate: [200, 100, 200],
    data: data,
    actions: [{ action: 'open', title: 'Ver dashboard' }]
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/dashboard-mobile.html'));
});
