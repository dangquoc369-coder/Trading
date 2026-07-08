/**
 * sidebar-resize.js
 * Cho phép kéo thanh chia giữa sidebar và vùng chart để đổi độ rộng sidebar,
 * cộng thêm nút thu gọn nhanh về dạng "chỉ icon".
 *
 * CẬP NHẬT (đợt fix này - tối ưu mobile): thêm 1 nút hamburger (☰) cố định
 * góc trên-trái, CHỈ hiển thị trên màn hình hẹp (xem media query trong
 * style.css). Bấm vào sẽ bật/tắt class 'mobile-open' trên #sidebar, biến
 * sidebar thành dạng "drawer" trượt ra từ bên trái thay vì chiếm chỗ cố định
 * trong grid - giữ tối đa diện tích cho chart trên điện thoại.
 */

(function () {
  const MIN_WIDTH = 180;
  const MAX_WIDTH = 420;
  const DEFAULT_WIDTH = 260;
  const COLLAPSED_WIDTH = 52;
  const MOBILE_BREAKPOINT = 900;

  let lastExpandedWidth = DEFAULT_WIDTH;
  let collapsed = false;
  let dragging = false;

  function setWidth(px) {
    document.documentElement.style.setProperty('--sidebar-width', px + 'px');
  }

  function onMouseMove(e) {
    if (!dragging) return;
    const sidebar = document.getElementById('sidebar');
    const rect = sidebar.getBoundingClientRect();
    let newWidth = e.clientX - rect.left;
    newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));
    setWidth(newWidth);
    lastExpandedWidth = newWidth;
    if (collapsed) {
      collapsed = false;
      sidebar.classList.remove('collapsed');
      updateToggleIcon();
    }
  }

  function onMouseUp() {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
  }

  let toggleBtnRef = null;
  function updateToggleIcon() {
    if (toggleBtnRef) toggleBtnRef.textContent = collapsed ? '\u00BB' : '\u00AB';
  }

  function mount() {
    const sidebar = document.getElementById('sidebar');
    const header = document.querySelector('.sidebar-header');
    if (!sidebar || !header) return;

    setWidth(DEFAULT_WIDTH);

    const handle = document.createElement('div');
    handle.id = 'sidebarResizeHandle';
    handle.title = 'Kéo để đổi độ rộng';
    sidebar.appendChild(handle);

    handle.addEventListener('mousedown', (e) => {
      dragging = true;
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
    handle.addEventListener('dblclick', () => {
      collapsed = false;
      sidebar.classList.remove('collapsed');
      setWidth(DEFAULT_WIDTH);
      lastExpandedWidth = DEFAULT_WIDTH;
      updateToggleIcon();
    });

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'sidebarToggleBtn';
    toggleBtn.type = 'button';
    toggleBtn.title = 'Thu gọn / mở rộng sidebar';
    toggleBtn.textContent = '\u00AB';
    toggleBtn.addEventListener('click', () => {
      collapsed = !collapsed;
      sidebar.classList.toggle('collapsed', collapsed);
      setWidth(collapsed ? COLLAPSED_WIDTH : lastExpandedWidth);
      updateToggleIcon();
    });
    toggleBtnRef = toggleBtn;
    header.appendChild(toggleBtn);

    mountMobileToggle(sidebar);
  }

  /** Nút hamburger cố định - chỉ hiện trên mobile (CSS ẩn nó ở màn hình rộng). */
  function mountMobileToggle(sidebar) {
    const btn = document.createElement('button');
    btn.id = 'mobileSidebarToggle';
    btn.type = 'button';
    btn.title = 'Mở/đóng danh sách symbol';
    btn.textContent = '☰';
    btn.addEventListener('click', () => {
      sidebar.classList.toggle('mobile-open');
    });
    document.body.appendChild(btn);

    // Bấm ra ngoài sidebar (trên mobile) -> tự đóng lại drawer
    document.addEventListener('click', (e) => {
      if (window.innerWidth > MOBILE_BREAKPOINT) return;
      if (!sidebar.classList.contains('mobile-open')) return;
      if (sidebar.contains(e.target) || e.target === btn) return;
      sidebar.classList.remove('mobile-open');
    });

    // Chọn xong 1 symbol trên mobile -> tự đóng drawer luôn cho gọn
    const symbolList = document.getElementById('symbolList');
    if (symbolList) {
      symbolList.addEventListener('click', () => {
        if (window.innerWidth <= MOBILE_BREAKPOINT) sidebar.classList.remove('mobile-open');
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
