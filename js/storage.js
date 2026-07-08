/**
 * storage.js
 * State trung tâm (single source of truth) cho toàn bộ app.
 *
 * `state.panes` - mảng tối đa 4 pane, MỖI pane có symbol/timeframe/candles
 * ĐỘC LẬP hoàn toàn với nhau. Pane id CỐ ĐỊNH là 'pane-1'..'pane-4' (khớp với
 * 4 container cố định trong index.html).
 *
 * CẬP NHẬT (đợt fix trước) - cấu hình BUY/SELL (breakout) riêng từng pane:
 *   - breakoutLookback, slMode, slTimeframe (xem giải thích chi tiết trong
 *     bản gốc, không đổi).
 *
 * CẬP NHẬT (đợt fix này) - CẢNH BÁO TÍN HIỆU BUY/SELL:
 *   - Thêm field `signalAlertEnabled` (mặc định false) cho mỗi pane - bật/tắt
 *     qua checkbox trong popover cài đặt breakout (xem indicator-legend.js).
 *     Khi bật, app.js sẽ gửi thông báo hệ thống mỗi khi breakout.js phát
 *     hiện tín hiệu BUY/SELL MỚI ở pane đó (xem 'pane:newSignal' trong
 *     app.js/breakout.js).
 *   - setPaneSignalAlertEnabled(paneId, enabled) để cập nhật field này.
 */

const Store = (function () {
  const DEFAULT_PANE_CONFIG = [
    { id: 'pane-1', symbol: 'BTCUSDT', timeframe: '15m' },
    { id: 'pane-2', symbol: 'ETHUSDT', timeframe: '1h' },
    { id: 'pane-3', symbol: 'BNBUSDT', timeframe: '4h' },
    { id: 'pane-4', symbol: 'SOLUSDT', timeframe: '1d' },
  ];

  function makePane(cfg) {
    return {
      id: cfg.id,
      symbol: cfg.symbol,
      timeframe: cfg.timeframe,
      candles: [],
      lastPrice: null,
      priceChangePercent: null,
      // Cấu hình breakout/SL riêng của pane này
      breakoutLookback: 2,
      slMode: 'entry', // 'entry' | 'higher' | 'custom'
      slTimeframe: null, // vd '1h' - chỉ dùng khi slMode === 'custom'
      // Cảnh báo tín hiệu BUY/SELL riêng của pane này (đợt fix này)
      signalAlertEnabled: false,
    };
  }

  // Danh sách pane hiển thị theo từng layout id.
  const LAYOUT_PANES = {
    '1': (activeId) => [activeId],
    '2': () => ['pane-1', 'pane-2'],
    '3': () => ['pane-1', 'pane-2', 'pane-3'],
    '4': () => ['pane-1', 'pane-2', 'pane-3', 'pane-4'],
  };

  const state = {
    panes: DEFAULT_PANE_CONFIG.map(makePane),
    activePaneId: 'pane-1',
    layout: '1',
    orientation: 'landscape',
    layoutRatios: {},
    popularSymbols: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT'],
    allSymbols: [],
  };

  function getState() {
    return state;
  }

  function getPane(paneId) {
    return state.panes.find((p) => p.id === paneId) || null;
  }

  function getActivePane() {
    return getPane(state.activePaneId);
  }

  function getVisiblePaneIds() {
    const fn = LAYOUT_PANES[state.layout] || LAYOUT_PANES['1'];
    return fn(state.activePaneId);
  }

  function maxPanesForOrientation(orientation) {
    return orientation === 'portrait' ? 3 : 4;
  }

  function setActivePane(paneId) {
    if (!getPane(paneId) || state.activePaneId === paneId) return;
    state.activePaneId = paneId;
    EventBus.emit('pane:focused', { paneId });
    if (state.layout === '1') {
      EventBus.emit('layout:changed', {
        layout: state.layout,
        visiblePaneIds: getVisiblePaneIds(),
        orientation: state.orientation,
      });
    }
  }

  function setLayout(layout) {
    layout = String(layout);
    if (!LAYOUT_PANES[layout]) return;
    const max = maxPanesForOrientation(state.orientation);
    if (Number(layout) > max) layout = String(max);
    if (state.layout === layout) return;
    state.layout = layout;
    let visible = getVisiblePaneIds();
    if (!visible.includes(state.activePaneId)) {
      state.activePaneId = visible[0];
      EventBus.emit('pane:focused', { paneId: state.activePaneId });
      visible = getVisiblePaneIds();
    }
    EventBus.emit('layout:changed', { layout, visiblePaneIds: visible, orientation: state.orientation });
  }

  function setOrientation(orientation) {
    if (state.orientation === orientation) return;
    state.orientation = orientation;

    const max = maxPanesForOrientation(orientation);
    if (Number(state.layout) > max) {
      state.layout = String(max);
    }

    let visible = getVisiblePaneIds();
    if (!visible.includes(state.activePaneId)) {
      state.activePaneId = visible[0];
    }

    EventBus.emit('orientation:changed', { orientation });
    EventBus.emit('layout:changed', {
      layout: state.layout,
      visiblePaneIds: getVisiblePaneIds(),
      orientation: state.orientation,
    });
  }

  function getLayoutRatioKey(layout, orientation) {
    return `${layout}-${orientation}`;
  }

  function getLayoutRatios(layout, orientation) {
    return state.layoutRatios[getLayoutRatioKey(layout, orientation)] || null;
  }

  function setLayoutRatios(layout, orientation, ratios) {
    state.layoutRatios[getLayoutRatioKey(layout, orientation)] = ratios;
  }

  function setPaneSymbol(paneId, symbol) {
    const pane = getPane(paneId);
    if (!pane || pane.symbol === symbol) return;
    pane.symbol = symbol;
    pane.candles = [];
    pane.lastPrice = null;
    pane.priceChangePercent = null;
    EventBus.emit('pane:symbolChanged', { paneId, symbol });
  }

  function setPaneTimeframe(paneId, timeframe) {
    const pane = getPane(paneId);
    if (!pane || pane.timeframe === timeframe) return;
    pane.timeframe = timeframe;
    pane.candles = [];
    EventBus.emit('pane:timeframeChanged', { paneId, timeframe });
  }

  function setPaneCandles(paneId, candles) {
    const pane = getPane(paneId);
    if (!pane) return;
    pane.candles = candles;
    EventBus.emit('pane:candlesLoaded', { paneId, candles });
  }

  function upsertPaneCandle(paneId, candle) {
    const pane = getPane(paneId);
    if (!pane) return;
    const candles = pane.candles;
    const last = candles[candles.length - 1];
    if (last && last.time === candle.time) {
      candles[candles.length - 1] = candle;
    } else if (!last || candle.time > last.time) {
      candles.push(candle);
    }
  }

  function setPaneLastPrice(paneId, price, changePercent) {
    const pane = getPane(paneId);
    if (!pane) return;
    pane.lastPrice = price;
    if (changePercent !== undefined) pane.priceChangePercent = changePercent;
    EventBus.emit('pane:priceChanged', { paneId, price, changePercent: pane.priceChangePercent });
  }

  function setAllSymbols(list) {
    state.allSymbols = list;
  }

  function setPaneBreakoutConfig(paneId, config) {
    const pane = getPane(paneId);
    if (!pane) return;
    if (config.lookbackCandles !== undefined) pane.breakoutLookback = config.lookbackCandles;
    if (config.slMode !== undefined) pane.slMode = config.slMode;
    if (config.slTimeframe !== undefined) pane.slTimeframe = config.slTimeframe;

    EventBus.emit('pane:breakoutConfigChanged', {
      paneId,
      breakoutLookback: pane.breakoutLookback,
      slMode: pane.slMode,
      slTimeframe: pane.slTimeframe,
    });
  }

  function getPaneBreakoutConfig(paneId) {
    const pane = getPane(paneId);
    if (!pane) return null;
    return {
      lookbackCandles: pane.breakoutLookback,
      slMode: pane.slMode,
      slTimeframe: pane.slTimeframe,
    };
  }

  /** Bật/tắt thông báo tín hiệu BUY/SELL của 1 pane (đợt fix này). */
  function setPaneSignalAlertEnabled(paneId, enabled) {
    const pane = getPane(paneId);
    if (!pane) return;
    pane.signalAlertEnabled = !!enabled;
  }

  return {
    getState,
    getPane,
    getActivePane,
    getVisiblePaneIds,
    maxPanesForOrientation,
    setActivePane,
    setLayout,
    setOrientation,
    getLayoutRatios,
    setLayoutRatios,
    setPaneSymbol,
    setPaneTimeframe,
    setPaneCandles,
    upsertPaneCandle,
    setPaneLastPrice,
    setAllSymbols,
    setPaneBreakoutConfig,
    getPaneBreakoutConfig,
    setPaneSignalAlertEnabled,
  };
})();