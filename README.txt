═══════════════════════════════════════════
  TEMBAK IMEI 3 BULAN - Website Setup Guide
═══════════════════════════════════════════

📁 FILE STRUCTURE
-----------------
/
├── index.html          Landing page + Order form + Status check
├── admin.html          Admin dashboard (login + orders table)
├── css/
│   └── style.css       Custom styles (glassmorphism, glows, animations)
├── js/
│   ├── main.js         Landing page logic (form, validation, status)
│   ├── supabase.js     Supabase database CRUD operations
│   ├── pakasir.js      Payment gateway + notifications
│   └── admin.js        Admin panel logic (auth, table, CRUD)
├── .env.js             Configuration (credentials)
├── images/
│   ├── dashboard-mockup.jpg
│   ├── icon-imei.png
│   ├── icon-payment.png
│   └── icon-notif.png
└── README.txt          This file

🔧 SETUP INSTRUCTIONS
---------------------

1. SUPABASE SETUP
   - Create account at https://supabase.com
   - Create new project
   - Go to SQL Editor → New query
   - Run this SQL:

     CREATE TABLE orders (
       id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
       imei text NOT NULL CHECK (length(imei) = 15),
       device_model text NOT NULL,
       whatsapp text NOT NULL,
       email text,
       status text DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'processing', 'completed', 'failed')),
       pakasir_invoice_id text,
       payment_url text,
       created_at timestamptz DEFAULT now(),
       paid_at timestamptz,
       completed_at timestamptz
     );

     -- Enable RLS
     ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

     -- Allow anonymous inserts
     CREATE POLICY "Allow anon insert" ON orders
       FOR INSERT WITH CHECK (true);

     -- Allow anonymous select
     CREATE POLICY "Allow anon select" ON orders
       FOR SELECT USING (true);

     -- Allow anon update (for status changes)
     CREATE POLICY "Allow anon update" ON orders
       FOR UPDATE USING (true);

   - Go to Project Settings → API → copy URL and Anon Key
   - Paste into .env.js

2. PAKASIR PAYMENT SETUP
   - Register at https://pakasir.com
   - Get API key from dashboard
   - Paste into .env.js PAKASIR_API_KEY
   - Update PAKASIR_API_URL if different

3. TELEGRAM BOT SETUP
   - Message @BotFather on Telegram
   - Create new bot, get token
   - Paste into .env.js TELEGRAM_BOT_TOKEN
   - Add bot to your admin group/channel
   - Get chat ID (use https://api.telegram.org/bot<TOKEN>/getUpdates)
   - Paste into .env.js TELEGRAM_CHAT_ID

4. WHATSAPP NOTIFICATIONS
   - Add owner WhatsApp number to .env.js OWNER_WHATSAPP
   - For advanced: Use Wablas/Fonnte API (code has stubs)

5. ADMIN PASSWORD
   - Change ADMIN_PASSWORD_HASH in .env.js
   - Default: "admin123" (CHANGE THIS!)

6. DEPLOY
   - Upload all files to any static hosting:
     • Vercel (vercel.com)
     • Netlify (netlify.com)
     • GitHub Pages
     • cPanel / traditional hosting
   - Make sure .env.js is included (it's client-side safe)

📱 FEATURES
-----------
- Landing page with glassmorphism dark purple design
- IMEI order form with validation
- Payment via Pakasir.com (auto invoice creation)
- Status tracking with visual timeline
- WhatsApp & Telegram notifications
- Admin dashboard with order management
- Auto-refresh every 30 seconds
- Responsive: Desktop + Mobile

🎨 CUSTOMIZATION
----------------
- Edit .env.js to change prices, credentials
- Edit colors in css/style.css :root variables
- Edit text directly in index.html / admin.html

⚠️ IMPORTANT NOTES
------------------
- This is CLIENT-SIDE code. Supabase RLS must be configured properly.
- For production, use Supabase Edge Functions for webhooks (security).
- The .env.js is visible in browser — only use ANON keys, never service keys.
- Change admin password before going live.

📞 SUPPORT
----------
- WhatsApp: (your number)
- Telegram: (your channel)

═══════════════════════════════════════════
Built 2026 | TEMBAKIMEI
═══════════════════════════════════════════
