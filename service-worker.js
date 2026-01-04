// Import version from shared file
importScripts('/version.js');

const CACHE_NAME = `dih-${APP_VERSION.replace(/\./g, '-')}`;
const OFFLINE_CACHE_NAME = `dih-offline-${APP_VERSION.replace(/\./g, '-')}`;

// Assets to cache on install
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/privacy.html',
    '/terms.html',
    '/support.html',
    '/manifest.json',
    '/version.js',
    '/assets/css/styles.css',
    '/assets/js/app.js',
    '/assets/js/spa.js',
    '/assets/js/db.js',
    '/assets/js/operations.js',
    '/assets/js/sync.js',
    '/assets/js/cloud-providers.js',
    '/assets/js/stock-data.js',
    '/assets/js/stock-import.js',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css',
    'https://cdn.jsdelivr.net/npm/alpinejs@3.13.3/dist/cdn.min.js',
    'https://cdn.jsdelivr.net/npm/dexie@3.2.4/dist/dexie.min.js'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
            .catch((error) => {
                console.error('[SW] Cache failed:', error);
            })
    );
});

// Listen for messages from the app
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        console.log('[SW] Received SKIP_WAITING message');
        self.skipWaiting();
    }
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME && name !== OFFLINE_CACHE_NAME)
                        .map((name) => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => self.clients.claim())
    );
});

// Fetch event - network first, then cache
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip cross-origin requests
    if (url.origin !== location.origin) {
        // But still cache CDN resources
        if (url.hostname.includes('cdn.jsdelivr.net') || url.hostname.includes('bootstrap')) {
            event.respondWith(
                caches.match(request)
                    .then((cached) => {
                        if (cached) {
                            return cached;
                        }
                        return fetch(request).then((response) => {
                            return caches.open(CACHE_NAME).then((cache) => {
                                cache.put(request, response.clone());
                                return response;
                            });
                        });
                    })
            );
        }
        return;
    }
    
    // API requests - network only (no cache)
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
        event.respondWith(
            fetch(request)
                .catch(() => {
                    return new Response(
                        JSON.stringify({ error: 'Network error. Please check your connection.' }),
                        {
                            status: 503,
                            headers: { 'Content-Type': 'application/json' }
                        }
                    );
                })
        );
        return;
    }
    
    // HTML pages and static assets - cache first, then network
    event.respondWith(
        caches.match(request)
            .then((cached) => {
                if (cached) {
                    // Return cached version and update cache in background
                    const fetchPromise = fetch(request)
                        .then((response) => {
                            return caches.open(CACHE_NAME).then((cache) => {
                                cache.put(request, response.clone());
                                return response;
                            });
                        })
                        .catch(() => cached);
                    
                    return cached;
                }
                
                // Not in cache, fetch from network
                return fetch(request)
                    .then((response) => {
                        // Cache successful responses
                        if (response.status === 200) {
                            const responseClone = response.clone();
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(request, responseClone);
                            });
                        }
                        return response;
                    })
                    .catch((error) => {
                        console.error('[SW] Fetch failed:', error);
                        
                        // Return offline page for HTML requests
                        if (request.headers.get('accept').includes('text/html')) {
                            return caches.match('/login.html');
                        }
                        
                        throw error;
                    });
            })
    );
});

// Background sync for offline notes (optional)
self.addEventListener('sync', (event) => {
    console.log('[SW] Background sync:', event.tag);
    
    if (event.tag === 'sync-notes') {
        event.waitUntil(syncNotes());
    }
});

// Push notifications (optional)
self.addEventListener('push', (event) => {
    console.log('[SW] Push notification received');
    
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'TickerNotes';
    const options = {
        body: data.body || 'You have a new notification',
        icon: '/assets/images/icon-192x192.png',
        badge: '/assets/images/icon-72x72.png',
        data: data.url
    };
    
    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked');
    
    event.notification.close();
    
    const urlToOpen = event.notification.data || '/';
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // Check if window is already open
                for (let client of clientList) {
                    if (client.url === urlToOpen && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Open new window
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});

// Helper function to sync notes (example)
async function syncNotes() {
    // This would sync any offline notes to the server
    console.log('[SW] Syncing notes...');
    // Implementation depends on your offline storage strategy
}
