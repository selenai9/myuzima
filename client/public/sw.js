import { precacheAndRoute } from 'workbox-precaching';

// The plugin looks for this EXACT string to inject your assets:
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));
