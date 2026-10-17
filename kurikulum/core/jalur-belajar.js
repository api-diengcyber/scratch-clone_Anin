// ============================================================
// MESIN JALUR BELAJAR — Dieng Cyber Coding
// Konten (tahap, jalur, task, project) ada di jalur-data.js.
// File ini mengurus: status, kunci berurutan, poin, progres, penyimpanan.
// Dipakai oleh: belajar.html, dashboard.html, Scratch/index.html
// (jalur-data.js harus dimuat SEBELUM file ini)
// ============================================================

(function () {

if (!window.LP_DATA) { console.error("jalur-data.js belum dimuat sebelum jalur-belajar.js"); return; }

const LP = Object.assign({}, window.LP_DATA, {

  // ---------- EDITOR YANG TERSEDIA ----------
  // Task interactive dibuka di editor sesuai `kind`-nya. Untuk editor baru (misalnya PHP),
  // tambahkan satu entri di sini + satu pembuat data di jalur-data.js.
  EDITOR: {
    editor: { folder: "/tools/Scratch",    nama: "Block Editor", icon: "🧩", tombol: "Buka Editor 🚀",
              cara: ["Klik tombol <b>Buka Editor</b>.", "Susun blok sesuai misi.", "Klik bendera hijau 🚩 — misi dicek otomatis!"] },
    code:   { folder: "/tools/TextEditor", nama: "Text Editor",  icon: "💻", tombol: "Buka Text Editor 💻",
              cara: ["Klik tombol <b>Buka Text Editor</b>.", "Tulis kode di sebelah kiri, hasilnya muncul di sebelah kanan.", "Klik ▶ <b>Jalankan</b> — misi dicek otomatis!"] },
    model3d: { folder: "/tools/Editor3D",   nama: "3D Editor",   icon: "🧊", tombol: "Buka 3D Editor 🧊",
              cara: ["Klik tombol <b>Buka 3D Editor</b>. Misimu langsung muncul di atas.", "Tambah dan atur benda 3D seperti di Roblox Studio.", "Kalau semua syarat di kartu misi sudah ✅, task selesai otomatis!"] }
  },
  // editor untuk sebuah task (null jika task tidak memakai editor, mis. kuis / external)
  editorOf(task) { return this.EDITOR[task.kind] || null; },

  // ---------- MODE PRAKTIK (tombol "🚀 Mulai Praktik") ----------
  // Setiap task punya SATU mode, diatur lewat `praktik` di jalur-data.js:
  //   block    → Block Editor (Scratch/)       — jalur 2D Game
  //   text     → Text Editor (TextEditor/)     — jalur Website (HTML + CSS)
  //   external → halaman instruksi + checklist, dikerjakan di aplikasi luar (Roblox Studio, ScratchJr, Paint, ...)
  //   physical → halaman instruksi + unggah foto/video, dikerjakan di dunia nyata
  // Jika `praktik` tidak diisi: kind "editor" → block, kind "code" → text, type "external" → external, kuis → tanpa praktik.
  // Mode block/text pada task kuis/external membuka editor dalam MODE BEBAS (tanpa cek otomatis);
  // task tetap diselesaikan lewat kuis / checklist-nya seperti biasa, jadi poin & kunci berurutan tidak berubah.
  PRAKTIK: {
    block:    { icon: "🧩", nama: "Block Editor",    folder: "/tools/Scratch" },
    text:     { icon: "💻", nama: "Text Editor",     folder: "/tools/TextEditor" },
    external: { icon: "🔵", nama: "Aplikasi Luar",   folder: null },
    physical: { icon: "🎨", nama: "Aktivitas Nyata", folder: null }
  },
  // mode sebuah task: "block" | "text" | "external" | "physical" | null (kuis tanpa praktik)
  modeOf(task) {
    if (task.type === "project") return null;                  // Project Akhir punya aturan sendiri (JENIS)
    if (task.praktik && this.PRAKTIK[task.praktik]) return task.praktik;
    if (task.kind === "editor") return "block";
    if (task.kind === "code") return "text";
    if (task.type === "external") return "external";
    return null;
  },
  // info tombol "Mulai Praktik" untuk task yang BUKAN task editor otomatis (kuis / external). null jika tidak ada.
  praktikOf(task) {
    if (this.editorOf(task)) return null;                       // task block/code otomatis langsung dibuka di editornya
    const m = this.modeOf(task);
    return m ? Object.assign({ key: m }, this.PRAKTIK[m]) : null;
  },
  // nama aplikasi luar untuk task external/physical (task.aplikasi, atau aplikasi di Project Akhir jalur yang sama)
  aplikasiOf(task, pemb) {
    return task.aplikasi || (pemb && pemb.project && pemb.project.jenis === "external" && pemb.project.aplikasi) || "aplikasi pilihanmu";
  },
  // alamat editor (mode bebas) untuk praktik sebuah task. dari: "" | "Scratch" | "TextEditor"
  praktikHref(id, dari) {
    const f = this.find(id), m = f && this.praktikOf(f.task);
    if (!m || !m.folder) return null;
    return m.folder + "/index.html?dari=" + id;
  },

  // ---------- STATUS TASK ----------
  STATUS: {
    terkunci: { icon: "🔒", nama: "Terkunci" },
    tersedia: { icon: "🟡", nama: "Tersedia" },
    selesai:  { icon: "✅", nama: "Selesai" }
  },

  // ---------- PROJECT AKHIR: jenis & status pengumpulan ----------
  // jenis project diatur lewat `jenis` di jalur-data.js.
  //   bukti: minimal salah satu ini harus diisi sebelum project bisa dikumpulkan
  //   file / link: apakah kolom unggah file / kolom link ditampilkan
  JENIS: {
    block:    { icon: "🧩", nama: "Block Editor",     info: "Dibuat memakai Block Editor di website ini", folder: "/tools/Scratch",
                mulai: "Buka Block Editor 🧩", file: "image/*", link: false, bukti: ["img", "note"],
                petunjuk: "Klik tombol di bawah untuk membuka Block Editor. Setelah karyamu selesai, kembali ke halaman ini lalu kumpulkan." },
    text:     { icon: "💻", nama: "Text Editor",      info: "Dibuat memakai Text Editor di website ini", folder: "/tools/TextEditor",
                mulai: "Buka Text Editor 💻", file: "image/*", link: true, bukti: ["img", "link", "note"],
                petunjuk: "Klik tombol di bawah untuk membuka Text Editor. Setelah websitemu selesai, kembali ke halaman ini lalu kumpulkan." },
    model3d:  { icon: "🧊", nama: "3D Editor",        info: "Dibuat memakai 3D Editor di website ini", folder: "/tools/Editor3D",
                mulai: "Buka 3D Editor 🧊", file: "image/*", link: false, bukti: ["img", "note"],
                petunjuk: "Klik tombol di bawah untuk membuka 3D Editor. Setelah duniamu selesai, ambil screenshot, kembali ke halaman ini lalu kumpulkan." },
    external: { icon: "🔵", nama: "External",         info: "Dikerjakan di aplikasi luar", folder: null,
                mulai: "Mulai Project 🚀", file: "image/*", link: true, bukti: ["img", "link"],
                petunjuk: "Buka aplikasinya, kerjakan project-mu, lalu kembali ke sini untuk mengirim screenshot, foto, atau link hasilnya." },
    fisik:    { icon: "🎨", nama: "Physical Project", info: "Karya nyata yang difoto atau direkam", folder: null,
                mulai: "Mulai Project 🚀", file: "image/*,video/*", link: false, bukti: ["img", "video"],
                petunjuk: "Siapkan bahan-bahannya dan buat karyamu. Setelah selesai, foto atau rekam video karyamu lalu unggah di sini." }
  },
  BUKTI_NAMA: { img: "foto/screenshot", video: "video", link: "link", note: "catatan" },
  jenisOf(task) { return this.JENIS[task.jenis] ? task.jenis : "external"; },   // project lama tanpa `jenis` dianggap External

  // status Project Akhir: "belum" | "dikerjakan" | "dikumpulkan"
  PROJECT_STATUS: {
    belum:       { icon: "⚪", nama: "Belum dikerjakan" },
    dikerjakan:  { icon: "🛠️", nama: "Sedang dikerjakan" },
    dikumpulkan: { icon: "📤", nama: "Sudah dikumpulkan" }
  },
  projectStatus(id) {
    if (this.isDone(id)) return "dikumpulkan";
    const u = this.upload(id);
    const ada = u.mulai || u.img || u.video || u.link || u.note || (u.cek && u.cek.some(Boolean));
    return ada ? "dikerjakan" : "belum";
  },

  // ============================================================
  // PENYIMPANAN (per username) — kunci localStorage SAMA dengan versi sebelumnya,
  // jadi progres & poin anak yang sudah ada tidak hilang.
  // ============================================================
    user() {
    return localStorage.getItem("username")
      || localStorage.getItem("scratch_user")
      || "tamu";
  },

  _get(name, def) {
    try {
      return JSON.parse(
        localStorage.getItem(name + "_" + this.user())
      ) || def;
    } catch (e) {
      return def;
    }
  },

  _set(name, val) {
    localStorage.setItem(
      name + "_" + this.user(),
      JSON.stringify(val)
    );
  },

  // ============================================================
  // GERBANG MATERI — task baru boleh dikerjakan setelah materinya dibaca sampai selesai
  // ------------------------------------------------------------
  // Halaman materi (shared/js/materi-gate.js) mencatat "sudah dibaca sampai selesai" di
  // localStorage "materiRead_<user>". Kunci catatan = alamat halaman materi (path, ditambah
  // ?task= untuk materi SD). Fungsi materiKey() harus SAMA dengan yang ada di materi-gate.js.
  // Aturan:
  //   • task tanpa halaman materi, dan Final Project (kumpul), tidak digembok;
  //   • task yang SUDAH selesai tidak digembok (progres lama aman, boleh diulang);
  //   • penyelesaian ditolak di LP.complete / LP.completeSmp (hasilnya { blocked: true }),
  //     jadi semua jalur (tombol, editor, alamat langsung) ikut terblokir.
  // ============================================================
  materiKey(url) {
    try {
      const u = new URL(url, location.origin), t = u.searchParams.get("task");
      return decodeURIComponent(u.pathname) + (t ? "?task=" + t : "");
    } catch (e) { return String(url || ""); }
  },
  materiDibaca(task) {
    if (!task || !task.halamanMateri) return true;
    return !!this._get("materiRead", {})[this.materiKey(task.halamanMateri)];
  },
  materiTerkunci(task, sudahSelesai) {
    return !!(task && task.halamanMateri && !task.kumpul) && !sudahSelesai && !this.materiDibaca(task);
  },
  // alamat halaman materi + ?kembali= (halaman belajar tempat asal; hanya alamat internal yang diterima materi-gate.js)
  materiHref(task, kembali) {
    const u = task.halamanMateri;
    return u + (u.indexOf("?") > -1 ? "&" : "?") + "kembali=" + encodeURIComponent(kembali);
  },
  // task SD berdasarkan id ("g1-t1")
  materiTerkunciId(id) {
    const f = this.find(id);
    return !!f && this.materiTerkunci(f.task, this.isDone(id));
  },
  // task SMP / SMA-SMK berdasarkan modul + nomor task
  _smpTask(nodeId, index) {
    const all = [].concat(window.LP_SMP || [], window.LP_SMAK || []);
    for (const t of all) for (const n of (t.nodes || [])) if (n.id === nodeId) return (n.tasks || [])[index] || null;
    return null;
  },
  materiTerkunciSmp(nodeId, index) {
    const sudah = !!this._get("smpTasks", {})[nodeId + ":" + index];
    return this.materiTerkunci(this._smpTask(nodeId, index), sudah);
  },

  // ============================================================
  // DATABASE SYNC
  // ============================================================

  authHeaders() {
    const token = localStorage.getItem("authToken");

    return token
      ? {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json"
        }
      : {
          "Content-Type": "application/json"
        };
  },

  async loadFromServer() {
    const username = this.user();
    const token = localStorage.getItem("authToken");

    if (!token || username === "tamu") {
      return false;
    }

    try {
      const [progressRes, pointsRes] = await Promise.all([
        fetch("/api/progress/" + encodeURIComponent(username), {
          headers: this.authHeaders()
        }),

        fetch("/api/points/" + encodeURIComponent(username), {
          headers: this.authHeaders()
        })
      ]);

      if (!progressRes.ok || !pointsRes.ok) {
        throw new Error("Gagal mengambil data progress dari server.");
      }

      const progressData = await progressRes.json();
      const pointsData = await pointsRes.json();

      // Handle new API format: { ok: true, progress: [...] }
      const progressRows = progressData.progress || progressData;
      const pointsTotal = pointsData.total ?? pointsData;

      const completed = {};

      progressRows.forEach((row) => {
        if (row.completed) {
          completed[row.task_id] = true;
        }
      });

      this._set("codingCompleted", completed);

      // Task SMP & SMA/SMK memakai id "modul:nomor" (mis. py1:0). Pulihkan juga ke smpTasks
      // (status selesai) dan smpPoin (poin sudah pernah diberikan) supaya tidak hilang / dobel di perangkat lain.
      const smpDone = this._get("smpTasks", {}), smpGiven = this._get("smpPoin", {});
      progressRows.forEach((row) => {
        if (!row || String(row.task_id).indexOf(":") < 1) return;
        if (row.completed) { smpDone[row.task_id] = 1; smpGiven[row.task_id] = 1; }
        else delete smpDone[row.task_id];
      });
      this._set("smpTasks", smpDone);
      this._set("smpPoin", smpGiven);

      localStorage.setItem(
        "codingPoints_" + username,
        String(Number(pointsTotal) || 0)
      );

      return true;

    } catch (error) {
      console.error(
        "Gagal sinkronisasi progress dari database:",
        error
      );

      return false;
    }
  },

  // Simpan status task ke server. Jawaban server (kontrak baru):
  //   { points: <total poin terbaru>, earned: { base, bonus } }
  // Mengembalikan { ok, points, earned } (points/earned bernilai null kalau server tidak mengirimnya), atau false bila gagal.
  async saveProgressToServer(id, completed) {
    const username = this.user();
    const token = localStorage.getItem("authToken");

    if (!token || username === "tamu") {
      return false;
    }

    // laporan kegagalan yang masih di jalan harus tiba DULU, supaya server menghitung bonus dengan benar
    if (completed === true && this._pend.length) {
      await Promise.allSettled(this._pend.slice());
    }

    try {
      const response = await fetch(
        "/api/progress/" + encodeURIComponent(username),
        {
          method: "POST",
          headers: this.authHeaders(),
          body: JSON.stringify({
            taskId: id,
            completed: completed === true
          })
        }
      );

      if (!response.ok) {
        throw new Error("Gagal menyimpan progress.");
      }

      let body = {};
      try { body = await response.json(); } catch (e) { body = {}; }
      const d = (body && typeof body.points !== "number" && body.data && typeof body.data === "object") ? body.data : (body || {});
      const e = d.earned && typeof d.earned === "object" ? d.earned : null;

      return {
        ok: true,
        points: typeof d.points === "number" ? d.points : null,
        earned: e ? { base: Number(e.base) || 0, bonus: Number(e.bonus) || 0 } : null
      };

    } catch (error) {
      console.error(
        "Gagal menyimpan progress ke database:",
        error
      );

      return false;
    }
  },

  // Laporkan SATU kegagalan cek misi ke server (tombol Run / bendera ditekan, syarat belum terpenuhi).
  // Hanya untuk task (id wajib ada); mode bebas tanpa task tidak melapor. Sukses TIDAK dilaporkan di sini
  // (dilaporkan lewat progress). Server memakai jumlah kegagalan ini untuk bonus percobaan pertama.
  // Mengembalikan Promise<jumlah gagal sejauh ini | null>. Tidak pernah melempar error.
  laporGagal(id) {
    const username = this.user();
    const token = localStorage.getItem("authToken");
    if (!id || !token || username === "tamu") return Promise.resolve(null);

    const p = fetch("/api/attempts/" + encodeURIComponent(username), {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify({ taskId: String(id) })
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => (b && typeof b.fails === "number" ? b.fails : null))
      .catch(() => null);

    this._pend.push(p);
    p.then(() => { const i = this._pend.indexOf(p); if (i > -1) this._pend.splice(i, 1); });
    return p;
  },
  _pend: [],   // laporan gagal yang belum selesai terkirim

  // Terapkan jawaban server ke tampilan: points = total terbaru (MENGGANTIKAN angka lokal),
  // earned.base / earned.bonus = rincian untuk teks dan animasi. Poin TIDAK lagi dihitung di sini.
  // Kalau server tidak terjangkau (atau mode tamu) → hanya poin dasar, tanpa bonus.
  _terapkan(id, judul, res, base) {
    let earned, bonus, total;
    if (res && typeof res.points === "number") {
      total = res.points;
      earned = res.earned ? res.earned.base : base;
      bonus = res.earned ? res.earned.bonus : 0;
    } else {
      earned = base; bonus = 0; total = this.points() + base;
    }
    localStorage.setItem("codingPoints_" + this.user(), String(total));
    const rec = this._get("poinEarned", {}); rec[id] = { base: earned, bonus: bonus }; this._set("poinEarned", rec);   // untuk undo
    this.logPoin(id, judul, earned, bonus);
    try { window.dispatchEvent(new CustomEvent("lp:points", { detail: { total: total } })); } catch (e) {}
    return { earned: earned, bonus: bonus, total: total };
  },

  progress() {
    return this._get("codingCompleted", {});
  },

  isDone(id) {
    return !!this.progress()[id];
  },

  points() {
    return Number(
      localStorage.getItem(
        "codingPoints_" + this.user()
      )
    ) || 0;
  },

  attempts(id) {
    return this._get("codingAttempts", {})[id] || 0;
  },

  // percobaan gagal: hitungan lokal (untuk teks "percobaan ke-N" dan laporan) + laporkan ke server
  addAttempt(id) {
    const a = this._get("codingAttempts", {});
    a[id] = (a[id] || 0) + 1;
    this._set("codingAttempts", a);
    this.laporGagal(id);
    return a[id];
  },

  upload(id) {
    return this._get("codingUploads", {})[id] || {};
  },

  saveUpload(id, data) {
    const u = this._get("codingUploads", {});
    u[id] = Object.assign(u[id] || {}, data);
    this._set("codingUploads", u);
  },

  // ============================================================
  // BANTUAN STRUKTUR
  // ============================================================
  // semua isi satu pembelajaran: Task 1..N lalu Project Akhir
  items(pemb) { return pemb.tasks.concat([pemb.project]); },

  // cari task/project berdasarkan id → { tahap, pemb, task, index }
  find(id) {
    for (const th of this.tahap) for (const pb of th.pembelajaran) {
      const list = this.items(pb);
      const index = list.findIndex(t => t.id === id);
      if (index >= 0) return { tahap: th, pemb: pb, task: list[index], index };
    }
    return null;
  },
  next(id) { const f = this.find(id); return f ? (this.items(f.pemb)[f.index + 1] || null) : null; },

  // Task 1 selalu terbuka; berikutnya terbuka jika yang sebelumnya selesai
  isUnlocked(id) {
    const f = this.find(id);
    if (!f) return false;
    return f.index === 0 || this.isDone(this.items(f.pemb)[f.index - 1].id);
  },

  // status satu task: "terkunci" | "tersedia" | "selesai"
  status(id) {
    if (this.isDone(id)) return "selesai";
    return this.isUnlocked(id) ? "tersedia" : "terkunci";
  },

  // poin dasar sebuah task (bisa diatur per task lewat `poin` di jalur-data.js)
  poinOf(task) {
    if (typeof task.poin === "number") return task.poin;
    return task.type === "project" ? this.POIN_PROJECT : this.POIN_TASK;
  },

  // kondisi berhasil / gagal untuk task interactive (null untuk external & project)
  kondisi(task) {
    if (task.type !== "interactive") return null;
    const standar = task.kind === "quiz"
      ? { sukses: "Semua jawaban benar.", gagal: "Ada jawaban yang salah. Kamu boleh mencoba lagi sebanyak yang kamu mau." }
      : task.kind === "model3d"
      ? { sukses: "Semua syarat di kartu misi sudah ✅ (dicek otomatis saat kamu membangun).", gagal: "Masih ada syarat di kartu misi yang belum ✅. Baca lagi langkahnya, lalu lanjutkan membangun." }
      : task.kind === "code"
      ? { sukses: "Semua syarat di kartu misi terpenuhi, lalu kamu klik ▶ Jalankan.", gagal: "Ada syarat yang belum terpenuhi saat ▶ Jalankan diklik. Cek lagi kodemu, lalu coba lagi." }
      : { sukses: "Semua syarat di kartu misi terpenuhi, lalu kamu klik bendera hijau 🚩.", gagal: "Ada syarat yang belum terpenuhi saat bendera hijau diklik. Cek lagi kartu misi, lalu coba lagi." };
    return { sukses: task.sukses || standar.sukses, gagal: task.gagal || standar.gagal };
  },

  // cara mengumpulkan hasil Project Akhir
  kumpul(task) {
    return (task.kumpul && task.kumpul.length) ? task.kumpul
      : ["Centang semua checklist", "Unggah foto atau screenshot hasil karyamu", "Atau tempel link project-mu (jika ada)"];
  },

  // progres satu pembelajaran: { done, total, taskDone, projectDone }
  progressOf(pemb) {
    const list = this.items(pemb);
    const done = list.filter(t => this.isDone(t.id)).length;
    return { done, total: list.length, taskDone: pemb.tasks.filter(t => this.isDone(t.id)).length, projectDone: this.isDone(pemb.project.id) };
  },
  // total poin yang bisa didapat di satu pembelajaran (tanpa bonus)
  poinTotal(pemb) { return this.items(pemb).reduce((s, t) => s + this.poinOf(t), 0); },

  // pilihan jalur (khusus tahap bermode "pilih-jalur", misalnya Tahap 2)
  chosen(tid) { return this._get("jalurPilihan", {})[tid] || null; },
  choose(tid, pid) { const c = this._get("jalurPilihan", {}); c[tid] = pid; this._set("jalurPilihan", c); },
  progressOfTahap(th) {
    if (th.mode === "pilih-jalur") {          // progres = jalur yang dipilih saja
      const pb = th.pembelajaran.find(p => p.id === this.chosen(th.id));
      if (pb) return Object.assign(this.progressOf(pb), { chosen: pb });
      return { done: 0, total: this.items(th.pembelajaran[0]).length, chosen: null };
    }
    let done = 0, total = 0;
    th.pembelajaran.forEach(pb => { const p = this.progressOf(pb); done += p.done; total += p.total; });
    return { done, total };
  },

  // alamat untuk membuka sebuah task.
  // dari: "" (dari halaman utama) | "Scratch" | "TextEditor" (nama folder tempat kode ini dipanggil).
  // `true` tetap diterima = "Scratch" (cara panggil lama).
  href(id, dari) {
    const f = this.find(id);
    const ed = f && this.editorOf(f.task);
    if (ed) return ed.folder + "/index.html?task=" + id;
    return "/SD/belajar.html?task=" + id;
  },

  // tandai selesai. Poin & bonus ditentukan SERVER: tunggu `await r.ready` → { earned, bonus, total }.
  // Mengembalikan { already, ready } atau { blocked } bila materinya belum dibaca.
  complete(id, firstTry) {   // firstTry tidak dipakai lagi: bonus ditentukan SERVER dari jumlah kegagalan yang dilaporkan
    const f = this.find(id);

    if (!f) return null;

    // gerbang materi: materi belum dibaca sampai selesai → task belum boleh diselesaikan
    if (this.materiTerkunci(f.task, this.isDone(id))) {
      return { blocked: true, alasan: "materi", already: false, earned: 0, bonus: 0, total: this.points() };
    }

    if (this.isDone(id)) {
      return {
        already: true,
        earned: 0,
        bonus: 0,
        total: this.points(),
        ready: Promise.resolve({ earned: 0, bonus: 0, total: this.points() })
      };
    }

    const base = this.poinOf(f.task);

    const done = this.progress();
    done[id] = true;
    this._set("codingCompleted", done);

    // Poin & bonus datang dari jawaban server (bukan hitungan lokal). Tunggu `ready` sebelum menampilkan angka:
    //   const r = LP.complete(id); const s = await r.ready;  → s = { earned, bonus, total }
    // `earned` / `total` di objek ini hanya perkiraan sementara (poin dasar), JANGAN dipakai untuk tampilan akhir.
    const ready = this.saveProgressToServer(id, true).then((res) => this._terapkan(id, f.task.title, res, base));

    return { already: false, earned: base, bonus: 0, total: this.points(), ready };
  },

  // ============================================================
  // TASK SMP & SMA/SMK — tandai selesai + beri poin
  // ============================================================
  // Status selesai disimpan di "smpTasks" (id "modul:nomor"). Poin & bonus ditentukan SERVER (lihat _terapkan):
  // undo mendebit poin dasar + bonus, menyelesaikan ulang hanya memberi poin dasar.
  // info: { judul, project (Project Akhir → POIN_PROJECT), poin (angka khusus, opsional) }
  // Mengembalikan { already, ready } atau { blocked }; `await r.ready` → { earned, bonus, total }.
  completeSmp(nodeId, index, info) {
    info = info || {};
    const id = nodeId + ":" + index;

    // gerbang materi: materi belum dibaca sampai selesai → task belum boleh diselesaikan
    if (this.materiTerkunciSmp(nodeId, index)) {
      return { blocked: true, alasan: "materi", already: false, earned: 0, total: this.points() };
    }

    const done = this._get("smpTasks", {});
    if (done[id]) {
      return { already: true, earned: 0, total: this.points(), ready: Promise.resolve({ earned: 0, bonus: 0, total: this.points() }) };
    }
    done[id] = 1;
    this._set("smpTasks", done);

    const base = typeof info.poin === "number"
      ? info.poin
      : (info.project ? this.POIN_PROJECT : this.POIN_TASK);

    // Poin & bonus dari jawaban server. Layar diperbarui lewat event "lp:points" (dan `ready` untuk yang mau menunggu).
    const ready = this.saveProgressToServer(id, true).then((res) => this._terapkan(id, info.judul, res, base));

    return { already: false, earned: base, total: this.points(), ready };
  },

  // Sinkronkan status selesai dengan centang langkah di editor.
  // Task yang SEMUA langkahnya sudah tercentang (smpSteps_<modul>_<nomor>) tapi belum tertandai selesai
  // (mis. dikerjakan sebelum penyelesaian otomatis ada, atau status ikut terhapus saat sinkron server)
  // → ditandai selesai lewat completeSmp (poin tetap hanya sekali per task). Hanya task yang sudah terbuka
  // (task sebelumnya selesai); Final Project (kumpul) tidak ikut karena dikumpulkan manual.
  // tracks: array jalur (window.LP_SMP / window.LP_SMAK). Mengembalikan jumlah task yang diperbarui.
  syncSmpFromSteps(tracks) {
    let changed = 0;
    (tracks || []).forEach((t) => (t.nodes || []).forEach((n) => (n.tasks || []).forEach((k, i) => {
      const total = Array.isArray(k.langkah) ? k.langkah.length : 0;
      if (!total || k.kumpul) return;
      const done = this._get("smpTasks", {});
      if (done[n.id + ":" + i]) return;
      if (i > 0 && !done[n.id + ":" + (i - 1)]) return;
      if (this.materiTerkunci(k, false)) return;     // materi belum dibaca → tidak boleh selesai otomatis
      let c = [];
      try { c = JSON.parse(localStorage.getItem("smpSteps_" + n.id + "_" + i)) || []; } catch (e) { c = []; }
      if (!Array.isArray(c)) return;
      const ok = new Set(c.filter((x) => Number.isInteger(x) && x >= 0 && x < total)).size === total;
      if (!ok) return;
      this.completeSmp(n.id, i, { judul: (n.title || n.id) + " — " + (k.judul || "Task " + (i + 1)), project: !!k.project, poin: k.poin });
      changed++;
    })));
    return changed;
  },

  // Label info di kartu task SMP & SMA/SMK (gaya yang sama dengan kartu task SD):
  // jenis task • editor yang dipakai • status (Selesai / Sedang dikerjakan / Tersedia / Terkunci) • poin.
  // op = task sudah terbuka, dn = task sudah selesai. Memakai kelas .badge dari belajar.css.
  smpChips(node, k, i, op, dn) {
    const jenis = k.kumpul ? "📤 Kumpul Final Project" : k.project ? "🏆 Project Akhir" : "🛠️ Praktik";
    const tool = k.kumpul ? "" : '<span class="badge tool">' + (String(node.urlEditor || "").indexOf("3D") > -1 ? "🧊 3D Editor" : "💻 Text Editor") + "</span>";
    let st = "tersedia", lb = "▶️ Tersedia";
    if (dn) { st = "selesai"; lb = "✅ Selesai"; }
    else if (!op) { st = "terkunci"; lb = "🔒 Terkunci"; }
    else {
      let c = [];
      try { c = JSON.parse(localStorage.getItem("smpSteps_" + node.id + "_" + i)) || []; } catch (e) { c = []; }
      if (Array.isArray(c) && c.length) { st = "dikerjakan"; lb = "✏️ Sedang dikerjakan"; }
    }
    const poin = typeof k.poin === "number" ? k.poin : (k.project ? this.POIN_PROJECT : this.POIN_TASK);
    return '<div class="smp-chips"><span class="badge">' + jenis + "</span>" + tool +
      '<span class="badge st-' + st + '">' + lb + '</span><span class="badge pts">⭐ ' + poin + " poin</span></div>";
  },

  // batalkan status selesai. Server mendebit poin dasar + bonus; menyelesaikan ulang hanya memberi poin dasar (bonus hangus).
  undoSmp(nodeId, index) {
    const id = nodeId + ":" + index;
    const done = this._get("smpTasks", {});
    delete done[id];
    this._set("smpTasks", done);

    const rec = this._get("poinEarned", {}), lama = rec[id];
    delete rec[id];
    this._set("poinEarned", rec);

    // Server mendebit poin dasar + bonus. Tampilan ikut dikurangi: pakai total dari server bila ada,
    // kalau tidak, kurangi sebesar yang tercatat saat task ini diselesaikan.
    return this.saveProgressToServer(id, false).then((res) => {
      let total = null;
      if (res && typeof res.points === "number") total = res.points;
      else if (lama) total = Math.max(0, this.points() - ((lama.base || 0) + (lama.bonus || 0)));
      if (total !== null) {
        localStorage.setItem("codingPoints_" + this.user(), String(total));
        try { window.dispatchEvent(new CustomEvent("lp:points", { detail: { total: total } })); } catch (e) {}
      }
      return { total: total === null ? this.points() : total };
    });
  },

  // ============================================================
  // RIWAYAT POIN, LEVEL, DAN TUKAR POIN (dipakai halaman /poin/poin.html)
  // ============================================================

  // catat satu baris riwayat (dipanggil dari complete() dan dari editor Scratch)
  logPoin(id, judul, earned, bonus) {
    const log = this._get("pointLog", []);
    log.push({ t: new Date().toISOString(), id: id, judul: judul || id, earned: earned || 0, bonus: bonus || 0 });
    this._set("pointLog", log.slice(-300));          // simpan 300 terakhir saja
  },
  // riwayat terbaru dulu
  riwayat() { return this._get("pointLog", []).slice().reverse(); },

  // tingkatan berdasarkan TOTAL poin (total tidak pernah turun walau poin dibelanjakan)
  LEVEL: [
    { min: 0,   emoji: "🌱", nama: "Pemula" },
    { min: 50,  emoji: "🧭", nama: "Penjelajah Kode" },
    { min: 150, emoji: "🛠️", nama: "Pembuat Karya" },
    { min: 300, emoji: "💻", nama: "Programmer Muda" },
    { min: 500, emoji: "🚀", nama: "Jagoan Kode" },
    { min: 750, emoji: "👑", nama: "Master Coder" }
  ],
  levelOf(total) {
    let i = 0;
    this.LEVEL.forEach((l, k) => { if (total >= l.min) i = k; });
    const now = this.LEVEL[i], next = this.LEVEL[i + 1] || null;
    return { no: i + 1, now: now, next: next, pct: next ? Math.round((total - now.min) / (next.min - now.min) * 100) : 100 };
  },

  // hadiah yang bisa ditukar dengan poin. jenis: "bingkai" (bingkai foto profil) | "gelar" (julukan di bawah nama)
  // Satu-satunya daftar hadiah: dipakai dashboard, halaman poin, dan profil.
  // frameClass = gaya di /shared/css/frames.css, orn = hiasan (p: posisi, a: animasi, s: ukuran)
  HADIAH: [
    { id: "bg_gold",    jenis: "bingkai", emoji: "👑", nama: "Bingkai Mahkota Emas",    harga: 50,  frameClass: "frame-gold",    desc: "Mahkota emas berkilau di atas kepala avatarmu.",
      orn: [{ e: "👑", p: "top", a: "peek", s: 1.6 }] },
    { id: "bg_neon",    jenis: "bingkai", emoji: "💫", nama: "Bingkai Neon Cyber",      harga: 75,  frameClass: "frame-neon",    desc: "Laser neon biru pendar murni berdenyut tajam.",
      orn: [{ e: "💫", p: "tl", a: "wiggle", s: 1.3 }] },
    { id: "bg_matrix",  jenis: "bingkai", emoji: "🤖", nama: "Bingkai Matrix Terminal", harga: 100, frameClass: "frame-matrix",  desc: "Neon hacker hijau digital dengan kode terminal.",
      orn: [{ e: "⚡", p: "tr", a: "wiggle", s: 1 }, { e: "0101", p: "bl", code: true }] },
    { id: "bg_fire",    jenis: "bingkai", emoji: "🔥", nama: "Kobaran Api Petualang",   harga: 120, frameClass: "frame-fire",    desc: "Api membara dengan letupan energi koding penuh semangat.",
      orn: [{ e: "🔥", p: "tr", a: "peek", s: 1.6 }, { e: "💥", p: "bl", s: 1.2 }] },
    { id: "bg_cat",     jenis: "bingkai", emoji: "🐱", nama: "Kucing Mengintip Ceria",  harga: 130, frameClass: "frame-cat",     desc: "Kucing imut yang selalu mengintip dari atas bingkai neon.",
      orn: [{ e: "🐱", p: "top", a: "peek", s: 1.6 }, { e: "🐾", p: "br", s: 1 }] },
    { id: "bg_sea",     jenis: "bingkai", emoji: "🐬", nama: "Akuarium Lumba-lumba",    harga: 140, frameClass: "frame-sea",     desc: "Gelembung laut toska dengan lumba-lumba yang ceria melompat.",
      orn: [{ e: "🐬", p: "tr", a: "wiggle", s: 1.6 }, { e: "🫧", p: "bl", s: 1 }] },
    { id: "bg_rainbow", jenis: "bingkai", emoji: "🍭", nama: "Bingkai Permen Pelangi",  harga: 150, frameClass: "frame-rainbow", desc: "Gradasi pelangi neon lengkap dengan permen manis.",
      orn: [{ e: "🍭", p: "tr", a: "wiggle", s: 1.5 }, { e: "⭐", p: "bl", a: "peek", s: 1.2 }] },
    { id: "bg_space",   jenis: "bingkai", emoji: "🚀", nama: "Roket Orbit Antariksa",   harga: 180, frameClass: "frame-space",   desc: "Roket luar angkasa yang terbang mengitari lingkaran avatarmu.",
      orn: [{ e: "🚀", p: "orbit", s: 1.2 }, { e: "🪐", p: "br", s: 1 }] },
    { id: "bg_galaxy",  jenis: "bingkai", emoji: "🔮", nama: "Bingkai Galaksi Kosmik",  harga: 200, frameClass: "frame-galaxy",  desc: "Aura kosmik ungu dengan taburan bintang bercahaya.",
      orn: [{ e: "✨", p: "tl", a: "wiggle", s: 1.6 }, { e: "🔮", p: "br", a: "peek", s: 1.4 }] },

    { id: "gl_star",    jenis: "gelar",   emoji: "⭐", nama: "Bintang Kelas",    harga: 80 },
    { id: "gl_python",  jenis: "gelar",   emoji: "🐍", nama: "Pawang Python",    harga: 120 },
    { id: "gl_bug",     jenis: "gelar",   emoji: "🕵️", nama: "Detektif Bug",     harga: 150 },
    { id: "gl_web",     jenis: "gelar",   emoji: "🌐", nama: "Arsitek Web",      harga: 180 },
    { id: "gl_robot",   jenis: "gelar",   emoji: "🤖", nama: "Sahabat Robot",    harga: 250 },
    { id: "gl_master",  jenis: "gelar",   emoji: "⚡", nama: "Master Algoritma", harga: 300 }
  ],
  hadiahMilik() { return this._get("hadiahMilik", []); },
  hadiahPakai() { return this._get("hadiahPakai", {}); },
  // saldo = total poin − harga semua hadiah yang sudah dibeli
  saldo() {
    const own = this.hadiahMilik();
    const spent = this.HADIAH.filter(h => own.indexOf(h.id) >= 0).reduce((s, h) => s + h.harga, 0);
    return Math.max(0, this.points() - spent);
  },
  beli(id) {
    const h = this.HADIAH.find(x => x.id === id), own = this.hadiahMilik();
    if (!h) return { ok: false, pesan: "Hadiah tidak ditemukan." };
    if (own.indexOf(id) >= 0) return { ok: false, pesan: "Hadiah ini sudah kamu punya." };
    if (this.saldo() < h.harga) return { ok: false, pesan: "Poinmu belum cukup. Selesaikan task lagi ya!" };
    own.push(id);
    this._set("hadiahMilik", own);
    this.pakai(id);                                   // langsung dipakai
    return { ok: true };
  },
  pakai(id) {
    const h = this.HADIAH.find(x => x.id === id);
    if (!h || this.hadiahMilik().indexOf(id) < 0) return false;
    const p = this.hadiahPakai(); p[h.jenis] = id; this._set("hadiahPakai", p);
    return true;
  },
  lepas(jenis) { const p = this.hadiahPakai(); delete p[jenis]; this._set("hadiahPakai", p); },
  // hadiah yang sedang dipakai: { bingkai: {...}|null, gelar: {...}|null }
  hadiahAktif() {
    const p = this.hadiahPakai(), own = this.hadiahMilik(), out = {};
    ["bingkai", "gelar"].forEach(j => { out[j] = this.HADIAH.find(h => h.id === p[j] && own.indexOf(h.id) >= 0) || null; });
    return out;
  },

  // ============================================================
  // PEMERIKSA DATA — membantu saat menambah task baru.
  // Buka console browser lalu ketik: LP.validate()
  // ============================================================
  validate() {
    const masalah = [];
    const ids = new Set();
    this.tahap.forEach(th => th.pembelajaran.forEach(pb => {
      const where = (t) => pb.id + " / " + (t.title || "(tanpa judul)");
      if (!pb.tasks.length) masalah.push(pb.id + ": belum punya task");
      if (!pb.project) masalah.push(pb.id + ": belum punya project");
      this.items(pb).forEach(t => {
        if (ids.has(t.id)) masalah.push("Id kembar: " + t.id); ids.add(t.id);
        if (!t.title) masalah.push(where(t) + ": judul kosong");
        if (!t.desc) masalah.push(where(t) + ": deskripsi kosong");
        if (!["interactive", "external", "project"].includes(t.type)) masalah.push(where(t) + ": jenis tidak dikenal");
        if (t.type !== "project" && !(t.materi && t.materi.length)) masalah.push(where(t) + ": materi kosong");
        if (t.kind === "quiz" && !(t.quiz && t.quiz.length)) masalah.push(where(t) + ": kuis tanpa soal");
        if (t.kind === "quiz") (t.quiz || []).forEach((q, i) => { if (!q.options || q.answer == null || !q.options[q.answer]) masalah.push(where(t) + ": soal " + (i + 1) + " jawabannya tidak valid"); });
        if (t.type === "external" || t.type === "project") {
          if (!(t.steps && t.steps.length)) masalah.push(where(t) + ": langkah kosong");
          if (!(t.checklist && t.checklist.length)) masalah.push(where(t) + ": checklist kosong");
        }
        if (t.praktik && !this.PRAKTIK[t.praktik]) masalah.push(where(t) + ": praktik tidak dikenal (pakai block / text / external / physical)");
        if (t.kind === "editor" && t.praktik && t.praktik !== "block") masalah.push(where(t) + ": task editor harus praktik block");
        if (t.kind === "code" && t.praktik && t.praktik !== "text") masalah.push(where(t) + ": task kode harus praktik text");
        if (t.kind === "model3d" && !(t.cek && t.cek.length)) masalah.push(where(t) + ": syarat cek (cek) kosong");
        if (t.kind === "code") {
          if (!t.awal) masalah.push(where(t) + ": kode awal (awal) kosong");
          if (!(t.cek && t.cek.length)) masalah.push(where(t) + ": syarat cek (cek) kosong");
        }
        if (t.type === "project" && !t.tujuan) masalah.push(where(t) + ": tujuan project kosong");
        if (t.type === "project" && t.jenis && !this.JENIS[t.jenis]) masalah.push(where(t) + ": jenis project tidak dikenal (pakai block / text / external / fisik)");
        if (t.type === "project" && !t.jenis) masalah.push(where(t) + ": jenis project belum diisi (dianggap external)");
      });
    }));
    if (masalah.length) console.warn("LP.validate: " + masalah.length + " catatan", masalah);
    else console.log("LP.validate: semua data jalur belajar lengkap ✅");
    return masalah;
  }
});

// ---------- beri id, nomor, dan label otomatis ----------
LP.tahap.forEach(th => th.pembelajaran.forEach(pb => {
  pb.tasks.forEach((t, i) => { t.id = pb.id + "-t" + (i + 1); if (!t.halamanMateri) t.halamanMateri = "/SD/materi/sd.html?task=" + t.id; t.no = i + 1; t.label = LP.LABEL[i] || ("Task " + (i + 1)); });
  pb.project.id = pb.id + "-project"; pb.project.type = "project"; pb.project.no = pb.tasks.length + 1; pb.project.label = "Project Akhir";
}));

window.LP = LP;

})();
