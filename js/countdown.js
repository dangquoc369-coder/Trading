/**
 * countdown.js
 * Đếm ngược thời gian tới khi nến hiện tại đóng, hiển thị nhỏ ngay dưới/cạnh
 * giá của MỖI pane (phần tử #pane-X-countdown, xem index.html).
 *
 * Dùng CHUNG 1 interval (1 giây/lần) cho cả 4 pane thay vì 4 interval riêng
 * - rẻ hơn và không cần chart instance: nến trên Binance luôn đóng theo mốc
 * thời gian cố định kể từ epoch (epoch-aligned), nên chỉ cần biết timeframe
 * hiện tại của từng pane (Store) + giờ hệ thống là tính được, không phụ
 * thuộc layout đang hiển thị ô nào - cả 4 pane đều được đếm dù đang ẩn.
 */

const CountdownModule = (function () {
  const TIMEFRAME_MS = {
    '1m': 60_000,
    '5m': 300_000,
    '15m': 900_000,
    '30m': 1_800_000,
    '1h': 3_600_000,
    '2h': 7_200_000,
    '4h': 14_400_000,
    '12h': 43_200_000,
    '1d': 86_400_000,
    '3d': 259_200_000,
    '1w': 604_800_000,
  };

  /** '1M' (tháng) không có độ dài cố định -> tính theo lịch dương thật. */
  function nextCloseTime(timeframe, now) {
    if (timeframe === '1M') {
      const d = new Date(now);
      const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0);
      return next;
    }
    const ms = TIMEFRAME_MS[timeframe] || TIMEFRAME_MS['1h'];
    return Math.ceil(now / ms) * ms;
  }

  function formatRemaining(ms) {
    if (ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  function tick() {
    const now = Date.now();
    Store.getState().panes.forEach((pane) => {
      const el = document.getElementById(`${pane.id}-countdown`);
      if (!el) return;
      const close = nextCloseTime(pane.timeframe, now);
      el.textContent = '⏱ ' + formatRemaining(close - now);
    });
  }

  function init() {
    tick();
    setInterval(tick, 1000);
  }

  return { init };
})();