/**
 * TEMBAKIMEI - Main Application JavaScript (OTP + PROFILE + ORDER FLOW)
 * @version 3.2.0
 */

(function () {
    'use strict';

    const DOM = {};
    function $(sel, ctx) { return (ctx || document).querySelector(sel); }
    function $$(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

    let _currentUser = null;
    let _currentProfile = null;
    let _resendTimer = null;
    let _resendEmail = '';
    let _pendingNama = '';
    let _emailIsNew = false;

    /* ==========================================================
       AUTH STATE MANAGEMENT
       ========================================================== */

    async function initAuth() {
        const { user } = await window.TembakImei.getUser();
        _currentUser = user;
        if (user) {
            const { data } = await window.TembakImei.getProfile(user.id);
            _currentProfile = data;
        }
        updateAuthUI();
    }

    function updateAuthUI() {
        const authNav = $('#auth-nav');
        const userNav = $('#user-nav');
        const userName = $('#user-name');
        const guestView = $('#order-guest-view');
        const formView = $('#order-form-view');
        const mobileProfile = $('#mobile-profile');

        if (authNav && userNav) {
            if (_currentUser) {
                authNav.classList.add('hidden');
                authNav.classList.remove('flex');
                userNav.classList.remove('hidden');
                userNav.classList.add('flex');
                const displayName = _currentProfile?.nama?.trim() || _currentProfile?.full_name?.trim() || '';
                userName.textContent = displayName || _currentUser?.email || '';
                if (mobileProfile) { mobileProfile.classList.remove('hidden'); }
            } else {
                authNav.classList.remove('hidden');
                authNav.classList.add('flex');
                userNav.classList.add('hidden');
                userNav.classList.remove('flex');
                if (mobileProfile) { mobileProfile.classList.add('hidden'); }
            }
        }

        if (guestView && formView) {
            if (_currentUser) {
                guestView.classList.add('hidden');
                formView.classList.remove('hidden');
            } else {
                guestView.classList.remove('hidden');
                formView.classList.add('hidden');
            }
        }

        if (_currentProfile) {
            // BUGFIX 3: Never fill nama field with email — only use nama or full_name
            const profileNama = _currentProfile.nama?.trim() || _currentProfile.full_name?.trim() || '';
            if (DOM.namaInput && !DOM.namaInput.value) DOM.namaInput.value = profileNama;
            if (DOM.whatsappInput && !DOM.whatsappInput.value) DOM.whatsappInput.value = _currentProfile.wa_number || '';
            if (DOM.emailInput && !DOM.emailInput.value) DOM.emailInput.value = _currentUser.email || '';
        }
    }

    /* ==========================================================
       OTP AUTH MODAL
       ========================================================== */

    function openAuthModal() {
        const modal = $('#auth-modal');
        if (!modal) return;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        showOtpStep(1);
        resetOtpStep1();
        hideOtpErrors();
        clearInterval(_resendTimer);
    }

    function resetOtpStep1() {
        $('#otp-email').value = '';
        $('#otp-code').value = '';
        $('#otp-first-name').value = '';
        $('#otp-last-name').value = '';
        _pendingNama = '';
        _emailIsNew = false;
        hideNameFields();
        updateOtpButtonText('Kirim Kode OTP');
        clearNameFieldError('first');
        clearNameFieldError('last');
    }

    function showNameFieldError(field, message) {
        const input = field === 'first' ? $('#otp-first-name') : $('#otp-last-name');
        const errorEl = field === 'first' ? $('#otp-first-name-error') : $('#otp-last-name-error');
        if (input) input.style.borderColor = 'rgba(239,68,68,0.6)';
        if (errorEl) { errorEl.textContent = message; errorEl.classList.remove('hidden'); }
    }

    function clearNameFieldError(field) {
        const input = field === 'first' ? $('#otp-first-name') : $('#otp-last-name');
        const errorEl = field === 'first' ? $('#otp-first-name-error') : $('#otp-last-name-error');
        if (input) input.style.borderColor = 'rgba(139,92,246,0.3)';
        if (errorEl) errorEl.classList.add('hidden');
    }

    function showNameFields() {
        const wrap = $('#otp-name-fields');
        if (wrap) wrap.classList.remove('hidden');
    }

    function hideNameFields() {
        const wrap = $('#otp-name-fields');
        if (wrap) wrap.classList.add('hidden');
    }

    function updateOtpButtonText(text) {
        const el = $('#otp-send-text');
        if (el) el.textContent = text;
    }

    async function checkEmailExists(email) {
        const base = window.ENV?.EDGE_FUNCTION_BASE_URL || (window.ENV?.SUPABASE_URL ? window.ENV.SUPABASE_URL + '/functions/v1' : '');
        const url = base ? `${base}/check-email` : '';
        console.log('[checkEmail] URL:', url, '| email:', email);
        if (!url) {
            console.warn('[checkEmail] EDGE_FUNCTION_BASE_URL / SUPABASE_URL not configured');
            return null;
        }
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            console.log('[checkEmail] Response status:', res.status);
            const data = await res.json();
            console.log('[checkEmail] Response data:', data);
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            console.log('[checkEmail] Parsed — exists:', data.exists, '| hasName:', data.hasName);
            return data;
        } catch (err) {
            console.warn('[checkEmail] Error:', err.message);
            return null;
        }
    }

    function closeAuthModal() {
        const modal = $('#auth-modal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        clearInterval(_resendTimer);
    }

    function showOtpStep(step) {
        const step1 = $('#otp-step-1');
        const step2 = $('#otp-step-2');
        if (step === 1) {
            step1.classList.remove('hidden');
            step2.classList.add('hidden');
        } else {
            step1.classList.add('hidden');
            step2.classList.remove('hidden');
        }
    }

    function hideOtpErrors() {
        const err1 = $('#otp-error');
        const err2 = $('#otp-verify-error');
        if (err1) err1.classList.add('hidden');
        if (err2) err2.classList.add('hidden');
    }

    function setOtpSendLoading(loading) {
        const btn = $('#otp-send-btn');
        const spinner = $('#otp-send-spinner');
        const text = $('#otp-send-text');
        if (loading) {
            btn.disabled = true;
            spinner.classList.remove('hidden');
            text.textContent = 'Mengirim...';
        } else {
            btn.disabled = false;
            spinner.classList.add('hidden');
            text.textContent = 'Kirim Kode OTP';
        }
    }

    function setOtpVerifyLoading(loading) {
        const btn = $('#otp-verify-btn');
        const spinner = $('#otp-verify-spinner');
        const text = $('#otp-verify-text');
        if (loading) {
            btn.disabled = true;
            spinner.classList.remove('hidden');
            text.textContent = 'Memverifikasi...';
        } else {
            btn.disabled = false;
            spinner.classList.add('hidden');
            text.textContent = 'Verifikasi';
        }
    }

    function injectResendUI() {
        if ($('#otp-resend-wrap')) return;
        const wrap = document.createElement('div');
        wrap.id = 'otp-resend-wrap';
        wrap.style.cssText = 'margin-top: 16px; text-align: center;';
        wrap.innerHTML = `
            <p id="otp-spam-notice" style="font-size: 12px; color: #9ca3af; margin-bottom: 10px; line-height: 1.5;">
                Tidak ada email masuk? Cek folder <span style="color: #a78bfa; font-weight: 600;">Spam / Junk</span> di emailmu.
            </p>
            <button id="otp-resend-btn" disabled style="font-size: 13px; background: none; border: 1px solid rgba(167,139,250,0.3); border-radius: 8px; padding: 8px 20px; cursor: not-allowed; color: #6b7280; transition: all 0.2s; width: 100%;">
                Kirim ulang dalam <span id="otp-countdown">60</span> detik
            </button>
        `;
        const step2 = $('#otp-step-2');
        if (step2) step2.appendChild(wrap);
        $('#otp-resend-btn').addEventListener('click', async function () {
            if (this.disabled) return;
            this.disabled = true; this.style.cursor = 'not-allowed'; this.style.color = '#6b7280'; this.textContent = 'Mengirim...';
            showToast('Mengirim ulang kode OTP...', 'info');
            const { error } = await window.TembakImei.signInWithOtp(_resendEmail);
            if (error) {
                showToast('Gagal kirim ulang: ' + error, 'error');
                this.disabled = false; this.style.cursor = 'pointer'; this.style.color = '#a78bfa'; this.textContent = '↺ Kirim ulang kode OTP';
            } else {
                showToast('Kode OTP baru telah dikirim!', 'success');
                startResendCountdown(_resendEmail);
            }
        });
    }

    function startResendCountdown(email) {
        _resendEmail = email;
        injectResendUI();
        clearInterval(_resendTimer);
        let seconds = 60;
        const btn = $('#otp-resend-btn');
        if (btn) {
            btn.disabled = true; btn.style.cursor = 'not-allowed'; btn.style.color = '#6b7280';
            btn.innerHTML = `Kirim ulang dalam <span id="otp-countdown">${seconds}</span> detik`;
        }
        _resendTimer = setInterval(function () {
            seconds--;
            const el = $('#otp-countdown');
            if (el) el.textContent = seconds;
            if (seconds <= 0) {
                clearInterval(_resendTimer);
                const b = $('#otp-resend-btn');
                if (b) { b.disabled = false; b.style.cursor = 'pointer'; b.style.color = '#a78bfa'; b.innerHTML = '↺ Kirim ulang kode OTP'; }
            }
        }, 1000);
    }

    async function handleSendOtp() {
        const email = $('#otp-email').value.trim();
        const errorEl = $('#otp-error');
        hideOtpErrors();

        if (!email || !email.includes('@')) {
            errorEl.textContent = 'Masukkan email yang valid';
            errorEl.classList.remove('hidden');
            return;
        }

        const nameFieldsVisible = !$('#otp-name-fields').classList.contains('hidden');

        if (!nameFieldsVisible) {
            // Phase 1: Check if email exists, then login or show name fields for registration
            setOtpSendLoading(true);
            const dbCheck = await checkEmailExists(email);

            if (dbCheck === null || dbCheck.exists === false) {
                // Edge Function unreachable or email not found → show name fields (register flow)
                setOtpSendLoading(false);
                _emailIsNew = true;
                showNameFields();
                updateOtpButtonText('Daftar & Kirim OTP');
                return;
            }

            // Existing user → send OTP directly (login flow)
            _emailIsNew = false;
            const { error } = await window.TembakImei.signInWithOtp(email, { shouldCreateUser: false });
            setOtpSendLoading(false);

            if (error) {
                errorEl.textContent = error;
                errorEl.classList.remove('hidden');
                return;
            }

            goToOtpStep2(email);

        } else {
            // Phase 2: Name fields visible → validate names, then send OTP (register flow)
            const firstName = $('#otp-first-name')?.value.trim();
            const lastName = $('#otp-last-name')?.value.trim();
            let hasError = false;

            clearNameFieldError('first');
            clearNameFieldError('last');

            if (!firstName) {
                showNameFieldError('first', '⚠ Nama depan wajib diisi');
                hasError = true;
            }
            if (!lastName) {
                showNameFieldError('last', '⚠ Nama belakang wajib diisi');
                hasError = true;
            }
            if (hasError) return;

            _pendingNama = (firstName + ' ' + lastName).trim();
            _emailIsNew = true;

            setOtpSendLoading(true);
            const { error } = await window.TembakImei.signInWithOtp(email, { shouldCreateUser: true });
            setOtpSendLoading(false);

            if (error) {
                errorEl.textContent = error;
                errorEl.classList.remove('hidden');
                return;
            }

            goToOtpStep2(email);
        }
    }

    function goToOtpStep2(email) {
        $('#otp-display-email').textContent = email;
        showOtpStep(2);
        startResendCountdown(email);
        showToast('Kode OTP telah dikirim ke email Anda', 'success');
        setTimeout(() => { $('#otp-code').focus(); }, 100);
    }

    async function handleVerifyOtp() {
        const email = $('#otp-email').value.trim();
        const token = $('#otp-code').value.trim();
        const errorEl = $('#otp-verify-error');
        hideOtpErrors();
        if (!token || token.length !== 6 || !/^\d{6}$/.test(token)) { errorEl.textContent = 'Kode OTP harus 6 digit angka'; errorEl.classList.remove('hidden'); return; }
        setOtpVerifyLoading(true);
        const { user, session, error } = await window.TembakImei.verifyOtp(email, token);
        setOtpVerifyLoading(false);
        if (error || !user) { errorEl.textContent = error || 'Verifikasi gagal. Coba lagi.'; errorEl.classList.remove('hidden'); return; }

        _currentUser = user;
        console.log('[OTP] User verified:', user.id, '| email:', user.email);
        console.log('[OTP] Pending nama:', _pendingNama || '(kosong)');
        clearInterval(_resendTimer);
        closeAuthModal();

        // RULE 1: _pendingNama terisi → wajib simpan ke DB, set _currentProfile, update UI, return.
        // Jangan pernah buka profile modal.
        if (_pendingNama) {
            console.log('[OTP] RULE 1 — Saving pending nama:', _pendingNama);
            const profilePayload = { id: user.id, email: user.email, nama: _pendingNama };
            console.log('[OTP] Attempting upsert with:', profilePayload);
            try {
                const result = await window.TembakImei.updateProfile(user.id, { nama: _pendingNama, email: user.email });
                console.log('[OTP] Profile upsert success:', result);
                _currentProfile = result.data;
            } catch (err) {
                console.error('[OTP] Upsert failed:', err.message, '| Trying insert fallback...');
                try {
                    const result = await window.TembakImei.insertProfile(user.id, { nama: _pendingNama, email: user.email });
                    console.log('[OTP] Profile insert fallback success:', result);
                    _currentProfile = result.data;
                } catch (insertErr) {
                    console.error('[OTP] Insert fallback also failed:', insertErr.message);
                    _currentProfile = profilePayload;
                }
            }
            _pendingNama = '';
            updateAuthUI();
            showToast('Akun berhasil dibuat! Selamat datang.', 'success');
            return;
        }

        // RULE 2: _pendingNama kosong → cek isNewUser.
        // Jika baru tanpa nama → buat fallback dari email prefix, save, update UI, return.
        // Jangan pernah buka profile modal.
        const isNew = await window.TembakImei.isNewUser(user.id);
        console.log('[OTP] isNewUser:', isNew);
        if (isNew) {
            const emailPrefix = email.split('@')[0];
            const fallbackNama = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
            console.log('[OTP] RULE 2 — New user, creating fallback nama:', fallbackNama);
            try {
                const result = await window.TembakImei.updateProfile(user.id, { nama: fallbackNama, email: user.email });
                console.log('[OTP] Fallback profile upsert success:', result);
                _currentProfile = result.data;
            } catch (err) {
                console.error('[OTP] Fallback upsert failed:', err.message, '| Trying insert fallback...');
                try {
                    const result = await window.TembakImei.insertProfile(user.id, { nama: fallbackNama, email: user.email });
                    console.log('[OTP] Fallback profile insert success:', result);
                    _currentProfile = result.data;
                } catch (insertErr) {
                    console.error('[OTP] Fallback insert also failed:', insertErr.message);
                    _currentProfile = { id: user.id, nama: fallbackNama, email: user.email };
                }
            }
            updateAuthUI();
            showToast('Selamat datang! Profil Anda telah dibuat.', 'success');
            return;
        }

        // User lama (returning) → fetch profile dari DB
        console.log('[OTP] Returning user — fetching profile...');
        const { data } = await window.TembakImei.getProfile(user.id);
        _currentProfile = data;
        console.log('[OTP] Profile fetched:', _currentProfile);

        // SAFETY: jika somehow profile tidak punya nama, buat fallback
        if (!_currentProfile || !_currentProfile.nama) {
            const emailPrefix = email.split('@')[0];
            const fallbackNama = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
            console.log('[OTP] SAFETY — Returning user without nama, fixing with:', fallbackNama);
            try {
                const result = await window.TembakImei.updateProfile(user.id, { nama: fallbackNama, email: user.email });
                console.log('[OTP] Safety profile upsert success:', result);
                _currentProfile = result.data;
            } catch (err) {
                console.error('[OTP] Safety upsert failed:', err.message, '| Trying insert fallback...');
                try {
                    const result = await window.TembakImei.insertProfile(user.id, { nama: fallbackNama, email: user.email });
                    console.log('[OTP] Safety profile insert success:', result);
                    _currentProfile = result.data;
                } catch (insertErr) {
                    console.error('[OTP] Safety insert also failed:', insertErr.message);
                    _currentProfile = { id: user.id, nama: fallbackNama, email: user.email };
                }
            }
        }

        updateAuthUI();
        showToast('Berhasil masuk! Selamat datang kembali.', 'success');
    }

    async function handleLogout() {
        const { error } = await window.TembakImei.signOut();
        if (error) { showToast('Gagal logout: ' + error, 'error'); return; }
        _currentUser = null; _currentProfile = null;
        updateAuthUI();
        showToast('Berhasil logout', 'info');
    }

    /* ==========================================================
       PROFILE SETTINGS MODAL
       ========================================================== */

    function openProfileModal(mandatory) {
        const modal = $('#profile-modal');
        if (!modal) return;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        loadProfileData();
        const closeBtn = $('#profile-close');
        if (closeBtn) closeBtn.style.display = mandatory ? 'none' : 'block';
    }

    function closeProfileModal() {
        const modal = $('#profile-modal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        $('#profile-error').classList.add('hidden');
    }

    async function loadProfileData() {
        if (!_currentUser) return;
        // Simpan nama lokal sebelum fetch (untuk fallback kalau DB belum sync)
        const localNama = _currentProfile?.nama;
        const { data } = await window.TembakImei.getProfile(_currentUser.id);
        _currentProfile = data;
        // BUGFIX 2: fallback ke nama lokal kalau DB return kosong atau nama belum ada
        if (data) {
            $('#profile-nama').value = data.nama || localNama || '';
            $('#profile-wa').value = data.wa_number || '';
        } else if (localNama) {
            // DB belum punya row tapi kita punya nama lokal → tetap tampilkan
            $('#profile-nama').value = localNama;
        }
        $('#profile-email').value = _currentUser.email || '';
    }

    async function handleSaveProfile(e) {
        e.preventDefault();
        if (!_currentUser) return;
        const nama = $('#profile-nama').value.trim();
        const wa = $('#profile-wa').value.trim();
        const errorEl = $('#profile-error');
        const btn = $('#profile-save-btn');
        const spinner = $('#profile-spinner');
        const text = $('#profile-save-text');
        errorEl.classList.add('hidden');
        if (!nama || nama.length < 2) { errorEl.textContent = 'Nama wajib diisi'; errorEl.classList.remove('hidden'); return; }
        if (!wa || wa.length < 10) { errorEl.textContent = 'Nomor WhatsApp tidak valid'; errorEl.classList.remove('hidden'); return; }
        btn.disabled = true; spinner.classList.remove('hidden'); text.textContent = 'Menyimpan...';
        try {
            const result = await window.TembakImei.updateProfile(_currentUser.id, { nama, wa_number: wa });
            console.log('[Profile] Save success:', result.data);
            _currentProfile = result.data;
            updateAuthUI();
            closeProfileModal();
            showToast('Profil berhasil diperbarui!', 'success');
        } catch (err) {
            console.error('[Profile] Save error:', err);
            errorEl.textContent = err.message || 'Gagal menyimpan profil';
            errorEl.classList.remove('hidden');
        } finally {
            btn.disabled = false; spinner.classList.add('hidden'); text.textContent = 'Simpan Perubahan';
        }
    }

    /* ==========================================================
       IMEI VALIDATION
       ========================================================== */

    function validateIMEI(imei) { return /^\d{15}$/.test(imei); }

    function initIMEIValidation() {
        const imeiInput = DOM.imeiInput;
        if (!imeiInput) return;
        const checkIcon = $('#imei-check');
        const errorIcon = $('#imei-error');
        const validationBox = $('#imei-validation');
        const helpText = $('#imei-help');
        imeiInput.addEventListener('input', function () {
            this.value = this.value.replace(/\D/g, '').slice(0, 15);
            const val = this.value;
            if (val.length === 0) {
                validationBox.classList.add('hidden');
                this.classList.remove('imei-valid', 'imei-invalid');
                helpText.textContent = 'Masukkan 15 digit nomor IMEI';
                helpText.classList.remove('text-green-400', 'text-red-400');
                helpText.classList.add('text-slate-500');
                updateSubmitButton();
                return;
            }
            validationBox.classList.remove('hidden');
            if (validateIMEI(val)) {
                this.classList.add('imei-valid'); this.classList.remove('imei-invalid');
                checkIcon.classList.remove('hidden'); errorIcon.classList.add('hidden');
                helpText.textContent = 'IMEI valid';
                helpText.classList.remove('text-slate-500', 'text-red-400'); helpText.classList.add('text-green-400');
            } else {
                this.classList.add('imei-invalid'); this.classList.remove('imei-valid');
                checkIcon.classList.add('hidden'); errorIcon.classList.remove('hidden');
                helpText.textContent = 'IMEI harus 15 digit angka';
                helpText.classList.remove('text-slate-500', 'text-green-400'); helpText.classList.add('text-red-400');
            }
            updateSubmitButton();
        });
    }

    /* ==========================================================
       FORM STATE
       ========================================================== */

    function updateSubmitButton() {
        const btn = DOM.submitBtn;
        if (!btn) return;
        const nama = DOM.namaInput ? DOM.namaInput.value.trim() : '';
        const imei = DOM.imeiInput ? DOM.imeiInput.value : '';
        const device = DOM.deviceSelect ? DOM.deviceSelect.value : '';
        const wa = DOM.whatsappInput ? DOM.whatsappInput.value : '';
        const email = DOM.emailInput ? DOM.emailInput.value.trim() : '';
        const isValid = nama.length >= 2 && validateIMEI(imei) && device !== '' && wa.length >= 10 && email.length >= 5;
        btn.disabled = !isValid;
        btn.style.opacity = isValid ? '1' : '0.5';
        btn.style.cursor = isValid ? 'pointer' : 'not-allowed';
    }

    /* ==========================================================
       DEVICE DROPDOWN — 2-Level Brand / Model Selector
       ========================================================== */

    const DEVICE_BRANDS = {
        iphone: {
            name: 'iPhone',
            icon: '🍎',
            models: [
                'iPhone 16 Pro Max', 'iPhone 16 Pro', 'iPhone 16 Plus', 'iPhone 16',
                'iPhone 15 Pro Max', 'iPhone 15 Pro', 'iPhone 15 Plus', 'iPhone 15',
                'iPhone 14 Pro Max', 'iPhone 14 Pro', 'iPhone 14 Plus', 'iPhone 14',
                'iPhone 13 Pro Max', 'iPhone 13 Pro', 'iPhone 13', 'iPhone 13 Mini',
                'iPhone 12 Pro Max', 'iPhone 12 Pro', 'iPhone 12', 'iPhone 12 Mini',
                'iPhone 11 Pro Max', 'iPhone 11 Pro', 'iPhone 11',
                'iPhone XS Max', 'iPhone XS', 'iPhone XR', 'iPhone X',
                'iPhone SE (2022)', 'iPhone SE (2020)'
            ]
        },
        samsung: {
            name: 'Samsung',
            icon: '📱',
            models: [
                'Galaxy S24 Ultra', 'Galaxy S24+', 'Galaxy S24',
                'Galaxy S23 Ultra', 'Galaxy S23+', 'Galaxy S23',
                'Galaxy S22 Ultra', 'Galaxy S22+', 'Galaxy S22',
                'Galaxy A55', 'Galaxy A54', 'Galaxy A35', 'Galaxy A34',
                'Galaxy Z Fold 5', 'Galaxy Z Flip 5'
            ]
        },
        xiaomi: {
            name: 'Xiaomi',
            icon: '📱',
            models: [
                'Xiaomi 14 Ultra', 'Xiaomi 14 Pro', 'Xiaomi 14',
                'Xiaomi 13 Ultra', 'Xiaomi 13 Pro', 'Xiaomi 13',
                'Redmi Note 13 Pro+', 'Redmi Note 13 Pro', 'Redmi Note 13',
                'POCO X6 Pro', 'POCO F5'
            ]
        },
        oppo: {
            name: 'Oppo',
            icon: '📱',
            models: [
                'Oppo Find X7 Ultra', 'Oppo Find X7',
                'Oppo Reno 11 Pro', 'Oppo Reno 11',
                'Oppo Reno 10 Pro+', 'Oppo Reno 10 Pro',
                'Oppo A98', 'Oppo A78'
            ]
        },
        vivo: {
            name: 'Vivo',
            icon: '📱',
            models: [
                'Vivo X100 Pro', 'Vivo X100',
                'Vivo V29 Pro', 'Vivo V29',
                'Vivo Y100'
            ]
        },
        other: {
            name: 'Lainnya',
            icon: '📝',
            models: []
        }
    };

    let _devicePanelOpen = false;
    let _currentDeviceBrand = null;

    function initDeviceDropdown() {
        const trigger = DOM.deviceTrigger;
        if (!trigger) return;

        trigger.addEventListener('click', function (e) {
            e.stopPropagation();
            toggleDevicePanel();
        });

        // Brand buttons
        $$('.device-brand-btn').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                const brand = this.dataset.brand;
                showDeviceModels(brand);
            });
        });

        // Back button
        $('#device-back-btn')?.addEventListener('click', function (e) {
            e.stopPropagation();
            showDeviceBrands();
        });

        // Search filter
        const searchInput = $('#device-search');
        if (searchInput) {
            searchInput.addEventListener('input', filterDeviceModels);
            searchInput.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') { e.stopPropagation(); closeDevicePanel(); }
            });
        }

        // Other device input
        $('#device-other-confirm')?.addEventListener('click', function (e) {
            e.stopPropagation();
            const val = $('#device-other-input')?.value.trim();
            if (val) {
                selectDeviceModel(val);
            } else {
                showToast('Masukkan nama device', 'warning');
            }
        });
        $('#device-other-input')?.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                const val = this.value.trim();
                if (val) selectDeviceModel(val);
            }
        });

        // Close on outside click
        document.addEventListener('click', function (e) {
            const panel = $('#device-panel');
            if (_devicePanelOpen && panel && !panel.contains(e.target) && !trigger.contains(e.target)) {
                closeDevicePanel();
            }
        });

        // Close on Escape
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && _devicePanelOpen) closeDevicePanel();
        });
    }

    function toggleDevicePanel() {
        const panel = $('#device-panel');
        if (!panel) return;
        if (_devicePanelOpen) {
            closeDevicePanel();
        } else {
            openDevicePanel();
        }
    }

    function openDevicePanel() {
        const panel = $('#device-panel');
        const trigger = DOM.deviceTrigger;
        if (!panel) return;
        panel.classList.remove('hidden');
        if (trigger) trigger.classList.add('device-open');
        _devicePanelOpen = true;
        showDeviceBrands();
    }

    function closeDevicePanel() {
        const panel = $('#device-panel');
        const trigger = DOM.deviceTrigger;
        if (panel) panel.classList.add('hidden');
        if (trigger) trigger.classList.remove('device-open');
        _devicePanelOpen = false;
    }

    function showDeviceBrands() {
        const stepBrand = $('#device-step-brand');
        const stepModel = $('#device-step-model');
        if (stepBrand) { stepBrand.classList.remove('hidden'); stepBrand.classList.add('device-step-enter'); }
        if (stepModel) stepModel.classList.add('hidden');
        _currentDeviceBrand = null;
    }

    function showDeviceModels(brandKey) {
        const brand = DEVICE_BRANDS[brandKey];
        if (!brand) return;
        _currentDeviceBrand = brandKey;

        const stepBrand = $('#device-step-brand');
        const stepModel = $('#device-step-model');
        const brandTitle = $('#device-brand-title');
        const modelList = $('#device-model-list');
        const searchInput = $('#device-search');
        const otherWrap = $('#device-other-wrap');

        if (stepBrand) stepBrand.classList.add('hidden');
        if (stepModel) { stepModel.classList.remove('hidden'); stepModel.classList.add('device-step-enter'); }
        if (brandTitle) brandTitle.textContent = brand.icon + ' ' + brand.name;
        if (searchInput) { searchInput.value = ''; }

        if (brandKey === 'other') {
            // Show custom input
            if (modelList) modelList.innerHTML = '';
            if (otherWrap) otherWrap.classList.remove('hidden');
            setTimeout(function () { $('#device-other-input')?.focus(); }, 100);
        } else {
            if (otherWrap) otherWrap.classList.add('hidden');
            // Render model buttons
            if (modelList) {
                modelList.innerHTML = brand.models.map(function (m) {
                    return '<button type="button" class="device-model-btn" data-model="' + m + '">' + m + '</button>';
                }).join('');
                $$('.device-model-btn', modelList).forEach(function (btn) {
                    btn.addEventListener('click', function (e) {
                        e.stopPropagation();
                        selectDeviceModel(this.dataset.model);
                    });
                });
            }
        }
    }

    function filterDeviceModels() {
        const searchInput = $('#device-search');
        if (!searchInput || _currentDeviceBrand === 'other') return;
        const term = searchInput.value.toLowerCase().trim();
        $$('.device-model-btn').forEach(function (btn) {
            const txt = btn.textContent.toLowerCase();
            if (!term || txt.includes(term)) {
                btn.classList.remove('no-match');
            } else {
                btn.classList.add('no-match');
            }
        });
    }

    function selectDeviceModel(modelName) {
        // Update hidden input
        if (DOM.deviceSelect) DOM.deviceSelect.value = modelName;
        // Update trigger text
        if (DOM.deviceTriggerText) {
            DOM.deviceTriggerText.textContent = modelName;
            DOM.deviceTriggerText.classList.remove('device-trigger-placeholder');
        }
        updateSubmitButton();
        closeDevicePanel();
    }

    function clearDeviceDropdown() {
        if (DOM.deviceSelect) DOM.deviceSelect.value = '';
        if (DOM.deviceTriggerText) {
            DOM.deviceTriggerText.textContent = 'Pilih model device';
            DOM.deviceTriggerText.classList.add('device-trigger-placeholder');
        }
        _currentDeviceBrand = null;
        closeDevicePanel();
    }

    /* ==========================================================
       +62 AUTO-PREFIX
       ========================================================== */

    function initWAAutoPrefix() {
        const waInput = DOM.whatsappInput;
        if (!waInput) return;
        waInput.addEventListener('blur', function () {
            let val = this.value.trim().replace(/\D/g, '');
            if (val.length === 0) return;
            if (val.startsWith('0')) val = '62' + val.substring(1);
            else if (!val.startsWith('62')) val = '62' + val;
            this.value = val;
            updateSubmitButton();
        });
        waInput.addEventListener('input', function () {
            this.value = this.value.replace(/\D/g, '');
            updateSubmitButton();
        });
    }

    /* ==========================================================
       FORM SUBMISSION — ORDER FLOW
       ========================================================== */

    function resetOrderForm() {
        const resultCard = $('#order-result');
        if (resultCard) resultCard.classList.add('hidden');
        if (DOM.orderForm) DOM.orderForm.reset();
        if (DOM.imeiInput) {
            DOM.imeiInput.classList.remove('imei-valid', 'imei-invalid');
            $('#imei-validation')?.classList.add('hidden');
            $('#imei-help').textContent = 'Masukkan 15 digit nomor IMEI';
            $('#imei-help').classList.remove('text-green-400', 'text-red-400');
            $('#imei-help').classList.add('text-slate-500');
        }
        // Reset custom device dropdown
        clearDeviceDropdown();
        // Re-fill profile data
        if (_currentProfile) {
            if (DOM.namaInput) DOM.namaInput.value = _currentProfile.nama || _currentProfile.full_name || '';
            if (DOM.whatsappInput) DOM.whatsappInput.value = _currentProfile.wa_number || '';
            if (DOM.emailInput) DOM.emailInput.value = _currentUser?.email || '';
        }
        updateSubmitButton();
    }

    async function handleFormSubmit(e) {
        e.preventDefault();
        if (!_currentUser) { showToast('Silakan login terlebih dahulu', 'warning'); openAuthModal(); return; }

        const nama = DOM.namaInput.value.trim();
        const imei = DOM.imeiInput.value.trim();
        const device = DOM.deviceSelect.value;
        const wa = DOM.whatsappInput.value.trim();
        const email = DOM.emailInput.value.trim();

        if (!nama || nama.length < 2) { showToast('Nama wajib diisi', 'error'); DOM.namaInput.focus(); return; }
        if (!validateIMEI(imei)) { showToast('IMEI harus 15 digit angka', 'error'); DOM.imeiInput.focus(); return; }
        if (!device) { showToast('Pilih model device', 'error'); DOM.deviceSelect.focus(); return; }
        if (!wa || wa.length < 10) { showToast('Masukkan nomor WhatsApp yang valid', 'error'); DOM.whatsappInput.focus(); return; }
        if (!email || email.length < 5) { showToast('Masukkan email yang valid', 'error'); DOM.emailInput.focus(); return; }

        setFormLoading(true);
        try {
            // Reset result card & hide modal dulu
            $('#order-result')?.classList.add('hidden');
            window.TembakImei.closePaymentModal?.();

            const orderId = 'IMEI-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5).toUpperCase();
            const amount = window.ENV.PRICE_AMOUNT || 150000;

            // 1. Simpan order ke Supabase
            const orderResult = await window.TembakImei.createOrder({
                user_id: _currentUser.id,
                nama, email, wa_number: wa, imei,
                device_name: device, device_model: '',
                order_id: orderId, amount
            });

            if (orderResult.error) throw new Error(orderResult.error);

            // 2. Create payment via Edge Function (API key aman di server)
            let paymentData;
            try {
                paymentData = await window.TembakImei.createPayment(orderId, amount);
            } catch (payErr) {
                console.error('[Order] Payment creation error:', payErr);
                // Kalau gagal bikin payment, tetap tunjukkan order result + toast
                showOrderResult(orderId, null);
                showToast('Order tersimpan, tapi gagal membuat pembayaran: ' + payErr.message, 'warning');
                setFormLoading(false);
                return;
            }

            // 3. Tampilkan result card + payment modal
            showOrderResult(orderId, paymentData);
            window.TembakImei.showPaymentModal(paymentData);

            // 4. Simpan ke localStorage
            try {
                const saved = JSON.parse(localStorage.getItem('tembakimei_orders') || '[]');
                saved.push({ order_id: orderId, imei, device, date: new Date().toISOString() });
                localStorage.setItem('tembakimei_orders', JSON.stringify(saved));
            } catch (_) {}

        } catch (err) {
            console.error('[Order] Error:', err);
            showToast('Gagal membuat order: ' + err.message, 'error');
        } finally {
            setFormLoading(false);
        }
    }

    function setFormLoading(show) {
        const overlay = $('#form-loading');
        const btnText = $('#btn-text');
        const btnSpinner = $('#btn-spinner');
        const btn = DOM.submitBtn;
        if (show) {
            overlay.classList.remove('hidden');
            btnText.textContent = 'Memproses...';
            btnSpinner.classList.remove('hidden');
            btn.disabled = true;
        } else {
            overlay.classList.add('hidden');
            btnText.textContent = 'Lanjutkan Pembayaran';
            btnSpinner.classList.add('hidden');
            btn.disabled = false;
        }
    }

    let _lastPaymentData = null;

    function showOrderResult(orderId, paymentData) {
        const resultCard = $('#order-result');
        const orderIdEl = $('#result-order-id');
        const paymentLink = $('#payment-link');
        if (!resultCard) return;
        orderIdEl.textContent = orderId;
        _lastPaymentData = paymentData;

        if (paymentLink) {
            paymentLink.textContent = 'Buka Pembayaran';
            paymentLink.href = '#';
            paymentLink.onclick = function (e) {
                e.preventDefault();
                if (_lastPaymentData) {
                    window.TembakImei.showPaymentModal(_lastPaymentData);
                } else {
                    showToast('Data pembayaran tidak tersedia', 'warning');
                }
            };
        }

        resultCard.classList.remove('hidden');
    }

    /* ==========================================================
       STATUS CHECK
       ========================================================== */

    async function handleStatusCheck() {
        const input = DOM.statusInput;
        const resultCard = $('#status-result');
        const notFoundCard = $('#status-notfound');
        if (!input) return;
        const val = input.value.trim();
        if (!val) { showToast('Masukkan Order ID atau nomor IMEI', 'warning'); return; }

        setStatusLoading(true);
        resultCard.classList.add('hidden');
        if (notFoundCard) notFoundCard.classList.add('hidden');

        try {
            let order;
            if (/^\d{15}$/.test(val)) order = await window.TembakImei.getOrderByImei(val);
            else order = await window.TembakImei.getOrderById(val);

            if (!order) {
                if (notFoundCard) notFoundCard.classList.remove('hidden');
                setStatusLoading(false);
                return;
            }

            displayStatusResult(order);
            resultCard.classList.remove('hidden');
            setTimeout(() => { resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 200);
        } catch (err) {
            console.error('[Status] Error:', err);
            showToast('Gagal mengecek status: ' + err.message, 'error');
        } finally {
            setStatusLoading(false);
        }
    }

    function setStatusLoading(show) {
        const btnText = $('#status-btn-text');
        const btnSpinner = $('#status-btn-spinner');
        const btn = DOM.statusBtn;
        if (show) { btnText.textContent = 'Memuat...'; btnSpinner.classList.remove('hidden'); btn.disabled = true; }
        else { btnText.textContent = 'Cek Status'; btnSpinner.classList.add('hidden'); btn.disabled = false; }
    }

    function displayStatusResult(order) {
        $('#status-order-id').textContent = order.order_id || '-';
        $('#status-imei').textContent = order.imei || '-';
        $('#status-device').textContent = ((order.device_name || '') + ' ' + (order.device_model || '')).trim() || '-';
        $('#status-wa').textContent = order.wa_number || '-';

        // Format date
        const dateEl = $('#status-date');
        if (dateEl && order.created_at) {
            try {
                const d = new Date(order.created_at);
                dateEl.textContent = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            } catch (_) {
                dateEl.textContent = order.created_at;
            }
        } else if (dateEl) {
            dateEl.textContent = '-';
        }

        const badge = $('#status-badge');
        const status = (order.status || 'pending').toLowerCase();
        const statusMap = {
            pending:    { class: 'badge-pending',    text: 'PENDING',    color: '#F59E0B' },
            processing: { class: 'badge-processing', text: 'PROCESSING', color: '#3B82F6' },
            completed:  { class: 'badge-completed',  text: 'COMPLETED',  color: '#22C55E' },
            cancelled:  { class: 'badge-failed',     text: 'CANCELLED',  color: '#EF4444' },
        };
        const s = statusMap[status] || statusMap.pending;
        badge.className = 'inline-flex items-center px-3 py-1.5 rounded-full text-[11px] font-semibold ' + s.class;
        badge.textContent = s.text;
        badge.style.color = s.color;

        updateTimeline(status);

        const successBox = $('#status-success');
        const errorBox = $('#status-error');
        successBox.classList.add('hidden');
        errorBox.classList.add('hidden');

        if (status === 'completed') successBox.classList.remove('hidden');
        else if (status === 'cancelled') {
            errorBox.classList.remove('hidden');
            $('#status-error-text').textContent = 'Order dibatalkan atau gagal diproses.';
        }
    }

    function updateTimeline(status) {
        const steps = $$('.timeline-step');
        let statusIndex;
        switch (status) {
            case 'pending': statusIndex = 0; break;
            case 'processing': statusIndex = 2; break;
            case 'completed': statusIndex = 3; break;
            case 'cancelled': statusIndex = 3; break;
            default: statusIndex = 0;
        }
        steps.forEach(function (step, idx) {
            const dot = step.querySelector('.timeline-dot');
            const label = step.querySelector('p:first-child');
            dot.style.background = '';
            dot.style.borderColor = '';
            dot.style.boxShadow = '';
            label.style.color = '';
            if (idx < statusIndex) {
                dot.style.background = '#22C55E'; dot.style.borderColor = '#22C55E'; label.style.color = '#22C55E';
            } else if (idx === statusIndex) {
                dot.style.background = '#8B5CF6'; dot.style.borderColor = '#8B5CF6';
                dot.style.boxShadow = '0 0 10px rgba(139,92,246,0.5)'; label.style.color = '#8B5CF6';
            } else {
                dot.style.background = 'rgba(255,255,255,0.2)'; dot.style.borderColor = 'rgba(255,255,255,0.2)';
                label.style.color = '#94A3B8';
            }
        });
        const line = $('.timeline-line');
        if (line && steps.length > 0) {
            const progress = Math.max(0, Math.min(1, statusIndex / 3));
            line.style.background = 'linear-gradient(to bottom, #8B5CF6 ' + (progress * 100) + '%, rgba(255,255,255,0.1) ' + (progress * 100) + '%)';
        }
    }

    /* ==========================================================
       SMOOTH SCROLL, MOBILE MENU, TOAST, ETC
       ========================================================== */

    function initSmoothScroll() {
        $$('a[href^="#"]').forEach(function (link) {
            link.addEventListener('click', function (e) {
                const href = this.getAttribute('href');
                if (href === '#') return;
                const target = $(href);
                if (target) {
                    e.preventDefault();
                    closeMobileMenu();
                    const top = target.getBoundingClientRect().top + window.pageYOffset - 80;
                    window.scrollTo({ top, behavior: 'smooth' });
                }
            });
        });
    }

    function initMobileMenu() {
        const btn = DOM.mobileMenuBtn;
        const menu = DOM.mobileMenu;
        if (!btn || !menu) return;
        btn.addEventListener('click', function () {
            menu.classList.contains('open') ? closeMobileMenu() : openMobileMenu();
        });
        $$('.mobile-nav-link').forEach(function (link) { link.addEventListener('click', closeMobileMenu); });
        document.addEventListener('click', function (e) {
            if (!menu.contains(e.target) && !btn.contains(e.target) && menu.classList.contains('open')) closeMobileMenu();
        });
    }

    function openMobileMenu() {
        DOM.mobileMenu.classList.add('open');
        DOM.mobileMenu.classList.remove('hidden');
        $('#hamburger-icon').classList.add('hidden');
        $('#close-icon').classList.remove('hidden');
    }

    function closeMobileMenu() {
        DOM.mobileMenu.classList.remove('open');
        $('#hamburger-icon').classList.remove('hidden');
        $('#close-icon').classList.add('hidden');
        setTimeout(function () {
            if (!DOM.mobileMenu.classList.contains('open')) DOM.mobileMenu.classList.add('hidden');
        }, 300);
    }

    function initNavbarScroll() {
        const navbar = DOM.navbar;
        if (!navbar) return;
        window.addEventListener('scroll', function () {
            window.pageYOffset > 50 ? navbar.classList.add('navbar-scrolled') : navbar.classList.remove('navbar-scrolled');
        });
    }

    function initCopyOrderId() {
        const btn = $('#copy-order-id');
        if (!btn) return;
        btn.addEventListener('click', function () {
            const orderId = $('#result-order-id').textContent;
            if (!orderId || orderId === '-') return;
            navigator.clipboard.writeText(orderId).then(function () {
                showToast('Order ID disalin!', 'success');
            }).catch(function () {
                const ta = document.createElement('textarea');
                ta.value = orderId;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                showToast('Order ID disalin!', 'success');
            });
        });
    }

    function showToast(message, type) {
        const existing = $('.toast-notification');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        const colors = {
            success: 'bg-green-500/90 text-white border border-green-400/30',
            error:   'bg-red-500/90 text-white border border-red-400/30',
            warning: 'bg-amber-500/90 text-white border border-amber-400/30',
            info:    'bg-blue-500/90 text-white border border-blue-400/30',
        };
        toast.className = 'toast-notification fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-xl text-sm font-medium shadow-2xl transition-all duration-300 transform translate-y-4 opacity-0 ' + (colors[type] || colors.info);
        toast.textContent = message;
        document.body.appendChild(toast);
        requestAnimationFrame(function () { toast.classList.remove('translate-y-4', 'opacity-0'); });
        setTimeout(function () {
            toast.classList.add('translate-y-4', 'opacity-0');
            setTimeout(function () { toast.remove(); }, 300);
        }, 3000);
    }

    function initInputListeners() {
        if (DOM.deviceTrigger) initDeviceDropdown();
        if (DOM.namaInput) DOM.namaInput.addEventListener('input', updateSubmitButton);
        if (DOM.emailInput) DOM.emailInput.addEventListener('input', updateSubmitButton);
        if (DOM.statusInput) {
            DOM.statusInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); handleStatusCheck(); }
            });
        }
    }

    /* ==========================================================
       REDIRECT FROM PAKASIR (after payment)
       ========================================================== */

    async function checkUrlParams() {
        const params = new URLSearchParams(window.location.search);
        const orderId = params.get('order');
        const paid = params.get('paid');
        const cancelled = params.get('cancelled');

        if (orderId && paid === '1') {
            showToast('Pembayaran berhasil! Order sedang diproses.', 'success');

            // FIX: Update order status ke 'processing' di Supabase
            try {
                await window.TembakImei.updateOrderStatus(orderId, 'processing');
                console.log('[Pakasir] Order status updated to processing:', orderId);
            } catch (err) {
                console.warn('[Pakasir] Failed to update order status:', err);
            }

            if (DOM.statusInput) {
                DOM.statusInput.value = orderId;
                setTimeout(handleStatusCheck, 500);
            }
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        if (orderId && cancelled === '1') {
            showToast('Pembayaran dibatalkan.', 'warning');
            try {
                await window.TembakImei.updateOrderStatus(orderId, 'cancelled');
            } catch (err) {
                console.warn('[Pakasir] Failed to update cancelled status:', err);
            }
            if (DOM.statusInput) {
                DOM.statusInput.value = orderId;
                setTimeout(handleStatusCheck, 500);
            }
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    /* ==========================================================
       DOM CACHE & INITIALIZATION
       ========================================================== */

    function cacheDOM() {
        DOM.navbar        = $('#navbar');
        DOM.mobileMenuBtn = $('#mobile-menu-btn');
        DOM.mobileMenu    = $('#mobile-menu');
        DOM.namaInput     = $('#nama');
        DOM.imeiInput     = $('#imei');
        DOM.deviceSelect  = $('#device');
        DOM.deviceTrigger = $('#device-trigger');
        DOM.deviceTriggerText = $('#device-trigger-text');
        DOM.whatsappInput = $('#whatsapp');
        DOM.emailInput    = $('#email');
        DOM.submitBtn     = $('#submit-btn');
        DOM.orderForm     = $('#order-form');
        DOM.statusInput   = $('#status-input');
        DOM.statusBtn     = $('#check-status-btn');
    }

    function init() {
        cacheDOM();
        initAuth();
        initIMEIValidation();
        initWAAutoPrefix();
        initInputListeners();
        initSmoothScroll();
        initMobileMenu();
        initNavbarScroll();
        initCopyOrderId();
        checkUrlParams();

        // Auth modal
        $('#nav-signin')?.addEventListener('click', openAuthModal);
        $('#mobile-signin')?.addEventListener('click', openAuthModal);
        $('#nav-logout')?.addEventListener('click', handleLogout);
        $('#auth-close')?.addEventListener('click', closeAuthModal);
        $('#auth-modal')?.addEventListener('click', (e) => { if (e.target.id === 'auth-modal') closeAuthModal(); });
        $('#otp-send-btn')?.addEventListener('click', handleSendOtp);
        $('#otp-verify-btn')?.addEventListener('click', handleVerifyOtp);
        $('#otp-back-btn')?.addEventListener('click', () => { showOtpStep(1); clearInterval(_resendTimer); resetOtpStep1(); });
        $('#otp-email')?.addEventListener('input', function () {
            if (!$('#otp-name-fields').classList.contains('hidden')) {
                hideNameFields();
                updateOtpButtonText('Kirim Kode OTP');
                _emailIsNew = false;
                clearNameFieldError('first');
                clearNameFieldError('last');
            }
        });
        $('#otp-first-name')?.addEventListener('input', () => clearNameFieldError('first'));
        $('#otp-last-name')?.addEventListener('input', () => clearNameFieldError('last'));

        // Profile modal
        $('#nav-profile')?.addEventListener('click', () => openProfileModal(false));
        $('#mobile-profile')?.addEventListener('click', () => openProfileModal(false));
        $('#profile-close')?.addEventListener('click', closeProfileModal);
        $('#profile-modal')?.addEventListener('click', (e) => { if (e.target.id === 'profile-modal') closeProfileModal(); });
        $('#profile-form')?.addEventListener('submit', handleSaveProfile);

        // Guest order
        $('#guest-signin-btn')?.addEventListener('click', openAuthModal);
        $('#guest-signup-btn')?.addEventListener('click', openAuthModal);

        // Order CTA
        $('#nav-order-btn')?.addEventListener('click', function (e) {
            if (!_currentUser) {
                e.preventDefault();
                openAuthModal();
                showToast('Silakan login terlebih dahulu untuk order', 'warning');
            } else {
                const target = $('#order');
                if (target) window.scrollTo({ top: target.getBoundingClientRect().top + window.pageYOffset - 80, behavior: 'smooth' });
            }
        });
        $('#mobile-order-btn')?.addEventListener('click', function (e) {
            if (!_currentUser) {
                e.preventDefault();
                closeMobileMenu();
                openAuthModal();
                showToast('Silakan login terlebih dahulu untuk order', 'warning');
            }
        });

        // Payment Modal Buttons
        $('#payment-modal-close')?.addEventListener('click', function () {
            window.TembakImei.closePaymentModal?.();
        });
        $('#payment-cancel-btn')?.addEventListener('click', function () {
            window.TembakImei.closePaymentModal?.();
        });
        $('#payment-check-btn')?.addEventListener('click', async function () {
            const orderId = _lastPaymentData?.order_id;
            if (!orderId) { showToast('Order ID tidak ditemukan', 'warning'); return; }
            this.disabled = true;
            try {
                const result = await window.TembakImei.checkPaymentStatus(orderId);
                if (result.status === 'completed') {
                    showToast('Pembayaran berhasil! Order sedang diproses.', 'success');
                    window.TembakImei.closePaymentModal?.();
                    resetOrderForm();
                } else {
                    showToast('Status: ' + result.status + '. Silakan selesaikan pembayaran.', 'info');
                }
            } catch (err) {
                showToast('Gagal cek status: ' + err.message, 'error');
            } finally {
                this.disabled = false;
            }
        });
        $('#payment-modal')?.addEventListener('click', function (e) {
            if (e.target.id === 'payment-modal') window.TembakImei.closePaymentModal?.();
        });

        // Payment completed event
        window.addEventListener('payment:completed', function (e) {
            showToast('Pembayaran berhasil! Order sedang diproses.', 'success');
            resetOrderForm();
            // Auto-check status
            if (DOM.statusInput) {
                DOM.statusInput.value = e.detail.order_id;
                setTimeout(handleStatusCheck, 500);
            }
        });

        if (DOM.orderForm) DOM.orderForm.addEventListener('submit', handleFormSubmit);
        if (DOM.statusBtn) DOM.statusBtn.addEventListener('click', handleStatusCheck);

        updateSubmitButton();
        console.log('%c[TEMBAKIMEI] Aplikasi siap.', 'color: #8B5CF6; font-weight: bold;');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.TembakImeiMain = {
        validateIMEI, handleFormSubmit, handleStatusCheck, showOrderResult,
        displayStatusResult, updateTimeline, setFormLoading, setStatusLoading,
        showToast, updateSubmitButton, openAuthModal, closeAuthModal,
        openProfileModal, closeProfileModal
    };

})();
