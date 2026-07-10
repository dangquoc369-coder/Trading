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

  function labelForSwing(v) {
    if (v === 'up') return { text: '📈 Tăng', cls: 'ms-trend-up' };
    if (v === 'down') return { text: '📉 Giảm', cls: 'ms-trend-down' };
    if (v === 'sideway') return { text: '⏸️ Sideway', cls: 'ms-trend-side' };
    return { text: '⏳ Đang xác định...', cls: 'ms-muted' };
  }

  function labelForScalp(v) {
    if (v === 'up') return { text: '📈 Xu hướng tăng', cls: 'ms-trend-up' };
    if (v === 'down') return { text: '📉 Xu hướng giảm', cls: 'ms-trend-down' };
    return { text: '⏳ Đang xác định...', cls: 'ms-muted' };
  }

  /**
   * Trend tham khảo MỚI (đợt fix này): luôn báo đủ Swing H1|H4|D1 + Scalp,
   * KHÔNG phụ thuộc timeframe đang mở của pane - lấy từ TrendReferenceModule
   * instance riêng của pane (xem TrendRefRegistry trong app.js).
   */
  function buildTrendReferenceHTML(trendRef) {
    if (!trendRef) {
      return `<div class="ms-row ms-muted">⚠️ Chưa có dữ liệu trend tham khảo.</div>`;
    }
    const h1 = labelForSwing(trendRef.swing.h1);
    const h4 = labelForSwing(trendRef.swing.h4);
    const d1 = labelForSwing(trendRef.swing.d1);
    const scalp = labelForScalp(trendRef.scalp);

    return `
      <div class="ms-row ms-bold">🧭 TREND SWING (tham khảo)</div>
      <div class="ms-row ${h1.cls}">H1: ${h1.text}</div>
      <div class="ms-row ${h4.cls}">H4: ${h4.text}</div>
      <div class="ms-row ${d1.cls}">D1: ${d1.text}</div>
      <div class="ms-divider"></div>
      <div class="ms-row ms-bold">⚡ TREND SCALP (tham khảo)</div>
      <div class="ms-row ${scalp.cls}">${scalp.text}</div>
    `;
  }

  function buildStatusHTML(status, paneLabel, trendRef) {
    if (!status.ok) {
      return `<div class="ms-row ms-muted">${status.reason}</div>`;
    }

    const trendRefHTML = buildTrendReferenceHTML(trendRef);

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
      <div class="ms-divider"></div>
      ${trendRefHTML}
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

      const trendRefInstance = window.TrendRefRegistry ? window.TrendRefRegistry.get(activePane.id) : null;
      const trendRef = trendRefInstance ? trendRefInstance.compute() : null;

      const paneLabel = `Pane đang xem: ${activePane.symbol} (${activePane.timeframe})`;
      body.innerHTML = buildStatusHTML(status, paneLabel, trendRef);
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