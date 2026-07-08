/**
 * sw.js
 * Service Worker tối giản - chỉ phục vụ 2 việc:
 *  1) Cho phép hiển thị thông báo qua registration.showNotification() (cách
 *     này tương thích tốt hơn với iOS Safari PWA "Thêm vào màn hình chính"
 *     so với dùng thẳng `new Notification()`).
 *  2) Khi người dùng bấm vào thông báo -> focus lại tab app đang mở (nếu có)
 *     hoặc mở tab mới tới app.
 * Không cache gì cả (không phải mục tiêu offline-first ở đây).
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./index.html');
    })
  );
});