/**
 * push-sync.js
 * Đồng bộ cảnh báo giá lên Cloudflare Worker để nhận thông báo NGAY CẢ KHI
 * ĐÃ TẮT APP/ĐÓNG TRÌNH DUYỆT (Web Push thật qua VAPID) - khác với
 * notifications.js (NotificationsModule), module đó chỉ hoạt động khi app
 * còn đang chạy (kể cả chạy nền/tab khác), KHÔNG hoạt động khi app đã đóng
 * hẳn hoặc máy khoá lâu.
 *
 * CÁCH HOẠT ĐỘNG:
 *   1) ensureSubscription(): đăng ký Push Subscription qua PushManager của
 *      trình duyệt (dùng VAPID public key lấy từ Worker), rồi gửi lên Worker
 *      để lưu lại (worker/src/index.js: POST /api/subscribe).
 *   2) syncAlerts(): mỗi khi AlertsModule có thay đổi (thêm/xoá cảnh báo),
 *      gửi TOÀN BỘ danh sách cảnh báo hiện tại lên Worker (worker/src/
 *      index.js: POST /api/alerts). Worker sẽ tự kiểm tra giá mỗi phút bằng
 *      Cron Trigger và gửi push khi giá chạm mức - hoàn toàn không phụ
 *      thuộc vào việc máy bạn có đang mở app hay không.
 *
 * BẮT BUỘC: đổi WORKER_URL bên dưới thành địa chỉ Worker bạn đã deploy (xem
 * HUONG_DAN.md). Nếu để nguyên placeholder, module này sẽ không làm gì cả.
 */

const PushSync = (function () {
  const WORKER_URL = 'https://dq-tracker-push.quocngyendanght.workers.dev';
  const DEVICE_ID_KEY = 'dq_tracker_device_id_v1';

  function isConfigured() {
    return !!WORKER_URL && WORKER_URL.startsWith('https://');
  }

  function getDeviceId() {
    let id;
    try {
      id = localStorage.getItem(DEVICE_ID_KEY);
    } catch (err) {
      id = null;
    }
    if (!id) {
      id = uid('device');
      try {
        localStorage.setItem(DEVICE_ID_KEY, id);
      } catch (err) {
        // localStorage không khả dụng - vẫn dùng id tạm cho phiên này.
      }
    }
    return id;
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
  }

  async function ensureSubscription() {
    if (!isConfigured()) return null;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    if (!('Notification' in window) || Notification.permission !== 'granted') return null;

    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        const res = await fetch(`${WORKER_URL}/api/vapid-public-key`);
        if (!res.ok) throw new Error('Không lấy được VAPID public key từ Worker');
        const { publicKey } = await res.json();
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      await fetch(`${WORKER_URL}/api/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: getDeviceId(), subscription: sub.toJSON() }),
      });

      return sub;
    } catch (err) {
      console.error('Lỗi khi đăng ký Web Push:', err);
      return null;
    }
  }

  async function syncAlerts() {
    if (!isConfigured()) return;
    try {
      await ensureSubscription();

      const alerts = AlertsModule.getAllAlerts()
        .filter((a) => !a.triggered)
        .map((a) => ({ id: a.id, symbol: a.symbol, price: a.price }));

      await fetch(`${WORKER_URL}/api/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: getDeviceId(), alerts }),
      });
    } catch (err) {
      console.error('Lỗi khi đồng bộ cảnh báo lên Worker:', err);
    }
  }

  function init() {
    if (!isConfigured()) {
      console.warn(
        '[push-sync.js] Chưa cấu hình WORKER_URL - thông báo khi tắt app sẽ KHÔNG hoạt động. ' +
          'Xem HUONG_DAN.md để deploy Cloudflare Worker rồi cập nhật WORKER_URL trong file này.'
      );
      return;
    }

    // Đồng bộ lại mỗi khi danh sách cảnh báo đổi (thêm/xoá/kích hoạt).
    EventBus.on('alerts:changed', () => syncAlerts());

    // Nếu người dùng vừa cấp quyền thông báo (bấm nút ở banner), đăng ký +
    // đồng bộ ngay thay vì chờ lần đổi cảnh báo tiếp theo.
    document.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'notifAllowBtn') {
        setTimeout(syncAlerts, 500);
      }
    });

    // Đồng bộ 1 lần lúc khởi động, phòng trường hợp đã có quyền từ trước
    // (vd mở lại app sau khi đã cấp quyền ở lần dùng trước).
    setTimeout(syncAlerts, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { syncAlerts, ensureSubscription };
})();