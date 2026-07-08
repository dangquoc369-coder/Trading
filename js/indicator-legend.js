/**
 * indicator-legend.js
 * Vẽ 1 legend nhỏ (giống TradingView) đè lên góc trên-trái của mỗi pane,
 * liệt kê các indicator (EMA21, EMA200, RSI14, EMA9(RSI), WMA45(RSI)) +
 * Volume + chip BUY/SELL.
 *
 * CẬP NHẬT (đợt fix này) - THÊM CHECKBOX "THÔNG BÁO TÍN HIỆU BUY/SELL":
 *   - Trong popover cài đặt breakout (mở qua bánh răng ⚙ của chip BUY/SELL),
 *     thêm 1 checkbox để bật/tắt việc gửi thông báo hệ thống mỗi khi pane
 *     này có tín hiệu BUY/SELL MỚI. Lưu qua Store.setPaneSignalAlertEnabled()
 *     - app.js đọc field này (pane.signalAlertEnabled) khi nhận sự kiện
 *     'pane:newSignal' để quyết định có gửi thông báo hay không.
 */

const IndicatorLegend = (function () {
  const collapsedState = {};

  const SL_MODE_LABELS = {
    entry: 'Khung vào lệnh (mặc định)',
    higher: 'Khung trend (cùng cặp entry → trend)',
    custom: 'Khung tuỳ chọn riêng...',
  };

  function isCollapsed(paneId) {
    return !!collapsedState[paneId];
  }

  function render(paneId, instance) {
    const container = document.getElementById(`${paneId}-legend`);
    if (!container) return;
    container.innerHTML = '';

    const collapsed = isCollapsed(paneId);
    container.classList.toggle('legend-collapsed', collapsed);

    container.appendChild(buildCollapseToggle(paneId, instance, collapsed));

    if (collapsed) return;

    const config = instance.getIndicatorConfig();
    Object.keys(config).forEach((key) => {
      container.appendChild(buildChip(paneId, instance, key, config[key]));
    });

    container.appendChild(buildSimpleToggleChip('#787b86', 'Volume', instance.getVolumeVisible(), (next) => {
      instance.setVolumeVisible(next);
      render(paneId, instance);
    }));

    container.appendChild(buildBreakoutChip(paneId, instance));
  }

  function buildCollapseToggle(paneId, instance, collapsed) {
    const btn = document.createElement('div');
    btn.className = 'legend-toggle-btn';
    btn.title = collapsed ? 'Mở rộng danh sách chỉ báo' : 'Thu gọn danh sách chỉ báo';
    btn.textContent = collapsed ? '📊 Chỉ báo ▸' : 'Chỉ báo ▾';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      collapsedState[paneId] = !collapsed;
      render(paneId, instance);
    });
    return btn;
  }

  function buildChip(paneId, instance, key, item) {
    const chip = document.createElement('div');
    chip.className = 'indicator-chip' + (item.enabled ? '' : ' disabled');

    const dot = document.createElement('span');
    dot.className = 'indicator-dot';
    dot.style.background = item.color;

    const name = document.createElement('span');
    name.className = 'indicator-name';
    name.textContent = `${item.label} ${item.period}`;

    const gear = document.createElement('span');
    gear.className = 'indicator-gear';
    gear.title = 'Chỉnh chu kỳ';
    gear.textContent = '⚙';

    function toggle(e) {
      e.stopPropagation();
      instance.setIndicatorVisible(key, !item.enabled);
      render(paneId, instance);
    }

    dot.addEventListener('click', toggle);
    name.addEventListener('click', toggle);
    gear.addEventListener('click', (e) => {
      e.stopPropagation();
      openPeriodPopover(chip, paneId, instance, key, item);
    });

    chip.appendChild(dot);
    chip.appendChild(name);
    chip.appendChild(gear);
    return chip;
  }

  function buildSimpleToggleChip(color, label, enabled, onToggle) {
    const chip = document.createElement('div');
    chip.className = 'indicator-chip' + (enabled ? '' : ' disabled');

    const dot = document.createElement('span');
    dot.className = 'indicator-dot';
    dot.style.background = color;

    const name = document.createElement('span');
    name.className = 'indicator-name';
    name.textContent = label;

    function toggle(e) {
      e.stopPropagation();
      onToggle(!enabled);
    }

    dot.addEventListener('click', toggle);
    name.addEventListener('click', toggle);

    chip.appendChild(dot);
    chip.appendChild(name);
    return chip;
  }

  function buildBreakoutChip(paneId, instance) {
    const breakout = instance.getBreakout();
    const enabled = breakout.isVisible();

    const chip = document.createElement('div');
    chip.className = 'indicator-chip' + (enabled ? '' : ' disabled');

    const dot = document.createElement('span');
    dot.className = 'indicator-dot';
    dot.style.background = '#2962ff';

    const name = document.createElement('span');
    name.className = 'indicator-name';
    name.textContent = 'BUY/SELL';

    const gear = document.createElement('span');
    gear.className = 'indicator-gear';
    gear.title = 'Cài đặt breakout (số nến / nguồn SL / thông báo)';
    gear.textContent = '⚙';

    function toggle(e) {
      e.stopPropagation();
      breakout.setVisible(!enabled);
      render(paneId, instance);
    }

    dot.addEventListener('click', toggle);
    name.addEventListener('click', toggle);
    gear.addEventListener('click', (e) => {
      e.stopPropagation();
      openBreakoutSettingsPopover(chip, paneId, instance);
    });

    chip.appendChild(dot);
    chip.appendChild(name);
    chip.appendChild(gear);
    return chip;
  }

  function closeAnyOpenPopover() {
    document.querySelectorAll('.indicator-popover').forEach((el) => el.remove());
  }

  function openPeriodPopover(chip, paneId, instance, key, item) {
    closeAnyOpenPopover();

    const popover = document.createElement('div');
    popover.className = 'indicator-popover';
    popover.addEventListener('click', (e) => e.stopPropagation());

    const label = document.createElement('label');
    label.textContent = `Chu kỳ ${item.label}`;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.max = '1000';
    input.value = item.period;

    const actions = document.createElement('div');
    actions.className = 'indicator-popover-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'ip-cancel';
    cancelBtn.textContent = 'Hủy';

    const applyBtn = document.createElement('button');
    applyBtn.className = 'ip-apply';
    applyBtn.textContent = 'Áp dụng';

    function apply() {
      const val = parseInt(input.value, 10);
      if (val && val > 0) {
        instance.setIndicatorPeriod(key, val);
      }
      popover.remove();
      render(paneId, instance);
    }

    applyBtn.addEventListener('click', apply);
    cancelBtn.addEventListener('click', () => popover.remove());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') apply();
      if (e.key === 'Escape') popover.remove();
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(applyBtn);
    popover.appendChild(label);
    popover.appendChild(input);
    popover.appendChild(actions);
    chip.appendChild(popover);

    input.focus();
    input.select();
  }

  /**
   * Popover cài đặt breakout của 1 pane: số nến breakout + nguồn tính SL +
   * (đợt fix này) checkbox bật/tắt thông báo tín hiệu BUY/SELL mới.
   */
  function openBreakoutSettingsPopover(chip, paneId, instance) {
    closeAnyOpenPopover();

    const current = Store.getPaneBreakoutConfig(paneId) || {
      lookbackCandles: 2,
      slMode: 'entry',
      slTimeframe: null,
    };
    const pane = Store.getPane(paneId);

    const popover = document.createElement('div');
    popover.className = 'indicator-popover wide';
    popover.addEventListener('click', (e) => e.stopPropagation());

    // ---- Số nến breakout ----
    const lookbackLabel = document.createElement('label');
    lookbackLabel.textContent = 'Số nến breakout (khung trend)';

    const lookbackInput = document.createElement('input');
    lookbackInput.type = 'number';
    lookbackInput.min = '1';
    lookbackInput.max = '20';
    lookbackInput.value = current.lookbackCandles;

    // ---- Nguồn tính SL ----
    const slModeLabel = document.createElement('label');
    slModeLabel.textContent = 'Nguồn tính SL (ATR)';

    const slModeSelect = document.createElement('select');
    ['entry', 'higher', 'custom'].forEach((mode) => {
      const opt = document.createElement('option');
      opt.value = mode;
      opt.textContent = SL_MODE_LABELS[mode];
      if (mode === current.slMode) opt.selected = true;
      slModeSelect.appendChild(opt);
    });

    // ---- Khung SL tuỳ chọn (chỉ hiện khi slMode = 'custom') ----
    const slTimeframeLabel = document.createElement('label');
    slTimeframeLabel.textContent = 'Khung tính SL';

    const slTimeframeSelect = document.createElement('select');
    TIMEFRAMES.forEach((tf) => {
      const opt = document.createElement('option');
      opt.value = tf.value;
      opt.textContent = tf.label;
      if (tf.value === current.slTimeframe) opt.selected = true;
      slTimeframeSelect.appendChild(opt);
    });
    if (!current.slTimeframe) {
      slTimeframeSelect.value = '1h';
    }

    const slTimeframeRow = document.createElement('div');
    slTimeframeRow.className = 'bo-conditional-row';
    slTimeframeRow.appendChild(slTimeframeLabel);
    slTimeframeRow.appendChild(slTimeframeSelect);

    function updateConditionalVisibility() {
      slTimeframeRow.style.display = slModeSelect.value === 'custom' ? '' : 'none';
    }
    slModeSelect.addEventListener('change', updateConditionalVisibility);
    updateConditionalVisibility();

    const hint = document.createElement('div');
    hint.className = 'bo-hint';
    hint.textContent = 'Ví dụ: vào lệnh M5, SL tính ATR theo H1.';

    // ---- Checkbox thông báo tín hiệu BUY/SELL mới (đợt fix này) ----
    const notifyRow = document.createElement('label');
    notifyRow.className = 'bo-notify-row';

    const notifyCheckbox = document.createElement('input');
    notifyCheckbox.type = 'checkbox';
    notifyCheckbox.checked = !!(pane && pane.signalAlertEnabled);

    const notifyText = document.createElement('span');
    notifyText.textContent = 'Thông báo khi có tín hiệu BUY/SELL mới';

    notifyRow.appendChild(notifyCheckbox);
    notifyRow.appendChild(notifyText);

    const notifyHint = document.createElement('div');
    notifyHint.className = 'bo-hint';
    notifyHint.textContent = 'Cần cấp quyền thông báo cho trình duyệt/app trước (xem banner ở dưới màn hình).';

    const actions = document.createElement('div');
    actions.className = 'indicator-popover-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'ip-cancel';
    cancelBtn.textContent = 'Hủy';

    const applyBtn = document.createElement('button');
    applyBtn.className = 'ip-apply';
    applyBtn.textContent = 'Áp dụng';

    function apply() {
      const lookback = parseInt(lookbackInput.value, 10);
      const slMode = slModeSelect.value;
      const slTimeframe = slMode === 'custom' ? slTimeframeSelect.value : null;

      Store.setPaneBreakoutConfig(paneId, {
        lookbackCandles: lookback && lookback > 0 ? lookback : current.lookbackCandles,
        slMode,
        slTimeframe,
      });

      Store.setPaneSignalAlertEnabled(paneId, notifyCheckbox.checked);

      // Nếu người dùng vừa tick bật thông báo nhưng chưa từng cấp quyền,
      // chủ động hỏi luôn để đỡ phải chờ banner tự hiện.
      if (
        notifyCheckbox.checked &&
        NotificationsModule.isSupported() &&
        NotificationsModule.getPermission() === 'default'
      ) {
        NotificationsModule.requestPermission();
      }

      popover.remove();
      render(paneId, instance);
    }

    applyBtn.addEventListener('click', apply);
    cancelBtn.addEventListener('click', () => popover.remove());

    actions.appendChild(cancelBtn);
    actions.appendChild(applyBtn);

    popover.appendChild(lookbackLabel);
    popover.appendChild(lookbackInput);
    popover.appendChild(slModeLabel);
    popover.appendChild(slModeSelect);
    popover.appendChild(slTimeframeRow);
    popover.appendChild(hint);
    popover.appendChild(notifyRow);
    popover.appendChild(notifyHint);
    popover.appendChild(actions);
    chip.appendChild(popover);

    lookbackInput.focus();
    lookbackInput.select();
  }

  document.addEventListener('click', closeAnyOpenPopover);

  return { render };
})();