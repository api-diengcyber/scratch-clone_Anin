// Wajib login untuk membuka dashboard
if (localStorage.getItem('isLoggedIn') !== 'true') {
  window.location.replace('index.html');
}

const $ = id => document.getElementById(id);
const currentUser = localStorage.getItem('username') || localStorage.getItem('scratch_user') || 'tamu';
const totalPoints = Number(localStorage.getItem('codingPoints_' + currentUser)) || 0;

const savedUser = localStorage.getItem('username');
if (savedUser) $('displayUsername').textContent = '@' + savedUser;
$('pointsValue').textContent = totalPoints;

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
    text = tp.chosen ? `Jalurmu: ${tp.chosen.emoji} ${tp.chosen.judul} • ${tp.done} dari ${tp.total} langkah selesai` : 'Kamu belum memilih jalur';
    btn = !tp.chosen ? 'Pilih Jalurmu →' : tp.done === tp.total ? 'Lihat Lagi 🎉' : 'Lanjutkan Belajar →';
  } else {
    text = `${tp.done} dari ${tp.total} langkah selesai`;
    btn = tp.done === 0 ? 'Mulai Petualangan →' : tp.done === tp.total ? 'Lihat Lagi 🎉' : 'Lanjutkan Belajar →';
  }

  const cards = th.pembelajaran.map((pb, i) => {
    const p = LP.progressOf(pb);
    const dots = pb.tasks.map(t => `<i class="${LP.isDone(t.id) ? 'on' : ''}"></i>`).join('') +
      `<i class="trophy ${p.projectDone ? 'on' : ''}">🏆</i>`;
    const status = p.done === 0 ? (pilih ? 'Ayo pilih!' : 'Belum mulai') : p.done === p.total ? '✓ Selesai!' : `${p.done}/${p.total} selesai`;
    const isMine = chosenId === pb.id;
    return `<a class="tg-card ${p.done === p.total ? 'complete' : ''} ${isMine ? 'mine' : ''}" href="belajar.html?p=${pb.id}" style="--c:${pb.warna}; --d:${i * 0.07}s">
      ${isMine ? '<span class="tg-chip">⭐ Jalurmu</span>' : ''}
      <div class="tg-emoji">${pb.emoji}</div>
      <h3>${pb.judul}</h3>
      <p>${pilih ? pb.tagline : pb.desc}</p>
      <div class="tg-dots">${dots}</div>
      <span class="tg-status">${status}</span>
    </a>`;
  }).join('');

  return `<section class="tahap-section">
    <div class="tahap-banner ${pilih ? 't2' : ''}">
      <div class="tb-bubbles"><i></i><i></i><i></i><i></i></div>
      <div class="tb-left">
        <span class="tb-age">🎈 Untuk usia <b>${th.usia}</b></span>
        <h2>${th.emoji} ${th.nama}</h2>
        <p>${th.slogan || th.desc}</p>
        <div class="tb-track">
          <div class="tb-bar"><i style="width:${pct}%"></i></div>
          <span class="tb-rocket" style="left:calc(${pct}% * 0.94)">🚀</span>
        </div>
        <small>${text}</small>
      </div>
      <a class="tb-btn" href="belajar.html?t=${th.id}">${btn}</a>
    </div>
    <div class="tahap-grid ${pilih ? 'cols3' : ''}">${cards}</div>
  </section>`;
}

// Tahap 1 & 2 hanya tampil di jenjang SD. Jenjang lain menampilkan info "segera hadir".
const gradeNames = { smp: 'SMP', smak: 'SMA/SMK' };

function renderGrade(grade) {
  const area = $('tahapArea');
  if (grade === 'sd') {
    area.innerHTML = (typeof LP !== 'undefined') ? LP.tahap.map(tahapBlock).join('') : '';
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
  renderGrade(tab.dataset.grade);
}));
renderGrade('sd');

$('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('isLoggedIn');
  localStorage.removeItem('username');
  localStorage.removeItem('scratch_user');
  window.location.replace('index.html');
});
