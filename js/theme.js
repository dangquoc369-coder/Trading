/**
 * theme.js
 * Chuyển đổi NỀN SÁNG / NỀN TỐI cho TOÀN BỘ app (kiểu TradingView).
 *
 * Cách làm: đặt attribute `data-theme="light"` hoặc `data-theme="dark"` lên
 * thẻ <html> - toàn bộ css/style.css định nghĩa lại các biến CSS
 * (--bg-main, --text-primary, ...) theo attribute này (xem
 * :root[data-theme="light"] trong style.css), nên hầu hết giao diện
 * (sidebar, topbar, panel, popover...) tự đổi theo mà không cần code JS gì
 * thêm.
 *
 * RIÊNG chart Lightweight Charts KHÔNG đọc được biến CSS (nó vẽ bằng canvas,
 * màu phải truyền vào bằng JS lúc tạo/applyOptions) - nên module này phát ra
 * sự kiện 'theme:changed' qua EventBus, và chart.js lắng nghe sự kiện đó để
 * tự gọi chart.applyOptions() đổi màu nền/lưới/chữ cho từng pane.
 *
 * Lựa chọn theme được lưu vào localStorage để nhớ giữa các lần mở app. Đoạn
 * script nhỏ ở đầu <head> (index.html) đã đọc trước giá trị này và đặt
 * data-theme lên <html> NGAY LẬP TỨC (trước khi trang vẽ ra) để tránh bị
 * "nháy" nền tối mặc định rồi mới đổi sang sáng - module này chỉ cần đọc lại
 * đúng giá trị đó để đồng bộ trạng thái nút bấm.
 */

const ThemeModule = (function () {
  const STORAGE_KEY = 'dq_tracker_theme_v1';
  let currentTheme = 'dark';
  let btnRef = null;

  function readSavedTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === 'light' ? 'light' : 'dark';
    } catch (err) {
      return 'dark';
    }
  }

  function persist(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (err) {
      console.error('Không lưu được lựa chọn theme:', err);
    }
  }

  function updateButtonLabel() {
    if (!btnRef) return;
    if (currentTheme === 'dark') {
      btnRef.textContent = '☀️ Nền sáng';
      btnRef.title = 'Chuyển sang nền sáng';
    } else {
      btnRef.textContent = '🌙 Nền tối';
      btnRef.title = 'Chuyển sang nền tối';
    }
  }

  /** Áp dụng 1 theme: đổi attribute trên <html>, lưu lại, báo cho chart.js. */
  function apply(theme) {
    currentTheme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    persist(currentTheme);
    updateButtonLabel();
    EventBus.emit('theme:changed', { theme: currentTheme });
  }

  function toggle() {
    apply(currentTheme === 'dark' ? 'light' : 'dark');
  }

  function getTheme() {
    return currentTheme;
  }

  function buildButton() {
    const btn = document.createElement('button');
    btn.id = 'themeToggleBtn';
    btn.type = 'button';
    btn.addEventListener('click', toggle);
    btnRef = btn;
    updateButtonLabel();
    return btn;
  }

  function mountButton() {
    const btn = buildButton();
    const target = document.querySelector('.topbar-right') || document.getElementById('topbar');
    if (target) {
      target.insertBefore(btn, target.firstChild ? target.firstChild.nextSibling : null);
    } else {
      btn.style.position = 'fixed';
      btn.style.top = '10px';
      btn.style.right = '260px';
      btn.style.zIndex = '9999';
      document.body.appendChild(btn);
    }
  }

  function init() {
    // Đồng bộ lại đúng giá trị đã được đoạn script trong <head> áp trước đó
    // (không set lại attribute ở đây để tránh 1 nhịp "nháy" - chỉ đọc lại).
    currentTheme = readSavedTheme();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mountButton);
    } else {
      mountButton();
    }
  }

  init();

  return { getTheme, toggle, apply };
})();