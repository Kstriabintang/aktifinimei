/**
 * =============================================================================
 * TEMBAK IMEI 3 BULAN - Supabase Integration Module (OTP + PROFILE)
 * =============================================================================
 * 
 * Auth: OTP-based (no password!)
 *   1. signInWithOtp(email) → Supabase sends OTP via SMTP
 *   2. verifyOtp(email, token) → auto login
 * 
 * Schema matching supabase/schema.sql:
 *   profiles: id, nama, wa_number, email, created_at
 *   orders: id, user_id, nama, email, wa_number, imei, device_name, device_model,
 *           order_id, amount, status, notes, source, created_at, updated_at
 *   payments: id, order_id, amount, fee, total_payment, payment_method,
 *             payment_number, expired_at, status, completed_at, webhook_payload, created_at, updated_at
 */

function checkSupabaseConfig() {
  const missing = [];
  if (!window.ENV) missing.push('window.ENV');
  if (!window.ENV?.SUPABASE_URL || window.ENV.SUPABASE_URL.includes('your-project')) missing.push('SUPABASE_URL');
  if (!window.ENV?.SUPABASE_ANON_KEY || window.ENV.SUPABASE_ANON_KEY.includes('your-anon-key')) missing.push('SUPABASE_ANON_KEY');
  if (missing.length) {
    console.error('[TembakImei] FATAL: ENV not configured. Missing:', missing.join(', '));
    return false;
  }
  return true;
}

if (!checkSupabaseConfig()) {
  console.error('[TembakImei] FATAL: ENV configuration not loaded. Import .env.js before supabase.js');
}

const SUPABASE_URL = window.ENV?.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.ENV?.SUPABASE_ANON_KEY || '';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =============================================================================
// AUTHENTICATION (OTP-Based — No Password!)
// =============================================================================

/**
 * Step 1: Send OTP to email
 * Supabase will send a 6-digit OTP code via the configured SMTP (SumoPod)
 */
async function signInWithOtp(email, options = {}) {
  try {
    const payload = { email };
    if (typeof options.shouldCreateUser === 'boolean') {
      payload.options = { shouldCreateUser: options.shouldCreateUser };
    }
    const { error } = await sb.auth.signInWithOtp(payload);
    if (error) throw error;
    return { error: null };
  } catch (err) {
    console.error('[TembakImei][signInWithOtp] Error:', err);
    return { error: err.message };
  }
}

/**
 * Step 2: Verify OTP code
 */
async function verifyOtp(email, token) {
  try {
    const { data, error } = await sb.auth.verifyOtp({
      email,
      token,
      type: 'email'
    });
    if (error) throw error;
    return { user: data.user, session: data.session, error: null };
  } catch (err) {
    console.error('[TembakImei][verifyOtp] Error:', err);
    return { user: null, session: null, error: err.message };
  }
}

/**
 * Logout
 */
async function signOut() {
  try {
    const { error } = await sb.auth.signOut();
    if (error) throw error;
    return { error: null };
  } catch (err) {
    console.error('[TembakImei][signOut] Error:', err);
    return { error: err.message };
  }
}

/**
 * Get current logged-in user
 */
async function getUser() {
  try {
    const { data: { user }, error } = await sb.auth.getUser();
    if (error) throw error;
    return { user, error: null };
  } catch (err) {
    return { user: null, error: err.message };
  }
}

/**
 * Get user session
 */
async function getSession() {
  try {
    const { data: { session }, error } = await sb.auth.getSession();
    if (error) throw error;
    return { session, error: null };
  } catch (err) {
    return { session: null, error: err.message };
  }
}

// =============================================================================
// PROFILE MANAGEMENT
// =============================================================================

/**
 * Get user profile from profiles table
 * @param {string} user_id
 */
async function getProfile(user_id) {
  try {
    const { data, error } = await sb
      .from('profiles')
      .select('*')
      .eq('id', user_id)
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * Update user profile
 * @param {string} user_id
 * @param {Object} updates - { nama, wa_number, email }
 */
async function updateProfile(user_id, updates) {
  const { data, error } = await sb
    .from('profiles')
    .upsert({ id: user_id, ...updates }, { onConflict: 'id' })
    .select()
    .single();
  if (error) {
    console.error('[updateProfile] FAILED:', error.code, error.message, { user_id, updates });
    throw error;
  }
  console.log('[updateProfile] SUCCESS:', data);
  return { data, error: null };
}

/**
 * Insert user profile (fallback when upsert fails due to RLS / conflict)
 * @param {string} user_id
 * @param {Object} data - { nama, wa_number, email }
 */
async function insertProfile(user_id, data) {
  try {
    const { data: result, error } = await sb
      .from('profiles')
      .insert([{ id: user_id, ...data }])
      .select()
      .single();
    if (error) throw error;
    console.log('[insertProfile] SUCCESS:', result);
    return { data: result, error: null };
  } catch (err) {
    console.error('[insertProfile] FAILED:', err.message, { user_id, data });
    throw err;
  }
}

/**
 * Check if user is new (no profile yet)
 * @param {string} user_id
 */
async function isNewUser(user_id) {
  try {
    const { data, error } = await sb
      .from('profiles')
      .select('id')
      .eq('id', user_id)
      .single();
    if (error && error.code === 'PGRST116') return true; // Not found = new user
    return false;
  } catch (err) {
    return true;
  }
}

// =============================================================================
// ORDER CRUD
// =============================================================================

async function createOrder(orderData) {
  try {
    const { nama, email, wa_number, imei, device_name, device_model, order_id, amount, user_id } = orderData;

    if (!nama || !email || !wa_number || !imei || !device_name || !order_id) {
      return { order_id: null, error: 'Semua field wajib diisi' };
    }
    if (!/^\d{15}$/.test(imei)) {
      return { order_id: null, error: 'IMEI harus 15 digit angka' };
    }

    const { data, error } = await sb
      .from('orders')
      .insert([{
        user_id: user_id || null,
        nama,
        email,
        wa_number,
        imei,
        device_name,
        device_model: device_model || '',
        order_id,
        amount: amount || window.ENV.PRICE_AMOUNT,
        status: 'pending',
        source: 'website',
        notes: ''
      }])
      .select()
      .single();

    if (error) {
      console.error('[TembakImei][createOrder] Supabase error:', error);
      return { order_id: null, error: `Gagal membuat order: ${error.message}` };
    }

    return { order_id: data.order_id, error: null };
  } catch (err) {
    console.error('[TembakImei][createOrder] Unexpected error:', err);
    return { order_id: null, error: `Terjadi kesalahan: ${err.message}` };
  }
}

async function getOrderById(orderId) {
  try {
    if (!orderId) return null;
    const { data, error } = await sb
      .from('orders')
      .select('*, payments(*)')
      .eq('order_id', orderId)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('[TembakImei][getOrderById] Supabase error:', error);
      return null;
    }
    return data;
  } catch (err) {
    console.error('[TembakImei][getOrderById] Unexpected error:', err);
    return null;
  }
}

async function getOrderByImei(imei) {
  try {
    if (!imei || !/^\d{15}$/.test(imei)) return null;
    const { data, error } = await sb
      .from('orders')
      .select('*, payments(*)')
      .eq('imei', imei)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('[TembakImei][getOrderByImei] Supabase error:', error);
      return null;
    }
    return data;
  } catch (err) {
    console.error('[TembakImei][getOrderByImei] Unexpected error:', err);
    return null;
  }
}

async function getOrdersByUser() {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return [];
    const { data, error } = await sb
      .from('orders')
      .select('*, payments(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[TembakImei][getOrdersByUser] Supabase error:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('[TembakImei][getOrdersByUser] Unexpected error:', err);
    return [];
  }
}

async function updateOrderStatus(orderId, status) {
  try {
    const validStatuses = ['pending', 'processing', 'completed', 'cancelled'];
    if (!orderId || !validStatuses.includes(status)) {
      console.error('[TembakImei][updateOrderStatus] Invalid params');
      return false;
    }
    const { error } = await sb.from('orders').update({ status }).eq('order_id', orderId);
    if (error) {
      console.error('[TembakImei][updateOrderStatus] Supabase error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[TembakImei][updateOrderStatus] Unexpected error:', err);
    return false;
  }
}

// =============================================================================
// PAYMENT CRUD
// =============================================================================

async function createPayment(paymentData) {
  try {
    const { order_id, amount, fee, total_payment, payment_method, payment_number, expired_at } = paymentData;
    const { error } = await sb.from('payments').insert([{
      order_id, amount, fee: fee || 0, total_payment, payment_method, payment_number, expired_at, status: 'pending'
    }]);
    if (error) {
      console.error('[TembakImei][createPayment] Supabase error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[TembakImei][createPayment] Unexpected error:', err);
    return false;
  }
}

async function updatePaymentStatus(orderId, status, webhookPayload) {
  try {
    const updateData = { status, webhook_payload: webhookPayload };
    if (status === 'completed') updateData.completed_at = new Date().toISOString();
    const { error } = await sb.from('payments').update(updateData).eq('order_id', orderId);
    if (error) {
      console.error('[TembakImei][updatePaymentStatus] Supabase error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[TembakImei][updatePaymentStatus] Unexpected error:', err);
    return false;
  }
}

// =============================================================================
// ADMIN / OWNER FUNCTIONS
// =============================================================================

async function getAllOrders(limit = 100) {
  try {
    const { data, error } = await sb
      .from('orders')
      .select('*, payments(*)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.error('[TembakImei][getAllOrders] Supabase error:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('[TembakImei][getAllOrders] Unexpected error:', err);
    return [];
  }
}

async function getPendingOrders() {
  try {
    const { data, error } = await sb
      .from('orders')
      .select('*, payments(*)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[TembakImei][getPendingOrders] Supabase error:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('[TembakImei][getPendingOrders] Unexpected error:', err);
    return [];
  }
}

async function getOrderStats() {
  try {
    const { data, error } = await sb.from('orders').select('status');
    if (error) {
      console.error('[TembakImei][getOrderStats] Supabase error:', error);
      return { total: 0, pending: 0, processing: 0, completed: 0, cancelled: 0 };
    }
    const orders = data || [];
    const stats = { total: orders.length, pending: 0, processing: 0, completed: 0, cancelled: 0 };
    for (const o of orders) {
      if (stats.hasOwnProperty(o.status)) stats[o.status]++;
    }
    return stats;
  } catch (err) {
    console.error('[TembakImei][getOrderStats] Unexpected error:', err);
    return { total: 0, pending: 0, processing: 0, completed: 0, cancelled: 0 };
  }
}

// =============================================================================
// REALTIME SUBSCRIPTION
// =============================================================================

function subscribeToNewOrders(callback) {
  try {
    if (typeof callback !== 'function') return;
    const channel = sb
      .channel('orders-insert-channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        callback(payload.new);
      })
      .subscribe();
    return channel;
  } catch (err) {
    console.error('[TembakImei][subscribeToNewOrders] Error:', err);
  }
}

// =============================================================================
// EXPORT
// =============================================================================
window.TembakImei = window.TembakImei || {};
Object.assign(window.TembakImei, {
  supabase: sb,
  // Auth (OTP)
  signInWithOtp,
  verifyOtp,
  signOut,
  getUser,
  getSession,
  isNewUser,
  // Profile
  getProfile,
  updateProfile,
  insertProfile,
  // Orders
  createOrder,
  getOrderById,
  getOrderByImei,
  getOrdersByUser,
  updateOrderStatus,
  // Payments
  createPayment,
  updatePaymentStatus,
  // Admin
  getAllOrders,
  getPendingOrders,
  getOrderStats,
  // Realtime
  subscribeToNewOrders
});

console.log('[TembakImei] supabase.js loaded — OTP Auth + Profile ready');
