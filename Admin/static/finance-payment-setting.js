/*
 * Pengaturan Pembayaran, Rekening Bank, dan Payment Gateway (Admin Portal)
 * Menyediakan konfigurasi rekening bank manual, QRIS statis/dinamis,
 * serta koneksi ke Payment Gateway (Midtrans, Xendit, Tripay).
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'dc_payment_settings';

  const DEFAULT_SETTINGS = {
    // 1. Rekening Bank Transfer Manual
    bankActive: true,
    bankName: 'Bank BCA',
    bankAccount: '8210-9988-77',
    bankHolder: 'PT Ruang KKA Dieng Cyber',
    bankNote: 'Sertakan kode invoice unik saat melakukan transfer agar otomatis terverifikasi.',

    // 2. Mode QRIS
    qrisActive: true,
    qrisMode: 'gateway', // 'gateway' (Dinamis via PG) atau 'static' (QR / String Merchant Sendiri)
    qrisMerchantName: 'RUANG KKA DIENG CYBER',
    qrisNmid: 'ID1020261126520',
    qrisPayload: '00020101021226590014ID.LINKAJA.WWW0118936009110020261126520458125303360540',
    qrisImageUrl: '',

    // 3. Payment Gateway
    gatewayProvider: 'midtrans', // 'midtrans', 'xendit', 'tripay', 'manual'
    gatewayEnvironment: 'sandbox', // 'sandbox' atau 'production'
    gatewayServerKey: '',
    gatewayClientKey: '',
    gatewayMerchantId: '',
    gatewayWebhookSecret: '',
    autoConfirmPaid: true
  };

  const CARD = 'bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs';
  const FIELD = 'w-full py-2.5 px-3.5 bg-white dark:bg-slate-800/60 hover:border-slate-300 dark:hover:border-slate-600 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 transition outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10';
  const BTN_PRI = 'px-4 py-2.5 rounded-xl font-semibold text-sm bg-sky-600 hover:bg-sky-700 active:scale-95 text-white transition shadow-sm shadow-sky-600/20 flex items-center gap-2';
  const BTN_SEC = 'px-4 py-2.5 rounded-xl font-semibold text-sm bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition';

  function getSettings() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? Object.assign({}, DEFAULT_SETTINGS, JSON.parse(data)) : Object.assign({}, DEFAULT_SETTINGS);
    } catch (_) {
      return Object.assign({}, DEFAULT_SETTINGS);
    }
  }

  function saveSettings(settings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  function renderPaymentSetting() {
    const container = document.getElementById('view-finance-setting');
    if (!container) return;

    const s = getSettings();

    container.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div class="flex items-center gap-2 text-xs font-mono text-slate-400 dark:text-slate-500 mb-1">
            <span>Portal Admin</span><span>/</span><span>Finance</span><span>/</span><span class="text-sky-600 dark:text-sky-400 font-medium">Pengaturan Pembayaran</span>
          </div>
          <h1 class="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <i class="fa-solid fa-sliders text-sky-600 dark:text-sky-400 text-xl"></i>
            Metode Pembayaran &amp; Gateway
          </h1>
          <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Atur rekening penampung transfer bank manual, mode QRIS, serta kredensial Payment Gateway untuk generate otomatis.
          </p>
        </div>

        <div class="flex items-center gap-2">
          <button type="button" id="btnResetPaymentSettings" class="${BTN_SEC}">
            <i class="fa-solid fa-rotate-left mr-1"></i> Reset Default
          </button>
          <button type="button" id="btnSavePaymentSettings" class="${BTN_PRI}">
            <i class="fa-solid fa-floppy-disk"></i> Simpan Pengaturan
          </button>
        </div>
      </div>

      <!-- Info Banner Gateway -->
      <div class="p-4 rounded-2xl bg-gradient-to-r from-sky-50 to-indigo-50 dark:from-slate-800/80 dark:to-slate-800/40 border border-sky-100 dark:border-slate-700 flex items-start gap-3.5">
        <div class="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0 mt-0.5 text-base">
          <i class="fa-solid fa-circle-nodes"></i>
        </div>
        <div class="text-xs sm:text-sm">
          <h4 class="font-bold text-slate-900 dark:text-white">Arsitektur Pembayaran Hybrid</h4>
          <p class="text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
            Untuk <b>Transfer Bank</b>, siswa dapat mentransfer langsung ke rekening lembaga di bawah ini. Untuk <b>QRIS</b>, Anda dapat memilih menggunakan <b>Payment Gateway (Midtrans/Xendit/Tripay)</b> agar QRIS dan verifikasi otomatis lunas, atau <b>QRIS Merchant Sendiri</b> (statis/payload dinamis).
          </p>
        </div>
      </div>

      <form id="paymentSettingForm" class="space-y-6">

        <!-- 1. KONTROL REKENING BANK TRANSFER -->
        <div class="${CARD} p-6 sm:p-7 space-y-5">
          <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <div class="flex items-center gap-3">
              <span class="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-lg">
                <i class="fa-solid fa-building-columns"></i>
              </span>
              <div>
                <h2 class="text-base font-bold text-slate-900 dark:text-white">1. Rekening Bank Transfer Manual</h2>
                <p class="text-xs text-slate-500 dark:text-slate-400">Informasi rekening yang ditampilkan pada halaman checkout dan invoice siswa.</p>
              </div>
            </div>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" name="bankActive" id="bankActive" ${s.bankActive ? 'checked' : ''} class="w-4 h-4 rounded text-sky-600 focus:ring-sky-500">
              <span class="text-xs font-semibold text-slate-700 dark:text-slate-300">Aktifkan Metode Ini</span>
            </label>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">Nama Bank</label>
              <input type="text" name="bankName" value="${escapeHtml(s.bankName)}" placeholder="Contoh: Bank BCA" class="${FIELD}" required>
            </div>
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">Nomor Rekening</label>
              <input type="text" name="bankAccount" value="${escapeHtml(s.bankAccount)}" placeholder="Contoh: 8210998877" class="${FIELD}" required>
            </div>
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">Atas Nama Rekening</label>
              <input type="text" name="bankHolder" value="${escapeHtml(s.bankHolder)}" placeholder="Contoh: PT Dieng Cyber" class="${FIELD}" required>
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">Catatan Instruksi Transfer</label>
            <input type="text" name="bankNote" value="${escapeHtml(s.bankNote)}" placeholder="Petunjuk khusus untuk siswa yang mentransfer" class="${FIELD}">
          </div>
        </div>

        <!-- 2. KONTROL QRIS -->
        <div class="${CARD} p-6 sm:p-7 space-y-5">
          <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <div class="flex items-center gap-3">
              <span class="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center text-lg">
                <i class="fa-solid fa-qrcode"></i>
              </span>
              <div>
                <h2 class="text-base font-bold text-slate-900 dark:text-white">2. Mode &amp; Konfigurasi QRIS</h2>
                <p class="text-xs text-slate-500 dark:text-slate-400">Pilih apakah QRIS digenerate otomatis lewat Gateway atau QRIS Merchant Mandiri.</p>
              </div>
            </div>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" name="qrisActive" id="qrisActive" ${s.qrisActive ? 'checked' : ''} class="w-4 h-4 rounded text-sky-600 focus:ring-sky-500">
              <span class="text-xs font-semibold text-slate-700 dark:text-slate-300">Aktifkan QRIS</span>
            </label>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label class="p-4 rounded-xl border-2 transition cursor-pointer flex items-start gap-3.5 ${s.qrisMode === 'gateway' ? 'border-sky-500 bg-sky-50/50 dark:bg-sky-500/10' : 'border-slate-200 dark:border-slate-800'}">
              <input type="radio" name="qrisMode" value="gateway" ${s.qrisMode === 'gateway' ? 'checked' : ''} class="mt-1 text-sky-600">
              <div>
                <span class="font-bold text-sm text-slate-900 dark:text-white block">QRIS Dinamis Otomatis (Payment Gateway)</span>
                <span class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 block leading-relaxed">
                  Tiap transaksi membuat QRIS unik otomatis via Midtrans/Xendit/Tripay. Status otomatis lunas begitu dibayar siswa tanpa cek mutasi manual.
                </span>
              </div>
            </label>

            <label class="p-4 rounded-xl border-2 transition cursor-pointer flex items-start gap-3.5 ${s.qrisMode === 'static' ? 'border-sky-500 bg-sky-50/50 dark:bg-sky-500/10' : 'border-slate-200 dark:border-slate-800'}">
              <input type="radio" name="qrisMode" value="static" ${s.qrisMode === 'static' ? 'checked' : ''} class="mt-1 text-sky-600">
              <div>
                <span class="font-bold text-sm text-slate-900 dark:text-white block">QRIS Merchant Milik Sendiri (Mandiri)</span>
                <span class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 block leading-relaxed">
                  Menggunakan QRIS statis atau payload EMVCo milik lembaga/PT Dieng Cyber langsung dari bank.
                </span>
              </div>
            </label>
          </div>

          <div id="staticQrisSection" class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 ${s.qrisMode === 'static' ? '' : 'hidden'}">
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">Nama Merchant QRIS</label>
              <input type="text" name="qrisMerchantName" value="${escapeHtml(s.qrisMerchantName)}" placeholder="RUANG KKA DIENG CYBER" class="${FIELD}">
            </div>
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">NMID / Kode Merchant (Opsional)</label>
              <input type="text" name="qrisNmid" value="${escapeHtml(s.qrisNmid)}" placeholder="ID1020261126520" class="${FIELD}">
            </div>
            <div class="sm:col-span-2">
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">Master Payload QRIS EMVCo</label>
              <textarea name="qrisPayload" rows="2" placeholder="00020101021226..." class="${FIELD} font-mono text-xs">${escapeHtml(s.qrisPayload)}</textarea>
              <p class="text-[11px] text-slate-400 mt-1">String QRIS resmi bawaan merchant. Sistem akan menyisipkan nominal tagihan secara dinamis ke dalamnya.</p>
            </div>
          </div>
        </div>

        <!-- 3. KONEKSI PAYMENT GATEWAY -->
        <div class="${CARD} p-6 sm:p-7 space-y-5">
          <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <div class="flex items-center gap-3">
              <span class="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center text-lg">
                <i class="fa-solid fa-bolt"></i>
              </span>
              <div>
                <h2 class="text-base font-bold text-slate-900 dark:text-white">3. Integrasi Payment Gateway API</h2>
                <p class="text-xs text-slate-500 dark:text-slate-400">Hubungkan kredensial API untuk proses QRIS dan pembayaran otomatis.</p>
              </div>
            </div>
            <span class="text-xs font-mono px-2.5 py-1 rounded-lg bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 font-bold uppercase">
              ${s.gatewayProvider}
            </span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">Penyedia Gateway</label>
              <select name="gatewayProvider" id="gatewayProvider" class="${FIELD}">
                <option value="midtrans" ${s.gatewayProvider === 'midtrans' ? 'selected' : ''}>Midtrans (Snap / Core API)</option>
                <option value="xendit" ${s.gatewayProvider === 'xendit' ? 'selected' : ''}>Xendit Payment Gateway</option>
                <option value="tripay" ${s.gatewayProvider === 'tripay' ? 'selected' : ''}>Tripay Payment Gateway</option>
                <option value="manual" ${s.gatewayProvider === 'manual' ? 'selected' : ''}>Nonaktif / Manual Only</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">Environment / Mode</label>
              <select name="gatewayEnvironment" class="${FIELD}">
                <option value="sandbox" ${s.gatewayEnvironment === 'sandbox' ? 'selected' : ''}>Sandbox (Mode Uji Coba / Testing)</option>
                <option value="production" ${s.gatewayEnvironment === 'production' ? 'selected' : ''}>Production (Mode Transaksi Asli)</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">Server Key / Secret Key</label>
              <div class="relative">
                <input type="password" name="gatewayServerKey" id="gatewayServerKey" value="${escapeHtml(s.gatewayServerKey)}" placeholder="SB-Mid-server-..." class="${FIELD} pr-10 font-mono text-xs">
                <button type="button" onclick="togglePass('gatewayServerKey')" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">
                  <i class="fa-regular fa-eye"></i>
                </button>
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">Client Key / Public Key</label>
              <input type="text" name="gatewayClientKey" value="${escapeHtml(s.gatewayClientKey)}" placeholder="SB-Mid-client-..." class="${FIELD} font-mono text-xs">
            </div>

            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">Merchant ID</label>
              <input type="text" name="gatewayMerchantId" value="${escapeHtml(s.gatewayMerchantId)}" placeholder="G123456789" class="${FIELD} font-mono text-xs">
            </div>

            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">Webhook Notification Secret (Opsional)</label>
              <input type="password" name="gatewayWebhookSecret" id="gatewayWebhookSecret" value="${escapeHtml(s.gatewayWebhookSecret)}" placeholder="Secret token verifikasi signature" class="${FIELD} font-mono text-xs">
            </div>
          </div>

          <div class="pt-2">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" name="autoConfirmPaid" ${s.autoConfirmPaid ? 'checked' : ''} class="w-4 h-4 rounded text-sky-600 focus:ring-sky-500">
              <span class="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Otomatis tandai transaksi siswa menjadi Lunas ketika menerima sinyal sukses dari Webhook Payment Gateway.
              </span>
            </label>
          </div>
        </div>

      </form>
    `;

    // Event Listeners
    setupEvents();
  }

  function setupEvents() {
    const qrisRadios = document.querySelectorAll('input[name="qrisMode"]');
    const staticSection = document.getElementById('staticQrisSection');

    qrisRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (staticSection) {
          staticSection.classList.toggle('hidden', e.target.value !== 'static');
        }
      });
    });

    const btnSave = document.getElementById('btnSavePaymentSettings');
    if (btnSave) {
      btnSave.addEventListener('click', handleSave);
    }

    const btnReset = document.getElementById('btnResetPaymentSettings');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        if (confirm('Kembalikan pengaturan pembayaran ke nilai awal bawaan?')) {
          saveSettings(DEFAULT_SETTINGS);
          renderPaymentSetting();
          if (window.DCUI && typeof window.DCUI.toast === 'function') {
            window.DCUI.toast('Pengaturan pembayaran telah direset.');
          }
        }
      });
    }
  }

  function handleSave() {
    const form = document.getElementById('paymentSettingForm');
    if (!form) return;

    const fd = new FormData(form);
    const updated = {
      bankActive: form.querySelector('#bankActive').checked,
      bankName: String(fd.get('bankName') || '').trim(),
      bankAccount: String(fd.get('bankAccount') || '').trim(),
      bankHolder: String(fd.get('bankHolder') || '').trim(),
      bankNote: String(fd.get('bankNote') || '').trim(),

      qrisActive: form.querySelector('#qrisActive').checked,
      qrisMode: String(fd.get('qrisMode') || 'gateway'),
      qrisMerchantName: String(fd.get('qrisMerchantName') || '').trim(),
      qrisNmid: String(fd.get('qrisNmid') || '').trim(),
      qrisPayload: String(fd.get('qrisPayload') || '').trim(),
      qrisImageUrl: '',

      gatewayProvider: String(fd.get('gatewayProvider') || 'midtrans'),
      gatewayEnvironment: String(fd.get('gatewayEnvironment') || 'sandbox'),
      gatewayServerKey: String(fd.get('gatewayServerKey') || '').trim(),
      gatewayClientKey: String(fd.get('gatewayClientKey') || '').trim(),
      gatewayMerchantId: String(fd.get('gatewayMerchantId') || '').trim(),
      gatewayWebhookSecret: String(fd.get('gatewayWebhookSecret') || '').trim(),
      autoConfirmPaid: form.querySelector('input[name="autoConfirmPaid"]').checked
    };

    saveSettings(updated);

    if (window.DCUI && typeof window.DCUI.toast === 'function') {
      window.DCUI.toast('Pengaturan metode pembayaran berhasil disimpan!');
    } else {
      alert('Pengaturan metode pembayaran berhasil disimpan!');
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  window.togglePass = function (id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.type = el.type === 'password' ? 'text' : 'password';
  };

  // Dengarkan event perpindahan view di panel admin
  window.addEventListener('dc:view', function (e) {
    if (e.detail === 'finance-setting') {
      renderPaymentSetting();
    }
  });

  // Ekspor helper global agar dapat dipanggil langsung
  window.DCPaymentSetting = {
    get: getSettings,
    save: saveSettings,
    render: renderPaymentSetting
  };

})();
