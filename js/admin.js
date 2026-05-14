/**
 * ============================================================
 * TEMBAKIMEI ADMIN PANEL - admin.js (REVISED)
 * ============================================================
 */

(function() {
  'use strict';

  // ===== INTERNAL STATE =====
  let _isLoggedIn = false;
  let _allOrders = [];
  let _filteredOrders = [];
  let _stats = null;
  let _autoRefreshInterval = null;
  let _searchDebounceTimer = null;
  let _previousOrderCount = 0;
  let _numberAnimations = new Map();

  // ===== DOM ELEMENTS CACHE =====
  let $loginPage, $dashboardPage, $loginPassword, $loginError, $loginErrorText;
  let $loginBtn, $loginSpinner, $loginIcon, $loginBtnText;
  let $searchInput;
  let $ordersTbody, $tableLoading, $tableEmpty, $tableContainer;
  let $statTotal, $statPending, $statProcessing, $statCompleted;
  let $orderCountBadge, $lastUpdated;
  let $togglePassword, $togglePasswordIcon;

  // ============================================================
  // AUTHENTICATION
  // ============================================================

  function checkAuth() {
    const loggedIn = localStorage.getItem('adminLoggedIn') === 'true';
    _isLoggedIn = loggedIn;
    if (loggedIn) showDashboard(); else showLogin();
    return loggedIn;
  }

  function showLogin() {
    if ($loginPage) { $loginPage.classList.remove('hidden-page'); $loginPage.style.position = 'fixed'; }
    if ($dashboardPage) { $dashboardPage.classList.add('hidden-page'); $dashboardPage.style.position = 'absolute'; }
  }

  function showDashboard() {
    if ($loginPage) { $loginPage.classList.add('hidden-page'); $loginPage.style.position = ''; }
    if ($dashboardPage) { $dashboardPage.classList.remove('hidden-page'); $dashboardPage.style.position = ''; }
  }

  async function handleLogin(password) {
    if (!password || password.trim() === '') {
      showLoginError('Password wajib diisi');
      return false;
    }

    setLoginLoading(true);
    try {
      await sleep(300);
      const expected = (window.ENV && window.ENV.ADMIN_PASSWORD_HASH) ? window.ENV.ADMIN_PASSWORD_HASH : 'admin123';
      const isValid = password === expected;

      if (isValid) {
        localStorage.setItem('adminLoggedIn', 'true');
        _isLoggedIn = true;
        clearLoginError();
        showDashboard();
        await initDashboard();
        showToast('Login berhasil!', 'success');
        return true;
      } else {
        showLoginError('Password salah. Silakan coba lagi.');
        return false;
      }
    } catch (err) {
      console.error('[Admin] Login error:', err);
      showLoginError('Terjadi kesalahan. Coba lagi.');
      return false;
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLoginFromForm() {
    handleLogin($loginPassword ? $loginPassword.value : '');
  }

  function handleLogout() {
    if (confirm('Yakin ingin logout?')) {
      localStorage.removeItem('adminLoggedIn');
      _isLoggedIn = false;
      stopAutoRefresh();
      _allOrders = [];
      _filteredOrders = [];
      _stats = null;
      _previousOrderCount = 0;
      if ($searchInput) $searchInput.value = '';
      showLogin();
      showToast('Berhasil logout', 'info');
    }
  }

  function showLoginError(message) {
    if ($loginErrorText) $loginErrorText.textContent = message;
    if ($loginError) $loginError.classList.remove('hidden');
    const card = $loginPage ? $loginPage.querySelector('.glass-strong') : null;
    if (card) { card.style.animation = 'none'; card.offsetHeight; card.style.animation = 'shake 0.4s ease'; }
  }

  function clearLoginError() {
    if ($loginError) $loginError.classList.add('hidden');
    if ($loginErrorText) $loginErrorText.textContent = '';
  }

  function setLoginLoading(loading) {
    if ($loginBtn) $loginBtn.disabled = loading;
    if ($loginSpinner) $loginSpinner.classList.toggle('hidden', !loading);
    if ($loginIcon) $loginIcon.classList.toggle('hidden', loading);
    if ($loginBtnText) $loginBtnText.textContent = loading ? 'Masuk...' : 'Login';
  }

  function togglePasswordVisibility() {
    if (!$loginPassword || !$togglePasswordIcon) return;
    const isHidden = $loginPassword.type === 'password';
    $loginPassword.type = isHidden ? 'text' : 'password';
    $togglePasswordIcon.className = isHidden ? 'fas fa-eye-slash' : 'fas fa-eye';
  }

  // ============================================================
  // DASHBOARD INITIALIZATION
  // ============================================================

  async function initDashboard() {
    if ($tableLoading) $tableLoading.classList.remove('hidden');
    if ($tableEmpty) $tableEmpty.classList.add('hidden');
    if ($tableContainer) $tableContainer.classList.add('hidden');

    try {
      await Promise.all([loadStats(), loadOrders()]);
    } catch (err) {
      console.error('[Admin] Dashboard init error:', err);
      showToast('Gagal memuat data dashboard', 'error');
    }
    startAutoRefresh();
  }

  // ============================================================
  // DATA LOADING
  // ============================================================

  async function loadStats() {
    try {
      const TembakImei = getTembakImei();
      if (TembakImei && TembakImei.getOrderStats) {
        _stats = await TembakImei.getOrderStats();
      } else {
        computeStatsFromOrders();
        return;
      }
      animateNumber($statTotal, _stats.total || 0, 600);
      animateNumber($statPending, _stats.pending || 0, 600);
      animateNumber($statProcessing, _stats.processing || 0, 600);
      animateNumber($statCompleted, _stats.completed || 0, 600);
    } catch (err) {
      console.warn('[Admin] loadStats error, using fallback:', err);
      computeStatsFromOrders();
    }
  }

  function computeStatsFromOrders() {
    const stats = { total: _allOrders.length, pending: 0, processing: 0, completed: 0, cancelled: 0 };
    _allOrders.forEach(order => {
      const s = (order.status || 'pending').toLowerCase();
      if (stats.hasOwnProperty(s)) stats[s]++;
    });
    _stats = stats;
    animateNumber($statTotal, stats.total, 600);
    animateNumber($statPending, stats.pending, 600);
    animateNumber($statProcessing, stats.processing, 600);
    animateNumber($statCompleted, stats.completed, 600);
  }

  async function loadOrders(searchTerm) {
    searchTerm = (searchTerm || '').trim();
    try {
      const TembakImei = getTembakImei();
      if (TembakImei && TembakImei.getAllOrders) {
        _allOrders = await TembakImei.getAllOrders() || [];
      } else {
        _allOrders = [];
      }

      const newCount = _allOrders.length;
      if (_previousOrderCount > 0 && newCount > _previousOrderCount) {
        showToast((newCount - _previousOrderCount) + ' order baru masuk!', 'info');
      }
      _previousOrderCount = newCount;

      filterAndRenderOrders(searchTerm);
      updateLastUpdated();
    } catch (err) {
      console.error('[Admin] loadOrders error:', err);
      showToast('Gagal memuat data order', 'error');
    }
  }

  // ============================================================
  // SEARCH & FILTER
  // ============================================================

  function filterAndRenderOrders(searchTerm) {
    searchTerm = (searchTerm || '').toLowerCase().trim();
    if (!searchTerm) {
      _filteredOrders = [..._allOrders];
    } else {
      _filteredOrders = _allOrders.filter(order => {
        const imei = (order.imei || '').toLowerCase();
        const wa = (order.wa_number || '').toLowerCase();
        const device = (order.device_name + ' ' + order.device_model || '').toLowerCase();
        const nama = (order.nama || '').toLowerCase();
        const orderId = (order.order_id || '').toLowerCase();
        return imei.includes(searchTerm) || wa.includes(searchTerm) || device.includes(searchTerm) ||
               nama.includes(searchTerm) || orderId.includes(searchTerm);
      });
    }
    _filteredOrders.sort((a, b) => {
      const ta = new Date(a.created_at || 0);
      const tb = new Date(b.created_at || 0);
      return tb - ta;
    });
    renderOrdersTable();
  }

  function handleSearch(query) {
    if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);
    _searchDebounceTimer = setTimeout(() => { filterAndRenderOrders(query); }, 300);
  }

  // ============================================================
  // TABLE RENDERING
  // ============================================================

  function renderOrdersTable() {
    if ($tableLoading) $tableLoading.classList.add('hidden');

    if (!_filteredOrders || _filteredOrders.length === 0) {
      if ($tableEmpty) $tableEmpty.classList.remove('hidden');
      if ($tableContainer) $tableContainer.classList.add('hidden');
      if ($orderCountBadge) $orderCountBadge.classList.add('hidden');
    } else {
      if ($tableEmpty) $tableEmpty.classList.add('hidden');
      if ($tableContainer) $tableContainer.classList.remove('hidden');
      if ($orderCountBadge) { $orderCountBadge.classList.remove('hidden'); $orderCountBadge.textContent = _filteredOrders.length; }
      if ($ordersTbody) $ordersTbody.innerHTML = _filteredOrders.map(order => renderOrderRow(order)).join('');
    }
  }

  function renderOrderRow(order) {
    const id = order.order_id || order.id || '';
    const imei = order.imei || '-';
    const device = (order.device_name || '') + (order.device_model ? ' ' + order.device_model : '');
    const wa = order.wa_number || '-';
    const nama = order.nama || '-';
    const status = (order.status || 'pending').toLowerCase();
    const createdAt = order.created_at || null;

    const relativeTime = formatRelativeTime(createdAt);
    const fullDate = formatFullDate(createdAt);
    const statusBadge = getStatusBadgeHTML(status);
    const actions = getActionButtonsHTML(id, status);
    const waClean = wa.replace(/[^0-9]/g, '');
    const waLink = waClean ? `https://wa.me/${waClean}` : '#';

    return `<tr data-order-id="${escapeHtml(id)}">
      <td>
        <div class="tooltip-wrapper">
          <span class="text-xs" style="color: #94A3B8;">${escapeHtml(relativeTime)}</span>
          <span class="tooltip-text">${escapeHtml(fullDate)}</span>
        </div>
      </td>
      <td>
        <span class="font-mono text-xs tracking-wider" style="color: #F8FAFC;">${escapeHtml(truncateString(imei, 16))}</span>
      </td>
      <td class="hidden sm:table-cell">
        <span class="text-xs" style="color: #94A3B8;">${escapeHtml(truncateString(device, 25))}</span>
      </td>
      <td>
        <div class="text-xs" style="color: #F8FAFC;">${escapeHtml(truncateString(nama, 16))}</div>
        <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-[10px] font-medium transition-colors hover:underline" style="color: #22C55E;">
          <i class="fab fa-whatsapp"></i>
          <span>${escapeHtml(truncateString(wa, 14))}</span>
        </a>
      </td>
      <td>${statusBadge}</td>
      <td>
        <div class="flex items-center gap-2 flex-wrap">${actions}</div>
      </td>
    </tr>`;
  }

  function getStatusBadgeHTML(status) {
    const statusMap = {
      'pending':    { class: 'badge-pending',    label: 'Pending',    icon: 'fa-clock' },
      'processing': { class: 'badge-processing', label: 'Processing', icon: 'fa-spinner' },
      'completed':  { class: 'badge-completed',  label: 'Completed',  icon: 'fa-check-circle' },
      'cancelled':  { class: 'badge-failed',     label: 'Cancelled',  icon: 'fa-circle-xmark' }
    };
    const info = statusMap[status] || statusMap.pending;
    return `<span class="${info.class} inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap"><i class="fas ${info.icon} text-[10px]"></i>${info.label}</span>`;
  }

  function getActionButtonsHTML(orderId, status) {
    const buttons = [];
    const oid = escapeHtml(orderId);

    if (status === 'pending') {
      buttons.push(
        `<button onclick="TembakImeiAdmin.markAsProcessing('${oid}')" class="action-btn border transition-all hover:bg-violet-500/10" style="border-color: rgba(139,92,246,0.3); color: #8B5CF6;" data-action="process" data-order="${oid}"><span class="spinner"></span><span class="btn-text flex items-center gap-1"><i class="fas fa-play text-[9px]"></i> Proses</span></button>`
      );
    }

    if (status === 'processing') {
      buttons.push(
        `<button onclick="TembakImeiAdmin.markAsCompleted('${oid}')" class="action-btn border transition-all hover:bg-green-500/10" style="border-color: rgba(34,197,94,0.3); color: #22C55E;" data-action="complete" data-order="${oid}"><span class="spinner"></span><span class="btn-text flex items-center gap-1"><i class="fas fa-check text-[9px]"></i> Selesai</span></button>`
      );
    }

    if (status === 'completed') {
      buttons.push(`<span class="text-xs px-2 py-1 rounded-lg" style="color: #22C55E; background: rgba(34,197,94,0.08);"><i class="fas fa-check-double mr-1"></i>Selesai</span>`);
    }
    if (status === 'cancelled') {
      buttons.push(`<span class="text-xs px-2 py-1 rounded-lg" style="color: #EF4444; background: rgba(239,68,68,0.08);"><i class="fas fa-xmark mr-1"></i>Batal</span>`);
    }

    return buttons.join('');
  }

  // ============================================================
  // ACTIONS
  // ============================================================

  async function markAsProcessing(orderId) {
    if (!orderId) return;
    if (!confirm('Yakin ingin memproses order ini?')) return;

    setButtonLoading(orderId, 'process', true);
    try {
      const TembakImei = getTembakImei();
      let success = false;
      if (TembakImei && TembakImei.updateOrderStatus) {
        success = await TembakImei.updateOrderStatus(orderId, 'processing');
      } else {
        const order = _allOrders.find(o => (o.order_id || o.id) === orderId);
        if (order) { order.status = 'processing'; success = true; }
      }
      if (success) {
        showToast('Order berhasil ditandai sebagai Processing', 'success');
        await Promise.all([loadStats(), loadOrders($searchInput ? $searchInput.value : '')]);
      } else {
        showToast('Gagal mengubah status order', 'error');
      }
    } catch (err) {
      console.error('[Admin] markAsProcessing error:', err);
      showToast('Terjadi kesalahan', 'error');
    } finally {
      setButtonLoading(orderId, 'process', false);
    }
  }

  async function markAsCompleted(orderId) {
    if (!orderId) return;
    if (!confirm('Yakin ingin menyelesaikan order ini?')) return;

    setButtonLoading(orderId, 'complete', true);
    try {
      const TembakImei = getTembakImei();
      let success = false;
      if (TembakImei && TembakImei.updateOrderStatus) {
        success = await TembakImei.updateOrderStatus(orderId, 'completed');
      } else {
        const order = _allOrders.find(o => (o.order_id || o.id) === orderId);
        if (order) { order.status = 'completed'; success = true; }
      }
      if (success) {
        showToast('Order berhasil diselesaikan!', 'success');
        await Promise.all([loadStats(), loadOrders($searchInput ? $searchInput.value : '')]);
      } else {
        showToast('Gagal menyelesaikan order', 'error');
      }
    } catch (err) {
      console.error('[Admin] markAsCompleted error:', err);
      showToast('Terjadi kesalahan', 'error');
    } finally {
      setButtonLoading(orderId, 'complete', false);
    }
  }

  // ============================================================
  // UI HELPERS
  // ============================================================

  function setButtonLoading(orderId, action, loading) {
    const btn = document.querySelector(`button[data-order="${orderId}"][data-action="${action}"]`);
    if (btn) { btn.disabled = loading; btn.classList.toggle('loading', loading); }
  }

  function formatRelativeTime(dateString) {
    if (!dateString) return 'Baru saja';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 10) return 'Baru saja';
    if (diffSec < 60) return diffSec + ' detik lalu';
    if (diffMin < 60) return diffMin + ' menit lalu';
    if (diffHour < 24) return diffHour + ' jam lalu';
    if (diffDay < 7) return diffDay + ' hari lalu';
    return formatFullDate(dateString);
  }

  function formatFullDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    const pad = n => String(n).padStart(2, '0');
    const days = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return `${days[date.getDay()]}, ${pad(date.getDate())} ${months[date.getMonth()]} ${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function truncateString(str, maxLen) {
    if (!str) return '-';
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen - 2) + '..';
  }

  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  function getTembakImei() { return window.TembakImei || null; }

  function updateLastUpdated() {
    if ($lastUpdated) $lastUpdated.textContent = 'Terakhir diperbarui: ' + formatFullDate(new Date());
  }

  // ============================================================
  // NUMBER ANIMATION
  // ============================================================

  function animateNumber(element, target, duration) {
    if (!element) return;
    target = parseInt(target) || 0;
    duration = duration || 500;
    const existingId = _numberAnimations.get(element.id);
    if (existingId) cancelAnimationFrame(existingId);

    const startTime = performance.now();
    const startValue = parseInt(element.textContent) || 0;

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = Math.round(startValue + (target - startValue) * eased);
      if (progress < 1) {
        _numberAnimations.set(element.id, requestAnimationFrame(update));
      } else {
        element.textContent = target;
        _numberAnimations.delete(element.id);
      }
    }
    _numberAnimations.set(element.id, requestAnimationFrame(update));
  }

  // ============================================================
  // TOAST
  // ============================================================

  function showToast(message, type) {
    type = type || 'info';
    const container = document.getElementById('toast-container');
    if (!container) return;
    const styles = {
      info:    { border: 'rgba(59,130,246,0.3)',  bg: 'rgba(30,20,60,0.95)', icon: 'fa-circle-info',       color: '#3B82F6' },
      success: { border: 'rgba(34,197,94,0.3)',   bg: 'rgba(20,40,20,0.95)', icon: 'fa-circle-check',      color: '#22C55E' },
      error:   { border: 'rgba(239,68,68,0.3)',   bg: 'rgba(40,15,15,0.95)', icon: 'fa-circle-exclamation',color: '#EF4444' },
      warning: { border: 'rgba(245,158,11,0.3)',  bg: 'rgba(40,35,10,0.95)', icon: 'fa-triangle-exclamation', color: '#F59E0B' }
    };
    const style = styles[type] || styles.info;
    const toast = document.createElement('div');
    toast.className = 'toast-in pointer-events-auto';
    toast.style.cssText = `display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:12px;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);background:${style.bg};border:1px solid ${style.border};box-shadow:0 8px 32px rgba(0,0,0,0.3);min-width:260px;max-width:400px;`;
    toast.innerHTML = `<i class="fas ${style.icon}" style="color:${style.color};font-size:16px;flex-shrink:0;"></i><span class="text-xs font-medium" style="color:#F8FAFC;">${escapeHtml(message)}</span><button onclick="this.parentElement.remove()" class="ml-auto flex-shrink-0" style="color:#64748B;background:none;border:none;cursor:pointer;padding:2px;"><i class="fas fa-xmark"></i></button>`;
    container.appendChild(toast);
    setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.remove('toast-in');
        toast.classList.add('toast-out');
        setTimeout(() => { if (toast.parentElement) toast.remove(); }, 300);
      }
    }, 5000);
  }

  // ============================================================
  // AUTO-REFRESH
  // ============================================================

  function startAutoRefresh() {
    stopAutoRefresh();
    _autoRefreshInterval = setInterval(async () => {
      if (_isLoggedIn) {
        try {
          await Promise.all([loadStats(), loadOrders($searchInput ? $searchInput.value : '')]);
        } catch (err) {
          console.warn('[Admin] Auto-refresh error:', err);
        }
      }
    }, 30000);
  }

  function stopAutoRefresh() {
    if (_autoRefreshInterval) { clearInterval(_autoRefreshInterval); _autoRefreshInterval = null; }
  }

  // ============================================================
  // KEYBOARD SHORTCUTS
  // ============================================================

  function handleKeydown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      if ($searchInput && _isLoggedIn) $searchInput.focus();
    }
    if (e.key === 'Enter' && !_isLoggedIn) {
      handleLoginFromForm();
    }
  }

  // ============================================================
  // DOM CACHE & INIT
  // ============================================================

  function cacheElements() {
    $loginPage        = document.getElementById('login-page');
    $dashboardPage    = document.getElementById('dashboard-page');
    $loginPassword    = document.getElementById('login-password');
    $loginError       = document.getElementById('login-error');
    $loginErrorText   = document.getElementById('login-error-text');
    $loginBtn         = document.getElementById('login-btn');
    $loginSpinner     = document.getElementById('login-spinner');
    $loginIcon        = document.getElementById('login-icon');
    $loginBtnText     = document.getElementById('login-btn-text');
    $searchInput      = document.getElementById('search-input');
    $ordersTbody      = document.getElementById('orders-tbody');
    $tableLoading     = document.getElementById('table-loading');
    $tableEmpty       = document.getElementById('table-empty');
    $tableContainer   = document.getElementById('table-container');
    $statTotal        = document.getElementById('stat-total');
    $statPending      = document.getElementById('stat-pending');
    $statProcessing   = document.getElementById('stat-processing');
    $statCompleted    = document.getElementById('stat-completed');
    $orderCountBadge  = document.getElementById('order-count-badge');
    $lastUpdated      = document.getElementById('last-updated');
    $togglePassword   = document.getElementById('toggle-password');
    $togglePasswordIcon = document.getElementById('toggle-password-icon');
  }

  function injectShakeKeyframes() {
    if (document.getElementById('admin-keyframes')) return;
    const style = document.createElement('style');
    style.id = 'admin-keyframes';
    style.textContent = `@keyframes shake { 0%,100%{transform:translateX(0);} 20%{transform:translateX(-8px);} 40%{transform:translateX(6px);} 60%{transform:translateX(-4px);} 80%{transform:translateX(2px);} }`;
    document.head.appendChild(style);
  }

  function init() {
    cacheElements();
    injectShakeKeyframes();
    document.addEventListener('keydown', handleKeydown);
    const isAuthed = checkAuth();
    if (isAuthed) initDashboard();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ============================================================
  // PUBLIC API
  // ============================================================

  window.TembakImeiAdmin = {
    handleLoginFromForm,
    handleLogout,
    togglePasswordVisibility,
    handleSearch,
    markAsProcessing,
    markAsCompleted
  };

})();
