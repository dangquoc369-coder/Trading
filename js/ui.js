/**
 * ui.js
 * Render sidebar (danh sách symbol + tìm kiếm) - DÙNG CHUNG cho cả 4 pane,
 * nhưng khi chọn 1 symbol thì áp dụng cho PANE ĐANG FOCUS (activePaneId).
 *
 * CẬP NHẬT (đợt fix này): thêm công cụ 🔔 "Đặt cảnh báo giá" vào thanh công
 * cụ vẽ dùng chung (DRAW_TOOLS) - hoạt động y hệt các tool vẽ khác (cursor,
 * hline, trendline, rectangle), chỉ khác là khi chọn tool này rồi click lên
 * chart sẽ tạo 1 cảnh báo giá (xem drawing.js/chart.js/alerts.js) thay vì vẽ
 * hình. Không cần sửa gì thêm trong renderSharedDrawGroup() vì logic hiện
 * tại đã tổng quát cho mọi tool trong DRAW_TOOLS.
 */

const UI = (function () {
  let searchDebounceTimer = null;

  const DRAW_TOOLS = [
    { id: 'cursor', label: '↖', title: 'Con trỏ' },
    { id: 'hline', label: '—', title: 'Đường ngang' },
    { id: 'trendline', label: '/', title: 'Đường xu hướng' },
    { id: 'rectangle', label: '▭', title: 'Hình chữ nhật' },
    { id: 'alert', label: '🔔', title: 'Đặt cảnh báo giá (click lên chart)' },
    { id: 'clear', label: '🗑', title: 'Xoá tất cả hình vẽ (ô đang chọn)' },
  ];

  function init() {
    renderPopularSymbols();
    renderLayoutButtons();
    renderSharedTimeframeGroup();
    renderSharedDrawGroup();
    bindSymbolSearch();
    bindPaneFocusClicks();
    bindPaneHeaderTexts();
    bindPriceUpdates();
    bindConnectionStatus();
    bindPaneFocusedEvent();
    bindLayoutChangedEvent();
    bindOrientationChangedEvent();

    LayoutModule.initOrientationWatcher();
    LayoutModule.render();
    highlightActivePaneBorder(Store.getState().activePaneId);
  }

  /* ===================== SIDEBAR: DANH SÁCH SYMBOL ===================== */

  function renderPopularSymbols() {
    const state = Store.getState();
    const activeSymbol = Store.getActivePane().symbol;
    const listEl = document.getElementById('symbolList');
    listEl.innerHTML = '';

    state.popularSymbols.forEach((symbol) => {
      const li = document.createElement('li');
      li.dataset.symbol = symbol;
      li.className = symbol === activeSymbol ? 'active' : '';
      li.innerHTML = `
        <span class="sym-name">${symbol}</span>
        <span class="sym-price" data-symbol-price="${symbol}">--</span>
      `;
      li.addEventListener('click', () => selectSymbol(symbol));
      listEl.appendChild(li);
    });
  }

  function selectSymbol(symbol) {
    document.getElementById('symbolSearchResults').classList.add('hidden');
    document.getElementById('symbolSearchInput').value = '';
    const paneId = Store.getState().activePaneId;
    Store.setPaneSymbol(paneId, symbol);
  }

  function bindSymbolSearch() {
    const input = document.getElementById('symbolSearchInput');
    const resultsEl = document.getElementById('symbolSearchResults');

    input.addEventListener('input', () => {
      clearTimeout(searchDebounceTimer);
      const query = input.value.trim().toUpperCase();

      if (!query) {
        resultsEl.classList.add('hidden');
        return;
      }

      searchDebounceTimer = setTimeout(async () => {
        const matches = await searchSymbols(query);
        renderSearchResults(matches, resultsEl);
      }, 250);
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.symbol-search')) {
        resultsEl.classList.add('hidden');
      }
    });
  }

  async function searchSymbols(query) {
    const state = Store.getState();
    if (state.allSymbols.length === 0) {
      try {
        const all = await fetchAllSymbols();
        Store.setAllSymbols(all);
      } catch (err) {
        console.error('Không tải được danh sách symbol:', err);
        return [];
      }
    }
    return Store.getState()
      .allSymbols.filter((s) => s.includes(query))
      .slice(0, 20);
  }

  function renderSearchResults(matches, resultsEl) {
    if (matches.length === 0) {
      resultsEl.innerHTML = '<div class="symbol-search-item">Không tìm thấy</div>';
    } else {
      resultsEl.innerHTML = matches
        .map((s) => `<div class="symbol-search-item" data-symbol="${s}">${s}</div>`)
        .join('');
      resultsEl.querySelectorAll('.symbol-search-item[data-symbol]').forEach((el) => {
        el.addEventListener('click', () => selectSymbol(el.dataset.symbol));
      });
    }
    resultsEl.classList.remove('hidden');
  }

  /* ===================== HÀNG TIMEFRAME DÙNG CHUNG ===================== */

  function renderSharedTimeframeGroup() {
    const groupEl = document.getElementById('sharedTimeframeGroup');
    if (!groupEl) return;
    const activePane = Store.getActivePane();
    groupEl.innerHTML = '';

    TIMEFRAMES.forEach((tf) => {
      const btn = document.createElement('button');
      btn.className = 'timeframe-btn' + (tf.value === activePane.timeframe ? ' active' : '');
      btn.textContent = tf.label;
      btn.addEventListener('click', () => {
        Store.setPaneTimeframe(Store.getState().activePaneId, tf.value);
      });
      groupEl.appendChild(btn);
    });
  }

  /* ===================== HÀNG CÔNG CỤ VẼ DÙNG CHUNG ===================== */

  function renderSharedDrawGroup() {
    const groupEl = document.getElementById('sharedDrawGroup');
    if (!groupEl) return;
    groupEl.innerHTML = '';

    const activePaneId = Store.getState().activePaneId;
    const instance = window.PaneRegistry && window.PaneRegistry.get(activePaneId);
    const activeTool = instance ? instance.getDrawing().getTool() : 'cursor';

    DRAW_TOOLS.forEach((t) => {
      const btn = document.createElement('button');
      btn.className = 'draw-tool-btn' + (t.id === activeTool && t.id !== 'clear' ? ' active' : '');
      btn.textContent = t.label;
      btn.title = t.title;
      btn.addEventListener('click', () => {
        const inst = window.PaneRegistry && window.PaneRegistry.get(Store.getState().activePaneId);
        if (!inst) return;
        const drawing = inst.getDrawing();
        if (t.id === 'clear') {
          drawing.clearAll();
          return;
        }
        drawing.setTool(t.id);
        renderSharedDrawGroup();
      });
      groupEl.appendChild(btn);
    });
  }

  /* ===================== LAYOUT (1/2/3/4 Ô) ===================== */

  function renderLayoutButtons() {
    const groupEl = document.getElementById('layoutGroup');
    if (!groupEl) return;
    groupEl.innerHTML = '';

    const orientation = Store.getState().orientation;
    const labels = { '1': '1 ô', '2': '2 ô', '3': '3 ô', '4': '4 ô' };

    LayoutModule.getAvailableLayouts(orientation).forEach((n) => {
      const btn = document.createElement('button');
      btn.className = 'timeframe-btn' + (n === Store.getState().layout ? ' active' : '');
      btn.dataset.layout = n;
      btn.textContent = labels[n];
      btn.addEventListener('click', () => Store.setLayout(n));
      groupEl.appendChild(btn);
    });
  }

  function highlightActiveLayoutButton(layout) {
    const groupEl = document.getElementById('layoutGroup');
    if (!groupEl) return;
    groupEl.querySelectorAll('button').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.layout === String(layout));
    });
  }

  function bindLayoutChangedEvent() {
    EventBus.on('layout:changed', ({ layout }) => highlightActiveLayoutButton(layout));
  }

  function bindOrientationChangedEvent() {
    EventBus.on('orientation:changed', () => renderLayoutButtons());
  }

  /* ===================== FOCUS / HEADER PANE ===================== */

  function bindPaneFocusClicks() {
    Store.getState().panes.forEach((pane) => {
      const el = document.getElementById(pane.id);
      if (!el) return;
      el.addEventListener('click', () => Store.setActivePane(pane.id));
    });
  }

  function highlightActivePaneBorder(activePaneId) {
    Store.getState().panes.forEach((pane) => {
      const el = document.getElementById(pane.id);
      if (el) el.classList.toggle('pane-focused', pane.id === activePaneId);
    });
  }

  function bindPaneFocusedEvent() {
    EventBus.on('pane:focused', ({ paneId }) => {
      highlightActivePaneBorder(paneId);
      renderPopularSymbols();
      renderSharedTimeframeGroup();
      renderSharedDrawGroup();
    });
  }

  function bindPaneHeaderTexts() {
    Store.getState().panes.forEach((pane) => updatePaneSymbolText(pane.id, pane.symbol));

    EventBus.on('pane:symbolChanged', ({ paneId, symbol }) => {
      updatePaneSymbolText(paneId, symbol);
      if (paneId === Store.getState().activePaneId) renderPopularSymbols();
    });

    EventBus.on('pane:timeframeChanged', ({ paneId }) => {
      if (paneId === Store.getState().activePaneId) renderSharedTimeframeGroup();
    });
  }

  function updatePaneSymbolText(paneId, symbol) {
    const el = document.getElementById(`${paneId}-symbol`);
    if (el) el.textContent = symbol;
  }

  /* ===================== GIÁ / TRẠNG THÁI KẾT NỐI ===================== */

  function bindPriceUpdates() {
    EventBus.on('pane:priceChanged', ({ paneId, price, changePercent }) => {
      updatePanePriceUI(paneId, price, changePercent);
    });
  }

  function updatePanePriceUI(paneId, price, changePercent) {
    const pane = Store.getPane(paneId);
    if (!pane) return;

    const priceEl = document.getElementById(`${paneId}-price`);
    const changeEl = document.getElementById(`${paneId}-change`);
    if (priceEl) priceEl.textContent = formatPrice(price);

    if (changeEl && changePercent !== undefined && changePercent !== null) {
      changeEl.textContent = formatPercent(changePercent);
      changeEl.className = 'change ' + (changePercent >= 0 ? 'up' : 'down');
    }

    const sidebarPriceEl = document.querySelector(`[data-symbol-price="${pane.symbol}"]`);
    if (sidebarPriceEl) {
      sidebarPriceEl.textContent = formatPrice(price);
      sidebarPriceEl.className = 'sym-price ' + (changePercent >= 0 ? 'up' : changePercent < 0 ? 'down' : '');
    }
  }

  function bindConnectionStatus() {
    EventBus.on('ws:status', ({ paneId, status }) => {
      const el = document.getElementById(`${paneId}-status`);
      if (!el) return;
      el.className = 'connection-status ' + status;
      el.textContent =
        status === 'connected' ? 'Đã kết nối' : status === 'disconnected' ? 'Mất kết nối...' : 'Đang kết nối...';
    });
  }

  return { init, renderSharedDrawGroup, renderSharedTimeframeGroup };
})();