// --- 1. Theme Toggle System (Day / Night) with LocalStorage ---
function initTheme() {
  const savedTheme = localStorage.getItem('dc-theme');
  const html = document.documentElement;

  if (savedTheme === 'dark') {
    html.classList.add('dark');
    html.classList.remove('light');
  } else {
    html.classList.add('light');
    html.classList.remove('dark');
  }
}

function toggleTheme() {
  const html = document.documentElement;
  if (html.classList.contains('dark')) {
    html.classList.remove('dark');
    html.classList.add('light');
    localStorage.setItem('dc-theme', 'light');
    showToast('Beralih ke Day Mode (Light)');
  } else {
    html.classList.remove('light');
    html.classList.add('dark');
    localStorage.setItem('dc-theme', 'dark');
    showToast('Beralih ke Night Mode (Dark)');
  }
}

// Inisialisasi tema saat load
initTheme();

// --- 2. Mobile Sidebar Toggle ---
const mobileBtn = document.getElementById('mobileMenuBtn');
const sidebar = document.getElementById('sidebar');

if (mobileBtn && sidebar) {
  mobileBtn.addEventListener('click', () => {
    sidebar.classList.toggle('hidden');
  });
}

// --- 3. Modal Controllers ---
function toggleModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.toggle('hidden');
  }
}

function openDetailModal(name, course, progress, score) {
  document.getElementById('modalStudentName').textContent = name;
  document.getElementById('modalStudentCourse').textContent = course;
  document.getElementById('modalStudentProgress').textContent = progress;
  document.getElementById('modalStudentScore').textContent = score + ' / 100';
  toggleModal('modalDetail');
}

// --- 4. Filtering Table by Jenjang ---
function filterTable(level, buttonElement) {
  const rows = document.querySelectorAll('#studentTableBody tr');
  rows.forEach(row => {
    const rowLevel = row.getAttribute('data-level');
    if (level === 'all' || rowLevel === level) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });

  // Update active pill button style
  document.querySelectorAll('.level-pill').forEach(btn => {
    btn.className = "level-pill px-3.5 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 hover:bg-slate-100 transition shadow-xs shrink-0";
  });
  buttonElement.className = "level-pill px-3.5 py-1.5 rounded-full text-xs font-semibold bg-sky-600 text-white shadow-xs shrink-0";
}

// --- 5. Form Submissions ---
function handleCourseSubmit(e) {
  e.preventDefault();
  toggleModal('modalAddCourse');
  showToast('Modul coding baru berhasil dipublikasikan!');
  e.target.reset();
}

function handleStudentSubmit(e) {
  e.preventDefault();
  toggleModal('modalAddStudent');
  showToast('Siswa baru berhasil didaftarkan ke sistem Dieng Cyber!');
  e.target.reset();
}

function refreshData() {
  showToast('Sinkronisasi data praktikum & server tester berhasil!');
}

// --- 6. Toast Notification Engine ---
// showToast(pesan, jenis?)  jenis: 'success' | 'warning' | 'error' | 'info'. Kalau tidak diisi, ditebak dari isi pesan.
const TOAST_TONE = {
  success: { icon: 'fa-solid fa-check',                badge: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400' },
  warning: { icon: 'fa-solid fa-exclamation',          badge: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400' },
  error:   { icon: 'fa-solid fa-xmark',                badge: 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400' },
  info:    { icon: 'fa-solid fa-info',                 badge: 'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400' },
};
let toastTimer = null;
function showToast(message, type) {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMessage');
  const badge = document.getElementById('toastBadge');
  if (!type) type = /gagal|error/i.test(message) ? 'error'
    : /belum|tidak valid|tidak ditemukan|terlalu|masih dipakai|sudah ada|harus|klik dulu|blok dulu|^buat /i.test(message) ? 'warning' : 'success';
  const t = TOAST_TONE[type] || TOAST_TONE.success;
  toastMsg.textContent = message;
  badge.className = 'w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs ' + t.badge;
  badge.innerHTML = '<i class="' + t.icon + '"></i>';

  toast.classList.remove('translate-y-24', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');

  clearTimeout(toastTimer); // pesan baru tidak dipotong timer pesan lama
  toastTimer = setTimeout(() => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-24', 'opacity-0');
  }, type === 'success' ? 2800 : 4200);
}


// --- 7. Notification Bell ---
// Data awal masih contoh (belum ada backend). Status baca/hapus disimpan di localStorage.
const NOTIF_SEED = [
  { id: 'n1', icon: 'fa-solid fa-code-pull-request', tone: 'sky',     title: 'Submisi baru dari Alvaro Kenzo',  desc: 'Tugas Tipe Data String, Int & Float menunggu review kode.', time: '5 mnt lalu',  view: 'dashboard' },
  { id: 'n2', icon: 'fa-solid fa-circle-xmark',      tone: 'rose',    title: 'Tes otomatis gagal',              desc: 'Dina Oktavia: 3 dari 8 test case tidak lolos.',            time: '32 mnt lalu', view: 'dashboard' },
  { id: 'n3', icon: 'fa-solid fa-circle-check',      tone: 'emerald', title: 'Fadly Naufal menyelesaikan modul', desc: 'Ketuntasan modul mencapai 100%.',                          time: '2 jam lalu',  view: 'dashboard' },
  { id: 'n4', icon: 'fa-solid fa-book-open',         tone: 'amber',   title: 'Kurikulum diperbarui',            desc: 'Ada perubahan pada Kurikulum Standar 2026/2027.',          time: 'Kemarin',     view: 'kurikulum' },
];
const NOTIF_TONE = {
  sky:     'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',
  rose:    'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
  emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
  amber:   'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
};
const NOTIF_KEY = 'dc-notif';

function notifLoad() {
  try {
    const raw = JSON.parse(localStorage.getItem(NOTIF_KEY));
    if (raw && Array.isArray(raw.removed) && Array.isArray(raw.read)) return raw;
  } catch (e) {}
  return { read: [], removed: [] };
}
function notifSave(st) {
  try { localStorage.setItem(NOTIF_KEY, JSON.stringify(st)); } catch (e) {}
}
function notifEsc(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderNotif() {
  const list = document.getElementById('notifList');
  if (!list) return;
  const st = notifLoad();
  const items = NOTIF_SEED.filter((n) => !st.removed.includes(n.id));
  const unread = items.filter((n) => !st.read.includes(n.id)).length;

  document.getElementById('notifDot').classList.toggle('hidden', unread === 0);
  const cnt = document.getElementById('notifCount');
  cnt.textContent = unread + ' baru';
  cnt.classList.toggle('hidden', unread === 0);
  document.getElementById('notifReadAll').disabled = unread === 0;
  document.getElementById('notifClear').classList.toggle('hidden', items.length === 0);

  if (!items.length) {
    list.innerHTML = '<li class="px-4 py-10 text-center"><i class="fa-regular fa-bell-slash text-2xl text-slate-300 dark:text-slate-600"></i><p class="text-xs text-slate-500 dark:text-slate-400 mt-2">Belum ada notifikasi</p></li>';
    return;
  }
  list.innerHTML = items.map((n) => {
    const isRead = st.read.includes(n.id);
    return '<li>' +
      '<button type="button" data-notif-id="' + n.id + '" class="w-full text-left flex items-start gap-3 px-4 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/60 ' + (isRead ? '' : 'bg-sky-50/50 dark:bg-sky-500/5') + '">' +
        '<span class="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-xs ' + (NOTIF_TONE[n.tone] || NOTIF_TONE.sky) + '"><i class="' + n.icon + '"></i></span>' +
        '<span class="flex-1 min-w-0">' +
          '<span class="block text-xs ' + (isRead ? 'font-medium text-slate-600 dark:text-slate-300' : 'font-bold text-slate-900 dark:text-white') + '">' + notifEsc(n.title) + '</span>' +
          '<span class="block text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">' + notifEsc(n.desc) + '</span>' +
          '<span class="block text-[11px] font-mono text-slate-400 mt-1">' + notifEsc(n.time) + '</span>' +
        '</span>' +
        (isRead ? '' : '<span class="w-2 h-2 mt-1.5 shrink-0 rounded-full bg-sky-500" aria-label="Belum dibaca"></span>') +
      '</button></li>';
  }).join('');
}

function setNotifOpen(open) {
  const panel = document.getElementById('notifPanel');
  const btn = document.getElementById('notifBtn');
  panel.classList.toggle('hidden', !open);
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

(function initNotif() {
  const wrap = document.getElementById('notifWrap');
  if (!wrap) return;
  renderNotif();

  document.getElementById('notifBtn').addEventListener('click', () => {
    setNotifOpen(document.getElementById('notifPanel').classList.contains('hidden'));
  });

  document.getElementById('notifReadAll').addEventListener('click', () => {
    const st = notifLoad();
    st.read = NOTIF_SEED.map((n) => n.id);
    notifSave(st); renderNotif();
  });

  document.getElementById('notifClear').addEventListener('click', () => {
    const st = notifLoad();
    st.removed = NOTIF_SEED.map((n) => n.id);
    notifSave(st); renderNotif();
    showToast('Semua notifikasi dihapus');
  });

  document.getElementById('notifList').addEventListener('click', (e) => {
    const item = e.target.closest('[data-notif-id]');
    if (!item) return;
    const id = item.dataset.notifId;
    const n = NOTIF_SEED.find((x) => x.id === id);
    const st = notifLoad();
    if (!st.read.includes(id)) { st.read.push(id); notifSave(st); }
    renderNotif();
    setNotifOpen(false);
    // pindah halaman lewat link sidebar yang sudah ada
    const nav = n && document.querySelector('aside [data-view="' + n.view + '"]');
    if (nav) nav.click();
  });

  // tutup kalau klik di luar atau tekan Esc
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) setNotifOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setNotifOpen(false); });
})();
