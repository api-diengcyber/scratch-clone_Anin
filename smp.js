// Halaman kurikulum SMP. Data di TRACKS; ganti nilai `href` editor sesuai kebutuhan.
// Halaman kurikulum SMP. Data di TRACKS; ganti nilai `href` editor sesuai kebutuhan.
(async function () {

  const authToken = localStorage.getItem("authToken");

  if (!authToken) {
    window.location.replace("index.html");
    return;
  }

  try {
    const response = await fetch("/api/auth/me", {
      headers: {
        Authorization: "Bearer " + authToken
      }
    });

    if (!response.ok) {
      localStorage.removeItem("isLoggedIn");
      localStorage.removeItem("username");
      localStorage.removeItem("scratch_user");
      localStorage.removeItem("authToken");

      window.location.replace("index.html");
      return;
    }

    const user = await response.json();

    localStorage.setItem("username", user.username);
    localStorage.setItem("scratch_user", user.username);
    localStorage.setItem("isLoggedIn", "true");

  } catch (error) {
    console.error("Gagal memeriksa sesi:", error);
    window.location.replace("index.html");
    return;
  }

  const EDITOR = {
text: 'TextEditor/index.html', d3: 'Editor3D/index.html' }; // placeholder CTA
const TRACKS = [
  { id: 'python', em: '🐍', c: '#4cc9f0', nama: 'Python Start', tag: 'Dasar sampai game 2D',
    ringkas: 'Belajar Python dari nol: dari print() pertama sampai membuat game 2D dan tampil di Hackathon.',
    proyek: 'Game 2D buatan sendiri + karya tim di Hackathon Series', editor: ['Text Editor Python', EDITOR.text + '?dari=smp-python'],
    mod: [
      ['1–6', 'Dasar Python', 'Pemula', ['print, variabel, dan tipe data', 'Input dari pengguna', 'Operator dan perhitungan'], 'Kalkulator mini'],
      ['7–12', 'Struktur Kontrol', 'Pemula', ['if / elif / else', 'Perulangan for dan while', 'Menggabungkan kondisi'], 'Game tebak angka'],
      ['13–18', 'Fungsi & Modul math', 'Menengah', ['Membuat fungsi', 'Parameter dan return', 'Modul math'], 'Kalkulator sains'],
      ['19–26', 'OOP: Kelas & Inheritance', 'Menengah', ['Class dan object', 'Atribut dan method', 'Inheritance'], 'Sistem karakter game'],
      ['27–32', 'Game 2D', 'Lanjut', ['Game loop sederhana', 'Gerak dan tabrakan', 'Skor dan nyawa'], 'Game 2D lengkap'],
      ['33–36', 'Hackathon Series (Finale)', 'Lanjut', ['Merancang game tim', 'Mengerjakan dan menguji', 'Presentasi karya'], 'Game final tim'] ] },
  { id: 'ai', em: '🤖', c: '#b38cff', nama: 'AI & Creative Tech', tag: 'Kreatif dengan AI',
    ringkas: 'Kuasai prompt engineering dan 14 tools AI untuk membuat gambar, audio, video, dan website portofoliomu.',
    proyek: 'Portofolio website yang dipublikasikan online', editor: ['Text Editor (HTML/CSS)', EDITOR.text + '?dari=smp-ai'],
    mod: [
      ['1–6', 'Prompt Engineering ChatGPT', 'Pemula', ['Menulis prompt yang jelas', 'Memberi peran dan konteks', 'Memperbaiki hasil'], 'Kumpulan prompt andalan'],
      ['7–12', 'HTML/CSS via AI', 'Pemula', ['Dasar HTML dan CSS', 'Meminta AI membuat kode', 'Memeriksa dan mengedit hasil AI'], 'Halaman web pertama'],
      ['13–20', '14 Tools AI', 'Menengah', ['StableAudio, Runway, HeyGen, dll.', 'Memilih tool yang tepat', 'Etika memakai AI'], 'Katalog tools AI'],
      ['21–26', 'Aset Gambar, Audio & Video', 'Menengah', ['Generasi gambar', 'Musik dan suara', 'Video pendek'], 'Paket aset kreatif'],
      ['27–32', 'Board Game & Cerita Interaktif', 'Lanjut', ['Aturan dan alur permainan', 'Cerita bercabang', 'Uji coba bersama teman'], 'Board game / cerita interaktif'],
      ['33–36', 'Portofolio Website Online', 'Lanjut', ['Menyusun halaman portofolio', 'Merapikan tampilan', 'Publikasi online'], 'Website portofolio live'] ] },
  { id: '3d', em: '🧊', c: '#ffb02e', nama: 'Game Dev 3D Lanjutan', tag: 'Dunia dan game 3D',
    ringkas: 'Bangun dunia 3D, buat karakter yang bisa dikontrol, tambahkan fisika dan musuh AI, lalu pamerkan di 3D Hackathon.',
    proyek: 'Game 3D lengkap untuk 3D Hackathon Showcase', editor: ['Editor 3D', EDITOR.d3 + '?dari=smp-3d'],
    mod: [
      ['1–6', 'World Building & Transformasi 3D', 'Menengah', ['Sumbu X, Y, Z', 'Posisi, rotasi, skala', 'Menyusun dunia'], 'Dunia 3D mini'],
      ['7–12', 'Karakter & Sistem Kontrol', 'Menengah', ['Gerak WASD', 'Kontrol kamera', 'Animasi karakter'], 'Karakter yang bisa dimainkan'],
      ['13–20', 'Fisika, Bounding Box & Raycasting', 'Lanjut', ['Gravitasi dan tabrakan', 'Bounding box', 'Raycasting'], 'Level dengan rintangan'],
      ['21–28', 'Game Loop, Audio 3D & AI Musuh', 'Lanjut', ['Game loop', 'Audio 3D', 'AI musuh sederhana'], 'Game 3D dengan musuh'],
      ['29–32', 'Optimasi Performa', 'Lanjut', ['Mengurangi beban objek', 'Mencari bagian yang lambat', 'Menguji di banyak perangkat'], 'Game yang lancar'],
      ['33–36', '3D Hackathon Showcase', 'Lanjut', ['Menyempurnakan game', 'Menyiapkan demo', 'Pameran karya'], 'Game 3D final'] ] }
];
const SHOW = [['python', '🕹️', 'Game 2D', 'Game buatan sendiri dengan Python: ada skor, nyawa, dan level.'],
  ['ai', '🌐', 'Web Portofolio AI', 'Website pribadi berisi karya AI-mu, siap dipublikasikan online.'],
  ['3d', '🎮', 'Game 3D', 'Dunia 3D dengan karakter, fisika, dan musuh yang bisa dimainkan.']];

const $ = (s) => document.querySelector(s), esc = (t) => String(t).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
let active = TRACKS.find((t) => '#' + t.id === location.hash) || TRACKS[0];

function renderTabs() {
  $('#tabs').innerHTML = TRACKS.map((t, i) =>
    `<button class="tab" role="tab" id="tab-${t.id}" data-id="${t.id}" aria-selected="${t === active}" tabindex="${t === active ? 0 : -1}" style="--c:${t.c}">
      <span class="em">${t.em}</span><span><b>Track ${i + 1}: ${esc(t.nama)}</b><small>${esc(t.tag)}</small></span></button>`).join('');
}
function renderPanel() {
  const t = active;
  $('#panel').style.setProperty('--c', t.c);
  $('#panel').setAttribute('aria-labelledby', 'tab-' + t.id);
  $('#panel').innerHTML = `
    <div class="overview">
      <div><h2>${t.em} ${esc(t.nama)}</h2><p>${esc(t.ringkas)}</p>
        <div class="chips"><span class="badge">📅 36 pertemuan</span><span class="badge">⏱️ 90 menit/sesi</span><span class="badge glow" style="border-color:${t.c};color:${t.c}">${t.mod.length} modul</span></div>
        <div class="out"><b>🎯 Proyek akhir:</b> ${esc(t.proyek)}</div></div>
      <div class="side"><div class="stat"><div><strong>36</strong><span>Pertemuan</span></div><div><strong>54 jam</strong><span>Total belajar</span></div></div>
        <a class="cta" href="${esc(t.editor[1])}" data-cta="${t.id}">Mulai Belajar →</a><div class="edt">Dikerjakan di ${esc(t.editor[0])}</div></div>
    </div>
    <div class="road"><h3>🗺️ Roadmap modul</h3>${t.mod.map((m, i) => `
      <div class="acc ${i === 0 ? 'open' : ''}">
        <button class="acc-head" aria-expanded="${i === 0}" aria-controls="m-${i}"><span class="no">${i + 1}</span>
          <span class="t"><b>${esc(m[1])}</b><small>Pertemuan ${m[0]}</small></span><span class="lv">${m[2]}</span><span class="chev">▾</span></button>
        <div class="acc-body" id="m-${i}"><div class="acc-in"><div><ul>${m[3].map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
          <div class="proj"><b>Output:</b> ${esc(m[4])}</div></div></div></div></div>`).join('')}</div>`;
  $('#panel').querySelectorAll('.acc-head').forEach((b) => b.addEventListener('click', () => {
    const acc = b.parentElement, open = !acc.classList.contains('open');
    acc.classList.toggle('open', open); b.setAttribute('aria-expanded', open);
  }));
}
function select(id, focus) {
  active = TRACKS.find((t) => t.id === id); history.replaceState(null, '', '#' + id);
  renderTabs(); renderPanel(); if (focus) $('#tab-' + id).focus();
}
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (b) select(b.dataset.id); });
$('#tabs').addEventListener('keydown', (e) => {   // navigasi panah kiri/kanan antar tab
  const i = TRACKS.indexOf(active), d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
  if (d) { e.preventDefault(); select(TRACKS[(i + d + TRACKS.length) % TRACKS.length].id, true); }
});
$('#showcase').innerHTML = SHOW.map((s) => { const t = TRACKS.find((x) => x.id === s[0]);
  return `<button class="work" data-id="${s[0]}" style="--c:${t.c}"><div class="prev">${s[1]}</div><div class="b"><b>${s[2]}</b><small>${s[3]}</small></div></button>`; }).join('');
$('#showcase').addEventListener('click', (e) => { const b = e.target.closest('.work'); if (b) { select(b.dataset.id); scrollTo({ top: $('#tabs').offsetTop - 10, behavior: 'smooth' }); } });
renderTabs(); renderPanel();
})();
