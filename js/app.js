/**
 * app.js
 * Entry point - khởi động app và điều phối luồng dữ liệu giữa các module.
 *
 * (Phần 1: tự động tải thêm lịch sử khi kéo sang trái - xem onNeedMoreHistory.)
 *
 * (Phần 2, CẢNH BÁO):
 *   - Khởi động NotificationsModule (đăng ký service worker + hiện banner
 *     xin quyền thông báo lần đầu nếu chưa quyết định).
 *   - Lắng nghe 'pane:priceChanged' (do Store.setPaneLastPrice bắn ra) ->
 *     gọi AlertsModule.checkPrice(symbol, price) để phát hiện lúc giá vượt
 *     qua mức cảnh báo đã đặt.
 *   - Lắng nghe 'pane:newSignal' (bắn ra từ chart.js khi breakout.js phát
 *     hiện tín hiệu BUY/SELL MỚI) -> nếu pane đó đã bật signalAlertEnabled,
 *     gửi thông báo hệ thống dạng "M5 vào lệnh BUY" (ví dụ).
 *
 * ĐỢT FIX NÀY (SỬA LỖI CẢNH BÁO GIÁ KHÔNG HOẠT ĐỘNG):
 *   - websocket.js phát ra sự kiện 'price:update' mỗi khi có giá ticker mới
 *     (realtime), nhưng TRƯỚC ĐÂY không có nơi nào trong app lắng nghe sự
 *     kiện này -> Store chỉ có giá tại thời điểm tải trang (qua
 *     loadInitialPrice() gọi 1 lần REST API), rồi bị "đóng băng" mãi mãi.
 *     Hệ quả: AlertsModule.checkPrice() không bao giờ được gọi lại với giá
 *     MỚI -> cảnh báo giá gần như không bao giờ kích hoạt.
 *   - Thêm onTickerPriceUpdate(): nối 'price:update' -> Store.setPaneLastPrice(),
 *     việc này sẽ tự động bắn tiếp 'pane:priceChanged' (Store đã có sẵn logic
 *     này) -> vừa cập nhật UI giá vừa cho AlertsModule kiểm tra cảnh báo với
 *     giá thật, theo thời gian thực.
 */

(async function App() {
  const KLINES_LIMIT = 1000;

  const paneInstances = {}; // paneId -> ChartModule instance

  window.PaneRegistry = {
    get(paneId) {
      return paneInstances[paneId];
    },
  };

  try {
    await init();
  } catch (err) {
    console.error('Lỗi khởi động app:', err);
  }

  async function init() {
    UI.init();
    CountdownModule.init();
    NotificationsModule.init();

    const state = Store.getState();

    for (const pane of state.panes) {
      await setupPane(pane.id);
    }

    EventBus.on('pane:symbolChanged', onPaneSymbolOrTimeframeChanged);
    EventBus.on('pane:timeframeChanged', onPaneSymbolOrTimeframeChanged);
    EventBus.on('kline:update:htf', onHigherTFKlineUpdate);
    EventBus.on('kline:update:sl', onSLKlineUpdate);
    EventBus.on('pane:breakoutConfigChanged', onBreakoutConfigChanged);
    EventBus.on('layout:changed', onLayoutChanged);
    EventBus.on('pane:needMoreHistory', onNeedMoreHistory);

    // Kiểm tra cảnh báo giá mỗi khi có giá mới của bất kỳ pane nào.
    EventBus.on('pane:priceChanged', onPricePotentiallyAlertable);

    // ĐỢT FIX NÀY: đồng bộ giá ticker realtime từ WebSocket (websocket.js)
    // vào Store. Thiếu dòng này là lý do chính khiến cảnh báo giá "không
    // chạy" - Store không có giá mới nên không ai kiểm tra được.
    EventBus.on('price:update', onTickerPriceUpdate);

    // Gửi thông báo hệ thống khi có tín hiệu BUY/SELL mới ở pane đã bật cảnh báo.
    EventBus.on('pane:newSignal', onPaneNewSignal);

    UI.renderSharedDrawGroup();
  }

  function onLayoutChanged({ visiblePaneIds }) {
    let attempts = 0;

    function tryResize() {
      attempts++;
      let allReady = true;

      visiblePaneIds.forEach((paneId) => {
        const instance = paneInstances[paneId];
        if (!instance) return;
        instance.resize();

        const container = document.getElementById(`${paneId}-container`);
        if (!container || container.clientWidth === 0 || container.clientHeight === 0) {
          allReady = false;
        }
      });

      if (!allReady && attempts < 10) {
        requestAnimationFrame(tryResize);
      }
    }

    requestAnimationFrame(() => requestAnimationFrame(tryResize));
  }

  async function setupPane(paneId) {
    const container = document.getElementById(`${paneId}-container`);
    if (!container) {
      console.error(`Không tìm thấy container cho ${paneId}`);
      return;
    }

    const instance = ChartModule.create(paneId);
    instance.initChart(container);
    paneInstances[paneId] = instance;
    IndicatorLegend.render(paneId, instance);

    const pane = Store.getPane(paneId);
    await loadPaneData(paneId, instance, pane.symbol, pane.timeframe);
    connectSockets(paneId, pane.symbol, pane.timeframe);
    await loadInitialPrice(paneId, pane.symbol);
    await loadHigherTFData(paneId, instance, pane.symbol, pane.timeframe);
    await syncBreakoutConfig(paneId, instance, pane);
  }

  async function onPaneSymbolOrTimeframeChanged({ paneId }) {
    const instance = paneInstances[paneId];
    const pane = Store.getPane(paneId);
    if (!instance || !pane) return;

    closePaneSockets(paneId);
    instance.clearData();

    try {
      await loadPaneData(paneId, instance, pane.symbol, pane.timeframe);
    } catch (err) {
      console.error(`[${paneId}] Lỗi khi tải dữ liệu:`, err);
    }

    connectSockets(paneId, pane.symbol, pane.timeframe);
    await loadInitialPrice(paneId, pane.symbol);
    await loadHigherTFData(paneId, instance, pane.symbol, pane.timeframe);
    await syncBreakoutConfig(paneId, instance, pane);
  }

  async function loadPaneData(paneId, instance, symbol, timeframe) {
    const candles = await fetchKlines(symbol, timeframe, KLINES_LIMIT);
    Store.setPaneCandles(paneId, candles);
    instance.loadInitialData(candles);
  }

  async function onNeedMoreHistory({ paneId }) {
    const instance = paneInstances[paneId];
    const pane = Store.getPane(paneId);
    if (!instance || !pane) return;
    if (instance.isLoadingOlder() || instance.isNoMoreOlder()) return;

    const existingCandles = instance.getCandles();
    const oldest = existingCandles[0];
    if (!oldest) return;

    instance.setLoadingOlder(true);
    const statusEl = document.getElementById(`${paneId}-status`);
    const previousStatusText = statusEl ? statusEl.textContent : null;
    if (statusEl) statusEl.textContent = 'Đang tải thêm dữ liệu cũ...';

    try {
      const endTime = oldest.time * 1000 - 1;
      const older = await fetchKlines(pane.symbol, pane.timeframe, KLINES_LIMIT, endTime);

      if (!older || older.length === 0) {
        instance.setNoMoreOlder(true);
      } else {
        instance.prependCandles(older);
        Store.setPaneCandles(paneId, instance.getCandles());
        if (older.length < KLINES_LIMIT) {
          instance.setNoMoreOlder(true);
        }
      }
    } catch (err) {
      console.error(`[${paneId}] Lỗi khi tải thêm nến cũ:`, err);
    } finally {
      instance.setLoadingOlder(false);
      if (statusEl) statusEl.textContent = previousStatusText || '';
    }
  }

  async function loadHigherTFData(paneId, instance, symbol, timeframe) {
    const higherTF = ChartModule.getHigherTimeframeFor(timeframe);

    if (!higherTF) {
      instance.setHigherTFCandles([]);
      return;
    }

    try {
      const candles = await fetchKlines(symbol, higherTF, KLINES_LIMIT);
      instance.setHigherTFCandles(candles);
    } catch (err) {
      console.error(`[${paneId}] Lỗi khi tải nến khung trend (${higherTF}):`, err);
    }

    connectHigherTFKlineStream(paneId, symbol, higherTF);
  }

  function onHigherTFKlineUpdate({ paneId, candle }) {
    const instance = paneInstances[paneId];
    if (!instance) return;
    instance.upsertHigherTFCandle(candle);
  }

  async function loadSLData(paneId, instance, symbol, slTimeframe) {
    try {
      const candles = await fetchKlines(symbol, slTimeframe, KLINES_LIMIT);
      instance.setSLCandles(candles);
    } catch (err) {
      console.error(`[${paneId}] Lỗi khi tải nến khung SL (${slTimeframe}):`, err);
    }
    connectSLKlineStream(paneId, symbol, slTimeframe);
  }

  function teardownSLData(paneId, instance) {
    closeSLKlineSocket(paneId);
    instance.setSLCandles(null);
  }

  function onSLKlineUpdate({ paneId, candle }) {
    const instance = paneInstances[paneId];
    if (!instance) return;
    instance.upsertSLCandle(candle);
  }

  async function syncBreakoutConfig(paneId, instance, pane) {
    instance.configureBreakout({
      slSource: pane.slMode,
      lookbackCandles: pane.breakoutLookback,
    });

    if (pane.slMode === 'custom' && pane.slTimeframe) {
      await loadSLData(paneId, instance, pane.symbol, pane.slTimeframe);
    } else {
      teardownSLData(paneId, instance);
    }
  }

  async function onBreakoutConfigChanged({ paneId }) {
    const instance = paneInstances[paneId];
    const pane = Store.getPane(paneId);
    if (!instance || !pane) return;
    await syncBreakoutConfig(paneId, instance, pane);
  }

  async function loadInitialPrice(paneId, symbol) {
    try {
      const { lastPrice, changePercent } = await fetch24hTicker(symbol);
      Store.setPaneLastPrice(paneId, lastPrice, changePercent);
    } catch (err) {
      console.error(`[${paneId}] Lỗi khi tải giá ban đầu:`, err);
    }
  }

  /**
   * Mỗi khi 1 pane có giá mới (đã được ghi vào Store - xem
   * onTickerPriceUpdate bên dưới, hoặc lúc tải giá ban đầu), kiểm tra xem
   * giá đó có vừa vượt qua mức cảnh báo nào của đúng symbol đó không.
   */
  function onPricePotentiallyAlertable({ paneId, price }) {
    const pane = Store.getPane(paneId);
    if (!pane || price === null || price === undefined) return;
    AlertsModule.checkPrice(pane.symbol, price);
  }

  /**
   * ĐỢT FIX NÀY: nhận giá ticker REALTIME từ websocket.js (sự kiện
   * 'price:update', bắn ra từ connectTickerStream() mỗi khi có tick giá
   * mới) và ghi vào Store. Store.setPaneLastPrice() sẽ tự bắn tiếp
   * 'pane:priceChanged' -> vừa cập nhật UI giá (ui.js đã lắng nghe sẵn) vừa
   * kích hoạt kiểm tra cảnh báo giá (onPricePotentiallyAlertable ở trên).
   *
   * Đây chính là mắt xích còn thiếu khiến cảnh báo giá "đặt xong nhưng
   * không bao giờ kêu": trước đây Store chỉ có giá tại thời điểm tải trang.
   */
  function onTickerPriceUpdate({ paneId, price, changePercent }) {
    Store.setPaneLastPrice(paneId, price, changePercent);
  }

  /**
   * Breakout.js (qua chart.js) vừa phát hiện 1 tín hiệu BUY/SELL MỚI ở 1
   * pane. Chỉ gửi thông báo nếu pane đó đã bật signalAlertEnabled. Nội dung
   * thông báo nêu rõ khung thời gian + hướng lệnh, vd: "M5 vào lệnh BUY".
   */
  function onPaneNewSignal({ paneId, direction }) {
    const pane = Store.getPane(paneId);
    if (!pane || !pane.signalAlertEnabled) return;

    const tfLabel = (TIMEFRAMES.find((t) => t.value === pane.timeframe) || {}).label || pane.timeframe;
    const dirLabel = direction === 1 ? 'BUY' : 'SELL';

    NotificationsModule.notify(
      `📊 ${pane.symbol} (${tfLabel})`,
      `${tfLabel} vào lệnh ${dirLabel}`
    );
  }
})();