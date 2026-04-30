self.addEventListener('install', (event) => {
  console.log('Service Worker installing');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activating');
  event.waitUntil(self.clients.claim());
});

// Required for Chrome to consider the app installable (PWA criteria).
// Pass-through fetch handler — does NOT cache to avoid stale content issues.
self.addEventListener('fetch', () => {
  // Intentionally empty: lets the browser handle requests normally.
});

self.addEventListener('push', (event) => {
  console.log('Push received:', event);
  
  if (!event.data) {
    console.log('Push event has no data');
    return;
  }
  
  try {
    const data = event.data.json();
    console.log('Push data:', data);
    
    const options = {
      body: data.body || 'Nova notificação',
      icon: '/logo.png',
      badge: '/logo.png',
      data: { url: data.url || '/' },
      vibrate: [200, 100, 200],
      tag: data.tag || 'notification-' + Date.now(),
      renotify: true,
      requireInteraction: true,
      silent: false,
      actions: []
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'RIOS', options)
    );
  } catch (error) {
    console.error('Error processing push:', error);
    // Fallback notification
    event.waitUntil(
      self.registration.showNotification('RIOS', {
        body: 'Nova notificação',
        icon: '/logo.png',
      })
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);
  event.notification.close();
  
  const url = event.notification?.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Try to focus an existing window
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus().then(() => {
            if ('navigate' in client) {
              return client.navigate(url);
            }
          });
        }
      }
      // Open new window if no existing window found
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
