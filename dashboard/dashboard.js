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
    
    // progres + poin, jenjang yang diizinkan, dan profil diambil sekaligus dari server (masing-masing tidak melempar error)
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

// Samakan dengan halaman Poin: tampilkan saldo koin (total poin − hadiah yang sudah dibeli)
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
  if (pilih) {
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

  const cards = th.pembelajaran.map((pb, i) => {
    const p = LP.progressOf(pb);
    const dots = pb.tasks.map(t => `<i class="${LP.isDone(t.id) ? 'on' : ''}"></i>`).join('') +
      `<i class="trophy ${p.projectDone ? 'on' : ''}">🏆</i>`;
    const status = p.done === 0 ? (pilih ? 'Ayo pilih!' : 'Belum mulai') : p.done === p.total ? '✓ Selesai!' : `${p.done}/${p.total} selesai`;
    const isMine = chosenId === pb.id;
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
      <a class="tb-btn" href="/belajar.html?t=${th.id}">${btn}</a>
    </div>
    <div class="tahap-grid ${gridClass}" style="--n:${n}">${cards}</div>
  </section>`;
}

// Tahap 1 & 2 hanya tampil di jenjang SD. Jenjang lain menampilkan info "segera hadir".
const gradeNames = { smp: 'SMP', smak: 'SMA/SMK' };

function renderGrade(grade) {
  const area = $('tahapArea');
  if (grade === 'sd') {
    area.innerHTML = (typeof LP !== 'undefined') ? LP.tahap.map(tahapBlock).join('') : '';
  } else if (grade === 'smp' && window.renderSMP) {
    window.renderSMP(area);          // khusus SMP: smp-tahap.js
  } else if (grade === 'smak' && window.renderSMAK) {
    window.renderSMAK(area);         // khusus SMA/SMK: smak-tahap.js (data: jalur-data-smak.js)
  } else {
    area.innerHTML = `<section class="coming-soon">
      <div class="cs-emoji">🚧</div>
      <h3>Materi ${gradeNames[grade]} segera hadir!</h3>
      <p>Kami sedang menyiapkan petualangan seru untuk jenjang ini. Sementara itu, kamu bisa melihat jenjang SD.</p>
    </section>`;
  }
}

document.querySelectorAll('.grade-tab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('.grade-tab').forEach(item => item.classList.remove('active'));
  tab.classList.add('active');
  try { localStorage.setItem('lastGrade', tab.dataset.grade); } catch (e) {}
  renderGrade(tab.dataset.grade);
}));
// ---------- Batasan jenjang per user ----------
// Tab jenjang yang tidak diizinkan disembunyikan. Daftarnya dari GET /api/user/allowed-grades (diambil di atas
// lewat LP.loadAllowedGrades); kalau server tidak terjangkau dipakai cache terakhir, atau semua jenjang bila belum ada.
const allowed = LP.allowedGrades();
document.querySelectorAll('.grade-tab').forEach(t => { if (!allowed.includes(t.dataset.grade)) t.remove(); });
const tabsLeft = document.querySelectorAll('.grade-tab');
if (tabsLeft.length < 2) document.querySelector('.grade-section').style.display = 'none';   // 1 jenjang: tidak perlu pemilih
else document.querySelector('.grade-tabs').style.gridTemplateColumns = 'repeat(' + tabsLeft.length + ', 1fr)';
if (tabsLeft.length) {
  document.querySelectorAll('.grade-tab').forEach(t => t.classList.remove('active'));
  const wanted = new URLSearchParams(location.search).get('grade') || localStorage.getItem('lastGrade');
  const startTab = Array.from(tabsLeft).find(t => t.dataset.grade === wanted) || tabsLeft[0];
  startTab.classList.add('active');
  renderGrade(startTab.dataset.grade);
}

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