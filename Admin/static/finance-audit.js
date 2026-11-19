/*
 * Finance Audit: mekanisme pencatatan aktivitas untuk SELURUH modul Finance.
 *
 * Pemakaian dari modul mana pun (cukup satu baris setelah aksi berhasil):
 *   DCFinanceAudit.log({ action: 'update', module: 'paket', entityType: 'Paket', entityId: key,
 *                        summary: 'Harga paket diubah', before: lama, after: baru });
 *
 * - Admin diambil dari sesi login (DCFinanceKit.actor / window.DCAdminMe), bukan dari isian form.
 * - Data sensitif (secret, token, password, ...) otomatis disamarkan; nilai panjang dipotong.
 * - Pencatatan tidak pernah melempar error ke pemanggil, jadi tidak bisa merusak aksi utamanya.
 * - Penyimpanan lewat DCFinanceStore ('audit'), disimpan maksimal MAX entri terbaru.
 *
 * BATASAN: log lokal hanya ada di browser ini dan bisa dihapus lewat DevTools. Ini BUKAN audit trail
 * yang tepercaya. Untuk itu server harus mencatat; adapter API tinggal dipasang di setSink().
 */
(function () {
  'use strict';

  const MAX = 2000, MAX_STR = 500, MAX_DEPTH = 6, MAX_KEYS = 40;
  const SECRET = /(secret|password|passwd|token|private[_-]?key|api[_-]?key|credential|pin)$|^(secret|password|token)/i;

  const ACTIONS = Object.freeze({
    create: 'Tambah', update: 'Ubah', delete: 'Hapus', status: 'Ubah status', approve: 'Setujui', reject: 'Tolak',
    pay: 'Bayar', verify: 'Verifikasi', export: 'Export', print: 'Cetak', purge: 'Bersihkan', migrate: 'Migrasi', settings: 'Pengaturan'
  });
  const MODULES = Object.freeze({
    ringkasan: 'Ringkasan', siswa: 'Transaksi Siswa', pembayaran: 'Pembayaran', invoice: 'Invoice', paket: 'Paket & Harga',
    promo: 'Diskon & Promo', pemasukan: 'Pemasukan Perusahaan', pengeluaran: 'Pengeluaran Perusahaan', payroll: 'Payroll',
    anggaran: 'Anggaran', laporan: 'Laporan', pengaturan: 'Pengaturan Finance', sistem: 'Sistem'
  });

  const store = () => window.DCFinanceStore;
  let sink = null; // fungsi async (entry) => void; diisi saat backend siap

  function redact(v, depth) {
    if (v == null) return v;
    if (typeof v === 'string') return v.length > MAX_STR ? v.slice(0, MAX_STR) + '…' : v;
    if (typeof v !== 'object') return v;
    if (depth >= MAX_DEPTH) return '[terpotong]';
    if (Array.isArray(v)) return v.slice(0, MAX_KEYS).map((x) => redact(x, depth + 1));
    const out = {};
    Object.keys(v).slice(0, MAX_KEYS).forEach((k) => { out[k] = SECRET.test(k) ? '[disamarkan]' : redact(v[k], depth + 1); });
    return out;
  }

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  /** Nama kolom yang berubah antara dua objek (untuk ringkasan dan tampilan "apa yang berubah"). */
  function diff(before, after) {
    const b = before && typeof before === 'object' ? before : {}, a = after && typeof after === 'object' ? after : {};
    return [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => !k.startsWith('_') && !same(b[k], a[k]));
  }

  function who() {
    try {
      const k = window.DCFinanceKit;
      if (k && typeof k.actor === 'function') { const a = k.actor(); if (a && (a.id || a.nama)) return { id: a.id || '', nama: a.nama || '' }; }
    } catch (_) {}
    try {
      const m = window.DCAdminMe || {}, u = m.user || m, n = u.full_name || u.fullName || u.name || u.username || '';
      if (u.id != null || n) return { id: u.id != null ? String(u.id) : '', nama: String(n) };
    } catch (_) {}
    return { id: '', nama: '' };
  }

  const newId = () => 'AUD-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();

  /**
   * Catat satu aktivitas. Mengembalikan entri yang dicatat (atau null bila gagal), tidak pernah melempar.
   * Wajib: action, module. Disarankan: entityType, entityId, summary, before, after.
   */
  function log(e) {
    try {
      if (!e || !e.action || !e.module) return null;
      const a = who();
      const before = e.before === undefined ? null : redact(e.before, 0);
      const after = e.after === undefined ? null : redact(e.after, 0);
      const entry = {
        id: newId(),
        ts: new Date().toISOString(),
        actorId: a.id,
        actorName: a.nama || 'Sesi admin tidak terbaca',
        actorKnown: !!(a.id || a.nama),
        action: String(e.action),
        module: String(e.module),
        entityType: e.entityType ? String(e.entityType) : '',
        entityId: e.entityId != null ? String(e.entityId) : '',
        summary: e.summary ? String(e.summary).slice(0, MAX_STR) : '',
        before, after,
        changes: e.changes || (before && after ? diff(before, after) : []),
        _src: 'local'
      };
      const s = store();
      if (!s) return null;
      s.append('audit', entry, { max: MAX });
      if (typeof sink === 'function') { try { Promise.resolve(sink(entry)).catch(() => {}); } catch (_) {} }
      return entry;
    } catch (_) { return null; }
  }

  /** Ambil entri dengan filter { q, actor, module, action, from, to } (tanggal ISO yyyy-mm-dd, zona waktu lokal). */
  function list(f) {
    f = f || {};
    const s = store(); if (!s) return [];
    const q = String(f.q || '').trim().toLowerCase();
    const day = (ts) => { const d = new Date(ts); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
    return s.get('audit', []).filter((x) =>
      (!f.actor || x.actorName === f.actor) && (!f.module || x.module === f.module) && (!f.action || x.action === f.action) &&
      (!f.from || day(x.ts) >= f.from) && (!f.to || day(x.ts) <= f.to) &&
      (!q || (x.summary + ' ' + x.entityId + ' ' + x.entityType + ' ' + x.actorName).toLowerCase().includes(q))
    );
  }

  const actors = () => [...new Set((store() ? store().get('audit', []) : []).map((x) => x.actorName))].sort();

  /** Baris datar untuk CSV (before/after dijadikan JSON ringkas). */
  function toRows(entries) {
    return (entries || []).map((x) => ({
      waktu: x.ts, admin: x.actorName, aksi: ACTIONS[x.action] || x.action, modul: MODULES[x.module] || x.module,
      objek: (x.entityType + ' ' + x.entityId).trim(), ringkasan: x.summary, berubah: (x.changes || []).join(', '),
      sebelum: x.before == null ? '' : JSON.stringify(x.before), sesudah: x.after == null ? '' : JSON.stringify(x.after)
    }));
  }

  window.DCFinanceAudit = Object.freeze({
    ACTIONS, MODULES, log, list, actors, diff, toRows, redact: (v) => redact(v, 0),
    setSink: (fn) => { sink = typeof fn === 'function' ? fn : null; },
    count: () => (store() ? store().get('audit', []).length : 0)
  });
})();
