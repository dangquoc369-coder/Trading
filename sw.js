/**
 * sw.js
 * Service Worker - phục vụ 3 việc:
 *  1) Cho phép hiển thị thông báo qua registration.showNotification() khi
 *     app CÒN ĐANG CHẠY (gọi từ notifications.js) - tương thích tốt hơn với
 *     iOS Safari PWA so với dùng thẳng `new Notification()`.
 *  2) (MỚI) Lắng nghe sự kiện 'push' - đây là thông báo THẬT gửi từ server
 *     (Cloudflare Worker, xem worker/src/index.js) qua Web Push Protocol.
 *     Khác với (1), sự kiện này được HỆ ĐIỀU HÀNH đánh thức Service Worker
 *     để xử lý NGAY CẢ KHI app/tab đã đóng hẳn - đây là cơ chế duy nhất cho
 *     phép nhận thông báo khi đã tắt app.
 *  3) Khi người dùng bấm vào thông báo -> focus lại tab app đang mở (nếu có)
 *     hoặc mở tab mới tới app.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Nhận push từ Cloudflare Worker. Dữ liệu gửi lên có dạng JSON:
 *   { title: '...', body: '...' }
 * (xem hàm sendPush() trong worker/src/index.js).
 */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = { title: 'DQ Tracker', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'DQ Tracker';
  const options = {
    body: data.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: 'dq-tracker-push-' + Date.now(),
    data,
  };

  event.waitUntil(self.registration.showNotification(title, options));
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