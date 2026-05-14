/**
 * =============================================================================
 * TEMBAK IMEI - Environment Configuration
 * =============================================================================
 *
 * ⚠️  GANTI SEMUA VALUE DIBAWAH INI SEBELUM DEPLOY KE PRODUCTION!
 *
 * Cara mendapatkan nilai-nilai ini:
 *
 * 1. SUPABASE_URL & SUPABASE_ANON_KEY:
 *    - Buka dashboard Supabase → Project Settings → API
 *    - Copy "URL" ke SUPABASE_URL
 *    - Copy "anon public" ke SUPABASE_ANON_KEY
 *
 * 2. EDGE_FUNCTION_BASE_URL:
 *    - Format: https://<project-ref>.supabase.co/functions/v1
 *    - Ganti <project-ref> dengan project reference ID Supabase kamu
 *    - Untuk local testing: http://localhost:54321/functions/v1
 *
 * 3. PAKASIR_SLUG:
 *    - Login ke https://app.pakasir.com
 *    - Copy "Slug" dari dashboard store Anda
 *    - Contoh: "aktifinimei"
 *
 * 4. PRICE_AMOUNT:
 *    - Harga produk dalam Rupiah
 *    - Contoh: 150000 (Rp 150.000)
 *
 * 5. ADMIN_PASSWORD_HASH:
 *    - Password admin panel (admin.html)
 *    - Untuk keamanan, ganti default di production
 */

window.ENV = {
  // Supabase (WAJIB)
  SUPABASE_URL:         'https://eyvzqwbonvymnzcwvrzg.supabase.co',
  SUPABASE_ANON_KEY:    'sb_publishable_aXNsqmFuZGEAB-ldUSLDBA_GRLdzfqD',

  // Supabase Edge Functions (WAJIB)
  // Format: https://<project-ref>.supabase.co/functions/v1
  EDGE_FUNCTION_BASE_URL: 'https://eyvzqwbonvymnzcwvrzg.supabase.co/functions/v1',

  // Pakasir (WAJIB - untuk admin panel & fallback)
  PAKASIR_SLUG:         'aktifinimei',

  // Harga produk (opsional, default 150000)
  PRICE_AMOUNT:         150000,

  // Admin panel (default: admin123)
  ADMIN_PASSWORD_HASH:  'admin123'
};
