
const CACHE_NAME = 'studyhub-cache-v1';

// Public app pages and essential PWA files
const APP_SHELL = [
    './',
    './index.html',
    './manifest.json',
    './login.html',
    './register.html',
    './dashboard.html',
    './library.html',
    './timetable.html',
    './timer.html',
    './goals.html',
    './reminder.html',
    './progress.html',
    './search.html',
    './account-setting.html',
    './admin.html',
    './forgot-password.html',
    './reset-password.html',
    './verify-otp.html',
    './force-change-password.html',
    './assets/icons/icon-192.png',
    './assets/icons/icon-512.png'
];

// INSTALL: Save essential app files
self.addEventListener('install', event => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);

            // Cache files individually so one missing file
            // does not prevent the service worker from installing.
            await Promise.allSettled(
                APP_SHELL.map(file => cache.add(file))
            );

            await self.skipWaiting();
        })()
    );
});

// ACTIVATE: Remove old caches and take control
self.addEventListener('activate', event => {
    event.waitUntil(
        (async () => {
            const cacheNames = await caches.keys();

            await Promise.all(
                cacheNames
                    .filter(name =>
                        name.startsWith('studyhub-cache-') &&
                        name !== CACHE_NAME
                    )
                    .map(name => caches.delete(name))
            );

            await self.clients.claim();
        })()
    );
});

// FETCH: Handle offline pages and static resources
self.addEventListener('fetch', event => {
    const request = event.request;

    // Only handle GET requests
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Never cache external websites or Supabase requests
    if (url.origin !== self.location.origin) return;

    // Never cache backend API requests
    if (url.pathname.includes('/api/')) return;

    // Do not cache requests carrying authorization headers
    if (request.headers.has('Authorization')) return;

    // HTML navigation: network first, then cached page
    if (request.mode === 'navigate') {
        event.respondWith(
            (async () => {
                try {
                    const response = await fetch(request);

                    if (
                        response.ok &&
                        response.headers.get('content-type')?.includes('text/html') &&
                        response.headers.get('cache-control') !== 'no-store'
                    ) {
                        const cache = await caches.open(CACHE_NAME);
                        await cache.put(request, response.clone());
                    }

                    return response;
                } catch (error) {
                    const cachedPage = await caches.match(request, {
                        ignoreSearch: true
                    });

                    if (cachedPage) return cachedPage;

                    const homePage = await caches.match('./index.html');

                    if (homePage) return homePage;

                    return new Response(
                        '<h2>StudyHub is offline</h2><p>Please reconnect to the internet and try again.</p>',
                        {
                            headers: {
                                'Content-Type': 'text/html; charset=utf-8'
                            }
                        }
                    );
                }
            })()
        );

        return;
    }

    // Static files: cache first, then network
    event.respondWith(
        (async () => {
            const cachedResponse = await caches.match(request);

            if (cachedResponse) return cachedResponse;

            try {
                const response = await fetch(request);

                const isStaticResource =
                    /\.(css|js|png|jpg|jpeg|svg|webp|ico|woff2?)$/i
                        .test(url.pathname);

                if (
                    response.ok &&
                    isStaticResource &&
                    response.type === 'basic' &&
                    response.headers.get('cache-control') !== 'no-store'
                ) {
                    const cache = await caches.open(CACHE_NAME);
                    await cache.put(request, response.clone());
                }

                return response;
            } catch (error) {
                return new Response('Resource unavailable offline.', {
                    status: 503,
                    headers: {
                        'Content-Type': 'text/plain'
                    }
                });
            }
        })()
    );
});

// PUSH: Receive StudyHub reminders
self.addEventListener('push', event => {
    let data = {};

    if (event.data) {
        try {
            data = event.data.json();
        } catch (error) {
            data = {
                title: 'StudyHub Reminder',
                body: event.data.text()
            };
        }
    }

    const title = data.title || 'StudyHub Reminder';

    const options = {
        body: data.body || 'You have a new reminder.',
        tag: `reminder-${data.reminderId || Date.now()}`,
        requireInteraction: true,
        data: {
            url: data.url || './reminder.html'
        }
    };

    event.waitUntil(
        Promise.all([
            self.registration.showNotification(title, options),

            self.clients.matchAll({
                type: 'window',
                includeUncontrolled: true
            }).then(clients => {
                clients.forEach(client => {
                    client.postMessage({
                        type: 'STUDYHUB_REMINDER',
                        title,
                        body: options.body
                    });
                });
            })
        ])
    );
});

// NOTIFICATION CLICK: Open the reminder page
self.addEventListener('notificationclick', event => {
    event.notification.close();

    const targetUrl = new URL(
        event.notification.data.url || './reminder.html',
        self.registration.scope
    ).href;

    event.waitUntil(
        self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then(async clientList => {
            for (const client of clientList) {
                if (client.url.startsWith(self.registration.scope)) {
                    await client.focus();
                    return client.navigate(targetUrl);
                }
            }

            return self.clients.openWindow(targetUrl);
        })
    );
});
