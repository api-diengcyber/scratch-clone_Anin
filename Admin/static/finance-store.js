/*
 * Finance Store: satu-satunya pintu baca/tulis data Finance yang belum punya API.
 *
 * Lapisan:  UI (finance*.js)  ->  DCFinanceStore  ->  adapter (local sekarang, api nanti)
 *
 * - get(nama)  : baca sinkron dari cache memori (sudah terisi saat file ini dimuat bila adapter lokal).
 * - set(nama,v): tulis lewat adapter, mengembalikan Promise<{ok, error?}>. Cache langsung diperbarui,
 *                dan dikembalikan bila penulisan gagal (mis. kuota localStorage penuh).
 * - Setiap baris data boleh membawa penanda sumber `_src`: 'sample' | 'local' | 'server'.
 *   Baris 'sample' TIDAK dihitung sebagai data keuangan sebenarnya oleh DCFinanceCalc.
 * - Dilarang menyimpan secret/credential: set() menolak objek yang punya kunci bernama secret/token/dst.
 *
 * Migrasi ke backend: ganti adapter lewat DCFinanceStore.useAdapter(...). Kode UI tidak berubah.
 */
(function () {
  'use strict';

  const META_KEY = 'dc-finance-store-meta';
  const BACKUP_PREFIX = 'dc-finance-backup:';
  const SRC = Object.freeze({ SAMPLE: 'sample', LOCAL: 'local', SERVER: 'server' });

  // Kunci localStorage sengaja sama dengan implementasi lama agar data admin tidak hilang.
  const COLLECTIONS = Object.freeze({
    income:   { key: 'dc-finance-income',   type: 'array' },
    expense:  { key: 'dc-finance-expense',  type: 'array' },
    payroll:  { key: 'dc-finance-payroll',  type: 'array' },
    budget:   { key: 'dc-finance-budget',   type: 'array' },
    promo:    { key: 'dc-finance-promo',    type: 'array' },
    paket:    { key: 'dc-finance-paket',    type: 'object' },
    status:   { key: 'dc-finance-status',   type: 'object' },
    settings: { key: 'dc-finance-settings', type: 'object' },
    audit:    { key: 'dc-finance-audit',    type: 'array' }
  });

  const SECRET_KEY = /(secret|password|passwd|private[_-]?key|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|server[_-]?key|credential)/i;

  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const known = (name) => {
    if (!Object.prototype.hasOwnProperty.call(COLLECTIONS, name)) throw new Error('Koleksi Finance tidak dikenal: ' + name);
    return COLLECTIONS[name];
  };
  const typeOk = (def, v) => (def.type === 'array' ? Array.isArray(v) : !!v && typeof v === 'object' && !Array.isArray(v));

  // ---------- penjaga secret ----------
  function findSecretKey(v, path, depth) {
    if (!v || typeof v !== 'object' || depth > 8) return '';
    for (const k of Object.keys(v)) {
      if (SECRET_KEY.test(k)) return (path ? path + '.' : '') + k;
      const hit = findSecretKey(v[k], (path ? path + '.' : '') + k, depth + 1);
      if (hit) return hit;
    }
    return '';
  }

  // ---------- adapter lokal ----------
  const localAdapter = {
    name: 'local',
    sync: true,
    read(name) {
      const def = known(name);
      try {
        const raw = localStorage.getItem(def.key);
        if (raw == null) return undefined;
        const v = JSON.parse(raw);
        return typeOk(def, v) ? v : undefined;
      } catch (_) { return undefined; }
    },
    write(name, value) {
      const def = known(name);
      localStorage.setItem(def.key, JSON.stringify(value)); // melempar bila kuota penuh; ditangani set()
    },
    remove(name) { try { localStorage.removeItem(known(name).key); } catch (_) {} }
  };

  /*
   * Kerangka adapter API untuk nanti. Isi `endpoints` sesuai backend, mis.
   *   { income: '/api/admin/finance/income', payroll: '/api/admin/finance/payroll', ... }
   * Koleksi yang belum dipetakan sengaja menolak, supaya tidak ada data yang diam-diam hilang.
   */
  function createApiAdapter(request, endpoints) {
    const path = (name) => {
      if (!endpoints || !endpoints[name]) { const e = new Error('Endpoint untuk "' + name + '" belum tersedia.'); e.code = 'ENDPOINT_BELUM_TERSEDIA'; throw e; }
      return endpoints[name];
    };
    return {
      name: 'api',
      sync: false,
      read: async (name) => { const r = await request(path(name)); return r.items || r.data || r; },
      write: async (name, value) => { await request(path(name), { method: 'PUT', body: { items: value } }); },
      remove: async () => {}
    };
  }

  // ---------- state ----------
  let adapter = localAdapter;
  const cache = Object.create(null);
  const listeners = new Set();
  let ready = Promise.resolve();

  function emit(name, detail) {
    listeners.forEach((fn) => { try { fn(name, detail); } catch (_) {} });
    try { window.dispatchEvent(new CustomEvent('dc:finance-data', { detail: { name, ...(detail || {}) } })); } catch (_) {}
  }

  function hydrate() {
    const names = Object.keys(COLLECTIONS);
    if (adapter.sync) {
      names.forEach((n) => { const v = adapter.read(n); if (v !== undefined) cache[n] = clone(v); else delete cache[n]; });
      ready = Promise.resolve();
      return ready;
    }
    ready = Promise.all(names.map(async (n) => {
      try { const v = await adapter.read(n); if (v !== undefined && typeOk(COLLECTIONS[n], v)) cache[n] = clone(v); else delete cache[n]; } catch (_) { delete cache[n]; }
    })).then(() => undefined);
    return ready;
  }

  // ---------- API publik ----------
  /** Nilai koleksi (salinan). `fallback` dipakai bila koleksi belum pernah disimpan. */
  function get(name, fallback) {
    const def = known(name);
    if (!(name in cache)) return fallback === undefined ? (def.type === 'array' ? [] : {}) : fallback;
    return clone(cache[name]);
  }
  /** true bila koleksi pernah disimpan (membedakan "kosong" dari "belum ada"; penting agar seed tidak jalan lagi). */
  const has = (name) => { known(name); return name in cache; };

  function set(name, value) {
    const def = known(name);
    if (!typeOk(def, value)) throw new Error('Bentuk data "' + name + '" harus ' + def.type + '.');
    if (name !== 'audit') {
      const bad = findSecretKey(value, '', 0);
      if (bad) throw new Error('Data Finance tidak boleh menyimpan secret/credential (kunci "' + bad + '"). Simpan di server.');
    }
    const had = name in cache, prev = had ? cache[name] : undefined;
    cache[name] = clone(value);
    let r;
    try { r = adapter.write(name, cache[name]); } catch (e) { r = Promise.reject(e); }
    return Promise.resolve(r).then(
      () => { emit(name, { op: 'set' }); return { ok: true }; },
      (error) => {
        if (had) cache[name] = prev; else delete cache[name];
        emit(name, { op: 'rollback' });
        try { window.dispatchEvent(new CustomEvent('dc:finance-store-error', { detail: { name, message: (error && error.message) || String(error) } })); } catch (_) {}
        return { ok: false, error };
      }
    );
  }

  /** Tambah satu baris ke koleksi array (baca-ubah-tulis lewat cache). */
  function append(name, row, opts) {
    const cur = get(name);
    if (!Array.isArray(cur)) throw new Error('append hanya untuk koleksi array.');
    cur.unshift(row);
    const max = opts && opts.max;
    return set(name, max && cur.length > max ? cur.slice(0, max) : cur);
  }

  function remove(name) {
    known(name);
    const prev = cache[name]; delete cache[name];
    try { adapter.remove(name); } catch (_) { if (prev !== undefined) cache[name] = prev; }
    emit(name, { op: 'remove' });
  }

  // ---------- penanda sumber data ----------
  const tag = (rows, src) => (rows || []).map((r) => ({ ...r, _src: r._src || src }));
  const isSample = (r) => !!r && r._src === SRC.SAMPLE;
  const withoutSamples = (rows) => (rows || []).filter((r) => !isSample(r));
  const sampleCount = (name) => { const v = get(name, []); return Array.isArray(v) ? v.filter(isSample).length : 0; };

  /** Hapus hanya baris bertanda sample (aksi admin, dengan konfirmasi di UI). */
  function purgeSamples(name) {
    const def = known(name);
    if (def.type !== 'array') return Promise.resolve({ ok: true, removed: 0 });
    const rows = get(name), keep = rows.filter((r) => !isSample(r));
    const removed = rows.length - keep.length;
    if (!removed) return Promise.resolve({ ok: true, removed: 0 });
    return set(name, keep).then((r) => ({ ...r, removed }));
  }

  /** Tandai satu baris yang salah terdeteksi sebagai contoh menjadi data nyata (lokal). */
  function markReal(name, id) {
    const rows = get(name);
    const hit = rows.find((r) => String(r.id) === String(id));
    if (!hit) return Promise.resolve({ ok: false });
    hit._src = SRC.LOCAL;
    return set(name, rows);
  }

  // ---------- deteksi seed lama (implementasi awal menyimpan data contoh sebagai data nyata) ----------
  const SEED_INC = [
    ['INC-001', 'Donasi', 'Donasi komunitas orang tua', 1500000], ['INC-002', 'Sponsor', 'Sponsor kegiatan lomba coding', 2500000],
    ['INC-003', 'Penjualan Merchandise', 'Penjualan kaos dan stiker', 350000], ['INC-004', 'Hibah', 'Hibah pelatihan guru', 5000000]
  ];
  const SEED_BUD = { 'Gaji & Honor': 9000000, 'Server & Domain': 800000, 'Operasional': 1000000, 'Pemasaran': 1500000, 'Sewa': 1500000, 'Peralatan': 700000 };
  const SEED_PROMO = { HEMAT10: 'Diskon Pembelajaran 10%', SD25K: 'Potongan Siswa SD', NEWSMP: 'Promo Siswa Baru SMP', LIBUR20: 'Promo Libur Semester' };

  const LEGACY_SEED = {
    income: (r) => SEED_INC.some((s) => r.id === s[0] && r.kategori === s[1] && r.ket === s[2] && r.nominal === s[3]),
    expense: (r) => { const m = /^EXP-(\d+)$/.exec(String(r.id || '')); return !!m && +m[1] >= 501 && +m[1] <= 528 && r.ket === 'Biaya ' + String(r.kategori || '').toLowerCase(); },
    payroll: (r) => /^Instruktur Contoh/.test(String(r.nama || '')) || /^contoh-/.test(String(r.ref || '')) ||
      (/^PAY-\d+$/.test(String(r.id || '')) && r.tipe === 'Instruktur' && r.tunjangan === 300000 && r.potongan === 100000 &&
        r.metode === 'Transfer Bank' && r.pokok >= 2000000 && (r.pokok - 2000000) % 250000 === 0),
    budget: (r) => /^BUD-\d+$/.test(String(r.id || '')) && SEED_BUD[r.kategori] === r.jumlah,
    promo: (r) => SEED_PROMO[r.kode] === r.nama
  };

  /**
   * Migrasi versi 1 (idempoten, TIDAK menghapus data):
   *  1. cadangkan isi mentah tiap kunci lama ke `dc-finance-backup:<kunci>` (sekali saja),
   *  2. beri `_src` pada tiap baris: 'sample' bila cocok pola seed lama, selain itu 'local'.
   * Baris yang salah terdeteksi dapat dikembalikan lewat markReal().
   */
  function migrate() {
    let meta = {};
    try { meta = JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch (_) {}
    if (meta.v >= 1) return { migrated: false, report: meta.report || {} };
    const report = {};
    Object.keys(LEGACY_SEED).forEach((name) => {
      const def = COLLECTIONS[name];
      try {
        const raw = localStorage.getItem(def.key);
        if (raw == null) return;
        if (localStorage.getItem(BACKUP_PREFIX + def.key) == null) localStorage.setItem(BACKUP_PREFIX + def.key, raw);
      } catch (_) { return; }
      const rows = get(name, null);
      if (!Array.isArray(rows)) return;
      let samples = 0;
      const next = rows.map((r) => {
        if (r._src) return r;
        const s = LEGACY_SEED[name](r);
        if (s) samples++;
        return { ...r, _src: s ? SRC.SAMPLE : SRC.LOCAL };
      });
      report[name] = { total: rows.length, sample: samples };
      cache[name] = next;
      try { adapter.write(name, next); } catch (_) {}
    });
    try { localStorage.setItem(META_KEY, JSON.stringify({ v: 1, at: new Date().toISOString(), report })); } catch (_) {}
    emit('*', { op: 'migrate' });
    return { migrated: true, report };
  }

  function useAdapter(next) {
    if (!next || typeof next.read !== 'function' || typeof next.write !== 'function') throw new Error('Adapter tidak valid.');
    adapter = next;
    return hydrate();
  }

  // sinkronkan antar tab
  try {
    window.addEventListener('storage', (e) => {
      if (!adapter.sync || !e.key) return;
      const name = Object.keys(COLLECTIONS).find((n) => COLLECTIONS[n].key === e.key);
      if (!name) return;
      const v = adapter.read(name);
      if (v !== undefined) cache[name] = clone(v); else delete cache[name];
      emit(name, { op: 'external' });
    });
  } catch (_) {}

  hydrate();

  window.DCFinanceStore = Object.freeze({
    SRC, COLLECTIONS, get, set, has, append, remove, tag, isSample, withoutSamples, sampleCount, purgeSamples, markReal,
    migrate, useAdapter, createApiAdapter, localAdapter,
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    ready: () => ready,
    adapterName: () => adapter.name
  });
})();
