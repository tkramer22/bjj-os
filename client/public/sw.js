// BJJ OS Service Worker - Push Notifications ONLY (NO CACHING)
// CRITICAL: All caching is disabled to ensure users always see latest version

// Install event - skip caching entirely
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing (NO CACHE MODE)...');
  self.skipWaiting();
});

// Activate event - delete ALL caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating (clearing all caches)...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          console.log('[Service Worker] Deleting cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - ALWAYS use network, NEVER cache
self.addEventListener('fetch', (event) => {
  // Only handle same-origin requests
  if (event.request.url.startsWith(self.location.origin)) {
    event.respondWith(
      // Clone the original request to preserve headers and body
      fetch(new Request(event.request, {
        cache: 'no-store',
      }))
    );
  }
});

// Push notification event
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push received:', event);
  
  let notificationData = {
    title: '🥋 BJJ OS',
    body: 'New technique available!',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: {
      url: '/'
    }
  };

  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = {
        title: data.title || notificationData.title,
        body: data.body || notificationData.body,
        icon: data.icon || notificationData.icon,
        badge: data.badge || notificationData.badge,
        data: data.data || notificationData.data
      };
    } catch (e) {
      console.error('[Service Worker] Error parsing push data:', e);
      notificationData.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      data: notificationData.data,
      vibrate: [200, 100, 200],
      tag: 'bjj-os-notification',
      requireInteraction: false
    })
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification clicked:', event);
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Check if there's already a window open
        for (let client of windowClients) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        // If no window is open, open a new one
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Background sync event (for future offline support)
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Background sync:', event.tag);
  if (event.tag === 'sync-messages') {
    event.waitUntil(
      // Sync offline messages when back online
      fetch('/api/sync')
        .then(response => response.json())
        .then(data => console.log('[Service Worker] Sync complete:', data))
        .catch(err => console.error('[Service Worker] Sync failed:', err))
    );
  }
});
