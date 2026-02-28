const CACHE_NAME = 'handpan-cache-v3';

// We don't need to specify all files, we can just cache requests dynamically as they come
// using a Stale-While-Revalidate strategy.

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Only handle GET requests for http/https
    if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
        return;
    }

    event.respondWith(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.match(event.request).then((cachedResponse) => {
                const fetchPromise = fetch(event.request).then((networkResponse) => {
                    // Cache the new network response for future use
                    if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                        cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                }).catch(() => {
                    // Fetch failed, maybe offline. Return original cached response if exists.
                    // (Already handled below)
                });

                // Return cached response immediately, while refreshing from network in the background (Stale-While-Revalidate)
                // If there is no cached response, wait for the network fetch
                return cachedResponse || fetchPromise;
            });
        })
    );
});

// Listen for messages from the clients to skip waiting (force update)
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
