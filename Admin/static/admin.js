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

initTheme();

// --- 2. Burger Sidebar ---
// Desktop: sidebar ciut jadi rail ikon (body.sb-collapsed). Layar kecil (<768px): drawer + overlay (body.sb-open).
const mobileBtn = document.getElementById('mobileMenuBtn');
const sidebar = document.getElementById('sidebar');
const sbToggle = document.getElementById('sbToggle');
const sbBackdrop = document.getElementById('sbBackdrop');
const SB_KEY = 'dc-sb-collapsed';

function isMobileNav() { return window.innerWidth < 768; }
function setDrawer(open) {
  document.body.classList.toggle('sb-open', open);
  if (mobileBtn) mobileBtn.setAttribute('aria-expanded', String(open));
}
function setCollapsed(collapsed, persist) {
  document.body.classList.toggle('sb-collapsed', collapsed);
  if (sbToggle) sbToggle.setAttribute('aria-expanded', String(!collapsed));
  if (persist) { try { localStorage.setItem(SB_KEY, collapsed ? '1' : '0'); } catch (e) {} }
}
function applyAutoSidebar() {
  // Preferensi pengguna menang; kalau belum pernah memilih, ciut otomatis di lebar < 1100px.
  let pref = null;
  try { pref = localStorage.getItem(SB_KEY); } catch (e) {}
  setCollapsed(pref === null ? window.innerWidth < 1100 : pref === '1', false);
  if (!isMobileNav()) setDrawer(false);
}
if (sidebar) {
  // Tooltip nama menu saat sidebar berbentuk rail
  document.querySelectorAll('#sidebarNav a').forEach((a) => {
    const label = a.querySelector('span');
    if (label && !a.title) a.title = label.textContent.trim();
  });
  if (mobileBtn) mobileBtn.addEventListener('click', () => setDrawer(!document.body.classList.contains('sb-open')));
  if (sbToggle) sbToggle.addEventListener('click', () => setCollapsed(!document.body.classList.contains('sb-collapsed'), true));
  if (sbBackdrop) sbBackdrop.addEventListener('click', () => setDrawer(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setDrawer(false); });
  window.addEventListener('resize', applyAutoSidebar);
  applyAutoSidebar();
}

// --- 3. Modal Controllers ---
function toggleModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.toggle('hidden');
}

// --- 4. Admin dashboard state & helpers ---
const adminState = {
  me: null,
  page: 1,
  limit: 10,
  pages: 1,
  total: 0,
  search: '',
  grade: '',
  status: '',
  users: [],
  stats: null
};

const GRADE_META = {
  SD: {
    label: 'SD',
    icon: 'fa-solid fa-shapes',
    badge: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200/80 dark:border-amber-500/20',
    avatar: 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/40',
    bar: 'bg-amber-500'
  },
  SMP: {
    label: 'SMP',
    icon: 'fa-solid fa-code',
    badge: 'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-200/80 dark:border-sky-500/20',
    avatar: 'bg-sky-100 dark:bg-sky-950/50 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-800/40',
    bar: 'bg-sky-500'
  },
  SMK: {
    label: 'SMA / SMK',
    icon: 'fa-brands fa-python',
    badge: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-200/80 dark:border-indigo-500/20',
    avatar: 'bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/40',
    bar: 'bg-indigo-600'
  },
  ALL: {
    label: 'Semua Jenjang',
    icon: 'fa-solid fa-layer-group',
    badge: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    avatar: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    bar: 'bg-slate-500'
  }
};

const STATUS_META = {
  active: { text: 'Aktif', icon: 'fa-solid fa-circle-check', className: 'text-emerald-600 dark:text-emerald-400' },
  suspended: { text: 'Suspend', icon: 'fa-solid fa-circle-pause', className: 'text-amber-600 dark:text-amber-400' },
  deleted: { text: 'Dihapus', icon: 'fa-solid fa-circle-xmark', className: 'text-rose-600 dark:text-rose-400' }
};

const $ = (selector) => document.querySelector(selector);
const escHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const fmtNum = (value) => Number(value || 0).toLocaleString('id-ID');

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}
function setHtml(id, value) {
  const node = document.getElementById(id);
  if (node) node.innerHTML = value;
}

function gradeOrder(value) {
  const grades = Array.isArray(value) ? value.filter((g) => ['SD', 'SMP', 'SMK'].includes(g)) : [];
  return ['SD', 'SMP', 'SMK'].filter((g) => grades.includes(g));
}
function primaryGrade(user) {
  const grades = gradeOrder(user && user.allowedGrades);
  return grades[0] || 'ALL';
}
function gradeText(user) {
  const grades = gradeOrder(user && user.allowedGrades);
  return grades.length ? grades.map((g) => GRADE_META[g].label).join(' / ') : GRADE_META.ALL.label;
}
function statusMeta(value) {
  return STATUS_META[value] || STATUS_META.active;
}
function initials(name) {
  const parts = String(name || 'Siswa').trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map((part) => part[0]).join('') || 'S').toUpperCase();
}
function formatDate(value) {
  if (!value) return 'Belum ada';
  const raw = String(value);
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}
function relativeTime(value) {
  if (!value) return '-';
  const raw = String(value);
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return raw;
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'baru saja';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + ' mnt lalu';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + ' jam lalu';
  const days = Math.floor(hours / 24);
  if (days < 30) return days + ' hari lalu';
  return formatDate(value);
}

// --- 5. Render dashboard ---
function renderStats(stats) {
  const students = stats.students || {};
  const content = stats.content || {};
  const activity = stats.activity || {};

  setText('statActiveStudents', fmtNum(students.active));
  setHtml('statActiveTrend', `<i class="fa-solid fa-arrow-trend-up mr-1 text-[10px]"></i>${fmtNum(students.total)} total`);
  setText('statActiveNote', `${fmtNum(students.suspended)} suspend · ${fmtNum(students.deleted)} dihapus`);

  setText('statModules', `${fmtNum(content.modules)} Modul`);
  setText('statModulesTrend', `${fmtNum(content.curriculumPaths)} Jalur`);
  setText('statModulesNote', `${fmtNum(content.tasks)} task · ${fmtNum(content.materials)} materi`);

  setText('statSubmissions', fmtNum(activity.completedToday));
  setText('statSubmissionsTrend', `${fmtNum(activity.completedTotal)} total`);
  setText('statSubmissionsNote', 'Penyelesaian task hari ini');

  const rate = Number(activity.completionRate || 0);
  setText('statCompletion', `${rate.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`);
  setText('statCompletionTrend', `${fmtNum(activity.completedTotal)} selesai`);
  setText('statCompletionNote', 'Rasio task yang sudah dicoba');
}

function renderGradeDistribution(stats) {
  const grades = stats.grades || {};
  const total = Number((stats.students && stats.students.total) || 0);
  const rows = [['Sd', grades.sd], ['Smp', grades.smp], ['Smk', grades.smk]];
  for (const [key, count] of rows) {
    const number = Number(count || 0);
    const percent = total ? Math.min(100, Math.round((number / total) * 100)) : 0;
    setText(`grade${key}Count`, `${fmtNum(number)} Siswa (${percent}%)`);
    const bar = document.getElementById(`grade${key}Bar`);
    if (bar) bar.style.width = percent + '%';
  }
  setText('gradeDistributionNote', `${fmtNum(grades.unassigned)} siswa belum ditentukan jenjangnya`);
}

function studentRow(user, totalTasks) {
  const name = user.full_name || user.username || ('Siswa #' + user.id);
  const grade = primaryGrade(user);
  const meta = GRADE_META[grade] || GRADE_META.ALL;
  const status = statusMeta(user.status);
  const completed = Number(user.completed_tasks || 0);
  const tasks = Number(totalTasks || 0);
  const percent = tasks ? Math.min(100, Math.round((completed / tasks) * 100)) : 0;
  const rowTone = user.status === 'active' ? '' : 'opacity-60';

  return `
    <tr data-level="${grade === 'ALL' ? 'all' : grade.toLowerCase()}" class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition ${rowTone}">
      <td class="px-5 py-4">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl ${meta.avatar} font-bold flex items-center justify-center text-xs border">
            ${escHtml(initials(name))}
          </div>
          <div>
            <p class="font-bold text-slate-900 dark:text-white text-sm">${escHtml(name)}</p>
            <span class="text-xs text-slate-500 dark:text-slate-400 font-mono">NIS: #DC-${String(user.id).padStart(4, '0')} · <span class="${status.className}">${status.text}</span></span>
          </div>
        </div>
      </td>
      <td class="px-5 py-4">
        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border font-mono ${meta.badge}">
          <i class="${meta.icon} text-[10px]"></i> ${escHtml(gradeText(user))}
        </span>
      </td>
      <td class="px-5 py-4">
        <p class="text-xs font-medium text-slate-800 dark:text-slate-200">${fmtNum(completed)} task selesai</p>
        <span class="text-[11px] text-slate-400">${fmtNum(user.points_total)} poin · ${fmtNum(user.item_count)} item</span>
      </td>
      <td class="px-5 py-4">
        <div class="w-32">
          <div class="flex justify-between text-xs mb-1">
            <span class="font-semibold text-slate-700 dark:text-slate-300">${percent}%</span>
            <span class="text-slate-500 dark:text-slate-400 font-mono text-[11px]">${fmtNum(completed)}/${fmtNum(tasks)} Task</span>
          </div>
          <div class="w-full bg-slate-200/80 dark:bg-slate-800 rounded-full h-1.5">
            <div class="${meta.bar} h-1.5 rounded-full" style="width: ${percent}%"></div>
          </div>
        </div>
      </td>
      <td class="px-5 py-4 text-right">
        <button onclick="openDetailModal(${Number(user.id)})" class="px-2.5 py-1 text-xs font-semibold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-500/10 hover:bg-sky-100 rounded-lg border border-sky-200/80 dark:border-sky-500/30 transition">
          Detail
        </button>
      </td>
    </tr>`;
}

function updateStudentFooter(data) {
  const total = Number(data.total || 0);
  const page = Number(data.page || 1);
  const limit = Number(data.limit || adminState.limit);
  const pages = Math.max(1, Number(data.pages || 1));
  adminState.page = page;
  adminState.pages = pages;
  adminState.total = total;
  adminState.limit = limit;

  const from = total ? (page - 1) * limit + 1 : 0;
  const to = Math.min(total, page * limit);
  setText('studentTableInfo', total ? `Menampilkan ${fmtNum(from)}–${fmtNum(to)} dari ${fmtNum(total)} siswa` : 'Belum ada siswa');
  setText('studentPageBtn', String(page));
  const prev = document.getElementById('studentPrev');
  const next = document.getElementById('studentNext');
  if (prev) prev.disabled = page <= 1;
  if (next) next.disabled = page >= pages;
}

function renderStudents(data) {
  const tbody = document.getElementById('studentTableBody');
  if (!tbody) return;
  const users = Array.isArray(data.users) ? data.users : [];
  if (!users.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="px-5 py-10 text-center text-xs text-slate-500 dark:text-slate-400">
          <i class="fa-solid fa-user-slash mr-2"></i>Belum ada siswa yang cocok dengan filter ini.
        </td>
      </tr>`;
    updateStudentFooter(data);
    return;
  }
  const totalTasks = Number((data.stats && data.stats.tasks_total) || (adminState.stats && adminState.stats.content && adminState.stats.content.tasks) || 0);
  tbody.innerHTML = users.map((user) => studentRow(user, totalTasks)).join('');
  updateStudentFooter(data);
}

function renderStudentError(message) {
  const tbody = document.getElementById('studentTableBody');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="px-5 py-10 text-center text-xs text-rose-600 dark:text-rose-400">
          <i class="fa-solid fa-triangle-exclamation mr-2"></i>${escHtml(message || 'Gagal memuat data siswa.')}
        </td>
      </tr>`;
  }
}

function renderActivity(entries) {
  const box = document.getElementById('activityFeed');
  if (!box) return;
  if (!Array.isArray(entries) || !entries.length) {
    box.innerHTML = `
      <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800 text-slate-500 dark:text-slate-400">
        <i class="fa-solid fa-inbox mr-2"></i>Belum ada submisi yang selesai.
      </div>`;
    return;
  }
  box.innerHTML = entries.map((entry) => {
    const name = entry.full_name || entry.username || 'Siswa';
    return `
      <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800 hover:border-slate-300 transition">
        <div class="flex justify-between items-center mb-1">
          <span class="font-bold text-slate-800 dark:text-slate-200 font-sans">${escHtml(name)}</span>
          <span class="text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full font-semibold border border-emerald-200/80 dark:border-emerald-500/20">Selesai</span>
        </div>
        <p class="text-[11px] text-slate-500 dark:text-slate-400 font-sans">Task: ${escHtml(entry.title || entry.task_id || '-')}</p>
        <div class="flex justify-between text-[10px] text-slate-400 mt-2 font-mono">
          <span>Poin: ${fmtNum(entry.points)}</span>
          <span>${escHtml(relativeTime(entry.completed_at))}</span>
        </div>
      </div>`;
  }).join('');
}

// --- 6. Data loading ---
let statsRequestId = 0;
let studentsRequestId = 0;

async function loadStats() {
  const requestId = ++statsRequestId;
  const stats = await window.DCAdminApi.stats();
  if (requestId !== statsRequestId) return stats;
  adminState.stats = stats;
  renderStats(stats);
  renderGradeDistribution(stats);
  return stats;
}

async function loadStudents() {
  const requestId = ++studentsRequestId;
  const data = await window.DCAdminApi.users({
    page: adminState.page,
    limit: adminState.limit,
    search: adminState.search,
    grade: adminState.grade,
    status: adminState.status
  });
  if (requestId !== studentsRequestId) return data;
  adminState.users = data.users || [];
  renderStudents(data);
  return data;
}

async function loadActivity() {
  const data = await window.DCAdminApi.activity(5);
  renderActivity(data.entries);
  return data;
}

async function loadDashboard() {
  const results = await Promise.allSettled([loadStats(), loadStudents(), loadActivity()]);
  const failed = results.find((result) => result.status === 'rejected');
  if (failed) {
    const error = failed.reason || {};
    if (error.status !== 401) {
      showToast(error.message || 'Sebagian data dashboard gagal dimuat.');
      if (!adminState.users.length) renderStudentError(error.message);
    }
  }
}

// Kurikulum.js memuat/menyimpan dokumen secara paralel dengan dashboard.
// Segarkan kartu statistik agar jumlah jalur tidak tertinggal.
window.addEventListener('dc:curriculum-updated', () => {
  if (!adminState.me) return;
  loadStats().catch(() => {});
});

// --- 7. Student detail modal ---
async function openDetailModal(id) {
  try {
    const data = await window.DCAdminApi.user(id);
    const user = data.user || {};
    const name = user.full_name || user.username || ('Siswa #' + id);
    const totalTasks = Number((adminState.stats && adminState.stats.content && adminState.stats.content.tasks) || 0);
    const completed = Number((data.progress && data.progress.completed) || 0);
    const percent = totalTasks ? Math.round((completed / totalTasks) * 100) : 0;
    const status = statusMeta(user.status);
    const lastProgress = (data.progressRows || []).find((row) => row.completed_at);

    setText('modalStudentName', name);
    setText('modalStudentCourse', `${gradeText(user)} · ${user.email || user.username || '-'}`);
    setText('modalStudentProgress', `${percent}% (${fmtNum(completed)}/${fmtNum(totalTasks)} task)`);
    setText('modalStudentScore', fmtNum(data.points && data.points.total));
    setText('modalStudentLast', lastProgress ? formatDate(lastProgress.completed_at) : 'Belum ada');
    const statusNode = document.getElementById('modalStudentStatus');
    if (statusNode) {
      statusNode.className = `font-semibold flex items-center gap-1 ${status.className}`;
      statusNode.innerHTML = `<i class="${status.icon} text-xs"></i> ${status.text}`;
    }
    toggleModal('modalDetail');
  } catch (error) {
    showToast(error.message || 'Gagal memuat detail siswa.');
  }
}

// --- 8. Forms ---
async function handleStudentSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const data = new FormData(form);
  const fullName = String(data.get('fullName') || '').trim();
  const email = String(data.get('email') || '').trim();
  const grade = String(data.get('grade') || '').toUpperCase();
  if (!fullName || !email || !grade) {
    showToast('Nama, email, dan jenjang wajib diisi.');
    return;
  }

  const submit = form.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    const result = await window.DCAdminApi.createUser({ fullName, email, allowedGrades: [grade] });
    toggleModal('modalAddStudent');
    form.reset();
    adminState.page = 1;
    if (result.temporaryPassword) {
      alert(`Siswa berhasil dibuat.\n\nUsername: ${result.username}\nPassword sementara: ${result.temporaryPassword}\n\nMinta siswa mengganti password setelah login.`);
    } else {
      showToast(`Siswa ${result.username} berhasil dibuat.`);
    }
    await loadDashboard();
  } catch (error) {
    showToast(error.message || 'Gagal membuat siswa.');
  } finally {
    if (submit) submit.disabled = false;
  }
}

function handleCourseSubmit(e) {
  e.preventDefault();
  toggleModal('modalAddCourse');
  e.target.reset();
  showToast('Form Code Lab belum terhubung ke backend. Gunakan menu Modul & Kurikulum untuk jalur dan materi.');
}

async function refreshData() {
  adminState.page = 1;
  await loadDashboard();
  showToast('Data dashboard dimuat ulang dari server.');
}

// --- 9. Filter & pagination ---
function filterTable(level, buttonElement) {
  adminState.grade = level === 'all' ? '' : (level === 'sma' ? 'SMK' : level.toUpperCase());
  adminState.page = 1;

  document.querySelectorAll('.level-pill').forEach((btn) => {
    btn.className = "level-pill px-3.5 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 hover:bg-slate-100 transition shadow-xs shrink-0";
  });
  if (buttonElement) {
    buttonElement.className = "level-pill px-3.5 py-1.5 rounded-full text-xs font-semibold bg-sky-600 text-white shadow-xs shrink-0";
  }
  loadStudents().catch((error) => {
    if (error.status !== 401) {
      showToast(error.message || 'Gagal memuat siswa.');
      renderStudentError(error.message);
    }
  });
}

document.getElementById('studentPrev')?.addEventListener('click', () => {
  if (adminState.page <= 1) return;
  adminState.page -= 1;
  loadStudents().catch((error) => showToast(error.message || 'Gagal memuat siswa.'));
});
document.getElementById('studentNext')?.addEventListener('click', () => {
  if (adminState.page >= adminState.pages) return;
  adminState.page += 1;
  loadStudents().catch((error) => showToast(error.message || 'Gagal memuat siswa.'));
});
document.getElementById('studentPageBtn')?.addEventListener('click', () => {
  loadStudents().catch((error) => showToast(error.message || 'Gagal memuat siswa.'));
});

// Pencarian global: dashboard mencari siswa, halaman kurikulum mencari modul.
let searchTimer = null;
document.getElementById('globalSearch')?.addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  const value = e.target.value.trim();
  searchTimer = setTimeout(() => {
    const dashboard = document.getElementById('view-dashboard');
    const kurikulum = document.getElementById('view-kurikulum');
    if (dashboard && !dashboard.classList.contains('hidden')) {
      adminState.search = value;
      adminState.page = 1;
      loadStudents().catch((error) => {
        if (error.status !== 401) {
          showToast(error.message || 'Gagal mencari siswa.');
          renderStudentError(error.message);
        }
      });
    } else if (document.getElementById('view-siswa') && !document.getElementById('view-siswa').classList.contains('hidden')) {
      const input = document.getElementById('swSearch');
      if (input) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } else if (kurikulum && !kurikulum.classList.contains('hidden')) {
      const input = document.getElementById('kurSearch');
      if (input) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }, 300);
});

// --- 10. Toast Notification Engine ---
let toastTimer = null;
const TOAST_TONE = {
  success: { badge: 'bg-emerald-100 text-emerald-600', icon: 'fa-solid fa-check' },
  warning: { badge: 'bg-amber-100 text-amber-600', icon: 'fa-solid fa-triangle-exclamation' },
  error:   { badge: 'bg-rose-100 text-rose-600', icon: 'fa-solid fa-circle-xmark' },
};

function showToast(message, type) {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMessage');
  if (!toast || !toastMsg) return;
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
// Notifikasi berasal dari backend dan disimpan per akun admin.
const NOTIF_TONE = {
  sky:     'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',
  rose:    'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
  emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
  amber:   'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
};
const notifState = { items: [], unread: 0, loading: false };

function notifEsc(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function notifTone(tone) {
  return NOTIF_TONE[tone] || NOTIF_TONE.sky;
}

function renderNotif() {
  const list = document.getElementById('notifList');
  if (!list) return;
  const items = notifState.items;
  const unread = Math.max(0, Number(notifState.unread) || 0);

  const dot = document.getElementById('notifDot');
  if (dot) dot.classList.toggle('hidden', unread === 0);
  const cnt = document.getElementById('notifCount');
  if (cnt) {
    cnt.textContent = notifState.loading ? 'Memuat...' : unread + ' baru';
    cnt.classList.toggle('hidden', unread === 0);
  }
  const readAll = document.getElementById('notifReadAll');
  if (readAll) readAll.disabled = unread === 0 || notifState.loading;
  const clear = document.getElementById('notifClear');
  if (clear) clear.classList.toggle('hidden', items.length === 0);

  if (!items.length) {
    list.innerHTML = notifState.loading
      ? '<li class="px-4 py-10 text-center"><i class="fa-solid fa-circle-notch fa-spin text-2xl text-slate-300 dark:text-slate-600"></i><p class="text-xs text-slate-500 dark:text-slate-400 mt-2">Memuat notifikasi...</p></li>'
      : '<li class="px-4 py-10 text-center"><i class="fa-regular fa-bell-slash text-2xl text-slate-300 dark:text-slate-600"></i><p class="text-xs text-slate-500 dark:text-slate-400 mt-2">Belum ada notifikasi</p></li>';
    return;
  }
  list.innerHTML = items.map((n) => {
    const isRead = Boolean(n.read);
    const id = Number(n.id);
    return '<li>' +
      '<button type="button" data-notif-id="' + id + '" class="w-full text-left flex items-start gap-3 px-4 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/60 ' + (isRead ? '' : 'bg-sky-50/50 dark:bg-sky-500/5') + '">' +
        '<span class="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-xs ' + notifTone(n.tone) + '"><i class="' + notifEsc(n.icon || 'fa-solid fa-bell') + '"></i></span>' +
        '<span class="flex-1 min-w-0">' +
          '<span class="block text-xs ' + (isRead ? 'font-medium text-slate-600 dark:text-slate-300' : 'font-bold text-slate-900 dark:text-white') + '">' + notifEsc(n.title) + '</span>' +
          '<span class="block text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">' + notifEsc(n.body || '') + '</span>' +
          '<span class="block text-[11px] font-mono text-slate-400 mt-1">' + notifEsc(relativeTime(n.createdAt)) + '</span>' +
        '</span>' +
        (isRead ? '' : '<span class="w-2 h-2 mt-1.5 shrink-0 rounded-full bg-sky-500" aria-label="Belum dibaca"></span>') +
      '</button></li>';
  }).join('');
}

async function loadNotif() {
  if (!window.DCAdminApi) return;
  notifState.loading = true;
  renderNotif();
  try {
    const data = await window.DCAdminApi.notifications(20);
    const fetched = Array.isArray(data.notifications) ? data.notifications : [];
    // Jangan timpa status baca yang baru diubah lokal oleh respons fetch yang telat.
    const locallyRead = new Set(notifState.items.filter((n) => n.read).map((n) => Number(n.id)));
    let unread = Number(data.unreadCount) || 0;
    for (const n of fetched) {
      if (!n.read && locallyRead.has(Number(n.id))) unread -= 1;
    }
    notifState.items = fetched.map((n) => (
      locallyRead.has(Number(n.id)) ? { ...n, read: true } : n
    ));
    notifState.unread = Math.max(0, unread);
  } catch (error) {
    if (error.status !== 401) console.warn('Gagal memuat notifikasi:', error.message);
    notifState.items = [];
    notifState.unread = 0;
  } finally {
    notifState.loading = false;
    renderNotif();
  }
}

function setNotifOpen(open) {
  const panel = document.getElementById('notifPanel');
  const btn = document.getElementById('notifBtn');
  if (!panel || !btn) return;
  panel.classList.toggle('hidden', !open);
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

(function initNotif() {
  const wrap = document.getElementById('notifWrap');
  if (!wrap) return;
  renderNotif();
  loadNotif();

  document.getElementById('notifBtn').addEventListener('click', () => {
    const open = document.getElementById('notifPanel').classList.contains('hidden');
    setNotifOpen(open);
    if (open) loadNotif();
  });

  document.getElementById('notifReadAll').addEventListener('click', async () => {
    if (notifState.loading) return;
    try {
      await window.DCAdminApi.readAllNotifications();
      notifState.items = notifState.items.map((n) => ({ ...n, read: true }));
      notifState.unread = 0;
      renderNotif();
    } catch (error) {
      if (error.status !== 401) showToast(error.message || 'Gagal menandai notifikasi.', 'error');
    }
  });

  document.getElementById('notifClear').addEventListener('click', async () => {
    if (notifState.loading) return;
    try {
      await window.DCAdminApi.clearNotifications();
      notifState.items = [];
      notifState.unread = 0;
      renderNotif();
      showToast('Semua notifikasi dihapus');
    } catch (error) {
      if (error.status !== 401) showToast(error.message || 'Gagal menghapus notifikasi.', 'error');
    }
  });

  document.getElementById('notifList').addEventListener('click', (e) => {
    const item = e.target.closest('[data-notif-id]');
    if (!item) return;
    const id = Number(item.dataset.notifId);
    const n = notifState.items.find((x) => Number(x.id) === id);
    if (n && !n.read) {
      n.read = true;
      notifState.unread = Math.max(0, notifState.unread - 1);
      renderNotif();
      window.DCAdminApi.readNotification(id).catch((error) => {
        if (error.status !== 401) console.warn('Gagal menandai notifikasi:', error.message);
      });
    }
    setNotifOpen(false);
    // pindah halaman lewat link sidebar yang sudah ada
    const view = n && String(n.view || 'dashboard');
    const nav = (n && /^[a-z0-9-]+$/.test(view)) ? document.querySelector('aside [data-view="' + view + '"]') : null;
    if (nav) nav.click();
  });

  // tutup kalau klik di luar atau tekan Esc
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) setNotifOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setNotifOpen(false); });
})();

// --- 10b. Akun admin di sidebar & tombol keluar ---
function renderSidebarAccount(me) {
  const u = (me && me.user) ? me.user : (me || {});
  const name = u.full_name || u.fullName || u.name || u.username || (u.email ? String(u.email).split('@')[0] : 'Admin');
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  const initials = ((parts[0] || 'A')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  const nameEl = document.getElementById('sidebarName');
  const roleEl = document.getElementById('sidebarRole');
  const avatarEl = document.getElementById('sidebarAvatar');
  if (nameEl) { nameEl.textContent = name; nameEl.title = u.email ? name + ' (' + u.email + ')' : name; }
  if (roleEl) roleEl.textContent = 'Administrator';
  if (avatarEl) avatarEl.textContent = initials;
}

(function initLogout() {
  const btn = document.getElementById('btnLogout');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    let ok = true;
    if (typeof window.dcConfirm === 'function') {
      ok = await window.dcConfirm({
        title: 'Keluar dari akun?',
        message: 'Kamu akan dibawa ke halaman login.',
        confirmText: 'Keluar',
        cancelText: 'Batal',
        tone: 'warning'
      });
    }
    if (!ok) return;
    if (window.DCAdminApi && window.DCAdminApi.logout) {
      window.DCAdminApi.logout();
    } else {
      ['authToken', 'isLoggedIn', 'username', 'email', 'scratch_user'].forEach((k) => { try { localStorage.removeItem(k); } catch (_) {} });
      location.replace('/index.html');
    }
  });
})();

// --- 11. Auth guard & initial load ---
// Pull frontend sempat menghapus blok ini; tanpa initAdmin, loadDashboard()
// tidak pernah dipanggil dan kartu statistik terus menampilkan "Memuat".
(async function initAdmin() {
  if (!window.DCAdminApi) {
    showToast('Klien API Admin gagal dimuat.');
    return;
  }
  try {
    const me = await window.DCAdminApi.me();
    if (me.role !== 'admin') {
      showToast('Akun ini bukan admin. Mengalihkan ke dashboard siswa...');
      setTimeout(() => location.replace('/dashboard.html'), 1200);
      return;
    }
    adminState.me = me;
    window.DCAdminMe = me;
    renderSidebarAccount(me);
    await loadDashboard();
  } catch (error) {
    if (error.status === 403) {
      if (error.code === 'PASSWORD_CHANGE_REQUIRED') {
        location.replace('/ganti-password.html');
        return;
      }
      showToast('Akun ini bukan admin. Mengalihkan ke dashboard siswa...');
      setTimeout(() => location.replace('/dashboard.html'), 1200);
    } else if (error.status !== 401) {
      showToast(error.message || 'Gagal memverifikasi sesi admin.');
    }
  }
})();
