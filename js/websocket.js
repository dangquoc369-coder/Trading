/**
 * websocket.js
 * Quản lý kết nối WebSocket realtime tới Binance CHO TỪNG PANE độc lập.
 *
 * CẬP NHẬT (đợt fix trước): thêm 1 socket kline THỨ HAI cho mỗi pane, dùng
 * riêng để lấy nến realtime của KHUNG TREND lớn hơn (D1/H12/H4/H2) phục vụ
 * breakout.js bản cross-timeframe. Socket này phát ra event riêng
 * 'kline:update:htf' (thay vì 'kline:update' như socket khung entry) để
 * chart.js/app.js không nhầm lẫn 2 nguồn dữ liệu.
 *
 * CẬP NHẬT (đợt fix này): thêm 1 socket kline THỨ BA, dùng riêng cho khung
 * tính SL khi người dùng chọn slMode = 'custom' (vd vào lệnh M5 nhưng SL
 * tính ATR theo H1) - độc lập hoàn toàn với socket khung entry và khung
 * trend. Phát ra event 'kline:update:sl'. Chỉ được mở khi cần (app.js quản
 * lý việc mở/đóng theo cấu hình breakout của từng pane, xem loadSLData()/
 * teardownSLData() trong app.js).
 */

const WS_BASE = 'wss://stream.binance.com:9443/ws';

const connections = new Map();

function getOrCreateEntry(paneId) {
  if (!connections.has(paneId)) {
    connections.set(paneId, {
      klineSocket: null,
      tickerSocket: null,
      htfKlineSocket: null,
      slKlineSocket: null,
      intentionalClose: false,
      klineReconnectTimer: null,
      tickerReconnectTimer: null,
      htfReconnectTimer: null,
      slReconnectTimer: null,
    });
  }
  return connections.get(paneId);
}

function connectKlineStream(paneId, symbol, interval) {
  const entry = getOrCreateEntry(paneId);
  closeKlineSocket(paneId);

  const streamName = `${symbol.toLowerCase()}@kline_${interval}`;
  const socket = new WebSocket(`${WS_BASE}/${streamName}`);
  entry.klineSocket = socket;

  socket.onopen = () => {
    EventBus.emit('ws:status', { paneId, status: 'connected' });
  };

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    const k = msg.k;
    const candle = {
      time: Math.floor(k.t / 1000),
      open: parseFloat(k.o),
      high: parseFloat(k.h),
      low: parseFloat(k.l),
      close: parseFloat(k.c),
      volume: parseFloat(k.v),
      closed: k.x,
    };
    EventBus.emit('kline:update', { paneId, candle });
  };

  socket.onerror = () => {
    EventBus.emit('ws:status', { paneId, status: 'disconnected' });
  };

  socket.onclose = () => {
    if (entry.klineSocket !== socket) return;
    if (!entry.intentionalClose) {
      EventBus.emit('ws:status', { paneId, status: 'disconnected' });
      entry.klineReconnectTimer = setTimeout(() => {
        connectKlineStream(paneId, symbol, interval);
      }, 2000);
    }
  };
}

/**
 * Socket kline RIÊNG cho khung TREND lớn hơn (dùng để breakout vào lệnh ảo
 * trong breakout.js). Không đụng gì tới socket khung entry ở trên - độc lập
 * hoàn toàn, phát event khác ('kline:update:htf').
 */
function connectHigherTFKlineStream(paneId, symbol, interval) {
  const entry = getOrCreateEntry(paneId);
  closeHigherTFKlineSocket(paneId);

  const streamName = `${symbol.toLowerCase()}@kline_${interval}`;
  const socket = new WebSocket(`${WS_BASE}/${streamName}`);
  entry.htfKlineSocket = socket;

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    const k = msg.k;
    const candle = {
      time: Math.floor(k.t / 1000),
      open: parseFloat(k.o),
      high: parseFloat(k.h),
      low: parseFloat(k.l),
      close: parseFloat(k.c),
      volume: parseFloat(k.v),
      closed: k.x,
    };
    EventBus.emit('kline:update:htf', { paneId, candle });
  };

  socket.onclose = () => {
    if (entry.htfKlineSocket !== socket) return;
    if (!entry.intentionalClose) {
      entry.htfReconnectTimer = setTimeout(() => {
        connectHigherTFKlineStream(paneId, symbol, interval);
      }, 2000);
    }
  };
}

/**
 * Socket kline RIÊNG cho khung tính SL tuỳ chỉnh (slMode = 'custom') - vd
 * entry M5 nhưng SL tính ATR theo H1. Chỉ được app.js mở khi cần (xem
 * loadSLData() trong app.js), và đóng lại (closeSLKlineSocket) khi người
 * dùng đổi sang slMode khác hoặc đổi symbol/timeframe SL.
 */
function connectSLKlineStream(paneId, symbol, interval) {
  const entry = getOrCreateEntry(paneId);
  closeSLKlineSocket(paneId);

  const streamName = `${symbol.toLowerCase()}@kline_${interval}`;
  const socket = new WebSocket(`${WS_BASE}/${streamName}`);
  entry.slKlineSocket = socket;

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    const k = msg.k;
    const candle = {
      time: Math.floor(k.t / 1000),
      open: parseFloat(k.o),
      high: parseFloat(k.h),
      low: parseFloat(k.l),
      close: parseFloat(k.c),
      volume: parseFloat(k.v),
      closed: k.x,
    };
    EventBus.emit('kline:update:sl', { paneId, candle });
  };

  socket.onclose = () => {
    if (entry.slKlineSocket !== socket) return;
    if (!entry.intentionalClose) {
      entry.slReconnectTimer = setTimeout(() => {
        connectSLKlineStream(paneId, symbol, interval);
      }, 2000);
    }
  };
}

function connectTickerStream(paneId, symbol) {
  const entry = getOrCreateEntry(paneId);
  closeTickerSocket(paneId);

  const streamName = `${symbol.toLowerCase()}@ticker`;
  const socket = new WebSocket(`${WS_BASE}/${streamName}`);
  entry.tickerSocket = socket;

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    EventBus.emit('price:update', {
      paneId,
      price: parseFloat(msg.c),
      changePercent: parseFloat(msg.P),
    });
  };

  socket.onclose = () => {
    if (entry.tickerSocket !== socket) return;
    if (!entry.intentionalClose) {
      entry.tickerReconnectTimer = setTimeout(() => connectTickerStream(paneId, symbol), 2000);
    }
  };
}

function closeKlineSocket(paneId) {
  const entry = connections.get(paneId);
  if (!entry) return;
  clearTimeout(entry.klineReconnectTimer);
  if (entry.klineSocket) {
    entry.intentionalClose = true;
    entry.klineSocket.onclose = null;
    entry.klineSocket.close();
    entry.klineSocket = null;
    entry.intentionalClose = false;
  }
}

function closeHigherTFKlineSocket(paneId) {
  const entry = connections.get(paneId);
  if (!entry) return;
  clearTimeout(entry.htfReconnectTimer);
  if (entry.htfKlineSocket) {
    entry.intentionalClose = true;
    entry.htfKlineSocket.onclose = null;
    entry.htfKlineSocket.close();
    entry.htfKlineSocket = null;
    entry.intentionalClose = false;
  }
}

function closeSLKlineSocket(paneId) {
  const entry = connections.get(paneId);
  if (!entry) return;
  clearTimeout(entry.slReconnectTimer);
  if (entry.slKlineSocket) {
    entry.intentionalClose = true;
    entry.slKlineSocket.onclose = null;
    entry.slKlineSocket.close();
    entry.slKlineSocket = null;
    entry.intentionalClose = false;
  }
}

function closeTickerSocket(paneId) {
  const entry = connections.get(paneId);
  if (!entry) return;
  clearTimeout(entry.tickerReconnectTimer);
  if (entry.tickerSocket) {
    entry.intentionalClose = true;
    entry.tickerSocket.onclose = null;
    entry.tickerSocket.close();
    entry.tickerSocket = null;
    entry.intentionalClose = false;
  }
}

function closePaneSockets(paneId) {
  closeKlineSocket(paneId);
  closeHigherTFKlineSocket(paneId);
  closeSLKlineSocket(paneId);
  closeTickerSocket(paneId);
  connections.delete(paneId);
}

function closeAllSockets() {
  Array.from(connections.keys()).forEach(closePaneSockets);
}

function connectSockets(paneId, symbol, timeframe) {
  connectKlineStream(paneId, symbol, timeframe);
  connectTickerStream(paneId, symbol);
}