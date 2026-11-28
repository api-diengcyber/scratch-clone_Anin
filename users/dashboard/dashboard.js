(async function () {

  const authToken = localStorage.getItem('authToken');
  const esc = window.DCUtils.esc;

  if (!authToken) {
    window.location.replace('/index.html');
    return;
  }

  try {
    const response = await fetch('/api/auth/me', {
      headers: {
        Authorization: 'Bearer ' + authToken
      }
    });

    if (!response.ok) {
      localStorage.removeItem('isLoggedIn');
      localStorage.removeItem('username');
      localStorage.removeItem('scratch_user');
      localStorage.removeItem('authToken');

      window.location.replace('/index.html');
      return;
    }

    const user = await response.json();

    // Sinkronkan username dari server
    localStorage.setItem('username', user.username);
    localStorage.setItem('scratch_user', user.username);
    localStorage.setItem('isLoggedIn', 'true');
    
    // progres + koin, jenjang yang diizinkan, dan profil diambil sekaligus dari server (masing-masing tidak melempar error)
    if (typeof LP !== "undefined") {
      await Promise.all([
        typeof LP.loadFromServer === "function" ? LP.loadFromServer() : null,
        typeof LP.loadAllowedGrades === "function" ? LP.loadAllowedGrades() : null,
        typeof LP.loadProfile === "function" ? LP.loadProfile() : null
      ]);
    }

  } catch (error) {
    console.error('Gagal memeriksa sesi:', error);

    window.location.replace('/index.html');
    return;
  }

  // ============================================================
  // KODE DASHBOARD LAMA MULAI DARI SINI
  // ============================================================

const $ = id => document.getElementById(id);
const currentUser = localStorage.getItem('username') || localStorage.getItem('scratch_user') || 'tamu';
const totalPoints = Number(localStorage.getItem('codingPoints_' + currentUser)) || 0;

const savedUser = localStorage.getItem('username');

// Profil dari halaman Pengaturan Profil (nama lengkap + foto), disimpan per akun di browser ini
let profile = {};
try { profile = JSON.parse(localStorage.getItem('profile_' + currentUser)) || {}; } catch (e) {}

const shownName = profile.fullName || (savedUser ? '@' + savedUser : '@' + currentUser);
$('displayUsername').textContent = shownName;

const avatarBox = $('avatarLetter');
// avatar robot lama (URL dicebear) diganti robot lokal karena CSP server memblokir gambar luar
const avatarSrc = window.DefaultAvatar ? DefaultAvatar.normalize(profile.avatar) : profile.avatar;
if (avatarSrc) {
  const img = document.createElement('img');
  img.src = avatarSrc;
  img.alt = 'Foto profil';
  // kalau gambar gagal dimuat, kembali ke huruf awal username supaya kotaknya tidak kosong
  img.onerror = () => { avatarBox.textContent = (savedUser || currentUser || 'A').charAt(0).toUpperCase(); };
  avatarBox.textContent = '';
  avatarBox.appendChild(img);

  // foto yang sama juga dipasang di tombol navbar (kalau gagal dimuat, kembali ke ikon burger)
  const navImg = $('menuAvatar');
  const navBox = $('menuAvatarBox');
  navImg.onerror = () => {
    const wrap = navBox.parentNode.classList.contains('af-wrap') ? navBox.parentNode : navBox;   // ikut sembunyikan bingkai
    wrap.hidden = true;
    $('menuIcon').hidden = false;
    $('menuBtn').classList.remove('has-avatar');
  };
  navImg.src = avatarSrc;
  navBox.hidden = false;
  $('menuIcon').hidden = true;
  $('menuBtn').classList.add('has-avatar');
} else {
  avatarBox.textContent = (savedUser || currentUser || 'A').charAt(0).toUpperCase();
}

if (LP.hadiahAktif) {
  const act = LP.hadiahAktif();
  if (act.bingkai && window.AvatarFrame) {
    AvatarFrame.apply(avatarBox, act.bingkai, { size: 44 });
    // bingkai yang sama untuk foto di tombol navbar (hanya kalau fotonya sedang tampil)
    if (!$('menuAvatarBox').hidden) AvatarFrame.apply($('menuAvatarBox'), act.bingkai, { size: 42 });
  }
  if (act.gelar) $('displayUsername').textContent += ' · ' + act.gelar.emoji + ' ' + act.gelar.nama;
}

// ---------- Burger menu ----------
const menuBtn = $('menuBtn');
const menuIcon = $('menuIcon');
const userMenu = $('userMenu');
const ICON_BURGER = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
function setMenu(open) {
  userMenu.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
  menuIcon.innerHTML = open ? ICON_CLOSE : ICON_BURGER;   // ikon hanya terlihat kalau belum ada foto profil
}
menuBtn.addEventListener('click', e => { e.stopPropagation(); setMenu(userMenu.hidden); });
document.addEventListener('click', e => { if (!userMenu.hidden && !userMenu.contains(e.target)) setMenu(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !userMenu.hidden) { setMenu(false); menuBtn.focus(); } });
// Mode Gelap: saklar di menu (logika & penyimpanan ada di /shared/js/theme.js)
if (window.DCTheme) DCTheme.bind($('themeItem'));

// Samakan dengan halaman Koin: tampilkan saldo koin (total koin − hadiah yang sudah dibeli)
const refreshSaldo = () => { $('pointsValue').textContent = Number(LP.saldo ? LP.saldo() : totalPoints) || 0; };
refreshSaldo();
window.addEventListener('pageshow', e => { if (e.persisted) refreshSaldo(); });

// ---------- Tahap belajar (banner + kartu) ----------
// Tahap biasa (Tahap 1): kartu = semua pembelajaran.
// Tahap bermode "pilih-jalur" (Tahap 2): kartu = pilihan jalur, progres = jalur yang dipilih.
function tahapBlock(th) {
  const tp = LP.progressOfTahap(th);
  const pilih = th.mode === 'pilih-jalur';
  const pct = tp.total ? Math.round(tp.done / tp.total * 100) : 0;
  const chosenId = pilih && tp.chosen ? tp.chosen.id : null;

  let text, btn;
  if (pilih && th.pembelajaran.length > 1) {
    text = tp.chosen ? `Jalurmu: ${esc(tp.chosen.emoji)} ${esc(tp.chosen.judul)} • ${tp.done} dari ${tp.total} langkah selesai` : 'Kamu belum memilih jalur';
    btn = !tp.chosen ? 'Pilih Jalurmu →' : tp.done === tp.total ? 'Lihat Lagi 🎉' : 'Lanjutkan Belajar →';
  } else {
    text = `${tp.done} dari ${tp.total} langkah selesai`;
    btn = tp.done === 0 ? 'Mulai Petualangan →' : tp.done === tp.total ? 'Lihat Lagi 🎉' : 'Lanjutkan Belajar →';
  }

  // Grid menyesuaikan jumlah kartu: <=4 kartu memenuhi satu baris (tidak ada kolom kosong),
  // <=3 kartu dibuat lebih besar. Lebih dari itu pakai grid otomatis.
  const n = th.pembelajaran.length;
  const gridClass = n <= 4 ? `fit n${n}${n <= 3 ? ' big' : ''}` : '';
  const bannerTargetHref = (th.pembelajaran.length === 1) ? `/belajar.html?p=${th.pembelajaran[0].id}` : `/belajar.html?t=${th.id}`;

  const cards = th.pembelajaran.map((pb, i) => {
    const p = LP.progressOf(pb);
    const dots = pb.tasks.map(t => `<i class="${LP.isDone(t.id) ? 'on' : ''}"></i>`).join('') +
      `<i class="trophy ${p.projectDone ? 'on' : ''}">🏆</i>`;
    const status = p.done === 0 ? (pilih && th.pembelajaran.length > 1 ? 'Ayo pilih!' : 'Belum mulai') : p.done === p.total ? '✓ Selesai!' : `${p.done}/${p.total} selesai`;
    const isMine = chosenId === pb.id || th.pembelajaran.length === 1;
    return `<a class="tg-card ${p.done === p.total ? 'complete' : ''} ${isMine ? 'mine' : ''}" href="/belajar.html?p=${pb.id}" style="--c:${pb.warna}; --d:${i * 0.07}s">
      ${isMine ? '<span class="tg-chip">⭐ Jalurmu</span>' : ''}
      <div class="tg-emoji">${esc(pb.emoji)}</div>
      <h3>${esc(pb.judul)}</h3>
      <p>${esc(pilih ? pb.tagline : pb.desc)}</p>
      <div class="tg-dots">${dots}</div>
      <span class="tg-status">${status}</span>
    </a>`;
  }).join('');

  return `<section class="tahap-section">
    <div class="tahap-banner ${pilih || th.no === 2 ? 't2' : ''}">
      <div class="tb-bubbles"><i></i><i></i><i></i><i></i></div>
      <div class="tb-left">
        <span class="tb-age">Untuk usia <b>${esc(th.usia)}</b></span>
        <h2>${esc(th.nama)}</h2>
        <p>${esc(th.slogan || th.desc)}</p>
        <div class="tb-track">
          <div class="tb-bar"><i style="width:${pct}%"></i></div>
          <span class="tb-rocket" style="left:calc(${pct}% * 0.94)">🚀</span>
        </div>
        <small>${text}</small>
      </div>
      <a class="tb-btn" href="${bannerTargetHref}">${btn}</a>
    </div>
    <div class="tahap-grid ${gridClass}" style="--n:${n}">${cards}</div>
  </section>`;
}

// Tahap 1 & 2 hanya tampil di jenjang SD. Jenjang lain menampilkan info "segera hadir".
const gradeNames = { smp: 'SMP', smak: 'SMA/SMK' };

function normalizeGrade(g) {
  if (!g) return '';
  const s = String(g).trim().toLowerCase();
  if (s === 'smk' || s === 'sma' || s === 'sma/smk') return 'smak';
  return s;
}

function renderGrade(grade) {
  const normGrade = normalizeGrade(grade) || 'sd';
  const area = $('tahapArea');
  if (!area) return;

  const rawUserTrack = localStorage.getItem('purchased_track_id') || localStorage.getItem('trial_track_id') || '';
  const userTrackId = String(rawUserTrack).toLowerCase();
  const rawUserPkg = localStorage.getItem('purchased_package_id') || '';
  const userPkgId = String(rawUserPkg).toLowerCase();

  if (normGrade === 'sd') {
    if (typeof LP !== 'undefined' && Array.isArray(LP.tahap)) {
      if (userTrackId === 'sd_basic') {
        // Siswa memilih paket SD Basic: hanya sajikan Tahap 1 (Basic)
        const th1 = LP.tahap.filter(th => th.id === 'basic');
        area.innerHTML = th1.map(tahapBlock).join('');
      } else if (userTrackId === 'sd_explore_game') {
        // Siswa memilih SD Explore (Game Development): hanya sajikan jalur Game Dev
        const th2 = LP.tahap.find(th => th.id === 'explore');
        if (th2) {
          const customTh = Object.assign({}, th2, {
            mode: false,
            nama: 'Tahap 2 — Explore: Game Development (2D Arcade)',
            desc: 'Jalur Belajar Pilihanmu: Game Development. Kuasai logika kontrol, mekanik game, skor, waktu, dan rancang game buatanmu sendiri!',
            slogan: 'Kreasikan game 2D seru dengan logika visual Scratch!',
            pembelajaran: th2.pembelajaran.filter(pb => pb.id === 'g1')
          });
          area.innerHTML = [customTh].map(tahapBlock).join('');
        } else {
          area.innerHTML = LP.tahap.map(tahapBlock).join('');
        }
      } else if (userTrackId === 'sd_explore_3d') {
        // Siswa memilih SD Explore (3D & Roblox): hanya sajikan jalur 3D & Roblox
        const th2 = LP.tahap.find(th => th.id === 'explore');
        if (th2) {
          const customTh = Object.assign({}, th2, {
            mode: false,
            nama: 'Tahap 2 — Explore: 3D Design & Roblox World',
            desc: 'Jalur Belajar Pilihanmu: 3D Design & Roblox. Bangun objek 3D, atur material warna, susun menara, dan ciptakan dunia 3D mini!',
            slogan: 'Membangun dunia 3D interaktif langsung di browsermu!',
            pembelajaran: th2.pembelajaran.filter(pb => pb.id === 'g2')
          });
          area.innerHTML = [customTh].map(tahapBlock).join('');
        } else {
          area.innerHTML = LP.tahap.map(tahapBlock).join('');
        }
      } else if (userTrackId === 'sd_explore_web') {
        // Siswa memilih SD Explore (Website Development): hanya sajikan jalur Web Dev
        const th2 = LP.tahap.find(th => th.id === 'explore');
        if (th2) {
          const customTh = Object.assign({}, th2, {
            mode: false,
            nama: 'Tahap 2 — Explore: Website Development (Web Kreatif)',
            desc: 'Jalur Belajar Pilihanmu: Website Development. Pelajari struktur HTML, styling modern CSS, dan buat website pertamamu!',
            slogan: 'Menulis kode web asli dan luncurkan websitemu sendiri!',
            pembelajaran: th2.pembelajaran.filter(pb => pb.id === 'g3')
          });
          area.innerHTML = [customTh].map(tahapBlock).join('');
        } else {
          area.innerHTML = LP.tahap.map(tahapBlock).join('');
        }
      } else {
        // sd_all atau tanpa batasan: tampilkan seluruh tahap SD
        area.innerHTML = LP.tahap.map(tahapBlock).join('');
      }
    }
  } else if (normGrade === 'smp' && window.renderSMP) {
    if (userTrackId === 'smp_python' || userPkgId === 'smp_python') {
      window.renderSMP(area, 'python');
    } else if (userTrackId === 'smp_ai' || userPkgId === 'smp_ai') {
      window.renderSMP(area, 'ai');
    } else if (userTrackId === 'smp_gamedev3d' || userPkgId === 'smp_gamedev3d') {
      window.renderSMP(area, 'd3');
    } else {
      window.renderSMP(area);
    }
  } else if (normGrade === 'smak' && window.renderSMAK) {
    if (userTrackId === 'smk_algo' || userPkgId === 'smk_algo') {
      window.renderSMAK(area, 'pl');
    } else if (userTrackId === 'smk_web' || userTrackId === 'smk_webdev' || userPkgId === 'smk_webdev') {
      window.renderSMAK(area, 'wb');
    } else if (userTrackId === 'smk_data' || userTrackId === 'smk_data_ai' || userPkgId === 'smk_data_ai') {
      window.renderSMAK(area, 'da');
    } else {
      window.renderSMAK(area);
    }
  } else {
    area.innerHTML = `<section class="coming-soon">
      <div class="cs-emoji">🚧</div>
      <h3>Materi ${gradeNames[normGrade] || normGrade.toUpperCase()} segera hadir!</h3>
      <p>Kami sedang menyiapkan petualangan seru untuk jenjang ini.</p>
    </section>`;
  }

  // Terapkan batasan jalur akun trial / subscription jika aktif
  if (window.TrialGate && typeof window.TrialGate.applyDashboardLocks === 'function') {
    window.TrialGate.applyDashboardLocks(normGrade);
  }
}

document.querySelectorAll('.grade-tab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('.grade-tab').forEach(item => item.classList.remove('active'));
  tab.classList.add('active');
  const g = normalizeGrade(tab.dataset.grade);
  try { localStorage.setItem('lastGrade', g); } catch (e) {}
  renderGrade(g);
}));

// ---------- Batasan jenjang per user ----------
const rawUserGrade = localStorage.getItem('purchased_package_grade') || localStorage.getItem('trial_grade');
const userGrade = normalizeGrade(rawUserGrade);

const rawServerAllowed = (typeof LP !== 'undefined' && typeof LP.allowedGrades === 'function') ? LP.allowedGrades() : [];
const serverAllowed = (Array.isArray(rawServerAllowed) ? rawServerAllowed : []).map(normalizeGrade).filter(Boolean);

let allowed = [];
if (userGrade) {
  allowed = [userGrade];
} else if (serverAllowed.length) {
  allowed = serverAllowed;
} else {
  allowed = ['sd', 'smp', 'smak'];
}

document.querySelectorAll('.grade-tab').forEach(t => {
  const g = normalizeGrade(t.dataset.grade);
  if (!allowed.includes(g)) {
    t.remove();
  }
});

const tabsLeft = document.querySelectorAll('.grade-tab');
const gs = document.querySelector('.grade-section');
if (tabsLeft.length < 2) {
  if (gs) gs.style.display = 'none'; // Sembunyikan pemilih jika hanya 1 jenjang atau 0
} else {
  if (gs) gs.style.display = '';
  const gt = document.querySelector('.grade-tabs');
  if (gt) gt.style.gridTemplateColumns = 'repeat(' + tabsLeft.length + ', 1fr)';
}

const wantedQuery = normalizeGrade(new URLSearchParams(location.search).get('grade'));
const lastGrade = normalizeGrade(localStorage.getItem('lastGrade'));

let targetGrade = '';
if (userGrade && allowed.includes(userGrade)) {
  targetGrade = userGrade;
} else if (wantedQuery && allowed.includes(wantedQuery)) {
  targetGrade = wantedQuery;
} else if (lastGrade && allowed.includes(lastGrade)) {
  targetGrade = lastGrade;
} else if (tabsLeft.length) {
  targetGrade = normalizeGrade(tabsLeft[0].dataset.grade);
} else {
  targetGrade = allowed[0] || 'sd';
}

if (tabsLeft.length) {
  tabsLeft.forEach(t => {
    if (normalizeGrade(t.dataset.grade) === targetGrade) {
      t.classList.add('active');
    } else {
      t.classList.remove('active');
    }
  });
}

// WAJIB: Selalu jalankan renderGrade agar halaman belajar siswa selalu tampil
renderGrade(targetGrade);

['logoutBtn'].forEach(id => {
  $(id).addEventListener('click', async () => {

    const token = localStorage.getItem('authToken');

    try {
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token
          }
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    }

    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('username');
    localStorage.removeItem('scratch_user');
    localStorage.removeItem('authToken');

    window.location.replace('/index.html');
  });
});
})();