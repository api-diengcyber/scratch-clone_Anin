/*
 * Dashboard — grafik, donut jenjang, dan interaksi kecil gaya UStudy.
 * Dimuat SEBELUM admin.js. admin.js memanggil window.dcDash.* bila tersedia,
 * jadi bila file ini dihapus dashboard tetap jalan (hanya tanpa grafik).
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n || 0).toLocaleString('id-ID');
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DAY = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  function parseDate(value) {
    if (!value) return null;
    const raw = String(value);
    const d = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z');
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const dayKey = (d) => d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();

  // ---------- Grafik batang: tugas selesai 7 hari terakhir ----------
  function renderWeek(entries) {
    const box = $('weekChart');
    if (!box) return;
    const list = Array.isArray(entries) ? entries : [];

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      days.push({ date: d, key: dayKey(d), count: 0, points: 0 });
    }
    const index = new Map(days.map((d) => [d.key, d]));
    for (const entry of list) {
      const d = parseDate(entry.completed_at);
      if (!d) continue;
      const slot = index.get(dayKey(d));
      if (slot) { slot.count += 1; slot.points += Number(entry.points || 0); }
    }

    const total = days.reduce((s, d) => s + d.count, 0);
    const max = Math.max(...days.map((d) => d.count), 0);
    const top = max <= 4 ? 4 : Math.ceil(max / 4) * 4;            // skala sumbu-Y yang rapi
    const peak = max > 0 ? days.findIndex((d) => d.count === max) : -1;
    const ticks = [4, 3, 2, 1, 0].map((n) => Math.round((top / 4) * n));

    const first = days[0].date, last = days[6].date;
    const rangeText = first.getDate() + ' ' + MON[first.getMonth()] + ' – ' + last.getDate() + ' ' + MON[last.getMonth()];
    const rangeEl = $('weekChartRange');
    if (rangeEl) rangeEl.innerHTML = '<i class="fa-regular fa-calendar"></i><span>' + rangeText + '</span>';
    const noteEl = $('weekChartNote');
    if (noteEl) noteEl.textContent = total
      ? fmt(total) + ' tugas selesai dari ' + fmt(list.length) + ' submisi terbaru'
      : 'Belum ada tugas selesai dalam 7 hari terakhir';

    box.innerHTML =
      '<div class="wk-y">' + ticks.map((t) => '<span>' + t + '</span>').join('') + '</div>' +
      '<div class="wk-plot">' +
        '<div class="wk-lines">' + ticks.map(() => '<i></i>').join('') + '</div>' +
        '<div class="wk-cols">' + days.map((d, i) => {
          const h = Math.round((d.count / top) * 100);
          const tip = fmt(d.count) + ' tugas' + (d.points ? ' · ' + fmt(d.points) + ' poin' : '');
          return '<div class="wk-col' + (i === peak ? ' is-peak' : '') + '" tabindex="0" aria-label="' + esc(DAY[d.date.getDay()] + ': ' + tip) + '">' +
            '<div class="wk-track"><div class="wk-fill" style="height:' + h + '%">' +
              (d.count ? '<span class="wk-tip">' + esc(tip) + '</span>' : '') +
            '</div></div>' +
            '<span class="wk-x">' + DAY[d.date.getDay()] + '</span></div>';
        }).join('') + '</div>' +
      '</div>';
  }

  // Ambil submisi lebih banyak untuk grafik; bila server menolak, pakai data feed.
  async function loadWeek(fallbackEntries) {
    renderWeek(fallbackEntries);
    if (!window.DCAdminApi || !window.DCAdminApi.activity) return;
    try {
      const data = await window.DCAdminApi.activity(100);
      if (data && Array.isArray(data.entries)) renderWeek(data.entries);
    } catch (_) { /* tetap pakai data feed */ }
  }

  // ---------- Donut: distribusi jenjang ----------
  function renderDonut(stats) {
    const svg = $('gradeDonut');
    if (!svg) return;
    const g = (stats && stats.grades) || {};
    const total = Number((stats && stats.students && stats.students.total) || 0);
    const parts = [
      { n: Number(g.sd || 0), cls: 'dn-sd' },
      { n: Number(g.smp || 0), cls: 'dn-smp' },
      { n: Number(g.smk || 0), cls: 'dn-smk' },
      { n: Number(g.unassigned || 0), cls: 'dn-un' },
    ];
    const sum = parts.reduce((s, p) => s + p.n, 0);
    const R = 46, C = 2 * Math.PI * R, GAP = sum > 0 && parts.filter((p) => p.n > 0).length > 1 ? 3 : 0;

    let html = '<circle class="dn-track" cx="60" cy="60" r="' + R + '" fill="none" stroke-width="14"></circle>';
    let acc = 0;
    if (sum > 0) {
      for (const p of parts) {
        if (!p.n) continue;
        const len = (p.n / sum) * C;
        html += '<circle class="' + p.cls + '" cx="60" cy="60" r="' + R + '" fill="none" stroke-width="14" ' +
          'stroke-dasharray="' + Math.max(0, len - GAP).toFixed(2) + ' ' + (C - Math.max(0, len - GAP)).toFixed(2) + '" ' +
          'stroke-dashoffset="' + (-acc).toFixed(2) + '"></circle>';
        acc += len;
      }
    }
    svg.innerHTML = html;
    const t = $('donutTotal'); if (t) t.textContent = fmt(total);
  }

  // ---------- Akun (nama di judul sambutan & avatar atas) ----------
  function setAccount(name, initials) {
    const w = $('welcomeName'); if (w) w.textContent = name;
    const a = $('topAvatar'); if (a) a.textContent = initials;
  }

  // ---------- Tombol [data-goto] -> pindah halaman via sidebar ----------
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-goto]');
    if (!t) return;
    const view = t.dataset.goto;
    if (!view || view === 'siswa' || !/^[a-z0-9-]+$/.test(view)) return;  // 'siswa' sudah ditangani siswa.js
    const nav = document.querySelector('aside [data-view="' + view + '"]');
    if (nav) nav.click();
  });

  // ---------- Kartu promo sidebar ----------
  (function promo() {
    const card = $('sidebarPromo'), close = $('promoClose');
    if (!card || !close) return;
    try { if (localStorage.getItem('dc-promo-hidden') === '1') card.style.display = 'none'; } catch (_) {}
    close.addEventListener('click', () => {
      card.style.display = 'none';
      try { localStorage.setItem('dc-promo-hidden', '1'); } catch (_) {}
    });
  })();

  renderWeek([]);   // kerangka awal sebelum data tiba
  renderDonut({});

  window.dcDash = { renderWeek, renderDonut, loadWeek, setAccount };
})();
