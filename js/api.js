/**
 * api.js
 * Tất cả các lời gọi REST API tới Binance.
 * Không đụng vào DOM, không đụng vào Store trực tiếp -> chỉ trả dữ liệu đã format sẵn.
 *
 * CẬP NHẬT (đợt fix này): fetchKlines() nhận thêm tham số endTime (tuỳ chọn)
 * để tải các nến CŨ HƠN một mốc thời gian nhất định - phục vụ tính năng kéo
 * chart sang trái để tự động nạp thêm lịch sử (xem onNeedMoreHistory trong
 * app.js + prependCandles trong chart.js). Nếu không truyền endTime, hành vi
 * giữ nguyên như cũ (lấy `limit` nến mới nhất).
 */

const BINANCE_REST_BASE = 'https://api.binance.com';

/**
 * Lấy dữ liệu nến (klines) từ Binance, format sẵn theo chuẩn Lightweight Charts.
 * @param {string} symbol - vd: BTCUSDT
 * @param {string} interval - vd: 15m, 1h, 1d
 * @param {number} limit - số lượng nến tối đa (Binance cho phép tới 1000)
 * @param {number|null} endTime - mốc thời gian (ms, epoch) - nếu truyền, chỉ
 *   lấy các nến có thời gian ĐÓNG trước mốc này. Dùng để tải lịch sử cũ hơn.
 * @returns {Promise<Array<{time:number, open:number, high:number, low:number, close:number, volume:number}>>}
 */
async function fetchKlines(symbol, interval, limit = 1000, endTime = null) {
  let url = `${BINANCE_REST_BASE}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  if (endTime) {
    url += `&endTime=${endTime}`;
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetchKlines lỗi: ${res.status} ${res.statusText}`);
  }
  const raw = await res.json();
  // Mỗi phần tử raw: [openTime, open, high, low, close, volume, closeTime, ...]
  return raw.map((k) => ({
    time: Math.floor(k[0] / 1000),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

/**
 * Lấy giá 24h ticker hiện tại (dùng để hiển thị giá ban đầu trước khi WS kết nối xong).
 * @param {string} symbol
 */
async function fetch24hTicker(symbol) {
  const url = `${BINANCE_REST_BASE}/api/v3/ticker/24hr?symbol=${symbol}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch24hTicker lỗi: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return {
    lastPrice: parseFloat(data.lastPrice),
    changePercent: parseFloat(data.priceChangePercent),
  };
}

/**
 * Lấy toàn bộ danh sách symbol đang giao dịch (dùng cho ô tìm kiếm).
 * Kết quả được cache lại ở Store sau lần gọi đầu tiên.
 */
async function fetchAllSymbols() {
  const url = `${BINANCE_REST_BASE}/api/v3/exchangeInfo`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetchAllSymbols lỗi: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data.symbols
    .filter((s) => s.status === 'TRADING' && s.quoteAsset === 'USDT')
    .map((s) => s.symbol)
    .sort();
}