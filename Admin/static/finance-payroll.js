/*
 * Payroll (Gaji & Honor) + Anggaran Operasional.
 * - Penerima merujuk ke data Instruktur yang sudah ada (tidak membuat data orang baru); staf lain boleh diketik manual.
 * - Gaji berstatus "Dibayar" masuk laporan sebagai pengeluaran kategori "Gaji & Honor" lewat DCCompany.addExpenseSource,
 *   satu-satunya jalur, jadi tidak terhitung dua kali dengan menu Pengeluaran (yang tidak menyediakan kategori itu).
 * - Kas keluar = total bersih. Potongan (pajak/BPJS) yang disetor terpisah belum dimodelkan.
 * Data contoh disimpan di localStorage.
 */
(function () {
  'use strict';
  const K = window.DCFinanceKit, C = window.DCCompany;
  if (!K || !C || !C.ui) return;
  const { $, esc, rp, toast, today, iso, fmt, head, banner, CARD, BTN, FIELD, IBTN, ib } = K;
  const U = C.ui, { card, badge, pager, lab, sel, modal, mhead, mfoot, val, fail, closeM, nextId, sum, load, save } = U;
  const NO = 'border-rose-100 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 text-rose-500 hover:bg-rose-100';
  const OK = 'border-emerald-100 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 hover:bg-emerald-100';
  const ym = (d) => iso(d).slice(0, 7), CUR = ym(today());
  const prevYM = (s) => { const d = new Date(s + '-01T00:00:00'); d.setMonth(d.getMonth() - 1); return ym(d); };
  const ymLabel = (s) => new Date(s + '-01T00:00:00').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const money = (id, min, max, label, required) => {
    const raw = val(id); if (!raw) return required ? fail(label + ' wajib diisi.') : 0;
    if (/[^\d.\s]/.test(raw)) return fail(label + ' hanya boleh berisi angka.');
    const n = parseInt(raw.replace(/[.\s]/g, ''), 10);
    if (!Number.isFinite(n) || n < min) return fail(label + ' minimal ' + rp(min) + '.'); if (n > max) return fail(label + ' maksimal ' + rp(max) + '.'); return n;
  };

  // ---------- penerima: rujuk data Instruktur ----------
  let people = null, demo = false;
  async function loadPeople() {
    if (people) return people;
    let l = [];
    try { const r = await window.DCAdminApi.users({ limit: 200 }); l = r.users || r.items || r.data || []; } catch (_) {}
    if (!l.length) { try { l = (JSON.parse(localStorage.getItem('dc-siswa-data')) || {}).users || []; } catch (_) {} }
    l = l.filter((u) => u.role === 'instruktur' && u.status !== 'deleted').map((u) => ({ id: String(u.id), nama: u.name || u.full_name || u.username || 'Instruktur #' + u.id }));
    if (!l.length) { l = ['Instruktur Contoh A', 'Instruktur Contoh B', 'Instruktur Contoh C'].map((n, i) => ({ id: 'contoh-' + (i + 1), nama: n })); demo = true; }
    people = l; return l;
  }

  // ---------- data payroll ----------
  const PK = 'dc-finance-payroll', AKEY = 'dc-finance-budget';
  let PAY = (function () { try { const v = JSON.parse(localStorage.getItem(PK)); if (Array.isArray(v)) return v; } catch (_) {} return null; })();
  const bersih = (r) => r.pokok + r.tunjangan + r.bonus - r.potongan;
  function seedPay(list) {
    const out = []; let n = 0;
    list.forEach((p, i) => {
      const base = { ref: p.id, nama: p.nama, tipe: 'Instruktur', pokok: 2000000 + i * 250000, tunjangan: 300000, bonus: i === 0 ? 200000 : 0, potongan: 100000, metode: 'Transfer Bank' };
      const pd = prevYM(CUR), last = new Date(Number(CUR.slice(0, 4)), Number(CUR.slice(5)) - 1, 0), pay = iso(last) > iso(today()) ? iso(today()) : iso(last);
      out.push({ id: 'PAY-' + String(++n).padStart(3, '0'), ...base, periode: pd, status: 'paid', tanggalBayar: pay });
      out.push({ id: 'PAY-' + String(++n).padStart(3, '0'), ...base, periode: CUR, status: 'draft', tanggalBayar: '' });
    });
    return out;
  }
  async function ensure() { await loadPeople(); if (!PAY) { PAY = seedPay(people); save(PK, PAY); } }
  // pengeluaran gaji untuk laporan: hanya yang Dibayar, sebesar total bersih
  C.addExpenseSource(() => (PAY || []).filter((r) => r.status === 'paid').map((r) => ({ tanggal: r.tanggalBayar, kategori: 'Gaji & Honor', nominal: bersih(r) })));
  loadPeople().then(() => { if (!PAY) { PAY = seedPay(people); save(PK, PAY); } });

  // ================= PAYROLL =================
  const PP = { q: '', status: '', periode: CUR, page: 1, size: 10 };
  const PS = { draft: ['Draft', 'verif'], paid: ['Dibayar', 'paid'] };
  const payFiltered = () => { const q = PP.q.trim().toLowerCase(); return (PAY || []).filter((r) => (!PP.periode || r.periode === PP.periode) && (!PP.status || r.status === PP.status) && (!q || (r.id + ' ' + r.nama).toLowerCase().includes(q))).sort((a, b) => b.periode.localeCompare(a.periode) || a.nama.localeCompare(b.nama)); };
  function drawPay() {
    const all = (PAY || []).filter((r) => !PP.periode || r.periode === PP.periode), d = all.filter((r) => r.status === 'draft'), p = all.filter((r) => r.status === 'paid');
    const opt = (v, t) => '<option value="' + v + '"' + (PP.status === v ? ' selected' : '') + '>' + t + '</option>';
    $('#view-finance-payroll').innerHTML = head('Gaji & Honor (Payroll)', 'Total bersih = gaji pokok + tunjangan + bonus − potongan. Hanya yang Dibayar dihitung sebagai pengeluaran.',
      '<div class="flex gap-2"><button type="button" data-py="export" class="' + BTN + '"><i class="fa-solid fa-file-arrow-down mr-1.5"></i>Export CSV</button><button type="button" data-py="new" class="px-3.5 py-2 rounded-xl text-sm font-semibold bg-jade-600 text-white hover:bg-jade-700"><i class="fa-solid fa-plus mr-1.5"></i>Tambah payroll</button></div>') + banner() +
      '<div class="rounded-2xl border border-jade-200 dark:border-jade-500/30 bg-jade-50 dark:bg-jade-500/10 px-4 py-3 text-sm text-jade-800 dark:text-jade-200"><i class="fa-solid fa-circle-info mr-2"></i>Penerima diambil dari menu Instruktur' + (demo ? ' (data Instruktur belum bisa dimuat, jadi memakai nama contoh)' : '') + '. Gaji yang dibayar otomatis tercatat sebagai pengeluaran "Gaji &amp; Honor", jadi tidak perlu diinput lagi di Pengeluaran. Pajak dan BPJS yang disetor terpisah belum dimodelkan.</div>' +
      '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">' + card('Total bersih' + (PP.periode ? ' · ' + ymLabel(PP.periode) : ''), rp(sum(all, bersih)), all.length + ' penerima') + card('Draft (belum dibayar)', d.length, rp(sum(d, bersih))) + card('Sudah dibayar', p.length, rp(sum(p, bersih))) + '</div>' +
      '<div class="' + CARD + ' p-4 space-y-3"><div class="grid sm:grid-cols-4 gap-2"><input type="search" data-py-f="q" value="' + esc(PP.q) + '" placeholder="Cari ID atau nama" aria-label="Cari payroll" class="' + FIELD + ' sm:col-span-2"><input type="month" data-py-f="periode" value="' + esc(PP.periode) + '" max="' + CUR + '" aria-label="Periode" class="' + FIELD + '"><select data-py-f="status" aria-label="Status" class="' + FIELD + '">' + opt('', 'Semua status') + opt('draft', 'Draft') + opt('paid', 'Dibayar') + '</select></div>' +
      '<div class="overflow-x-auto"><table id="pyTable" class="w-full text-sm min-w-[1100px]"></table></div><div id="pyPager" class="flex flex-wrap items-center justify-between gap-2"></div></div>';
    drawPayTable();
  }
  function drawPayTable() {
    const rows = payFiltered(), pages = Math.max(1, Math.ceil(rows.length / PP.size)); PP.page = Math.min(PP.page, pages);
    const act = (r) => ib('data-py-detail', r.id, 'fa-eye', IBTN, 'Lihat detail') + (r.status === 'draft' ? ib('data-py-edit', r.id, 'fa-pen', IBTN, 'Ubah') + ib('data-py-pay', r.id, 'fa-money-bill-wave', OK, 'Catat pembayaran') + ib('data-py-del', r.id, 'fa-trash', NO, 'Hapus') : ib('data-py-slip', r.id, 'fa-print', IBTN, 'Cetak slip gaji'));
    $('#pyTable').innerHTML = '<thead><tr class="text-slate-500">' + ['Penerima', 'Periode', 'Gaji Pokok', 'Tunjangan', 'Bonus', 'Potongan', 'Total Bersih', 'Status', 'Aksi'].map((h) => '<th class="py-2 font-semibold whitespace-nowrap">' + h + '</th>').join('') + '</tr></thead><tbody>' +
      (rows.slice((PP.page - 1) * PP.size, PP.page * PP.size).map((r) => '<tr class="border-t border-slate-100 dark:border-slate-800"><td class="py-2.5">' + esc(r.nama) + '<div class="text-xs text-slate-400">' + esc(r.tipe) + '</div></td><td class="whitespace-nowrap">' + ymLabel(r.periode) + '</td><td class="whitespace-nowrap">' + rp(r.pokok) + '</td><td class="whitespace-nowrap">' + rp(r.tunjangan) + '</td><td class="whitespace-nowrap">' + rp(r.bonus) + '</td><td class="whitespace-nowrap">' + rp(r.potongan) + '</td><td class="font-semibold whitespace-nowrap">' + rp(bersih(r)) + '</td><td>' + badge(r.status, PS) + '</td><td><div class="flex items-center justify-end gap-1.5">' + act(r) + '</div></td></tr>').join('') || '<tr><td colspan="9" class="py-10 text-center text-slate-400">Tidak ada payroll pada filter ini.</td></tr>') + '</tbody>';
    $('#pyPager').innerHTML = pager('py-page', PP.page, pages, rows.length, 'payroll').replace(/data-co=/g, 'data-py=');
  }
  async function openForm(id) {
    await loadPeople(); const o = id ? PAY.find((r) => r.id === id) : null; if (id && (!o || o.status !== 'draft')) return;
    const p = o || { ref: people[0].id, nama: '', tipe: 'Instruktur', periode: CUR, pokok: '', tunjangan: '', bonus: '', potongan: '' };
    const opts = people.map((x) => '<option value="' + esc(x.id) + '"' + (p.ref === x.id ? ' selected' : '') + '>' + esc(x.nama) + '</option>').join('') + '<option value="STAF"' + (p.tipe === 'Staf' ? ' selected' : '') + '>Staf lain (ketik nama)</option>';
    const num = (i, t, v) => '<div>' + lab(i, t) + '<input id="' + i + '" data-py-calc type="text" inputmode="numeric" autocomplete="off" value="' + esc(v) + '" class="' + FIELD + ' w-full"></div>';
    modal(mhead(o ? 'Ubah payroll' : 'Tambah payroll') + '<div class="grid sm:grid-cols-2 gap-3"><div>' + lab('pyPenerima', 'Penerima') + '<select id="pyPenerima" class="' + FIELD + ' w-full">' + opts + '</select></div><div>' + lab('pyPeriode', 'Periode') + '<input id="pyPeriode" type="month" max="' + CUR + '" value="' + esc(p.periode) + '" class="' + FIELD + ' w-full"></div>' +
      '<div class="sm:col-span-2">' + lab('pyNama', 'Nama staf (khusus "Staf lain")') + '<input id="pyNama" type="text" maxlength="60" autocomplete="off" value="' + esc(p.tipe === 'Staf' ? p.nama : '') + '" class="' + FIELD + ' w-full"></div>' +
      num('pyPokok', 'Gaji pokok (Rp)', p.pokok) + num('pyTunj', 'Tunjangan (Rp)', p.tunjangan) + num('pyBonus', 'Bonus (Rp)', p.bonus) + num('pyPot', 'Potongan (Rp)', p.potongan) +
      '<div class="sm:col-span-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 px-4 py-3 flex items-center justify-between text-sm"><span class="text-slate-500">Total bersih</span><b id="pyBersih" class="text-slate-900 dark:text-white">' + rp(o ? bersih(o) : 0) + '</b></div></div>' + mfoot('data-py="save" data-id="' + (o ? esc(o.id) : '') + '"'));
  }
  const calc = () => { const n = (i) => parseInt(String(val(i)).replace(/[.\s]/g, ''), 10) || 0, el = $('#pyBersih'); if (el) el.textContent = rp(n('pyPokok') + n('pyTunj') + n('pyBonus') - n('pyPot')); };
  async function saveForm(id) {
    await loadPeople(); const rid = val('pyPenerima'), periode = val('pyPeriode'), staf = rid === 'STAF';
    const nama = staf ? val('pyNama') : (people.find((x) => x.id === rid) || {}).nama;
    if (!nama) return fail(staf ? 'Nama staf wajib diisi.' : 'Pilih penerima.'); if (staf && nama.length < 2) return fail('Nama staf minimal 2 karakter.');
    if (!periode) return fail('Periode wajib diisi.'); if (periode > CUR) return fail('Periode tidak boleh di masa depan.');
    const pokok = money('pyPokok', 1000, 100000000, 'Gaji pokok', true); if (pokok == null) return;
    const tunjangan = money('pyTunj', 0, 100000000, 'Tunjangan', false); if (tunjangan == null) return;
    const bonus = money('pyBonus', 0, 100000000, 'Bonus', false); if (bonus == null) return;
    const potongan = money('pyPot', 0, 100000000, 'Potongan', false); if (potongan == null) return;
    if (potongan > pokok + tunjangan + bonus) return fail('Potongan tidak boleh melebihi gaji pokok + tunjangan + bonus.');
    const ref = staf ? '' : rid; if (PAY.some((r) => r.id !== id && r.periode === periode && (staf ? r.nama.toLowerCase() === nama.toLowerCase() && r.tipe === 'Staf' : r.ref === ref))) return fail(nama + ' sudah punya payroll untuk ' + ymLabel(periode) + '.');
    const old = id ? PAY.find((r) => r.id === id) : null;
    const rec = { id: old ? old.id : nextId(PAY, 'PAY'), ref, nama, tipe: staf ? 'Staf' : 'Instruktur', periode, pokok, tunjangan, bonus, potongan, status: 'draft', tanggalBayar: '', metode: 'Transfer Bank' };
    PAY = old ? PAY.map((r) => (r.id === id ? rec : r)) : [rec].concat(PAY); save(PK, PAY); closeM(); drawPay(); toast(old ? 'Payroll diperbarui.' : 'Payroll ditambahkan.');
  }
  function openPayDlg(id) {
    const r = PAY.find((x) => x.id === id); if (!r || r.status !== 'draft') return;
    modal(mhead('Catat pembayaran') + '<p class="text-sm text-slate-600 dark:text-slate-300 mb-3">' + esc(r.nama) + ' · ' + ymLabel(r.periode) + ' · <b>' + rp(bersih(r)) + '</b></p><div class="grid sm:grid-cols-2 gap-3"><div>' + lab('pyTgl', 'Tanggal pembayaran') + '<input id="pyTgl" type="date" max="' + iso(today()) + '" value="' + iso(today()) + '" class="' + FIELD + ' w-full"></div><div>' + lab('pyMetode', 'Metode') + sel('pyMetode', ['Transfer Bank', 'Tunai'], 'Transfer Bank') + '</div></div><p class="mt-3 text-xs text-slate-400">Setelah dibayar, data terkunci dan tercatat sebagai pengeluaran Gaji &amp; Honor.</p>' + mfoot('data-py="pay-save" data-id="' + esc(r.id) + '"'));
  }
  function savePayDlg(id) {
    const r = PAY.find((x) => x.id === id); if (!r) return; const t = val('pyTgl');
    if (!t) return fail('Tanggal pembayaran wajib diisi.'); if (t > iso(today())) return fail('Tanggal tidak boleh di masa depan.'); if (t < r.periode + '-01') return fail('Tanggal pembayaran tidak boleh sebelum awal periode.');
    PAY = PAY.map((x) => (x.id === id ? { ...x, status: 'paid', tanggalBayar: t, metode: val('pyMetode') || 'Transfer Bank' } : x)); save(PK, PAY); closeM(); drawPay(); toast('Pembayaran dicatat.');
  }
  async function delPay(id) {
    const r = PAY.find((x) => x.id === id); if (!r || r.status !== 'draft') return;
    if (!(await window.dcConfirm({ title: 'Hapus payroll?', message: r.nama + ' · ' + ymLabel(r.periode), detail: 'Hanya payroll Draft yang bisa dihapus.', confirmText: 'Ya, hapus', cancelText: 'Batal', tone: 'danger' }))) return;
    PAY = PAY.filter((x) => x.id !== id); save(PK, PAY); drawPay(); toast('Payroll dihapus.');
  }
  const komp = (r) => [['Gaji pokok', rp(r.pokok)], ['Tunjangan', rp(r.tunjangan)], ['Bonus', rp(r.bonus)], ['Potongan', r.potongan ? '− ' + rp(r.potongan) : '–']];
  function detailPay(id) {
    const r = PAY.find((x) => x.id === id); if (!r) return;
    const row = (k, v, b) => '<div class="flex justify-between gap-4 py-2 border-t border-slate-100 dark:border-slate-800 text-sm"><span class="text-slate-500">' + k + '</span><span class="text-right ' + (b ? 'font-extrabold text-slate-900 dark:text-white' : 'font-semibold text-slate-800 dark:text-slate-100') + '">' + v + '</span></div>';
    modal(mhead('Detail payroll') + row('ID', r.id) + row('Penerima', esc(r.nama)) + row('Tipe', r.tipe) + row('Periode', ymLabel(r.periode)) + komp(r).map((k) => row(k[0], k[1])).join('') + row('Total bersih', rp(bersih(r)), true) + row('Status', badge(r.status, PS)) + (r.status === 'paid' ? row('Dibayar', fmt(r.tanggalBayar) + ' · ' + esc(r.metode)) : '') + '<div class="flex items-center justify-between mt-3"><p class="text-xs text-slate-400">Data contoh.</p>' + (r.status === 'paid' ? '<button type="button" data-py-slip="' + r.id + '" class="' + BTN + '"><i class="fa-solid fa-print mr-1.5"></i>Cetak slip</button>' : '') + '</div>');
  }
  function slip(id) {
    const r = PAY.find((x) => x.id === id); if (!r || r.status !== 'paid') return;
    const w = window.open('', '_blank'); if (!w) return toast('Pop-up diblokir browser. Izinkan pop-up untuk mencetak.', 'error');
    const t = (k, v, b) => '<tr><td style="padding:6px 0;color:#64748b">' + k + '</td><td style="padding:6px 0;text-align:right;font-weight:' + (b ? 700 : 600) + '">' + v + '</td></tr>';
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Slip Gaji ' + esc(r.nama) + '</title></head><body style="font-family:Arial,sans-serif;max-width:520px;margin:32px auto;color:#0f172a"><h1 style="margin:0">Slip Gaji</h1><p style="margin:4px 0 20px;color:#64748b">' + r.id + ' · ' + ymLabel(r.periode) + '</p><table style="width:100%;border-collapse:collapse;font-size:14px">' + t('Penerima', esc(r.nama)) + t('Tipe', r.tipe) + komp(r).map((k) => t(k[0], k[1])).join('') +
      '<tr><td style="padding:10px 0;border-top:2px solid #0f172a;font-weight:700">Total bersih</td><td style="padding:10px 0;border-top:2px solid #0f172a;text-align:right;font-weight:700">' + rp(bersih(r)) + '</td></tr>' + t('Dibayar', fmt(r.tanggalBayar) + ' · ' + esc(r.metode)) + '</table><p style="margin-top:24px;font-size:12px;color:#94a3b8">Dokumen contoh, bukan slip gaji resmi.</p></body></html>');
    w.document.close(); w.focus(); w.print();
  }

  // ================= ANGGARAN OPERASIONAL =================
  const KATG = ['Gaji & Honor'].concat(U.EKAT), PA = { periode: CUR };
  const seedBud = () => { const b = { 'Gaji & Honor': 9000000, 'Server & Domain': 800000, 'Operasional': 1000000, 'Pemasaran': 1500000, 'Sewa': 1500000, 'Peralatan': 700000 }; let n = 0; const o = []; [CUR, prevYM(CUR)].forEach((p) => Object.keys(b).forEach((k) => o.push({ id: 'BUD-' + String(++n).padStart(3, '0'), periode: p, kategori: k, jumlah: b[k] }))); return o; };
  let BUD = load(AKEY, seedBud);
  const AS = { ok: ['Aman', 'paid'], warn: ['Hampir Habis', 'verif'], over: ['Melebihi', 'failed'], none: ['Belum Dianggarkan', 'refunded'] };
  function budRows(periode) {
    const exp = C.expenses(), real = {}, kom = {};
    exp.forEach((x) => { if (x.tanggal.slice(0, 7) !== periode) return; if (x.status === 'paid') real[x.kategori] = (real[x.kategori] || 0) + x.nominal; else if (x.status === 'approved') kom[x.kategori] = (kom[x.kategori] || 0) + x.nominal; });
    (PAY || []).forEach((r) => { if (r.status === 'paid' && r.tanggalBayar.slice(0, 7) === periode) real['Gaji & Honor'] = (real['Gaji & Honor'] || 0) + bersih(r); });
    const bud = BUD.filter((b) => b.periode === periode), cats = [...new Set(bud.map((b) => b.kategori).concat(Object.keys(real), Object.keys(kom)))];
    return cats.map((k) => { const b = bud.find((x) => x.kategori === k), a = b ? b.jumlah : 0, r = real[k] || 0, pct = a ? Math.round(r / a * 100) : 0;
      return { id: b ? b.id : '', kategori: k, anggaran: a, real: r, komit: kom[k] || 0, sisa: a - r, pct, st: !b ? 'none' : pct > 100 ? 'over' : pct >= 80 ? 'warn' : 'ok' }; }).sort((x, y) => KATG.indexOf(x.kategori) - KATG.indexOf(y.kategori));
  }
  function drawBud() {
    const rows = budRows(PA.periode), tot = sum(rows, (r) => r.anggaran), re = sum(rows, (r) => r.real);
    $('#view-finance-anggaran').innerHTML = head('Anggaran Operasional', 'Realisasi dihitung dari pengeluaran berstatus Dibayar dan payroll yang sudah dibayar pada bulan terpilih.', '<button type="button" data-ag="new" class="px-3.5 py-2 rounded-xl text-sm font-semibold bg-jade-600 text-white hover:bg-jade-700"><i class="fa-solid fa-plus mr-1.5"></i>Tambah anggaran</button>') + banner() +
      '<div class="grid grid-cols-2 xl:grid-cols-4 gap-3">' + card('Total anggaran', rp(tot), ymLabel(PA.periode)) + card('Realisasi', rp(re), tot ? Math.round(re / tot * 100) + '% dari anggaran' : '–') + card('Sisa anggaran', (tot - re < 0 ? '−' : '') + rp(Math.abs(tot - re)), 'Anggaran dikurangi realisasi') + card('Kategori melebihi', rows.filter((r) => r.st === 'over').length, 'Realisasi di atas anggaran') + '</div>' +
      '<div class="' + CARD + ' p-4 space-y-3"><div class="flex items-center gap-2"><label for="agPeriode" class="text-sm text-slate-500">Periode</label><input id="agPeriode" type="month" data-ag-f="periode" value="' + esc(PA.periode) + '" class="' + FIELD + '"></div><div class="overflow-x-auto"><table id="agTable" class="w-full text-sm min-w-[980px]"><thead><tr class="text-slate-500">' + ['Kategori', 'Anggaran', 'Realisasi', 'Komitmen', 'Sisa', 'Penggunaan', 'Status', 'Aksi'].map((h) => '<th class="py-2 font-semibold whitespace-nowrap">' + h + '</th>').join('') + '</tr></thead><tbody>' +
      (rows.map((r) => '<tr class="border-t border-slate-100 dark:border-slate-800"><td class="py-2.5 font-semibold">' + esc(r.kategori) + '</td><td class="whitespace-nowrap">' + (r.anggaran ? rp(r.anggaran) : '–') + '</td><td class="whitespace-nowrap">' + rp(r.real) + '</td><td class="whitespace-nowrap" title="Disetujui, belum dibayar">' + (r.komit ? rp(r.komit) : '–') + '</td><td class="whitespace-nowrap' + (r.sisa < 0 ? ' text-rose-600 font-semibold' : '') + '">' + (r.anggaran ? (r.sisa < 0 ? '−' : '') + rp(Math.abs(r.sisa)) : '–') + '</td><td style="min-width:140px">' + (r.anggaran ? '<div class="h-2 rounded-full bg-slate-100 dark:bg-slate-800"><div class="h-2 rounded-full" style="width:' + Math.min(100, r.pct) + '%;background:' + (r.st === 'over' ? '#fb7185' : r.st === 'warn' ? '#f59e0b' : '#10b981') + '"></div></div><div class="text-xs text-slate-400 mt-1">' + r.pct + '%</div>' : '<span class="text-slate-300">–</span>') + '</td><td>' + badge(r.st, AS) + '</td><td><div class="flex items-center justify-end gap-1.5">' +
        (r.id ? ib('data-ag-edit', r.id, 'fa-pen', IBTN, 'Ubah anggaran') + ib('data-ag-del', r.id, 'fa-trash', NO, 'Hapus anggaran') : ib('data-ag-add', r.kategori, 'fa-plus', OK, 'Anggarkan kategori ini')) + '</div></td></tr>').join('') || '<tr><td colspan="8" class="py-10 text-center text-slate-400">Belum ada anggaran untuk periode ini.</td></tr>') + '</tbody></table></div></div>';
  }
  function openBud(id, kat) {
    const o = id ? BUD.find((b) => b.id === id) : null; if (id && !o) return;
    const p = o || { periode: PA.periode, kategori: kat || KATG[0], jumlah: '' };
    modal(mhead(o ? 'Ubah anggaran' : 'Tambah anggaran') + '<div class="grid sm:grid-cols-2 gap-3"><div>' + lab('agPer', 'Periode') + '<input id="agPer" type="month" value="' + esc(p.periode) + '"' + (o ? ' disabled' : '') + ' class="' + FIELD + ' w-full"></div><div>' + lab('agKat', 'Kategori') + (o ? '<input id="agKat" value="' + esc(p.kategori) + '" disabled class="' + FIELD + ' w-full">' : sel('agKat', KATG, p.kategori)) + '</div>' +
      '<div class="sm:col-span-2">' + lab('agJumlah', 'Jumlah anggaran (Rp)') + '<input id="agJumlah" type="text" inputmode="numeric" autocomplete="off" value="' + esc(p.jumlah) + '" class="' + FIELD + ' w-full"></div></div>' + mfoot('data-ag="save" data-id="' + (o ? esc(o.id) : '') + '"'));
  }
  function saveBud(id) {
    const old = id ? BUD.find((b) => b.id === id) : null, periode = old ? old.periode : val('agPer'), kategori = old ? old.kategori : val('agKat');
    if (!periode) return fail('Periode wajib diisi.'); if (!KATG.includes(kategori)) return fail('Pilih kategori yang tersedia.');
    const jumlah = money('agJumlah', 1000, 1000000000, 'Jumlah anggaran', true); if (jumlah == null) return;
    if (!old && BUD.some((b) => b.periode === periode && b.kategori === kategori)) return fail('Anggaran ' + kategori + ' untuk ' + ymLabel(periode) + ' sudah ada. Ubah yang sudah ada.');
    BUD = old ? BUD.map((b) => (b.id === id ? { ...b, jumlah } : b)) : [{ id: nextId(BUD, 'BUD'), periode, kategori, jumlah }].concat(BUD); save(AKEY, BUD); closeM(); PA.periode = periode; drawBud(); toast(old ? 'Anggaran diperbarui.' : 'Anggaran ditambahkan.');
  }
  async function delBud(id) {
    const b = BUD.find((x) => x.id === id); if (!b) return;
    if (!(await window.dcConfirm({ title: 'Hapus anggaran?', message: b.kategori + ' · ' + ymLabel(b.periode) + ' · ' + rp(b.jumlah), detail: 'Realisasi pengeluaran tidak ikut terhapus.', confirmText: 'Ya, hapus', cancelText: 'Batal', tone: 'danger' }))) return;
    BUD = BUD.filter((x) => x.id !== id); save(AKEY, BUD); drawBud(); toast('Anggaran dihapus.');
  }

  // ================= EVENT =================
  const ACT = { 'py-detail': detailPay, 'py-edit': openForm, 'py-pay': openPayDlg, 'py-slip': slip, 'py-del': delPay, 'ag-edit': (i) => openBud(i), 'ag-del': delBud, 'ag-add': (k) => openBud('', k) };
  const csvPay = () => { const r = payFiltered(); if (!r.length) return toast('Tidak ada data untuk diexport.', 'error'); K.download('payroll-' + iso(today()) + '.csv', K.csv(r, [['ID', (x) => x.id], ['Penerima', (x) => x.nama], ['Tipe', (x) => x.tipe], ['Periode', (x) => x.periode], ['Gaji Pokok', (x) => x.pokok], ['Tunjangan', (x) => x.tunjangan], ['Bonus', (x) => x.bonus], ['Potongan', (x) => x.potongan], ['Total Bersih', bersih], ['Status', (x) => PS[x.status][0]], ['Tanggal Bayar', (x) => x.tanggalBayar]])); toast('Export CSV: ' + r.length + ' baris (data contoh).'); };
  const BTNS = { 'py:new': () => openForm(''), 'py:save': saveForm, 'py:pay-save': savePayDlg, 'py:export': csvPay, 'py:py-page': (d) => { PP.page += Number(d); drawPayTable(); }, 'ag:new': () => openBud(''), 'ag:save': saveBud };
  document.addEventListener('click', (e) => {
    for (const a in ACT) { const el = e.target.closest('[data-' + a + ']'); if (el) return ACT[a](el.getAttribute('data-' + a)); }
    for (const p of ['py', 'ag']) { const b = e.target.closest('[data-' + p + ']'); if (b && BTNS[p + ':' + b.getAttribute('data-' + p)]) return BTNS[p + ':' + b.getAttribute('data-' + p)](b.dataset.id); }
  });
  document.addEventListener('input', (e) => {
    const q = e.target.closest('[data-py-f="q"]'); if (q) { PP.q = q.value; PP.page = 1; drawPayTable(); }
    if (e.target.closest('[data-py-calc]')) calc();
  });
  document.addEventListener('change', (e) => {
    const s = e.target.closest('[data-py-f="status"]'); if (s) { PP.status = s.value; PP.page = 1; drawPay(); }
    const p = e.target.closest('[data-py-f="periode"]'); if (p) { PP.periode = p.value; PP.page = 1; drawPay(); }
    const a = e.target.closest('[data-ag-f="periode"]'); if (a && a.value) { PA.periode = a.value; drawBud(); }
  });
  const st = document.createElement('style');
  st.textContent = '#pyTable th,#pyTable td,#agTable th,#agTable td{text-align:center;padding-left:.75rem;padding-right:.75rem}#pyTable .justify-end,#agTable .justify-end{justify-content:center}#pyTable th,#agTable th{font-size:.7rem;text-transform:uppercase;letter-spacing:.04em}';
  document.head.appendChild(st);
  window.addEventListener('dc:view', (e) => {
    if (e.detail === 'finance-payroll') K.init().then(ensure).then(drawPay);
    else if (e.detail === 'finance-anggaran') K.init().then(ensure).then(drawBud);
  });
})();
