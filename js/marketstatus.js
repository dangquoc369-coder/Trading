/**
 * marketstatus.js
 * Nút "Trạng thái thị trường" - CHỈ 1 NÚT DUY NHẤT dùng chung cho cả 4 pane.
 *
 * CẬP NHẬT (đợt fix trước): getMarketStatus nhận { entryCandles, higherTFCandles }
 * thay vì 1 mảng candles - lấy thêm higherTFCandles từ instance.getHigherTFCandles()
 * (xem chart.js). Bổ sung hiển thị "vùng breakout thật" (crossTF).
 *
 * CẬP NHẬT (đợt fix này - GIAO DIỆN CHUYÊN NGHIỆP + NỀN SÁNG):
 *   - Bỏ hẳn injectStyles() (từng chèn 1 thẻ <style> với màu HEX CỨNG như
 *     #1e222d/#d1d4dc...) - đây chính là lý do panel này "kẹt cứng" ở giao
 *     diện tối, không đổi theo khi bật nền sáng (theme.js chỉ đổi biến CSS,
 *     không đụng được vào CSS hardcode). Giờ panel + nút dùng chung class
 *     .ms-panel/.topbar-btn (định nghĩa trong css/style.css bằng biến CSS)
 *     - tự động đổi màu đúng theo theme hiện tại, không cần code gì thêm.
 */

(function () {
  function formatPriceLocalMS(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return '--';
    const digits = Math.abs(value) < 1 ? 6 : 2;
    return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function formatTime(unixSeconds) {
    if (!unixSeconds) return '--';
    const d = new Date(unixSeconds * 1000);
    return d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  }

  function buildStatusHTML(status, paneLabel) {
    if (!status.ok) {
      return `<div class="ms-row ms-muted">${status.reason}</div>`;
    }

    let trendHTML = '';
    if (status.trend === 'up') {
      trendHTML = `
        <div class="ms-row ms-trend-up">✅ NẾN GẦN NHẤT: XU HƯỚNG TĂNG (tham khảo)</div>
        <div class="ms-row ms-muted">📏 Vượt vùng bán buôn: +${formatPriceLocalMS(status.breakDistance)}</div>`;
    } else if (status.trend === 'down') {
      trendHTML = `
        <div class="ms-row ms-trend-down">✅ NẾN GẦN NHẤT: XU HƯỚNG GIẢM (tham khảo)</div>
        <div class="ms-row ms-muted">📏 Vượt vùng bán buôn: -${formatPriceLocalMS(status.breakDistance)}</div>`;
    } else {
      trendHTML = `
        <div class="ms-row ms-trend-side">⏸️ NẾN GẦN NHẤT: ĐANG SIDEWAY (tham khảo)</div>`;
      if (status.maxHigh12 !== null && status.maxHigh12 !== undefined) {
        trendHTML += `
        <div class="ms-row ms-muted">📏 Tới vùng trên (tham khảo): +${formatPriceLocalMS(status.maxHigh12 - status.currentPrice)}</div>
        <div class="ms-row ms-muted">📏 Tới vùng dưới (tham khảo): -${formatPriceLocalMS(status.currentPrice - status.minLow12)}</div>`;
      }
    }

    let crossTFHTML = '';
    if (status.crossTF) {
      crossTFHTML = `
        <div class="ms-divider"></div>
        <div class="ms-row ms-bold">🎯 VÙNG BREAKOUT VÀO LỆNH (khung trend)</div>
        <div class="ms-row ms-muted">📏 Tới vùng trên: +${formatPriceLocalMS(status.crossTF.distanceToHighZone)}</div>
        <div class="ms-row ms-muted">📏 Tới vùng dưới: -${formatPriceLocalMS(status.crossTF.distanceToLowZone)}</div>`;
    } else {
      crossTFHTML = `
        <div class="ms-divider"></div>
        <div class="ms-row ms-muted">⚠️ Chưa có dữ liệu khung trend để xác định vùng breakout thật.</div>`;
    }

    let tradeHTML = '';
    if (status.activeTradeOpen) {
      const dirLabel = status.activeDirection === 1 ? 'BUY 🔵' : 'SELL 🔴';
      tradeHTML = `
        <div class="ms-divider"></div>
        <div class="ms-row ms-bold">📌 ĐANG THEO DÕI LỆNH: ${dirLabel}</div>
        <div class="ms-row">Entry: ${formatPriceLocalMS(status.activeEntryPrice)}</div>
        <div class="ms-row">Stop Loss: ${formatPriceLocalMS(status.activeSLPrice)}</div>
        <div class="ms-row">Giá hiện tại: ${formatPriceLocalMS(status.currentPrice)}</div>
        <div class="ms-row">📏 Risk: ${formatPriceLocalMS(status.risk)}</div>
        <div class="ms-row ms-muted">🎯 Sẽ cảnh báo khi chạm SL hoặc có đảo chiều</div>`;
    } else {
      tradeHTML = `
        <div class="ms-divider"></div>
        <div class="ms-row ms-bold">⏳ KHÔNG CÓ LỆNH NÀO ĐANG THEO DÕI</div>
        <div class="ms-row ms-muted">🎯 Sẽ cảnh báo khi có tín hiệu breakout mới</div>`;
    }

    return `
      <div class="ms-row ms-bold">${paneLabel}</div>
      <div class="ms-row ms-muted">⏱️ Nến đóng gần nhất: ${formatTime(status.lastClosedCandleTime)}</div>
      ${trendHTML}
      ${crossTFHTML}
      ${tradeHTML}
    `;
  }

  function createPanel() {
    const panel = document.createElement('div');
    panel.id = 'marketStatusPanel';
    panel.className = 'ms-panel';
    panel.innerHTML = `
      <div class="ms-header">
        <span>📊 Trạng thái thị trường</span>
        <span class="ms-close">✕</span>
      </div>
      <div id="marketStatusBody"></div>
    `;
    document.body.appendChild(panel);
    panel.querySelector('.ms-close').addEventListener('click', () => panel.classList.remove('open'));
    return panel;
  }

  function showStatus(panel) {
    const body = panel.querySelector('#marketStatusBody');
    try {
      const activePane = Store.getActivePane();
      const instance = window.PaneRegistry.get(activePane.id);
      const entryCandles = instance.getCandles();
      const higherTFCandles = typeof instance.getHigherTFCandles === 'function' ? instance.getHigherTFCandles() : [];
      const status = instance.getBreakout().getMarketStatus({ entryCandles, higherTFCandles });
      const paneLabel = `Pane đang xem: ${activePane.symbol} (${activePane.timeframe})`;
      body.innerHTML = buildStatusHTML(status, paneLabel);
    } catch (err) {
      body.innerHTML = `<div class="ms-row ms-muted">Lỗi khi lấy trạng thái: ${err.message}</div>`;
      console.error('marketstatus.js error:', err);
    }
    panel.classList.add('open');
  }

  function createButton(panel) {
    const btn = document.createElement('button');
    btn.id = 'marketStatusBtn';
    btn.className = 'topbar-btn';
    btn.type = 'button';
    btn.textContent = '📊 Trạng thái thị trường';
    btn.addEventListener('click', () => {
      if (panel.classList.contains('open')) {
        panel.classList.remove('open');
      } else {
        showStatus(panel);
      }
    });
    return btn;
  }

  function bindAutoRefreshOnFocusChange(panel) {
    EventBus.on('pane:focused', () => {
      if (panel.classList.contains('open')) showStatus(panel);
    });
  }

  function mount() {
    const panel = createPanel();
    const btn = createButton(panel);
    bindAutoRefreshOnFocusChange(panel);

    const target = document.querySelector('.topbar-right') || document.getElementById('topbar');
    if (target) {
      target.appendChild(btn);
    } else {
      btn.style.position = 'fixed';
      btn.style.top = '10px';
      btn.style.right = '20px';
      btn.style.zIndex = '9999';
      document.body.appendChild(btn);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();