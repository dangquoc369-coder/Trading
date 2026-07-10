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

  function getAlertsForSymbol(symbol) {
    return alerts.filter((a) => a.symbol === symbol && !a.triggered);
  }

  function getAllAlerts() {
    return alerts.slice();
  }

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

  function buildButton() {
    const btn = document.createElement('button');
    btn.id = 'alertsListBtn';
    btn.className = 'topbar-btn';
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
    panel.className = 'ms-panel';
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