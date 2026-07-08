/**
 * alerts.js
 * Quản lý CẢNH BÁO GIÁ (kiểu TradingView):
 *   - Người dùng chọn công cụ 🔔 trong thanh vẽ dùng chung, click lên chart
 *     đang focus -> tạo 1 cảnh báo tại mức giá đó (xem drawing.js/chart.js).
 *   - Cảnh báo được lưu theo SYMBOL (không theo pane cụ thể) và lưu vào
 *     localStorage để không mất khi tải lại trang - đồng thời tự vẽ đường
 *     ngang màu vàng trên MỌI pane đang hiển thị đúng symbol đó.
 *   - checkPrice(symbol, price) được app.js gọi mỗi khi có giá mới (từ
 *     ticker socket) để phát hiện lúc giá VỪA vượt qua mức cảnh báo (so giá
 *     trước và giá hiện tại), rồi bắn thông báo + đánh dấu "đã chạm".
 *
 * Module này KHÔNG đụng vào DOM chart trực tiếp (đó là việc của chart.js) -
 * chỉ quản lý dữ liệu + UI bảng danh sách cảnh báo riêng của nó, và bắn sự
 * kiện 'alerts:changed' để các nơi khác (chart.js) tự vẽ lại.
 */

const AlertsModule = (function () {
  const STORAGE_KEY = 'dq_tracker_price_alerts_v1';

  let alerts = load();
  let panelEl = null;
  const lastPriceForSymbol = {};

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.error('Lỗi khi đọc cảnh báo đã lưu:', err);
      return [];
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
    } catch (err) {
      console.error('Lỗi khi lưu cảnh báo:', err);
    }
  }

  /** Tạo 1 cảnh báo giá mới cho 1 symbol. */
  function addPriceAlert(symbol, price) {
    const alert = {
      id: uid('alert'),
      symbol,
      price,
      triggered: false,
      createdAt: Date.now(),
    };
    alerts.push(alert);
    persist();
    EventBus.emit('alerts:changed', {});
    renderPanel();
    return alert;
  }

  function removeAlert(id) {
    alerts = alerts.filter((a) => a.id !== id);
    persist();
    EventBus.emit('alerts:changed', {});
    renderPanel();
  }

  /** Danh sách cảnh báo CHƯA chạm của 1 symbol - dùng để vẽ đường ngang trên chart. */
  function getAlertsForSymbol(symbol) {
    return alerts.filter((a) => a.symbol === symbol && !a.triggered);
  }

  function getAllAlerts() {
    return alerts.slice();
  }

  /**
   * Kiểm tra giá mới nhất của 1 symbol so với các cảnh báo đang chờ.
   * Dùng cách so giá TRƯỚC và giá HIỆN TẠI để phát hiện đúng lúc giá "vượt
   * qua" mức cảnh báo (thay vì chỉ so giá hiện tại >= hoặc <= mức, vì cách
   * đó sẽ báo liên tục mỗi tick sau khi đã qua mức).
   */
  function checkPrice(symbol, price) {
    const prev = lastPriceForSymbol[symbol];
    lastPriceForSymbol[symbol] = price;
    if (prev === undefined || price === null || price === undefined || Number.isNaN(price)) return;

    let changed = false;
    alerts.forEach((a) => {
      if (a.triggered || a.symbol !== symbol) return;
      const crossedUp = prev < a.price && price >= a.price;
      const crossedDown = prev > a.price && price <= a.price;
      if (crossedUp || crossedDown) {
        a.triggered = true;
        changed = true;
        NotificationsModule.notify('🔔 Cảnh báo giá', `${symbol} đã chạm mức ${formatPrice(a.price)}`);
      }
    });

    if (changed) {
      persist();
      EventBus.emit('alerts:changed', {});
      renderPanel();
    }
  }

  /* ===================== UI: NÚT + BẢNG DANH SÁCH ===================== */

  function buildButton() {
    const btn = document.createElement('button');
    btn.id = 'alertsListBtn';
    btn.type = 'button';
    btn.textContent = '🔔 Cảnh báo';
    btn.addEventListener('click', () => {
      if (panelEl.classList.contains('open')) {
        panelEl.classList.remove('open');
      } else {
        renderPanel();
        panelEl.classList.add('open');
      }
    });
    return btn;
  }

  function buildPanel() {
    const panel = document.createElement('div');
    panel.id = 'alertsListPanel';
    panel.innerHTML = `
      <div class="ms-header">
        <span>🔔 Danh sách cảnh báo giá</span>
        <span class="ms-close">✕</span>
      </div>
      <div id="alertsListBody"></div>
    `;
    document.body.appendChild(panel);
    panel.querySelector('.ms-close').addEventListener('click', () => panel.classList.remove('open'));
    return panel;
  }

  function renderPanel() {
    if (!panelEl) return;
    const body = panelEl.querySelector('#alertsListBody');
    const list = getAllAlerts();

    if (list.length === 0) {
      body.innerHTML = `<div class="ms-row ms-muted">Chưa có cảnh báo nào. Chọn công cụ 🔔 trong thanh vẽ rồi click lên chart để đặt mức giá.</div>`;
      return;
    }

    body.innerHTML = list
      .slice()
      .reverse()
      .map(
        (a) => `
        <div class="alert-item ${a.triggered ? 'alert-triggered' : ''}">
          <div>
            <div class="ms-bold">${a.symbol}</div>
            <div class="ms-muted">Mức: ${formatPrice(a.price)}${a.triggered ? ' · đã chạm' : ''}</div>
          </div>
          <button data-id="${a.id}" class="alert-remove-btn" type="button">Xoá</button>
        </div>`
      )
      .join('');

    body.querySelectorAll('.alert-remove-btn').forEach((btn) => {
      btn.addEventListener('click', () => removeAlert(btn.dataset.id));
    });
  }

  function mountUI() {
    panelEl = buildPanel();
    const btn = buildButton();
    const target = document.querySelector('.topbar-right') || document.getElementById('topbar');
    if (target) {
      target.appendChild(btn);
    } else {
      btn.style.position = 'fixed';
      btn.style.top = '10px';
      btn.style.right = '160px';
      btn.style.zIndex = '9999';
      document.body.appendChild(btn);
    }
  }

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mountUI);
    } else {
      mountUI();
    }
  }

  init();

  return { addPriceAlert, removeAlert, getAlertsForSymbol, getAllAlerts, checkPrice };
})();