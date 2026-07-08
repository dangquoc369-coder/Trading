/**
 * utils.js
 * Các hàm tiện ích thuần (pure functions) + EventBus dùng chung toàn app.
 * File này KHÔNG phụ thuộc vào bất kỳ module nào khác -> phải load đầu tiên.
 */

/* ===================== EVENT BUS ===================== */
const EventBus = (function () {
  // eventName -> Map(originalCallback -> wrapperFunction)
  const registry = new Map();

  function on(eventName, callback) {
    const wrapper = (e) => callback(e.detail);
    if (!registry.has(eventName)) registry.set(eventName, new Map());
    registry.get(eventName).set(callback, wrapper);
    window.addEventListener(eventName, wrapper);
  }

  function off(eventName, callback) {
    const map = registry.get(eventName);
    if (!map) return;
    const wrapper = map.get(callback);
    if (wrapper) {
      window.removeEventListener(eventName, wrapper);
      map.delete(callback);
    }
  }

  function emit(eventName, detail) {
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
  }

  return { on, off, emit };
})();

/* ===================== FORMATTERS ===================== */

/**
 * Format giá theo số thập phân phù hợp.
 * Giá càng nhỏ thì càng cần nhiều số lẻ (vd: SHIB, PEPE).
 */
function formatPrice(value) {
  if (value === null || value === undefined || isNaN(value)) return '--';
  const num = Number(value);
  let decimals = 2;
  if (num < 1) decimals = 6;
  else if (num < 10) decimals = 4;
  else if (num < 1000) decimals = 2;
  else decimals = 2;
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Alias dùng trong drawing.js để format giá trên đường ngang (giữ cùng quy tắc với formatPrice). */
function formatPriceLocal(value) {
  return formatPrice(value);
}

/**
 * Rút gọn volume lớn thành dạng K / M / B.
 */
function formatVolume(value) {
  if (value === null || value === undefined || isNaN(value)) return '--';
  const num = Number(value);
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2) + 'B';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(2) + 'K';
  return num.toFixed(2);
}

/**
 * Format % thay đổi giá, kèm dấu +/-.
 */
function formatPercent(value) {
  if (value === null || value === undefined || isNaN(value)) return '--';
  const num = Number(value);
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}%`;
}

/**
 * Debounce: trì hoãn gọi hàm cho đến khi ngừng gọi trong khoảng `delay` ms.
 * Dùng cho ô tìm kiếm symbol.
 */
function debounce(fn, delay = 300) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Sinh 1 chuỗi id ngắn, dùng cho các nhu cầu phụ (không dùng để đặt tên
 * pane - pane id cố định là 'pane-1'..'pane-4', xem storage.js).
 */
function uid(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Map timeframe hiển thị (UI) -> interval Binance API.
 * Lưu ý: Binance phân biệt hoa/thường - '1w' (tuần) viết thường,
 * '1M' (tháng) viết hoa M. Gõ sai hoa/thường sẽ khiến API trả lỗi 400.
 */
const TIMEFRAMES = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '30m', value: '30m' },
  { label: '1H', value: '1h' },
  { label: '2H', value: '2h' },
  { label: '4H', value: '4h' },
  { label: '12H', value: '12h' },
  { label: '1D', value: '1d' },
  { label: '3D', value: '3d' },
  { label: 'W', value: '1w' },
  { label: 'M', value: '1M' },
];
