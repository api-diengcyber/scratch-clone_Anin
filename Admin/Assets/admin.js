/* ==========================================================
   Admin Dashboard - Dieng Cyber
   Data di bawah masih mock. Nanti ganti dengan fetch ke API,
   misalnya: const students = await api('/api/admin/students');
   ========================================================== */

// ---------- DATA (mock) ----------
const STATS = [
  { label: 'TOTAL SISWA AKTIF', value: '1,248', badge: '+12%', badgeClass: 'text-emerald-400', badgeIcon: 'trending-up', note: 'Terdaftar di 6 jalur belajar', icon: 'users', iconClass: 'bg-sky-500/10 text-sky-400' },
  { label: 'MODUL KODING TERSEDIA', value: '84', badge: '8 Baru', badgeClass: 'text-sky-400', badgeIcon: 'sparkle', note: 'Frontend, Backend, CyberSec', icon: 'file-code', iconClass: 'bg-indigo-500/10 text-indigo-400' },
  { label: 'KODE DISUBMIT HARI INI', value: '3,420', badge: '94% Pass', badgeClass: 'text-emerald-400', badgeIcon: 'check', note: 'Melalui automated unit test', icon: 'terminal', iconClass: 'bg-emerald-500/10 text-emerald-400' },
  { label: 'SERTIFIKAT KELULUSAN', value: '412', badge: 'Bulan ini', badgeClass: 'text-amber-400 font-mono', badgeIcon: null, note: 'Valid QR Verification', icon: 'award', iconClass: 'bg-amber-500/10 text-amber-400' },
];

const TRACKS = {
  fullstack: { label: 'Fullstack JS', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  python:    { label: 'Python & AI',  badge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
  cyber:     { label: 'Cyber Security', badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
};

const STATUS = {
  coding:  { text: 'Online (Coding)',   cls: 'text-emerald-400', dot: 'bg-emerald-400' },
  cert:    { text: 'Siap Sertifikasi',  cls: 'text-indigo-400',  icon: 'check-circle' },
  offline: { text: 'Offline',           cls: 'text-slate-400',   dot: 'bg-slate-500' },
  help:    { text: 'Butuh Bantuan Lab', cls: 'text-rose-400',    dot: 'bg-rose-500' },
};

const STUDENTS = [
  { id: 'DC-8012', name: 'Rizky Aditya',   track: 'fullstack', progress: 82,  labs: '28/34 Lab', status: 'coding',  avatar: 'from-sky-600 to-blue-500',     bar: 'bg-sky-400' },
  { id: 'DC-8033', name: 'Siti Nurhaliza', track: 'python',    progress: 100, labs: 'Selesai',   status: 'cert',    avatar: 'from-emerald-600 to-teal-500', bar: 'bg-emerald-400' },
  { id: 'DC-8041', name: 'Daffa Maulana',  track: 'cyber',     progress: 45,  labs: '9/20 Lab',  status: 'offline', avatar: 'from-purple-600 to-pink-500',  bar: 'bg-indigo-500' },
  { id: 'DC-8099', name: 'Fajar Ramadhan', track: 'fullstack', progress: 15,  labs: '5/34 Lab',  status: 'help',    avatar: 'from-amber-600 to-orange-500', bar: 'bg-amber-500' },
];

// ---------- HELPERS ----------
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Escape agar aman saat data nanti datang dari API/user
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = (name) => name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const refreshIcons = () => window.lucide && lucide.createIcons();

// ---------- RENDER ----------
function renderStats() {
  $('#statsGrid').innerHTML = STATS.map((s) => `
    <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition">
      <div class="flex items-center justify-between mb-3">
        <span class="text-xs font-medium text-slate-400 font-mono">${esc(s.label)}</span>
        <div class="w-9 h-9 rounded-xl flex items-center justify-center ${s.iconClass}">
          <i data-lucide="${s.icon}" class="w-5 h-5"></i>
        </div>
      </div>
      <div class="flex items-baseline gap-2">
        <span class="text-2xl md:text-3xl font-bold text-white tracking-tight">${esc(s.value)}</span>
        <span class="text-xs font-semibold flex items-center ${s.badgeClass}">
          ${s.badgeIcon ? `<i data-lucide="${s.badgeIcon}" class="w-3 h-3 mr-0.5"></i>` : ''}${esc(s.badge)}
        </span>
      </div>
      <p class="text-xs text-slate-400 mt-2">${esc(s.note)}</p>
    </div>`).join('');
}

function studentRow(s) {
  const track = TRACKS[s.track];
  const st = STATUS[s.status];
  const done = s.progress === 100;
  const statusIcon = st.icon
    ? `<i data-lucide="${st.icon}" class="w-3.5 h-3.5"></i>`
    : `<span class="w-1.5 h-1.5 rounded-full ${st.dot}"></span>`;

  return `
    <tr class="hover:bg-slate-800/30 transition">
      <td class="px-5 py-4">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full bg-gradient-to-tr ${s.avatar} flex items-center justify-center font-bold text-white text-xs">${esc(initials(s.name))}</div>
          <div>
            <p class="font-medium text-white text-sm">${esc(s.name)}</p>
            <span class="text-xs text-slate-500 font-mono">id: #${esc(s.id)}</span>
          </div>
        </div>
      </td>
      <td class="px-5 py-4">
        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border font-mono ${track.badge}">${esc(track.label)}</span>
      </td>
      <td class="px-5 py-4">
        <div class="w-36">
          <div class="flex justify-between text-xs mb-1">
            <span class="text-slate-400">${s.progress}%</span>
            <span class="font-mono ${done ? 'text-emerald-400' : 'text-slate-400'}">${esc(s.labs)}</span>
          </div>
          <div class="w-full bg-slate-800 rounded-full h-1.5" role="progressbar" aria-valuenow="${s.progress}" aria-valuemin="0" aria-valuemax="100">
            <div class="${s.bar} h-1.5 rounded-full" style="width:${s.progress}%"></div>
          </div>
        </div>
      </td>
      <td class="px-5 py-4">
        <span class="inline-flex items-center gap-1.5 text-xs ${st.cls}">${statusIcon} ${esc(st.text)}</span>
      </td>
      <td class="px-5 py-4 text-right">
        <button data-student="${esc(s.id)}" class="text-xs text-sky-400 hover:text-sky-300 font-medium px-2 py-1 rounded bg-sky-500/10 hover:bg-sky-500/20 transition">Detail</button>
      </td>
    </tr>`;
}

function renderStudents(filter = 'all') {
  const rows = STUDENTS.filter((s) => filter === 'all' || s.track === filter);
  $('#studentTableBody').innerHTML = rows.length
    ? rows.map(studentRow).join('')
    : `<tr><td colspan="5" class="px-5 py-10 text-center text-slate-500">Tidak ada siswa di jalur ini.</td></tr>`;
  $('#studentCount').textContent = `Menampilkan ${rows.length} dari 1,248 siswa terdaftar`;
  refreshIcons();
}

// ---------- MODAL ----------
function openModal(id)  { $('#' + id)?.classList.remove('hidden'); }
function closeModal(id) { $('#' + id)?.classList.add('hidden'); }
function closeAllModals() { $$('[data-modal]').forEach((m) => m.classList.add('hidden')); }

function openStudentDetail(studentId) {
  const s = STUDENTS.find((x) => x.id === studentId);
  if (!s) return;
  $('#modalStudentName').textContent = s.name;
  $('#modalStudentCourse').textContent = TRACKS[s.track].label;
  $('#modalStudentProgress').textContent = `${s.progress}%`;
  openModal('modalDetail');
}

// ---------- TOAST ----------
let toastTimer;
function showToast(message) {
  const toast = $('#toast');
  $('#toastMessage').textContent = message;
  toast.classList.remove('translate-y-20', 'opacity-0');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('translate-y-20', 'opacity-0'), 3000);
}

// ---------- EVENTS ----------
document.addEventListener('click', (e) => {
  const open = e.target.closest('[data-open-modal]');
  if (open) return openModal(open.dataset.openModal);

  const close = e.target.closest('[data-close-modal]');
  if (close) return closeModal(close.dataset.closeModal);

  const detail = e.target.closest('[data-student]');
  if (detail) return openStudentDetail(detail.dataset.student);

  // klik area gelap di luar kotak modal = tutup
  if (e.target.matches('[data-modal]')) return e.target.classList.add('hidden');

  if (e.target.closest('#refreshBtn')) {
    renderStudents($('#courseFilter').value);
    showToast('Data progress siswa berhasil diperbarui!');
  }
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAllModals(); });

$('#courseFilter').addEventListener('change', (e) => renderStudents(e.target.value));

$('#mobileMenuBtn').addEventListener('click', (e) => {
  const sidebar = $('#sidebar');
  sidebar.classList.toggle('hidden');
  e.currentTarget.setAttribute('aria-expanded', String(!sidebar.classList.contains('hidden')));
});

$('#courseForm').addEventListener('submit', (e) => {
  e.preventDefault();
  // TODO: kirim ke backend, mis. fetch('/api/admin/modules', { method: 'POST', ... })
  closeModal('modalAddCourse');
  showToast('Materi coding baru berhasil ditambahkan ke kurikulum!');
  e.target.reset();
});

// ---------- INIT ----------
renderStats();
renderStudents();
refreshIcons();


// ---------- TEMA ADMIN (sinkron dengan halaman users melalui dc-theme) ----------
(function initAdminTheme() {
  const toggle = document.getElementById('adminThemeToggle');
  const icon = document.getElementById('adminThemeIcon');
  if (!toggle) return;

  function applyTheme(mode, persist = true) {
    const dark = mode === 'dark';
    document.documentElement.classList.toggle('dark', dark);
    toggle.setAttribute('aria-pressed', String(dark));
    toggle.setAttribute('aria-label', dark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap');
    toggle.title = dark ? 'Mode gelap aktif — klik untuk mode terang' : 'Mode terang aktif — klik untuk mode gelap';
    if (icon) icon.setAttribute('data-lucide', dark ? 'sun' : 'moon');
    if (persist) {
      try { localStorage.setItem('dc-theme', dark ? 'dark' : 'light'); } catch (_) {}
    }
    if (window.lucide) window.lucide.createIcons();
  }

  let initial = 'light';
  try { initial = localStorage.getItem('dc-theme') === 'dark' ? 'dark' : 'light'; } catch (_) {}
  applyTheme(initial, false);
  toggle.addEventListener('click', () => {
    applyTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
  });
  window.addEventListener('storage', (event) => {
    if (event.key === 'dc-theme') applyTheme(event.newValue === 'dark' ? 'dark' : 'light', false);
  });
  window.addEventListener('dc-theme-change', (event) => {
    applyTheme(event.detail && event.detail.mode === 'dark' ? 'dark' : 'light', false);
  });
})();
