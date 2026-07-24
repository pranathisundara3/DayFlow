import {precacheAndRoute} from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title || 'DayFlow';
  const options = {
    body: data.body || 'You have a new notification.',
    // You can add icons and badges here once you have the assets
    // icon: '/icons/icon-192x192.png',
    // badge: '/icons/badge-72x72.png',
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // This opens the notifications page, you can change it to any other page
  event.waitUntil(
    self.clients.openWindow('/notifications')
  );
});
