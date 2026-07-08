/**
 * layout.js
 * Quản lý bố cục nhiều ô chart theo kiểu TradingView:
 *   - Layout '1' | '2' | '3' | '4' (số ô hiển thị cùng lúc).
 *   - Tự nhận biết hướng màn hình: DỌC tối đa 3 ô, NGANG tối đa 4 ô.
 *   - Mỗi cặp ô đều có đường chia (splitter) kéo được để đổi tỉ lệ dài/rộng
 *     riêng cho từng ô - tỉ lệ được nhớ riêng theo từng (layout, hướng).
 *
 * Toàn bộ 4 pane LUÔN tồn tại cố định trong DOM (không tạo/hủy khi đổi
 * layout) - module này chỉ đổi grid-column/grid-row của từng pane trong
 * #chartArea và ẩn pane không thuộc layout hiện tại bằng class 'hidden'.
 * Vì vậy dữ liệu/socket của TẤT CẢ pane (kể cả đang ẩn) vẫn chạy realtime
 * bình thường - đúng yêu cầu "mọi ô đều real-time, không phải chọn ô nào
 * mới chạy ô đó" (xem app.js/websocket.js, không phụ thuộc layout).
 *
 * Việc đổi kích thước khi kéo splitter KHÔNG cần tự gọi resize() thủ công:
 * mỗi pane-chart-container đã có ResizeObserver riêng (chart.js) tự phát
 * hiện khi kích thước container đổi (do đổi grid-template-columns/rows) và
 * tự resize chart tương ứng - nên khi kéo, chart co giãn mượt theo thời gian
 * thực.
 */

const LayoutModule = (function () {
  const SPLITTER_SIZE = 6; // px

  const DEFAULT_RATIOS = {
    '2-landscape': { a: 0.5 },
    '2-portrait': { a: 0.5 },
    '3-landscape': { col: 0.42, row: 0.5 },
    '3-portrait': { r1: 0.34, r2: 0.67 },
    '4-landscape': { col: 0.5, row: 0.5 },
  };

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function getRatios(layout, orientation) {
    const key = `${layout}-${orientation}`;
    const stored = Store.getLayoutRatios(layout, orientation);
    return stored ? { ...stored } : { ...(DEFAULT_RATIOS[key] || {}) };
  }

  function saveRatios(layout, orientation, ratios) {
    Store.setLayoutRatios(layout, orientation, ratios);
  }

  /** Danh sách layout khả dụng cho hướng màn hình hiện tại. */
  function getAvailableLayouts(orientation) {
    return orientation === 'portrait' ? ['1', '2', '3'] : ['1', '2', '3', '4'];
  }

  /**
   * Xây cấu trúc grid (track cột/hàng + toạ độ từng pane + đường chia)
   * cho 1 layout+hướng, dựa trên tỉ lệ hiện tại.
   */
  function computeStructure(layout, orientation, ratios) {
    if (layout === '1') {
      return { columns: '1fr', rows: '1fr', placements: {}, splitters: [] };
    }

    if (layout === '2') {
      const a = clamp(ratios.a ?? 0.5, 0.15, 0.85);
      if (orientation === 'portrait') {
        return {
          columns: '1fr',
          rows: `${a}fr ${SPLITTER_SIZE}px ${1 - a}fr`,
          placements: {
            'pane-1': { col: '1 / 2', row: '1 / 2' },
            'pane-2': { col: '1 / 2', row: '3 / 4' },
          },
          splitters: [{ id: 'sp-a', axis: 'row', col: '1 / 2', row: '2 / 3', ratioKey: 'a' }],
        };
      }
      return {
        columns: `${a}fr ${SPLITTER_SIZE}px ${1 - a}fr`,
        rows: '1fr',
        placements: {
          'pane-1': { col: '1 / 2', row: '1 / 2' },
          'pane-2': { col: '3 / 4', row: '1 / 2' },
        },
        splitters: [{ id: 'sp-a', axis: 'col', col: '2 / 3', row: '1 / 2', ratioKey: 'a' }],
      };
    }

    if (layout === '3') {
      if (orientation === 'portrait') {
        const r1 = clamp(ratios.r1 ?? 0.34, 0.12, 0.76);
        const r2 = clamp(ratios.r2 ?? 0.67, r1 + 0.12, 0.88);
        const f1 = r1;
        const f2 = r2 - r1;
        const f3 = 1 - r2;
        return {
          columns: '1fr',
          rows: `${f1}fr ${SPLITTER_SIZE}px ${f2}fr ${SPLITTER_SIZE}px ${f3}fr`,
          placements: {
            'pane-1': { col: '1 / 2', row: '1 / 2' },
            'pane-2': { col: '1 / 2', row: '3 / 4' },
            'pane-3': { col: '1 / 2', row: '5 / 6' },
          },
          splitters: [
            { id: 'sp-r1', axis: 'row', col: '1 / 2', row: '2 / 3', mode: 'boundary1' },
            { id: 'sp-r2', axis: 'row', col: '1 / 2', row: '4 / 5', mode: 'boundary2' },
          ],
        };
      }
      // Ngang: pane-1 lớn bên trái (chiếm 2 hàng), pane-2/pane-3 xếp chồng bên phải.
      const col = clamp(ratios.col ?? 0.42, 0.2, 0.7);
      const row = clamp(ratios.row ?? 0.5, 0.15, 0.85);
      return {
        columns: `${col}fr ${SPLITTER_SIZE}px ${1 - col}fr`,
        rows: `${row}fr ${SPLITTER_SIZE}px ${1 - row}fr`,
        placements: {
          'pane-1': { col: '1 / 2', row: '1 / 4' },
          'pane-2': { col: '3 / 4', row: '1 / 2' },
          'pane-3': { col: '3 / 4', row: '3 / 4' },
        },
        splitters: [
          { id: 'sp-col', axis: 'col', col: '2 / 3', row: '1 / 4', ratioKey: 'col' },
          { id: 'sp-row', axis: 'row', col: '3 / 4', row: '2 / 3', ratioKey: 'row' },
        ],
      };
    }

    // layout === '4' - lưới 2x2 (chỉ khả dụng ở màn hình ngang).
    const col = clamp(ratios.col ?? 0.5, 0.15, 0.85);
    const row = clamp(ratios.row ?? 0.5, 0.15, 0.85);
    return {
      columns: `${col}fr ${SPLITTER_SIZE}px ${1 - col}fr`,
      rows: `${row}fr ${SPLITTER_SIZE}px ${1 - row}fr`,
      placements: {
        'pane-1': { col: '1 / 2', row: '1 / 2' },
        'pane-2': { col: '3 / 4', row: '1 / 2' },
        'pane-3': { col: '1 / 2', row: '3 / 4' },
        'pane-4': { col: '3 / 4', row: '3 / 4' },
      },
      splitters: [
        { id: 'sp-col', axis: 'col', col: '2 / 3', row: '1 / 4', ratioKey: 'col' },
        { id: 'sp-row', axis: 'row', col: '1 / 4', row: '2 / 3', ratioKey: 'row' },
      ],
    };
  }

  function detectOrientation() {
    return window.innerHeight >= window.innerWidth ? 'portrait' : 'landscape';
  }

  let splitterEls = {};

  function clearSplitters(chartArea) {
    Object.values(splitterEls).forEach((el) => el.remove());
    splitterEls = {};
  }

  /** Vẽ lại toàn bộ grid: track cột/hàng, vị trí từng pane, và các đường chia. */
  function render() {
    const state = Store.getState();
    const layout = state.layout;
    const orientation = state.orientation;
    const chartArea = document.getElementById('chartArea');
    if (!chartArea) return;

    const visible = Store.getVisiblePaneIds();
    const ratios = getRatios(layout, orientation);
    const structure = computeStructure(layout, orientation, ratios);

    chartArea.style.display = 'grid';
    chartArea.style.gridTemplateColumns = structure.columns;
    chartArea.style.gridTemplateRows = structure.rows;

    state.panes.forEach((pane) => {
      const el = document.getElementById(pane.id);
      if (!el) return;
      const isVisible = visible.includes(pane.id);
      el.classList.toggle('hidden', !isVisible);
      if (!isVisible) return;

      if (layout === '1') {
        el.style.gridColumn = '1 / 2';
        el.style.gridRow = '1 / 2';
      } else {
        const p = structure.placements[pane.id];
        if (p) {
          el.style.gridColumn = p.col;
          el.style.gridRow = p.row;
        }
      }
    });

    clearSplitters(chartArea);
    structure.splitters.forEach((sp) => {
      const el = document.createElement('div');
      el.className = 'grid-splitter ' + (sp.axis === 'col' ? 'grid-splitter-col' : 'grid-splitter-row');
      el.style.gridColumn = sp.col;
      el.style.gridRow = sp.row;
      chartArea.appendChild(el);
      splitterEls[sp.id] = el;
      bindSplitterDrag(el, sp, layout, orientation, chartArea);
    });
  }

  /**
   * Kéo 1 đường chia: chỉ cập nhật grid-template-columns/rows trực tiếp
   * (KHÔNG gọi render() lại toàn bộ trong lúc kéo) để mượt và rẻ - việc thật
   * sự resize canvas chart đã được ResizeObserver trong chart.js lo tự động
   * ngay khi kích thước container đổi.
   */
  function bindSplitterDrag(el, sp, layout, orientation, chartArea) {
    let dragging = false;
    let rafPending = false;
    let latestEvent = null;

    function applyFromEvent(e) {
      const rect = chartArea.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const ratios = getRatios(layout, orientation);

      if (sp.mode === 'boundary1' || sp.mode === 'boundary2') {
        const frac = clamp((clientY - rect.top) / rect.height, 0.05, 0.95);
        if (sp.mode === 'boundary1') {
          ratios.r1 = clamp(frac, 0.12, (ratios.r2 ?? 0.67) - 0.12);
        } else {
          ratios.r2 = clamp(frac, (ratios.r1 ?? 0.34) + 0.12, 0.88);
        }
      } else if (sp.axis === 'col') {
        ratios[sp.ratioKey] = clamp((clientX - rect.left) / rect.width, 0.15, 0.85);
      } else {
        ratios[sp.ratioKey] = clamp((clientY - rect.top) / rect.height, 0.15, 0.85);
      }

      saveRatios(layout, orientation, ratios);
      const structure = computeStructure(layout, orientation, ratios);
      chartArea.style.gridTemplateColumns = structure.columns;
      chartArea.style.gridTemplateRows = structure.rows;
    }

    function onMove(e) {
      if (!dragging) return;
      latestEvent = e;
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        if (latestEvent) applyFromEvent(latestEvent);
      });
    }

    function onUp() {
      if (!dragging) return;
      dragging = false;
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }

    el.addEventListener('pointerdown', (e) => {
      dragging = true;
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      e.preventDefault();
    });
  }

  /** Theo dõi đổi hướng màn hình (resize / xoay thiết bị) và cập nhật Store. */
  function initOrientationWatcher() {
    function update() {
      Store.setOrientation(detectOrientation());
    }
    update();
    window.addEventListener('resize', debounce(update, 150));
    window.addEventListener('orientationchange', () => setTimeout(update, 150));
  }

  // Mọi thay đổi layout/hướng màn hình (do người dùng bấm nút, hoặc do xoay
  // màn hình) đều đi qua sự kiện này - layout.js tự vẽ lại grid tương ứng.
  EventBus.on('layout:changed', () => render());

  return { render, getAvailableLayouts, initOrientationWatcher, detectOrientation };
})();