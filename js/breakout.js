/**
 * breakout.js
 * Chuyển logic từ BreakoutAlert.mq5 sang JS, hiển thị trực quan lên chart.
 *
 * (Các đợt fix trước: so sánh chéo khung entry<->trend, SL theo nguồn tuỳ
 * chọn, số nến breakout chỉnh được qua CONFIG.lookbackCandles - xem chi tiết
 * trong các comment gốc bên dưới, không đổi.)
 *
 * CẬP NHẬT (đợt fix này) - PHÁT SỰ KIỆN KHI CÓ TÍN HIỆU BUY/SELL MỚI:
 *   - setOnNewSignal(callback) đăng ký 1 hàm được gọi MỖI KHI có 1 tín hiệu
 *     breakout MỚI vừa phát sinh ở nến khung entry VỪA ĐÓNG (không gọi lại
 *     cho các tín hiệu cũ trong lịch sử mỗi lần run() chạy lại - run() chạy
 *     rất thường xuyên do có tick mới, EMA đổi chu kỳ, v.v.).
 *   - Cơ chế chống lặp/chống báo tín hiệu cũ: lưu lastNotifiedEntryTime (thời
 *     điểm nến entry của tín hiệu gần nhất đã báo) - chỉ gọi callback khi tín
 *     hiệu mới có thời gian KHÁC với lần đã báo trước đó.
 *   - LẦN CHẠY ĐẦU TIÊN (baseline) sau khi load dữ liệu/đổi symbol/timeframe
 *     sẽ KHÔNG gọi callback dù có phát hiện tín hiệu, để tránh việc vừa mở
 *     app hoặc vừa đổi symbol là bị báo ngay tín hiệu từ... vài giờ/vài ngày
 *     trước. Chỉ báo cho tín hiệu THỰC SỰ MỚI phát sinh sau đó.
 *   - resetSignalBaseline() được gọi ở resetRunState() (tức mỗi lần run() bắt
 *     đầu lại từ đầu do đổi cấu hình/dữ liệu) để đảm bảo hành vi trên áp dụng
 *     đúng cho từng "phiên" dữ liệu.
 *
 * API MỚI của run(): không đổi so với trước, vẫn là:
 *   run({ entryCandles, higherTFCandles, slCandles })
 */

const BreakoutModule = (function () {
  function create(paneId) {
    let candleSeriesRef = null;
    let markersPrimitive = null;
    let slPriceLine = null;
    let markers = [];
    let visible = true; // bật/tắt hiển thị marker BUY/SELL/SL + đường SL

    let activeTradeOpen = false;
    let activeDirection = 0; // 1 = BUY, -1 = SELL
    let activeEntryPrice = 0;
    let activeSLPrice = 0;

    // Trend tham khảo (logic cũ, tính riêng, không ảnh hưởng lệnh ảo)
    let lastTrend = 'sideway';

    // ===== Thông báo tín hiệu MỚI (đợt fix này) =====
    let onNewSignalCb = null;
    let lastNotifiedEntryTime = null;
    let hasBaseline = false; // đã chạy qua ít nhất 1 lần kể từ lần reset gần nhất chưa

    const CONFIG = {
      atrPeriod: 14,
      atrMultiplier: 2.5,
      slSource: 'entry', // 'entry' | 'higher' | 'custom'
      lookbackCandles: 2, // số nến khung TREND dùng để xác định vùng breakout
    };

    function configure(options) {
      Object.assign(CONFIG, options);
    }

    function getConfig() {
      return { ...CONFIG };
    }

    /** Đăng ký callback gọi khi có tín hiệu BUY/SELL MỚI (không phải tín hiệu cũ trong lịch sử). */
    function setOnNewSignal(cb) {
      onNewSignalCb = cb;
    }

    function init(chart, candleSeries) {
      candleSeriesRef = candleSeries;
      markersPrimitive = LightweightCharts.createSeriesMarkers(candleSeries, []);
    }

    function removeSLLine() {
      if (slPriceLine && candleSeriesRef) {
        candleSeriesRef.removePriceLine(slPriceLine);
        slPriceLine = null;
      }
    }

    function drawSLLine(price, direction) {
      removeSLLine();
      if (!visible) return; // đang tắt hiển thị -> không vẽ đường SL
      slPriceLine = candleSeriesRef.createPriceLine({
        price,
        color: '#e98d16ec',
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'SL ' + (direction === 1 ? 'BUY' : 'SELL'),
      });
    }

    function pushMarker(marker) {
      markers.push(marker);
      markers.sort((a, b) => a.time - b.time);
      if (visible) markersPrimitive.setMarkers(markers);
    }

    function addEntryMarker(time, direction, isReversal) {
      const marker =
        direction === 1
          ? { time, position: 'belowBar', color: '#26a69a', shape: 'arrowUp', text: isReversal ? 'B' : 'BUY' }
          : { time, position: 'aboveBar', color: '#ef5350', shape: 'arrowDown', text: isReversal ? 'S' : 'SELL' };
      pushMarker(marker);
    }

    function addSLHitMarker(time) {
      pushMarker({ time, position: 'inBar', color: '#f5c518', shape: 'circle', text: 'SL' });
    }

    function openTrade(direction, entryPrice, slDistance) {
      activeTradeOpen = true;
      activeDirection = direction;
      activeEntryPrice = entryPrice;
      activeSLPrice = direction === 1 ? entryPrice - slDistance : entryPrice + slDistance;
      drawSLLine(activeSLPrice, direction);
    }

    function closeTrade() {
      activeTradeOpen = false;
      removeSLLine();
    }

    function checkSLAgainstBar(bar) {
      if (!activeTradeOpen) return false;
      if (activeDirection === 1 && bar.low <= activeSLPrice) return true;
      if (activeDirection === -1 && bar.high >= activeSLPrice) return true;
      return false;
    }

    // ===================== TREND THAM KHẢO (logic cũ, giữ nguyên) =====================
    function detectOwnTimeframeTrend(closedCandles, lookback = 3) {
  const len = closedCandles.length;

  if (len < lookback + 1) {
    return {
      trend: 'sideway',
      breakDistance: 0,
      maxHigh: null,
      minLow: null
    };
  }

  const current = closedCandles[len - 1];
  const previous = closedCandles.slice(len - 1 - lookback, len - 1);

  const maxHigh = Math.max(...previous.map(c => c.high));
  const minLow = Math.min(...previous.map(c => c.low));

  let trend = 'sideway';
  let breakDistance = 0;

  if (current.close > maxHigh) {
    trend = 'up';
    breakDistance = current.close - maxHigh;
  } else if (current.close < minLow) {
    trend = 'down';
    breakDistance = minLow - current.close;
  }

  return {
    trend,
    breakDistance,
    maxHigh,
    minLow
  };
}

    // ===================== TIỆN ÍCH GHÉP KHUNG (multi-timeframe align) =====================
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

    function computeBreakoutZone(series, count) {
      const n = CONFIG.lookbackCandles;
      if (count < n) return null;
      const windowCandles = series.slice(count - n, count);
      const maxHigh = Math.max(...windowCandles.map((c) => c.high));
      const minLow = Math.min(...windowCandles.map((c) => c.low));
      return { maxHigh, minLow };
    }

    function resetRunState() {
      activeTradeOpen = false;
      activeDirection = 0;
      activeEntryPrice = 0;
      activeSLPrice = 0;
      markers = [];
      removeSLLine();
      // Mỗi lần run() chạy lại từ đầu là 1 "phiên" tính toán mới -> chưa có
      // baseline, tránh báo nhầm tín hiệu cũ ngay sau khi reset.
      hasBaseline = false;
    }

    /**
     * run({ entryCandles, higherTFCandles, slCandles })
     * Xem mô tả API ở đầu file.
     */
    function run(params) {
      if (!candleSeriesRef) return;

      const entryCandles = (params && params.entryCandles) || [];
      const higherTFCandlesRaw = (params && params.higherTFCandles) || [];
      const slCandlesRaw = params && params.slCandles;

      resetRunState();

      if (entryCandles.length < 2) {
        markersPrimitive.setMarkers([]);
        lastTrend = 'sideway';
        return;
      }

      const entryClosed = entryCandles.slice(0, -1);
      const entryForming = entryCandles[entryCandles.length - 1];

      // Trend tham khảo (không lọc lệnh) - tính 1 lần trên toàn bộ dữ liệu hiện có
      const trendResult = detectOwnTimeframeTrend(entryClosed);
      lastTrend = trendResult.trend;

      // Chuỗi khung TREND (lớn hơn) dùng để phát hiện breakout vào lệnh ảo
      const htfSeries = buildClosedSeries(higherTFCandlesRaw);
      const htfAlign = makeAligner(htfSeries);

      // Chuỗi khung dùng để tính ATR cho SL, tuỳ CONFIG.slSource
      let slSeriesRaw;
      if (CONFIG.slSource === 'higher') {
        slSeriesRaw = higherTFCandlesRaw;
      } else if (CONFIG.slSource === 'custom') {
        slSeriesRaw = slCandlesRaw || entryClosed;
      } else {
        slSeriesRaw = entryClosed; // 'entry' (mặc định)
      }
      const slSeries = buildClosedSeries(slSeriesRaw);
      const slAlign = makeAligner(slSeries);

      if (entryClosed.length < 1 || htfSeries.length < CONFIG.lookbackCandles) {
        // Chưa đủ nến khung trend để so sánh -> không thể phát hiện breakout
        markersPrimitive.setMarkers([]);
        return;
      }

      // Tín hiệu breakout gần nhất phát sinh TRONG lần chạy này (dùng để báo
      // "tín hiệu mới" sau vòng lặp, xem đoạn sau vòng lặp bên dưới).
      let lastLoopSignal = null;

      for (let i = 0; i < entryClosed.length; i++) {
        const bar = entryClosed[i];

        if (checkSLAgainstBar(bar)) {
          addSLHitMarker(bar.time);
          closeTrade();
        }

        // Số nến khung TREND đã đóng tính đến thời điểm nến entry này đóng
        const htfCount = htfAlign(bar.time);
        const zone = computeBreakoutZone(htfSeries, htfCount);
        if (!zone) continue;

        let direction = 0;
        if (bar.close > zone.maxHigh) direction = 1;
        else if (bar.close < zone.minLow) direction = -1;
        if (direction === 0) continue;

        if (activeTradeOpen && direction === activeDirection) continue;

        // Số nến khung SL đã đóng tính đến thời điểm nến entry này đóng
        const slCount = slAlign(bar.time);
        if (slCount < CONFIG.atrPeriod + 1) continue;
        const slSlice = slSeries.slice(0, slCount);
        const atrArr = IndicatorModule.calcATR(slSlice, CONFIG.atrPeriod);
        const atr = atrArr[atrArr.length - 1];
        if (!atr) continue;
        const slDistance = atr * CONFIG.atrMultiplier;

        const isReversal = activeTradeOpen;
        addEntryMarker(bar.time, direction, isReversal);
        openTrade(direction, bar.close, slDistance);

        lastLoopSignal = { time: bar.time, direction };
      }

      if (checkSLAgainstBar(entryForming)) {
        addSLHitMarker(entryForming.time);
        closeTrade();
      }

      markersPrimitive.setMarkers(visible ? markers : []);

      // ===== Xử lý báo tín hiệu MỚI =====
      // Chỉ báo khi tín hiệu breakout gần nhất TRÙNG với nến entry ĐÃ ĐÓNG
      // gần nhất (tức là tín hiệu "nóng hổi" vừa xảy ra ở nến vừa đóng, không
      // phải 1 tín hiệu cũ hơn nằm giữa lịch sử), VÀ khác với lần đã báo
      // trước đó (tránh báo lặp lại mỗi khi run() được gọi lại do có tick mới
      // hoặc đổi cấu hình indicator).
      if (lastLoopSignal && entryClosed.length > 0) {
        const latestClosedTime = entryClosed[entryClosed.length - 1].time;
        if (lastLoopSignal.time === latestClosedTime) {
          const isNewSignal = lastLoopSignal.time !== lastNotifiedEntryTime;
          const isFirstRunOfThisSession = !hasBaseline;
          if (isNewSignal && !isFirstRunOfThisSession && onNewSignalCb) {
            onNewSignalCb(lastLoopSignal.direction, lastLoopSignal.time);
          }
          if (isNewSignal) lastNotifiedEntryTime = lastLoopSignal.time;
        }
      }
      hasBaseline = true;
    }

    /**
     * Bật/tắt hiển thị marker BUY/SELL/SL + đường SL trên chart.
     * Logic theo dõi lệnh ảo (activeTradeOpen, activeSLPrice...) vẫn chạy
     * bình thường phía dưới dù đang ẩn - chỉ phần VẼ ra là bị tắt.
     */
    function setVisible(v) {
      visible = !!v;
      if (markersPrimitive) markersPrimitive.setMarkers(visible ? markers : []);
      if (visible && activeTradeOpen) {
        drawSLLine(activeSLPrice, activeDirection);
      } else if (!visible) {
        removeSLLine();
      }
    }

    function isVisible() {
      return visible;
    }

    function getMarketStatus(params) {
      const entryCandles = Array.isArray(params) ? params : (params && params.entryCandles) || [];
      const higherTFCandlesRaw = Array.isArray(params) ? [] : (params && params.higherTFCandles) || [];

      if (!entryCandles || entryCandles.length < 5) {
        return { ok: false, reason: 'Chưa đủ dữ liệu nến để phân tích.' };
      }

      const closed = entryCandles.slice(0, -1);
      const forming = entryCandles[entryCandles.length - 1];
      const c1 = closed[closed.length - 1];

      const trendResult = detectOwnTimeframeTrend(closed);

      let crossTF = null;
      if (higherTFCandlesRaw && higherTFCandlesRaw.length >= CONFIG.lookbackCandles) {
        const htfSeries = buildClosedSeries(higherTFCandlesRaw);
        const htfAlign = makeAligner(htfSeries);
        const htfCount = htfAlign(c1.time);
        const zone = computeBreakoutZone(htfSeries, htfCount);
        if (zone) {
          crossTF = {
            maxHigh: zone.maxHigh,
            minLow: zone.minLow,
            distanceToHighZone: zone.maxHigh - c1.close,
            distanceToLowZone: c1.close - zone.minLow,
          };
        }
      }

      return {
        ok: true,
        paneId,
        lastClosedCandleTime: c1.time,
        trend: trendResult.trend,
        breakDistance: trendResult.breakDistance,
        maxHigh12: trendResult.maxHigh12,
        minLow12: trendResult.minLow12,
        crossTF,
        currentPrice: forming.close,
        activeTradeOpen,
        activeDirection,
        activeEntryPrice,
        activeSLPrice,
        risk: activeTradeOpen ? Math.abs(activeEntryPrice - activeSLPrice) : null,
      };
    }

    return { init, run, configure, getConfig, getMarketStatus, setVisible, isVisible, setOnNewSignal };
  }

  return { create };
})();