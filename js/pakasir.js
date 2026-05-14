/**
 * =============================================================================
 * TEMBAK IMEI 3 BULAN - Custom Payment Modal (Supabase Edge Functions)
 * =============================================================================
 *
 * Flow:
 * 1. createPayment(orderId, amount) → call Edge Function → get QR string
 * 2. showPaymentModal(data) → render QR + countdown + polling
 * 3. pollPaymentStatus(orderId) → every 5s via Edge Function
 * 4. on completed → hide modal, show success, update order status
 *
 * Dependencies:
 *   - qrcode.js (loaded via CDN in index.html)
 *   - Supabase client (for auth token)
 */

/* ==========================================================
   CONFIG
   ========================================================== */

function getEdgeBaseUrl() {
  return window.ENV?.EDGE_FUNCTION_BASE_URL || '';
}

function getAuthToken() {
  // Try to get from Supabase session
  if (window.TembakImei?.supabase) {
    const sb = window.TembakImei.supabase;
    // We can't easily get the token synchronously, but the Edge Function
    // call in main.js will use the session from supabase.auth
    return null;
  }
  return null;
}

/* ==========================================================
   API CALLS (Edge Functions)
   ========================================================== */

/**
 * Call create-payment Edge Function
 */
async function createPayment(orderId, amount) {
  const base = getEdgeBaseUrl();
  if (!base) throw new Error('EDGE_FUNCTION_BASE_URL not configured');

  const url = `${base}/create-payment`;

  // Get current session token
  let token = '';
  try {
    const { data } = await window.TembakImei.supabase.auth.getSession();
    token = data.session?.access_token || '';
  } catch (_) {}

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ order_id: orderId, amount }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data.payment;
}

/**
 * Call check-payment Edge Function
 */
async function checkPaymentStatus(orderId) {
  const base = getEdgeBaseUrl();
  if (!base) throw new Error('EDGE_FUNCTION_BASE_URL not configured');

  const url = `${base}/check-payment`;

  let token = '';
  try {
    const { data } = await window.TembakImei.supabase.auth.getSession();
    token = data.session?.access_token || '';
  } catch (_) {}

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ order_id: orderId }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

/* ==========================================================
   PAYMENT MODAL UI
   ========================================================== */

let _pollInterval = null;
let _countdownInterval = null;
let _currentOrderId = null;

function showPaymentModal(payment) {
  const modal = document.getElementById('payment-modal');
  if (!modal) {
    console.error('[Pakasir] Payment modal not found in DOM');
    return;
  }

  _currentOrderId = payment.order_id;

  // Set texts
  const orderIdEl = document.getElementById('payment-modal-order-id');
  const totalEl = document.getElementById('payment-modal-total');
  const feeEl = document.getElementById('payment-modal-fee');
  const qrContainer = document.getElementById('payment-qr-container');
  const pollingStatus = document.getElementById('payment-polling-status');

  if (orderIdEl) orderIdEl.textContent = payment.order_id;
  if (totalEl) totalEl.textContent = 'Rp ' + (payment.total_payment || payment.amount || 0).toLocaleString('id-ID');
  if (feeEl) feeEl.textContent = payment.fee
    ? `Termasuk biaya layanan Rp ${payment.fee.toLocaleString('id-ID')}`
    : 'Termasuk biaya layanan';
  if (pollingStatus) pollingStatus.textContent = 'Menunggu pembayaran...';

  // Render QR Code
  if (qrContainer) {
    qrContainer.innerHTML = '';
    if (typeof QRCode !== 'undefined' && payment.payment_number) {
      try {
        new QRCode(qrContainer, {
          text: payment.payment_number,
          width: 200,
          height: 200,
          colorDark: '#000000',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.M,
        });
      } catch (err) {
        console.error('[Pakasir] QR render error:', err);
        qrContainer.innerHTML = '<p class="text-xs text-red-400">Gagal render QR</p>';
      }
    } else if (payment.payment_number) {
      qrContainer.innerHTML = '<p class="text-xs text-amber-400">Library QR belum siap. Refresh halaman.</p>';
    } else {
      qrContainer.innerHTML = '<p class="text-xs text-red-400">QR string tidak tersedia</p>';
    }
  }

  // Show modal
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.body.style.overflow = 'hidden';

  // Start countdown
  if (payment.expired_at) {
    startCountdown(payment.expired_at);
  } else {
    updateTimerDisplay('--:--');
  }

  // Start polling
  startPolling(payment.order_id);
}

function closePaymentModal() {
  const modal = document.getElementById('payment-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  document.body.style.overflow = '';
  stopPolling();
  stopCountdown();
  _currentOrderId = null;
}

function updateTimerDisplay(text) {
  const el = document.getElementById('payment-timer');
  if (el) el.textContent = text;
}

function startCountdown(expiredAt) {
  stopCountdown();
  const end = new Date(expiredAt).getTime();

  function tick() {
    const now = Date.now();
    const diff = end - now;
    if (diff <= 0) {
      updateTimerDisplay('00:00');
      const statusEl = document.getElementById('payment-polling-status');
      if (statusEl) {
        statusEl.textContent = 'Waktu pembayaran habis';
        statusEl.style.color = '#f87171';
      }
      stopPolling();
      return;
    }
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    updateTimerDisplay(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
  }

  tick();
  _countdownInterval = setInterval(tick, 1000);
}

function stopCountdown() {
  if (_countdownInterval) {
    clearInterval(_countdownInterval);
    _countdownInterval = null;
  }
}

/* ==========================================================
   POLLING
   ========================================================== */

function startPolling(orderId) {
  stopPolling();
  let attempts = 0;
  const maxAttempts = 360; // 360 × 5s = 30 menit

  async function poll() {
    attempts++;
    if (attempts > maxAttempts) {
      stopPolling();
      const statusEl = document.getElementById('payment-polling-status');
      if (statusEl) statusEl.textContent = 'Polling dihentikan (timeout). Klik "Sudah Bayar" untuk cek manual.';
      return;
    }

    try {
      const result = await checkPaymentStatus(orderId);
      const status = String(result.status || '').toLowerCase();

      const statusEl = document.getElementById('payment-polling-status');
      if (statusEl) {
        if (status === 'pending') {
          statusEl.textContent = `Menunggu pembayaran... (${attempts})`;
        } else if (status === 'processing') {
          statusEl.textContent = 'Pembayaran sedang diproses...';
        } else if (status === 'completed') {
          statusEl.textContent = 'Pembayaran berhasil!';
          statusEl.style.color = '#4ade80';
        } else {
          statusEl.textContent = `Status: ${status}`;
        }
      }

      if (status === 'completed') {
        stopPolling();
        stopCountdown();
        onPaymentSuccess(orderId);
        return;
      }

      if (status === 'cancelled' || status === 'failed') {
        stopPolling();
        const pollingStatus = document.getElementById('payment-polling-status');
        if (pollingStatus) {
          pollingStatus.textContent = 'Pembayaran dibatalkan / gagal';
          pollingStatus.style.color = '#f87171';
        }
        return;
      }
    } catch (err) {
      console.warn('[Pakasir] Poll error:', err.message);
    }
  }

  // Poll immediately, then every 5s
  poll();
  _pollInterval = setInterval(poll, 5000);
}

function stopPolling() {
  if (_pollInterval) {
    clearInterval(_pollInterval);
    _pollInterval = null;
  }
}

function onPaymentSuccess(orderId) {
  // Dispatch custom event so main.js can handle UI updates
  window.dispatchEvent(new CustomEvent('payment:completed', {
    detail: { order_id: orderId },
  }));

  // Auto-close modal after 3s
  setTimeout(() => {
    closePaymentModal();
  }, 3000);
}

/* ==========================================================
   UTILITIES
   ========================================================== */

function formatRupiah(num) {
  if (typeof num !== 'number') return 'Rp 0';
  return 'Rp ' + num.toLocaleString('id-ID');
}

/* ==========================================================
   LEGACY / UNUSED (kept for reference, will be removed)
   ========================================================== */

// Old redirect URL methods — removed in favor of Edge Functions

/* ==========================================================
   EXPORT
   ========================================================== */

window.TembakImei = window.TembakImei || {};
Object.assign(window.TembakImei, {
  // Edge Function API
  createPayment,
  checkPaymentStatus,
  // Modal UI
  showPaymentModal,
  closePaymentModal,
  startPolling,
  stopPolling,
  // Utils
  formatRupiah,
});

console.log('[TembakImei] pakasir.js loaded — Custom Payment Modal + Edge Functions ready');
