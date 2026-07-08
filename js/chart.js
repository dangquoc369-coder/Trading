/**
 * chart.js
 * Khởi tạo và điều khiển biểu đồ Lightweight Charts v5.x.
 *
 * (Đợt fix trước - Phần 1: tự động tải thêm lịch sử khi kéo sang trái, xem
 * isLoadingOlder/setLoadingOlder/isNoMoreOlder/setNoMoreOlder/prependCandles.)
 *
 * (Phần 2, CẢNH BÁO):
 *   1) Truyền `onAlertRequested` vào DrawingModule.create() - khi người dùng
 *      chọn tool 🔔 và click lên chart, callback này gọi
 *      AlertsModule.addPriceAlert(symbol, price) để tạo cảnh báo mới.
 *   2) renderAlertLines()/clearAlertLines(): vẽ/xoá các đường ngang màu vàng
 *      cho MỌI cảnh báo giá CHƯA CHẠM của đúng symbol đang hiển thị ở pane
 *      này (dùng candleSeries.createPriceLine(), không phải canvas overlay -
 *      khác với hline do người dùng tự vẽ). Tự vẽ lại mỗi khi:
 *        - loadInitialData() được gọi (mới load nến / đổi symbol xong)
 *        - có sự kiện 'alerts:changed' (thêm/xoá/kích hoạt cảnh báo bất kỳ ở
 *          đâu trong app - lọc lại theo đúng symbol của pane này)
 *   3) Kết nối breakout.setOnNewSignal() -> phát ra sự kiện 'pane:newSignal'
 *      qua EventBus để app.js lắng nghe và gửi thông báo hệ thống (nếu pane
 *      đó đã bật signalAlertEnabled).
 *
 * ĐỢT FIX NÀY (MƯỢT HƠN - GỘP TÍNH LẠI CHỈ BÁO/BREAKOUT THEO KHUNG HÌNH):
 *   - Trước đây, MỖI khi có 1 tick giá mới từ BẤT KỲ socket nào trong 3
 *     socket của 1 pane (kline khung entry, khung trend, khung SL - cả 3
 *     đều gửi tick liên tục kể cả khi nến chưa đóng), app tính lại NGAY LẬP
 *     TỨC và ĐỒNG BỘ toàn bộ EMA/RSI/WMA + toàn bộ vòng lặp breakout. Với
 *     4 pane chạy song song (luôn real-time dù đang ẩn), việc này có thể
 *     dồn lại và gây giật, nhất là trên thiết bị yếu.
 *   - scheduleRecompute(needIndicators): gộp mọi yêu cầu tính lại trong
 *     cùng 1 khung hình (dùng requestAnimationFrame) thành ĐÚNG 1 lần tính
 *     lại mỗi frame, thay vì tính lại mỗi tick. Không đổi độ chính xác hay
 *     độ trễ cảm nhận được (chậm nhất ~1 frame ~16ms).
 *   - handleKlineUpdate (tick khung ENTRY) cần renderIndicators + runBreakout
 *     -> scheduleRecompute(true).
 *   - upsertHigherTFCandle/upsertSLCandle (tick khung TREND/SL) chỉ ảnh
 *     hưởng breakout, không ảnh hưởng chỉ báo trên khung entry -> chỉ cần
 *     runBreakout -> scheduleRecompute(false).
 *   - Các đường gọi runBreakout()/renderIndicators() còn lại (loadInitialData,
 *     prependCandles, setHigherTFCandles, setSLCandles, configureBreakout)
 *     là do HÀNH ĐỘNG rõ ràng của người dùng hoặc lúc tải dữ liệu ban đầu -
 *     tần suất thấp, giữ nguyên gọi NGAY LẬP TỨC để phản hồi tức thì.
 *   - destroy(): huỷ rAF đang chờ (nếu có) để tránh lỗi tham chiếu tới
 *     chart/candleSeries sau khi đã bị huỷ.
 */

const ChartModule = (function () {
  const ENTRY_TO_HIGHER_TF = {
    '2h': '3d',
    '1h': '1d',
    '30m': '12h',
    '15m': '4h',
    '5m': '2h',
  };

  function getHigherTimeframeFor(entryTimeframe) {
    return ENTRY_TO_HIGHER_TF[entryTimeframe] || null;
  }

  function create(paneId) {
    let chart = null;
    let containerRef = null;
    let candleSeries = null;
    let volumeSeries = null;
    let resizeObserver = null;
    let volumeVisible = true;

    let ema21Series = null;
    let ema200Series = null;
    let rsiSeries = null;
    let emaRsiSeries = null;
    let wmaRsiSeries = null;

    let currentCandles = [];

    // ===== Trạng thái tải thêm lịch sử (kéo sang trái) - Phần 1 =====
    let loadingOlder = false;
    let noMoreOlder = false;

    let higherTFCandles = [];
    let slCandles = null;

    // ===== Đường cảnh báo giá đang vẽ trên chart (Phần 2) =====
    let alertPriceLines = [];

    // ===== Gộp tính lại theo khung hình (đợt fix này) =====
    let recomputeRafId = null;
    let needIndicatorRecompute = false;

    const indicatorConfig = {
      ema21: { label: 'EMA', color: '#f5c518', period: 21, enabled: true },
      ema200: { label: 'EMA', color: '#ff5f5f', period: 200, enabled: true },
      rsi: { label: 'RSI', color: '#7e57c2', period: 14, enabled: true },
      emaRsi: { label: 'EMA(RSI)', color: '#26a69a', period: 9, enabled: true },
      wmaRsi: { label: 'WMA(RSI)', color: '#ef5350', period: 45, enabled: true },
    };

    const breakout = BreakoutModule.create(paneId);

    // Mỗi khi breakout.js phát hiện 1 tín hiệu BUY/SELL MỚI (không phải tín
    // hiệu cũ trong lịch sử), phát sự kiện ra ngoài để app.js xử lý gửi
    // thông báo hệ thống (tuỳ theo pane.signalAlertEnabled).
    breakout.setOnNewSignal((direction, time) => {
      EventBus.emit('pane:newSignal', { paneId, direction, time });
    });

    let drawing = null;

    function runBreakout() {
      breakout.run({
        entryCandles: currentCandles,
        higherTFCandles,
        slCandles: slCandles || undefined,
      });
    }

    /**
     * Gộp mọi yêu cầu tính lại chỉ báo/breakout phát sinh trong CÙNG 1 khung
     * hình thành đúng 1 lần chạy, thay vì chạy đồng bộ ngay mỗi lần được gọi.
     * needIndicators=true nếu lần gọi này cần tính lại cả EMA/RSI/WMA (chỉ
     * cần thiết khi có tick mới ở khung ENTRY); false nếu chỉ cần chạy lại
     * breakout (tick ở khung TREND/SL không ảnh hưởng chỉ báo khung entry).
     */
    function scheduleRecompute(needIndicators) {
      if (needIndicators) needIndicatorRecompute = true;
      if (recomputeRafId !== null) return;
      recomputeRafId = requestAnimationFrame(() => {
        recomputeRafId = null;
        if (needIndicatorRecompute) {
          needIndicatorRecompute = false;
          renderIndicators(currentCandles);
        }
        runBreakout();
      });
    }

    function handleKlineUpdate({ paneId: sourcePaneId, candle }) {
      if (sourcePaneId !== paneId) return;
      Store.upsertPaneCandle(paneId, candle);

      candleSeries.update({
        time: candle.time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      });

      volumeSeries.update({
        time: candle.time,
        value: candle.volume,
        color: candle.close >= candle.open ? 'rgba(38,166,154,0.5)' : 'rgba(239,83,80,0.5)',
      });

      const lastIndex = currentCandles.length - 1;
      if (lastIndex >= 0 && currentCandles[lastIndex].time === candle.time) {
        currentCandles[lastIndex] = candle;
      } else {
        currentCandles.push(candle);
      }
      // Trước đây gọi renderIndicators()+runBreakout() đồng bộ NGAY mỗi tick.
      // Giờ gộp lại theo khung hình để đỡ tính toán thừa khi tick dồn dập.
      scheduleRecompute(true);
    }

    function initChart(container) {
      containerRef = container;

      const rect = container.getBoundingClientRect();
      const initialWidth = container.clientWidth || rect.width || 400;
      const initialHeight = container.clientHeight || rect.height || 300;

      chart = LightweightCharts.createChart(container, {
        autoSize: false,
        width: initialWidth,
        height: initialHeight,
        layout: {
          background: { type: 'solid', color: '#131722' },
          textColor: '#d1d4dc',
          panes: { separatorColor: '#2a2e39' },
        },
        grid: {
          vertLines: { color: '#1e222d' },
          horzLines: { color: '#1e222d' },
        },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#2a2e39' },
        timeScale: { borderColor: '#2a2e39', timeVisible: true, secondsVisible: false },
      });

      candleSeries = chart.addSeries(LightweightCharts.CandlestickSeries, {
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
      });
      candleSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.1, bottom: 0.3 },
      });

      breakout.init(chart, candleSeries);

      volumeSeries = chart.addSeries(LightweightCharts.HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

      ema21Series = chart.addSeries(
        LightweightCharts.LineSeries,
        { color: '#f5c518', lineWidth: 1, title: '', priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false },
        0
      );
      ema200Series = chart.addSeries(
        LightweightCharts.LineSeries,
        { color: '#ff5f5f', lineWidth: 1, title: '', priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false },
        0
      );

      const fixedRSIRangeProvider = (original) => {
        const originalInfo = original();
        return {
          priceRange: { minValue: 36, maxValue: 84 },
          margins: originalInfo ? originalInfo.margins : undefined,
        };
      };

      rsiSeries = chart.addSeries(
        LightweightCharts.LineSeries,
        {
          color: '#7e57c2',
          lineWidth: 1,
          title: '',
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          autoscaleInfoProvider: fixedRSIRangeProvider,
        },
        1
      );
      emaRsiSeries = chart.addSeries(
        LightweightCharts.LineSeries,
        {
          color: '#26a69a',
          lineWidth: 1,
          title: '',
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          autoscaleInfoProvider: fixedRSIRangeProvider,
        },
        1
      );
      wmaRsiSeries = chart.addSeries(
        LightweightCharts.LineSeries,
        {
          color: '#ef5350',
          lineWidth: 1,
          title: '',
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          autoscaleInfoProvider: fixedRSIRangeProvider,
        },
        1
      );

      const RSI_REFERENCE_LEVELS = [50, 40, 60, 30, 70];
      RSI_REFERENCE_LEVELS.forEach((level) => {
        rsiSeries.createPriceLine({
          price: level,
          color: level === 50 ? '#5d6274' : '#595e6d',
          lineWidth: 1,
          lineStyle: LightweightCharts.LineStyle.Dotted,
          axisLabelVisible: true,
          title: '',
        });
      });

      try {
        const panes = chart.panes();
        if (panes[1] && typeof panes[1].setStretchFactor === 'function') panes[1].setStretchFactor(0.3);
        if (panes[0] && typeof panes[0].setStretchFactor === 'function') panes[0].setStretchFactor(0.7);
      } catch (err) {
        console.warn(`[${paneId}] Không thể chỉnh tỉ lệ pane:`, err);
      }

      setupResize(container);

      chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (!range) return;
        if (range.from < 15 && !loadingOlder && !noMoreOlder) {
          EventBus.emit('pane:needMoreHistory', { paneId });
        }
      });

      EventBus.on('kline:update', handleKlineUpdate);

      // Vẽ lại đường cảnh báo giá của pane này mỗi khi có thay đổi cảnh báo
      // ở BẤT KỲ đâu trong app (thêm/xoá/kích hoạt) - tự lọc theo đúng symbol
      // hiện tại của pane bên trong renderAlertLines().
      EventBus.on('alerts:changed', renderAlertLines);

      drawing = DrawingModule.create(paneId, chart, candleSeries, container, {
        onAlertRequested: (price) => {
          const pane = Store.getPane(paneId);
          if (!pane) return;
          AlertsModule.addPriceAlert(pane.symbol, price);
        },
      });

      return chart;
    }

    function setupResize(container) {
      if (resizeObserver) resizeObserver.disconnect();
      resizeObserver = new ResizeObserver((entries) => {
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) chart.resize(width, height);
      });
      resizeObserver.observe(container);
    }

    function resize() {
      if (!chart || !containerRef) return;
      const { clientWidth, clientHeight } = containerRef;
      if (clientWidth > 0 && clientHeight > 0) {
        chart.resize(clientWidth, clientHeight);
      }
    }

    function renderIndicators(candles) {
      const closes = candles.map((c) => c.close);

      const ema21 = IndicatorModule.calcEMA(closes, indicatorConfig.ema21.period);
      const ema200 = IndicatorModule.calcEMA(closes, indicatorConfig.ema200.period);
      ema21Series.setData(IndicatorModule.toSeriesData(candles, ema21));
      ema200Series.setData(IndicatorModule.toSeriesData(candles, ema200));

      const rsi = IndicatorModule.calcRSI(candles, indicatorConfig.rsi.period);
      const emaOfRsi = IndicatorModule.calcEMA(rsi, indicatorConfig.emaRsi.period);
      const wmaOfRsi = IndicatorModule.calcWMA(rsi, indicatorConfig.wmaRsi.period);
      rsiSeries.setData(IndicatorModule.toSeriesData(candles, rsi));
      emaRsiSeries.setData(IndicatorModule.toSeriesData(candles, emaOfRsi));
      wmaRsiSeries.setData(IndicatorModule.toSeriesData(candles, wmaOfRsi));
    }

    function seriesForKey(key) {
      return { ema21: ema21Series, ema200: ema200Series, rsi: rsiSeries, emaRsi: emaRsiSeries, wmaRsi: wmaRsiSeries }[key];
    }

    function setIndicatorVisible(key, visible) {
      const cfg = indicatorConfig[key];
      const series = seriesForKey(key);
      if (!cfg || !series) return;
      cfg.enabled = visible;
      series.applyOptions({ visible });
    }

    function setIndicatorPeriod(key, period) {
      const cfg = indicatorConfig[key];
      if (!cfg || !period || period <= 0) return;
      cfg.period = period;
      renderIndicators(currentCandles);
    }

    function getIndicatorConfig() {
      return JSON.parse(JSON.stringify(indicatorConfig));
    }

    function setVolumeVisible(visible) {
      volumeVisible = visible;
      if (volumeSeries) volumeSeries.applyOptions({ visible });
    }

    function getVolumeVisible() {
      return volumeVisible;
    }

    function setHigherTFCandles(candles) {
      higherTFCandles = candles ? candles.slice() : [];
      runBreakout();
    }

    function upsertHigherTFCandle(candle) {
      const idx = higherTFCandles.findIndex((c) => c.time === candle.time);
      if (idx >= 0) higherTFCandles[idx] = candle;
      else higherTFCandles.push(candle);
      // Tick khung TREND không ảnh hưởng chỉ báo khung entry - chỉ cần chạy
      // lại breakout, và gộp theo khung hình như tick khung entry.
      scheduleRecompute(false);
    }

    function getHigherTFCandles() {
      return higherTFCandles.slice();
    }

    function setSLCandles(candles) {
      slCandles = candles ? candles.slice() : null;
      runBreakout();
    }

    function upsertSLCandle(candle) {
      if (!slCandles) slCandles = [];
      const idx = slCandles.findIndex((c) => c.time === candle.time);
      if (idx >= 0) slCandles[idx] = candle;
      else slCandles.push(candle);
      // Tick khung SL cũng chỉ ảnh hưởng breakout - gộp theo khung hình.
      scheduleRecompute(false);
    }

    function configureBreakout(options) {
      breakout.configure(options || {});
      runBreakout();
    }

    function getBreakoutConfig() {
      return breakout.getConfig();
    }

    // ===================== CẢNH BÁO GIÁ (đường ngang) =====================

    function clearAlertLines() {
      alertPriceLines.forEach((line) => {
        try {
          candleSeries.removePriceLine(line);
        } catch (err) {
          // Series có thể đã bị huỷ (destroy) - bỏ qua an toàn.
        }
      });
      alertPriceLines = [];
    }

    /** Vẽ lại toàn bộ đường cảnh báo giá CHƯA CHẠM của đúng symbol hiện tại của pane này. */
    function renderAlertLines() {
      clearAlertLines();
      const pane = Store.getPane(paneId);
      if (!pane || !candleSeries) return;

      AlertsModule.getAlertsForSymbol(pane.symbol).forEach((a) => {
        const line = candleSeries.createPriceLine({
          price: a.price,
          color: '#f5c518',
          lineWidth: 1,
          lineStyle: LightweightCharts.LineStyle.Dashed,
          axisLabelVisible: true,
          title: '🔔 Cảnh báo',
        });
        alertPriceLines.push(line);
      });
    }

    function loadInitialData(candles) {
      currentCandles = candles.slice();

      candleSeries.setData(
        candles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }))
      );
      volumeSeries.setData(
        candles.map((c) => ({
          time: c.time,
          value: c.volume,
          color: c.close >= c.open ? 'rgba(38,166,154,0.5)' : 'rgba(239,83,80,0.5)',
        }))
      );

      renderIndicators(currentCandles);
      runBreakout();
      renderAlertLines();
    }

    function clearData() {
      candleSeries.setData([]);
      volumeSeries.setData([]);
      ema21Series.setData([]);
      ema200Series.setData([]);
      rsiSeries.setData([]);
      emaRsiSeries.setData([]);
      wmaRsiSeries.setData([]);
      currentCandles = [];
      higherTFCandles = [];
      slCandles = null;
      resetHistoryFlags();
      runBreakout();
      // Không clearAlertLines() ở đây - loadInitialData() của symbol MỚI sẽ tự
      // gọi renderAlertLines() lại (lọc đúng theo symbol mới) ngay sau đó.
    }

    // ===================== TẢI THÊM LỊCH SỬ (kéo sang trái) - Phần 1 =====================

    function isLoadingOlder() {
      return loadingOlder;
    }

    function setLoadingOlder(v) {
      loadingOlder = !!v;
    }

    function isNoMoreOlder() {
      return noMoreOlder;
    }

    function setNoMoreOlder(v) {
      noMoreOlder = !!v;
    }

    function resetHistoryFlags() {
      loadingOlder = false;
      noMoreOlder = false;
    }

    function prependCandles(olderCandles) {
      if (!olderCandles || olderCandles.length === 0) return;

      const firstExistingTime = currentCandles.length ? currentCandles[0].time : Infinity;
      const filtered = olderCandles
        .filter((c) => c.time < firstExistingTime)
        .sort((a, b) => a.time - b.time);

      if (filtered.length === 0) return;

      currentCandles = filtered.concat(currentCandles);

      const timeScale = chart.timeScale();
      const beforeRange = timeScale.getVisibleLogicalRange();

      candleSeries.setData(
        currentCandles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }))
      );
      volumeSeries.setData(
        currentCandles.map((c) => ({
          time: c.time,
          value: c.volume,
          color: c.close >= c.open ? 'rgba(38,166,154,0.5)' : 'rgba(239,83,80,0.5)',
        }))
      );

      renderIndicators(currentCandles);
      runBreakout();

      if (beforeRange) {
        const addedCount = filtered.length;
        timeScale.setVisibleLogicalRange({
          from: beforeRange.from + addedCount,
          to: beforeRange.to + addedCount,
        });
      }
    }

    function destroy() {
      EventBus.off('kline:update', handleKlineUpdate);
      EventBus.off('alerts:changed', renderAlertLines);
      if (resizeObserver) resizeObserver.disconnect();
      // Huỷ rAF gộp tính lại đang chờ (nếu có) - tránh chạy renderIndicators/
      // runBreakout tham chiếu tới series/chart đã bị huỷ bên dưới.
      if (recomputeRafId !== null) {
        cancelAnimationFrame(recomputeRafId);
        recomputeRafId = null;
      }
      if (chart) chart.remove();
      chart = null;
    }

    return {
      initChart,
      loadInitialData,
      clearData,
      destroy,
      resize,
      setIndicatorVisible,
      setIndicatorPeriod,
      getIndicatorConfig,
      setVolumeVisible,
      getVolumeVisible,
      setHigherTFCandles,
      upsertHigherTFCandle,
      getHigherTFCandles,
      setSLCandles,
      upsertSLCandle,
      configureBreakout,
      getBreakoutConfig,
      isLoadingOlder,
      setLoadingOlder,
      isNoMoreOlder,
      setNoMoreOlder,
      prependCandles,
      getCandles: () => currentCandles.slice(),
      getBreakout: () => breakout,
      getDrawing: () => drawing,
    };
  }

  return { create, getHigherTimeframeFor, ENTRY_TO_HIGHER_TF };
})();