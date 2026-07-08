/**
 * drawing.js
 * Bộ công cụ vẽ cơ bản kiểu TradingView cho MỖI pane, độc lập với nhau:
 *   - Con trỏ (mặc định, không vẽ gì, thao tác chart bình thường)
 *   - Đường ngang (Horizontal Line)
 *   - Đường xu hướng (Trend Line) - kéo từ điểm A -> điểm B
 *   - Hình chữ nhật (Rectangle) - kéo để khoanh vùng
 *   - Xoá tất cả
 *
 * Cách làm: KHÔNG dùng series/primitive phức tạp của lightweight-charts, mà
 * chèn 1 <canvas> overlay tuyệt đối đè lên trên container của chart, tự vẽ
 * tay bằng Canvas 2D API. Toạ độ (time, price) được quy đổi qua toạ độ pixel
 * bằng chart.timeScale() và candleSeries.priceToCoordinate()/coordinateToPrice(),
 * nên khi người dùng pan/zoom chart, hình vẽ tự "bám" đúng theo dữ liệu vì ta
 * redraw() lại mỗi khi visible range đổi.
 *
 * Dùng Pointer Events (không phải mouse events) để 1 bộ code chạy được cho
 * cả chuột (desktop) lẫn cảm ứng (điện thoại/tablet) - phục vụ yêu cầu tối
 * ưu cho mọi thiết bị.
 *
 * KHÔNG giữ state dùng chung - mỗi pane gọi DrawingModule.create(...) ra 1
 * instance riêng, y hệt pattern của ChartModule/BreakoutModule.
 *
 * CẬP NHẬT (đợt fix trước): bỏ thanh công cụ vẽ RIÊNG của từng pane, dùng
 * chung 1 thanh #sharedDrawGroup cho cả app (xem ui.js).
 *
 * CẬP NHẬT (đợt fix này) - THÊM CÔNG CỤ "🔔 ĐẶT CẢNH BÁO GIÁ":
 *   - Đây KHÔNG phải hình vẽ lưu trong `drawings` như 3 công cụ trên (vì
 *     cảnh báo cần lưu bền + đồng bộ qua AlertsModule/localStorage, và hiển
 *     thị bằng price line thật của lightweight-charts thay vì canvas overlay
 *     - xem chart.js: renderAlertLines()). Công cụ này chỉ đơn giản là: khi
 *     đang chọn tool 'alert' và người dùng click/chạm lên chart, đọc ra mức
 *     giá tại điểm đó rồi gọi callback `onAlertRequested(price)` do phía gọi
 *     (chart.js) truyền vào qua tham số `options` của create().
 *   - Không cần kéo-thả gì cả (khác trendline/rectangle) - chỉ cần 1 click.
 */

const DrawingModule = (function () {
  function create(paneId, chart, candleSeries, container, options = {}) {
    const { onAlertRequested } = options;

    let currentTool = 'cursor'; // cursor | hline | trendline | rectangle | alert
    let drawings = [];
    let dragStart = null;
    let previewDrawing = null;

    // Đảm bảo container có position để canvas overlay tuyệt đối bám đúng vị trí
    const computed = window.getComputedStyle(container);
    if (computed.position === 'static') container.style.position = 'relative';

    const canvas = document.createElement('canvas');
    canvas.className = 'draw-canvas';
    canvas.style.touchAction = 'none'; // chặn cuộn trang khi đang kéo vẽ trên mobile
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    function resizeCanvas() {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    }

    function timeToX(time) {
      return chart.timeScale().timeToCoordinate(time);
    }
    function priceToY(price) {
      return candleSeries.priceToCoordinate(price);
    }
    function xToTime(x) {
      return chart.timeScale().coordinateToTime(x);
    }
    function yToPrice(y) {
      return candleSeries.coordinateToPrice(y);
    }

    function setTool(tool) {
      currentTool = tool;
      const isInteractive = tool !== 'cursor';
      canvas.style.pointerEvents = isInteractive ? 'auto' : 'none';
      canvas.style.cursor = isInteractive ? 'crosshair' : 'default';
    }

    function clearAll() {
      drawings = [];
      redraw();
    }

    function getRect() {
      const rect = container.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }

    function redraw() {
      const { width, height } = getRect();
      ctx.clearRect(0, 0, width, height);
      drawings.forEach((d) => drawShape(d, false));
      if (previewDrawing) drawShape(previewDrawing, true);
    }

    function drawShape(d, isPreview) {
      ctx.save();
      ctx.strokeStyle = isPreview ? 'rgba(41, 98, 255, 0.55)' : '#2962ff';
      ctx.lineWidth = 1.5;

      if (d.type === 'hline') {
        const y = priceToY(d.price);
        if (y === null || y === undefined) { ctx.restore(); return; }
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(getRect().width, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#2962ff';
        ctx.font = '10px sans-serif';
        ctx.fillText(formatPrice(d.price), 4, y - 4);
      } else if (d.type === 'trendline') {
        const x1 = timeToX(d.p1.time), y1 = priceToY(d.p1.price);
        const x2 = timeToX(d.p2.time), y2 = priceToY(d.p2.price);
        if ([x1, y1, x2, y2].some((v) => v === null || v === undefined)) { ctx.restore(); return; }
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      } else if (d.type === 'rectangle') {
        const x1 = timeToX(d.p1.time), y1 = priceToY(d.p1.price);
        const x2 = timeToX(d.p2.time), y2 = priceToY(d.p2.price);
        if ([x1, y1, x2, y2].some((v) => v === null || v === undefined)) { ctx.restore(); return; }
        const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
        const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
        ctx.fillStyle = 'rgba(41, 98, 255, 0.10)';
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeRect(rx, ry, rw, rh);
      }
      ctx.restore();
    }

    function pointFromEvent(e) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const time = xToTime(x);
      const price = yToPrice(y);
      return { time, price };
    }

    function onPointerDown(e) {
      if (currentTool === 'cursor') return;

      // Công cụ đặt cảnh báo giá: chỉ cần 1 click, không kéo-thả.
      if (currentTool === 'alert') {
        const pt = pointFromEvent(e);
        if (pt.price === null || pt.price === undefined || Number.isNaN(pt.price)) return;
        if (onAlertRequested) onAlertRequested(pt.price);
        return;
      }

      const pt = pointFromEvent(e);
      if (pt.time === null || pt.time === undefined || pt.price === null || pt.price === undefined) return;

      if (currentTool === 'hline') {
        drawings.push({ type: 'hline', price: pt.price });
        redraw();
        return;
      }
      dragStart = pt;
      canvas.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e) {
      if (currentTool === 'cursor' || currentTool === 'alert' || !dragStart) return;
      const pt = pointFromEvent(e);
      if (pt.time === null || pt.time === undefined || pt.price === null || pt.price === undefined) return;
      previewDrawing = { type: currentTool, p1: dragStart, p2: pt };
      redraw();
    }

    function onPointerUp(e) {
      if (currentTool === 'cursor' || currentTool === 'alert' || !dragStart) return;
      const pt = pointFromEvent(e);
      if (
        pt.time !== null && pt.time !== undefined &&
        pt.price !== null && pt.price !== undefined &&
        (currentTool === 'trendline' || currentTool === 'rectangle')
      ) {
        drawings.push({ type: currentTool, p1: dragStart, p2: pt });
      }
      dragStart = null;
      previewDrawing = null;
      redraw();
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', () => { dragStart = null; previewDrawing = null; redraw(); });

    chart.timeScale().subscribeVisibleLogicalRangeChange(() => redraw());

    const resizeObs = new ResizeObserver(() => resizeCanvas());
    resizeObs.observe(container);
    resizeCanvas();

    return { setTool, clearAll, redraw, getTool: () => currentTool };
  }

  function formatPrice(v) {
    if (typeof formatPriceLocal === 'function') return formatPriceLocal(v);
    return Number(v).toLocaleString('en-US', { maximumFractionDigits: 6 });
  }

  return { create };
})();