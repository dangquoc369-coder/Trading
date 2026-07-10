/**
 * trend-reference.js
 * Module tính TREND THAM KHẢO kiểu mới - HOÀN TOÀN TÁCH BIỆT với breakout.js.
 *
 * Lưu ý quan trọng: phần LỆNH ẢO (BUY/SELL/SL) không đổi gì cả - vẫn do
 * breakout.js xử lý riêng theo entry/higher timeframe mà người dùng chọn ở
 * từng pane. File này CHỈ phục vụ hiển thị "trend tham khảo", tính theo các
 * khung thời gian CỐ ĐỊNH, không phụ thuộc vào timeframe đang xem của pane.
 *
 * ===== TREND SWING (báo đủ 3 dòng H1 | H4 | D1, dù pane đang mở TF nào) =====
 *   - H1  : vùng = High/Low của 2 nến H4  đã đóng gần nhất -> test bằng nến M15 đã đóng gần nhất.
 *   - H4  : vùng = High/Low của 2 nến D1  đã đóng gần nhất -> test bằng nến H1  đã đóng gần nhất.
 *   - D1  : vùng = High/Low của 2 nến 3D  đã đóng gần nhất -> test bằng nến H2  đã đóng gần nhất.
 *   Nến test nằm TRONG vùng -> "sideway". Nến test breakout khỏi vùng -> "up"/"down".
 *   Đây là phép test tại 1 thời điểm (nến gần nhất), KHÔNG có bộ nhớ trạng thái.
 *
 * ===== TREND SCALP (chỉ 2 trạng thái, không có sideway) =====
 *   - vùng = High/Low của 2 nến H2 đã đóng gần nhất -> test bằng M5.
 *   - Khi M5 breakout khỏi vùng thì đổi hướng ("up"/"down"). Khi M5 nằm
 *     TRONG vùng thì GIỮ NGUYÊN hướng đang có trước đó (không có sideway).
 *   -> Đây là logic có "bộ nhớ", phải lặp qua toàn bộ lịch sử M5 đã tải để
 *      xác định đúng hướng đang giữ tại thời điểm hiện tại.
 *
 * Dữ liệu nến của cả 7 khung (5m, 15m, 1h, 2h, 4h, 1d, 3d) được app.js tải
 * (REST) và đẩy realtime (WebSocket) vào đây qua setCandles()/upsertCandle(),
 * y hệt cách chart.js/breakout.js đang nhận dữ liệu - xem app.js/websocket.js.
 */

const TrendReferenceModule = (function () {
  // Khung -> interval Binance tương ứng. 4 khung "signal" (m5,m15,h1,h2) +
  // 3 khung "vùng" (h2 dùng lại, h4,d1,d3) => tổng cộng 7 khung cần tải.
  const ROLE_INTERVAL = {
    m5: '5m',
    m15: '15m',
    h1: '1h',
    h2: '2h',
    h4: '4h',
    d1: '1d',
    d3: '3d',
  };

  // Cấu hình 3 "chân" của Trend Swing: signalRole đóng nến để test, zoneRole
  // cung cấp vùng High/Low (2 nến đã đóng gần nhất của khung đó).
  const SWING_LEGS = [
    { key: 'h1', signalRole: 'm15', zoneRole: 'h4' },
    { key: 'h4', signalRole: 'h1', zoneRole: 'd1' },
    { key: 'd1', signalRole: 'h2', zoneRole: 'd3' },
  ];

  // Trend Scalp: 1 chân duy nhất, có bộ nhớ trạng thái (không sideway).
  const SCALP_LEG = { signalRole: 'm5', zoneRole: 'h2' };

  const ZONE_LOOKBACK = 2; // luôn là 2 nến, cố định, không cấu hình được

  // ===== Các hàm tiện ích căn chỉnh đa khung (giống ý tưởng trong breakout.js,
  // tách riêng ở đây để trend-reference.js không phụ thuộc vào breakout.js) =====

  function buildClosedSeries(rawCandles) {
    const candles = (rawCandles || []).slice().sort((a, b) => a.time - b.time);
    if (candles.length < 2) {
      return candles.map((c) => ({ ...c, closeTime: c.time }));
    }
    const diffs = [];
    for (let i = 1; i < candles.length; i++) diffs.push(candles[i].time - candles[i - 1].time);
    diffs.sort((a, b) => a - b);
    const duration = diffs[Math.floor(diffs.length / 2)];
    return candles.map((c) => ({ ...c, closeTime: c.time + duration }));
  }

  function makeAligner(series) {
    let pointer = 0;
    return function advanceTo(time) {
      while (pointer < series.length && series[pointer].closeTime <= time) pointer++;
      return pointer;
    };
  }

  function computeZone(series, count) {
    if (count < ZONE_LOOKBACK) return null;
    const win = series.slice(count - ZONE_LOOKBACK, count);
    return {
      maxHigh: Math.max(...win.map((c) => c.high)),
      minLow: Math.min(...win.map((c) => c.low)),
    };
  }

  function create(paneId) {
    // raw[role] = mảng nến thô của khung đó (nến CUỐI CÙNG luôn là nến đang
    // chạy/forming - giống quy ước currentCandles trong chart.js/breakout.js).
    const raw = {};
    Object.keys(ROLE_INTERVAL).forEach((role) => {
      raw[role] = [];
    });

    function setCandles(role, candles) {
      if (!ROLE_INTERVAL[role]) return;
      raw[role] = candles ? candles.slice() : [];
    }

    function upsertCandle(role, candle) {
      if (!ROLE_INTERVAL[role]) return;
      const arr = raw[role];
      const last = arr[arr.length - 1];
      if (last && last.time === candle.time) {
        arr[arr.length - 1] = candle;
      } else if (!last || candle.time > last.time) {
        arr.push(candle);
      }
    }

    function getClosed(role) {
      const arr = raw[role];
      if (!arr || arr.length < 2) return [];
      return arr.slice(0, -1); // bỏ nến cuối (đang chạy, chưa đóng)
    }

    /** 1 chân Trend Swing: test nến signal đã đóng gần nhất so với vùng zone. */
    function computeSwingLeg(leg) {
      const signalClosed = getClosed(leg.signalRole);
      const zoneRaw = raw[leg.zoneRole];
      if (signalClosed.length < 1 || !zoneRaw || zoneRaw.length < ZONE_LOOKBACK) return null;

      const lastSignal = signalClosed[signalClosed.length - 1];
      const zoneSeries = buildClosedSeries(zoneRaw);
      const align = makeAligner(zoneSeries);
      const count = align(lastSignal.time);
      const zone = computeZone(zoneSeries, count);
      if (!zone) return null;

      if (lastSignal.close > zone.maxHigh) return 'up';
      if (lastSignal.close < zone.minLow) return 'down';
      return 'sideway';
    }

    /**
     * Trend Scalp: lặp qua TOÀN BỘ lịch sử nến signal (M5) đã đóng, mỗi lần
     * breakout khỏi vùng (H2) thì đổi hướng; nằm trong vùng thì giữ nguyên
     * hướng trước đó. Không có "sideway". Trả về null nếu trong toàn bộ dữ
     * liệu đã tải chưa từng có 1 lần breakout nào (rất hiếm, coi như chưa
     * xác định được - UI sẽ hiện "Đang xác định...").
     */
    function computeScalpTrend() {
      const signalClosed = getClosed(SCALP_LEG.signalRole);
      const zoneRaw = raw[SCALP_LEG.zoneRole];
      if (signalClosed.length < 1 || !zoneRaw || zoneRaw.length < ZONE_LOOKBACK) return null;

      const zoneSeries = buildClosedSeries(zoneRaw);
      const align = makeAligner(zoneSeries);

      let direction = null;
      for (let i = 0; i < signalClosed.length; i++) {
        const bar = signalClosed[i];
        const count = align(bar.time);
        const zone = computeZone(zoneSeries, count);
        if (!zone) continue;

        if (bar.close > zone.maxHigh) direction = 'up';
        else if (bar.close < zone.minLow) direction = 'down';
        // else: đang trong vùng -> giữ nguyên direction hiện có, không đổi
      }
      return direction;
    }

    /** Trả về { swing: { h1, h4, d1 }, scalp } - dùng cho UI hiển thị. */
    function compute() {
      const swing = {};
      SWING_LEGS.forEach((leg) => {
        swing[leg.key] = computeSwingLeg(leg);
      });
      return { swing, scalp: computeScalpTrend() };
    }

    return { setCandles, upsertCandle, compute };
  }

  return { create, ROLE_INTERVAL };
})();