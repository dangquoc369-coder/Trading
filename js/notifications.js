/**
 * notifications.js
 * Xin quyền thông báo (giống hệt app cài từ App Store/Play Store hỏi lần
 * đầu) + gửi thông báo cục bộ (local notification).
 *
 * Ưu tiên dùng ServiceWorkerRegistration.showNotification() vì tương thích
 * tốt với iOS Safari khi app đã được "Thêm vào màn hình chính" (standalone
 * PWA) - `new Notification()` trực tiếp có thể không hoạt động ổn định
 * trong môi trường đó. Nếu không có service worker (vd đang mở bằng trình
 * duyệt thường, chưa cài), fallback về Notification API thường.
 *
 * LƯU Ý QUAN TRỌNG (để không gây hiểu lầm với người dùng): đây là thông báo
 * CỤC BỘ - chỉ hoạt động khi app còn đang chạy (kể cả chạy nền/tab khác).
 * Muốn nhận thông báo khi đã tắt hẳn app/khoá máy lâu, cần Web Push THẬT với
 * server đẩy tin (VAPID) - không nằm trong phạm vi module này.
 */

const NotificationsModule = (function () {
  let bannerEl = null;
  let swRegistration = null;

  function isSupported() {
    return 'Notification' in window;
  }

  function getPermission() {
    return isSupported() ? Notification.permission : 'unsupported';
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      swRegistration = await navigator.serviceWorker.register('sw.js');
      return swRegistration;
    } catch (err) {
      console.error('Không đăng ký được service worker:', err);
      return null;
    }
  }

  /** Xin quyền thông báo - trình duyệt tự hiển thị hộp thoại hệ thống (như app native). */
  function requestPermission() {
    if (!isSupported()) return Promise.resolve('unsupported');
    return Notification.requestPermission().then((perm) => {
      hideBanner();
      return perm;
    });
  }

  /** Gửi 1 thông báo cục bộ. Chỉ gửi khi đã được cấp quyền. */
  async function notify(title, body) {
    if (!isSupported() || Notification.permission !== 'granted') return;

    try {
      let reg = swRegistration;
      if (!reg && 'serviceWorker' in navigator) {
        reg = await navigator.serviceWorker.getRegistration();
      }
      if (reg) {
        await reg.showNotification(title, {
          body,
          icon: 'icons/icon-192.png',
          badge: 'icons/icon-192.png',
          tag: 'dq-tracker-' + Date.now(), // tránh gộp/đè các thông báo liên tiếp
        });
        return;
      }
      // Fallback không có service worker
      new Notification(title, { body, icon: 'icons/icon-192.png' });
    } catch (err) {
      console.error('Lỗi khi gửi thông báo:', err);
    }
  }

  /** Banner nhỏ ở dưới màn hình, mời người dùng bật thông báo (chỉ hiện khi chưa quyết định). */
  function showBanner() {
    if (bannerEl || !isSupported() || Notification.permission !== 'default') return;

    bannerEl = document.createElement('div');
    bannerEl.id = 'notifPermissionBanner';
    bannerEl.innerHTML = `
      <span>🔔 Bật thông báo để nhận cảnh báo giá và tín hiệu BUY/SELL?</span>
      <div class="notif-banner-actions">
        <button id="notifAllowBtn" type="button">Bật thông báo</button>
        <button id="notifDismissBtn" type="button">Để sau</button>
      </div>
    `;
    document.body.appendChild(bannerEl);

    bannerEl.querySelector('#notifAllowBtn').addEventListener('click', requestPermission);
    bannerEl.querySelector('#notifDismissBtn').addEventListener('click', hideBanner);
  }

  function hideBanner() {
    if (bannerEl) {
      bannerEl.remove();
      bannerEl = null;
    }
  }

  /** Gọi 1 lần lúc app khởi động. */
  function init() {
    registerServiceWorker();
    if (isSupported() && Notification.permission === 'default') {
      // Delay nhẹ để không hỏi ngay khi trang vừa mở, đỡ gây khó chịu.
      setTimeout(showBanner, 1500);
    }
  }

  return { init, requestPermission, notify, isSupported, getPermission };
})();