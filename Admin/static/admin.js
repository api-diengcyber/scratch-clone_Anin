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
function showToast(message) {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMessage');
  toastMsg.textContent = message;

  toast.classList.remove('translate-y-24', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');

  setTimeout(() => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-24', 'opacity-0');
  }, 2600);
}
  
