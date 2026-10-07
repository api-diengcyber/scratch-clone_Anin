// ============================================================
// DATA KONTEN JALUR BELAJAR — Dieng Cyber Coding
// ------------------------------------------------------------
// FILE INI HANYA BERISI KONTEN. Untuk menambah / mengubah task,
// cukup edit file ini. Mesin (status, poin, kunci) ada di jalur-belajar.js.
//
// Struktur:  Tahap → Pembelajaran/Jalur → Task 1..N → Project Akhir
//
// ---------- CARA MENAMBAH TASK ----------
// Tambahkan satu baris di dalam `tasks: [ ... ]` milik sebuah jalur.
// Id, nomor, label, dan kunci berurutan dibuat otomatis.
//
//   editor(opsi, judul, deskripsi, petunjuk)     → interactive: dicek otomatis di editor Scratch
//   kode(opsi, judul, deskripsi, petunjuk)       → interactive: dicek otomatis di Text Editor (HTML/CSS)
//   kuis(opsi, judul, deskripsi, [soal...])      → interactive: kuis pilihan ganda
//   luar(opsi, judul, deskripsi, langkah, checklist) → external: dikerjakan di luar website
//   proyek(opsi, judul, deskripsi, langkah, checklist) → Project Akhir (satu per jalur)
//
// `opsi` boleh dihilangkan. Isinya (semua boleh dikosongkan):
//   materi:  ["hal yang dipelajari", ...]
//   halamanMateri: "Materi/SD/Tahap 2/3D&Roblox/g2-t1.html"  (alamat halaman materi; kalau diisi, muncul tombol 📺 Lihat Materi di halaman task. File ditaruh di folder Materi/)
//   poin:    15                         (kalau kosong → POIN_TASK / POIN_PROJECT)
//   sukses:  "kapan task interactive dianggap berhasil"
//   gagal:   "kapan task interactive dianggap belum berhasil"
//   awal:    { html: "...", css: "..." } (khusus kode: isi editor saat dibuka & saat Reset; untuk Python/PHP: { python: "..." } / { php: "..." })
//   bahasa:  ["html"]                   (khusus kode: tab yang tampil; kosong = html dan css)
//            ["python"] | ["php"]       (Text Editor menjalankan Python/PHP di browser; hasilnya tampil di kotak Output)
//   langkah: ["langkah 1", ...]         (khusus kode: daftar langkah yang tampil di kartu misi Text Editor, supaya siswa ingat harus ngapain)
//   cek:     [ { teks, tag | css | kode | keluaran | uji } ]  (khusus kode: syarat berhasil, lihat contoh di jalur Website)
//              tag: "h1", isi: true, min: 1        → ada elemen HTML (isi:true = ada tulisannya)
//              css: { pada: "body", prop: ["color"] } → ada aturan CSS (atau kelas: true = ada class)
//              kode: "def "  atau  /for .+ in range/  → tulisan yang harus ada di KODE anak (semua bahasa)
//              keluaran: "halo"  atau  /\d+/          → tulisan yang harus muncul di OUTPUT program Python/PHP setelah ▶ Jalankan
//              uji: (ctx) => true/false            → syarat bebas (ctx.doc, ctx.rules, ctx.html, ctx.css, ctx.python, ctx.php, ctx.kode, ctx.output, ctx.error)
//              Contoh task Python:  kode({ bahasa: ["python"], awal: { python: "# tulis di sini\n" },
//                                         cek: [ { teks: "Mencetak sapaan", keluaran: /halo/i }, { teks: "Memakai variabel", kode: /\w+\s*=/ } ] }, "Judul", "Deskripsi", "Petunjuk")
//   praktik: "block" | "text" | "external" | "physical"   (tombol 🚀 Mulai Praktik; boleh dikosongkan)
//              block    = buka Block Editor (jalur 2D Game)
//              text     = buka Text Editor (jalur Website: HTML + CSS)
//              external = petunjuk + checklist, dikerjakan di aplikasi luar (Roblox Studio, ScratchJr, ...)
//              physical = petunjuk + unggah foto/video, dikerjakan di dunia nyata
//              Kosong → editor(...) = block, kode(...) = text, luar(...) = external, kuis(...) = tanpa praktik.
//              block/text di kuis(...) atau luar(...) membuka editor dalam mode bebas; task tetap selesai lewat kuis/checklist.
//   aplikasi: "Roblox Studio"           (task external: nama aplikasi; kosong → ikut aplikasi Project Akhir jalur itu)
//   tujuan:  "tujuan project"           (khusus proyek)
//   jenis:   "block" | "text" | "external" | "fisik"   (khusus proyek: cara mengerjakan & mengumpulkan)
//              block = Block Editor, text = Text Editor, external = aplikasi luar, fisik = karya nyata (foto/video)
//   aplikasi: "Roblox Studio"           (khusus proyek jenis external: nama aplikasi luar)
//   kumpul:  ["cara mengumpulkan", ...] (khusus proyek)
//   lencana: "🏆 nama hadiah"           (khusus proyek)
//
// Catatan: task `editor` baru butuh syarat cek blok di Scratch/script.js (EDITOR_GOALS).
// ============================================================

(function () {

// ---------- pembuat data (opsi di depan boleh dilewati) ----------
const pisah = (a) => (a[0] && typeof a[0] === "object" && !Array.isArray(a[0])) ? [a[0], a.slice(1)] : [{}, a];
const editor = (...a) => { const [o, [title, desc, hint]] = pisah(a);          return Object.assign({ type: "interactive", kind: "editor", title, desc, hint }, o); };
const kode   = (...a) => { const [o, [title, desc, hint]] = pisah(a);           return Object.assign({ type: "interactive", kind: "code", title, desc, hint }, o); };
const kuis   = (...a) => { const [o, [title, desc, quiz]] = pisah(a);          return Object.assign({ type: "interactive", kind: "quiz", title, desc, quiz }, o); };
const model3d = (...a) => { const [o, [title, desc, hint]] = pisah(a); return Object.assign({ type: "interactive", kind: "model3d", title, desc, hint }, o); };
const bagian = (c) => c.parts.filter((p) => p.shape !== "spawn");   // semua benda selain Tempat Muncul
const luar   = (...a) => { const [o, [title, desc, steps, checklist]] = pisah(a);  return Object.assign({ type: "external", title, desc, steps, checklist }, o); };
const proyek = (...a) => { const [o, [title, desc, steps, checklist]] = pisah(a);  return Object.assign({ type: "project", title, desc, steps, checklist }, o); };

window.LP_DATA = {
  // ---------- POIN (ubah angka di sini) ----------
  POIN_TASK: 10,        // setiap task selesai
  POIN_PROJECT: 50,     // Project Akhir
  BONUS_PERTAMA: 5,     // bonus task interactive yang langsung berhasil di percobaan pertama

  LABEL: ["Kenalan", "Mencoba", "Berkreasi", "Mengembangkan", "Menggabungkan"],
  TIPE: {
    interactive: { icon: "🟢", nama: "Interactive", info: "Dikerjakan langsung di website" },
    external:    { icon: "🔵", nama: "External",    info: "Dikerjakan di aplikasi atau kegiatan nyata" },
    project:     { icon: "🟣", nama: "Project",     info: "Membuat karya" }
  },

  // ============================================================
  // DATA TAHAP
  // ============================================================
  tahap: [
    {
      id: "basic", no: 1, emoji: "🌱", nama: "Tahap 1 — Basic", usia: "7–9 tahun",
      desc: "Kenalan dengan animasi, seni, dan desain lewat kegiatan seru!",
      slogan: "Petualangan seru: animasi, seni komputer, tanah liat, desain rumah, dan kartun!",
      pembelajaran: [

        // ---------------- 1. ANIMASI SEDERHANA ----------------
        {
          id: "p1", emoji: "🎬", warna: "#ff8a5c", judul: "Animasi Sederhana",
          desc: "Bikin karakter bergerak, berbicara, dan bersuara!",
          tasks: [
            editor({"materi": ["Blok Events: when 🚩 clicked", "Blok Motion: move 10 steps", "Cara menjalankan program dengan bendera hijau"], "sukses": "Ada blok \"when 🚩 clicked\" yang tersambung ke \"move 10 steps\", lalu bendera hijau diklik.", "gagal": "Belum ada blok move, atau blok belum tersambung di bawah \"when 🚩 clicked\"."}, "Karakter Bergerak", "Kenalan dengan gerakan! Buat karakter berjalan saat bendera hijau diklik.",
              "Ambil \"when 🚩 clicked\" dari Events, lalu \"move 10 steps\" dari Motion dan tempelkan di bawahnya."),
            editor({"materi": ["Menambah latar belakang (backdrop)", "Blok Looks: switch backdrop to"], "sukses": "Ada blok \"switch backdrop\" atau \"next backdrop\" di bawah \"when 🚩 clicked\", lalu bendera hijau diklik.", "gagal": "Blok ganti latar belum dipakai atau belum tersambung."}, "Ganti Latar", "Sekarang coba ganti latar belakang ceritamu.",
              "Pilih latar baru lewat tombol 🖼️＋ di bawah panggung, lalu pakai blok \"switch backdrop to\" dari Looks."),
            editor({"materi": ["Blok Looks: say dan think", "Menyusun beberapa blok berurutan"], "sukses": "Ada minimal 2 blok say/think dalam satu rangkaian, lalu bendera hijau diklik.", "gagal": "Blok bicara kurang dari 2, atau tidak tersambung dalam satu rangkaian."}, "Karakter Berbicara", "Buat karakter mengobrol: berbicara dan berpikir bergantian.",
              "Pakai \"say\" dan \"think\" dari Looks. Tempel dua atau lebih di bawah \"when 🚩 clicked\"."),
            editor({"materi": ["Blok Sound: start sound", "Menggabungkan suara dengan gerakan atau percakapan"], "sukses": "Ada blok Sound dalam rangkaian yang sama dengan blok Motion atau Looks, lalu bendera hijau diklik.", "gagal": "Blok Sound belum ada, atau berdiri sendiri (tidak satu rangkaian dengan blok aksi)."}, "Tambah Suara", "Beri suara supaya animasimu lebih hidup!",
              "Tambahkan \"start sound\" dari Sound di rangkaian yang sama dengan blok gerak atau say."),
            editor({"materi": ["Menggabungkan Motion, Looks, dan Sound", "Urutan kejadian dalam sebuah cerita"], "sukses": "Satu rangkaian berisi gerak, ganti latar, bicara, dan suara, lalu bendera hijau diklik.", "gagal": "Masih ada jenis blok yang belum dipakai, atau belum semuanya satu rangkaian."}, "Gabungkan Semuanya", "Satukan gerakan, latar, percakapan, dan suara dalam satu rangkaian.",
              "Susun satu rangkaian di bawah \"when 🚩 clicked\": move → switch backdrop → say → start sound.")
          ],
          project: proyek({"jenis": "block", "tujuan": "Membuat animasi cerita pendek yang punya karakter, latar, gerakan, dan percakapan.", "kumpul": ["Jalankan animasimu", "Screenshot atau foto hasilnya", "Unggah fotonya di halaman ini"], "lencana": "🎬 Lencana Animator"}, "Animasi Ceritaku", "Buat animasi cerita pendekmu sendiri! Boleh dibuat di editor di website ini, boleh juga di ScratchJr.",
            ["Pikirkan cerita pendek: siapa tokohnya dan apa yang terjadi?",
             "Pilih karakter dan latar belakang.",
             "Buat karakter bergerak dan berbicara.",
             "Tambahkan suara atau efek jika ada.",
             "Jalankan animasimu, lalu ambil foto atau screenshot hasilnya."],
            ["Ada minimal 1 karakter", "Ada latar belakang", "Ada gerakan", "Ada percakapan",
             "Ada suara atau efek (jika tersedia)", "Ada alur cerita sederhana (awal, tengah, akhir)"])
        },

        // ---------------- 2. SENI DARI KOMPUTER ----------------
        {
          id: "p2", emoji: "🖥️", warna: "#4c9aff", judul: "Seni dari Komputer",
          desc: "Berkarya seni memakai perangkat keras dan perangkat lunak komputer.",
          tasks: [
            editor({ materi: ["Blok Looks: set color effect", "Blok Control: wait", "Memberi jeda supaya perubahan terlihat"],
                     sukses: "Ada minimal 2 blok color effect dan 1 blok wait di bawah \"when 🚩 clicked\", lalu bendera hijau diklik.",
                     gagal: "Blok color effect kurang dari 2, belum ada blok wait, atau belum tersambung di bawah \"when 🚩 clicked\"." },
              "Warna Ajaib", "Ubah warna karaktermu seperti sulap! Beri jeda supaya kamu sempat melihat tiap warna.",
              "Pakai \"change color effect by\" atau \"set color effect to\" dari Looks, lalu \"wait 1 seconds\" dari Control. Susun: warna → tunggu → warna."),
            editor({ materi: ["Blok Control: repeat", "Blok Motion: turn", "Satu lingkaran penuh = 360 derajat"],
                     sukses: "Ada blok turn di dalam blok repeat, dan jumlah ulangan × sudut putarnya minimal 360, lalu bendera hijau diklik.",
                     gagal: "Blok turn belum ada di dalam repeat, atau putarannya belum sampai satu lingkaran penuh (360)." },
              "Putar Satu Lingkaran", "Buat karaktermu berputar satu lingkaran penuh tanpa menyusun blok turn berkali-kali.",
              "Taruh \"turn 15 degrees\" di DALAM \"repeat\". Ubah angka repeat menjadi 24, karena 24 × 15 = 360 derajat."),
            editor({ materi: ["Perulangan dengan repeat", "Mengubah color effect di dalam perulangan", "Jeda di dalam perulangan"],
                     sukses: "Di dalam blok repeat ada blok color effect dan blok wait, lalu bendera hijau diklik.",
                     gagal: "Blok color effect atau blok wait belum berada di dalam repeat." },
              "Pelangi Berputar", "Buat warna karaktermu berganti-ganti terus seperti pelangi.",
              "Di dalam \"repeat 20\", pasang \"change color effect by 25\" lalu \"wait 0.2 seconds\"."),
            editor({ materi: ["Blok Motion: glide to x y", "Koordinat x dan y di panggung", "Membuat jalur gerak seperti garis lukisan"],
                     sukses: "Ada minimal 3 blok glide dengan tujuan yang berbeda-beda, lalu bendera hijau diklik.",
                     gagal: "Blok glide kurang dari 3, atau tujuannya (x dan y) masih sama semua." },
              "Lukis dengan Gerakan", "Buat karaktermu meluncur ke beberapa tempat dan membentuk jalur seperti lukisan.",
              "Pakai \"glide 1 secs to x: y:\" tiga kali dengan angka berbeda, misalnya (-100, 80), (100, 80), lalu (0, -80) sehingga membentuk segitiga."),
            editor({ materi: ["Menggabungkan perulangan, gerak, dan tampilan", "Merencanakan sebuah pertunjukan seni"],
                     sukses: "Satu rangkaian berisi ganti latar, repeat yang berisi blok Motion dan blok Looks, serta blok bicara, lalu bendera hijau diklik.",
                     gagal: "Masih ada bagian yang belum dipakai, atau repeat belum berisi blok Motion dan blok Looks." },
              "Karya Seni Bergerak", "Satukan semuanya: latar baru, perulangan gerak dan warna, lalu karaktermu menyapa penonton.",
              "Susun: switch backdrop → repeat 12 { turn 30, change color effect by 25 (atau change size), wait 0.2 } → say. Semuanya di bawah \"when 🚩 clicked\".")
          ],
          project: proyek({"jenis": "external", "aplikasi": "aplikasi gambar di komputer", "tujuan": "Membuat satu poster digital yang memakai gambar, warna, dan tulisan buatanmu sendiri.", "kumpul": ["Simpan posternya di komputer", "Foto atau screenshot hasilnya", "Unggah fotonya di halaman ini"], "lencana": "🎨 Lencana Seniman Digital"}, "Poster Seni Digitalku", "Buat satu poster seni dari komputer memakai semua yang sudah kamu pelajari.",
            ["Pilih tema posternya, misalnya hewan, taman, atau kota.", "Gambar dan beri warna.", "Tambahkan judul poster.", "Simpan, lalu foto atau screenshot hasilnya."],
            ["Posterku punya gambar", "Posterku berwarna", "Posterku punya judul", "Aku memakai ide dari Task 1–5"])
        },

        // ---------------- 3. MEMAHAT TANAH LIAT ----------------
        {
          id: "p3", emoji: "🏺", warna: "#c9843f", judul: "Memahat Tanah Liat",
          desc: "Meremas, menggulung, dan memahat tanah liat menjadi karya.",
          tasks: [
            editor({ materi: ["Blok Events: when key pressed", "Karakter bergerak karena tombol", "Menguji dengan bendera hijau dan keyboard"],
                     sukses: "Ada blok \"when key pressed\" yang tersambung ke blok Motion, lalu bendera hijau diklik.",
                     gagal: "Belum ada \"when key pressed\", atau belum ada blok Motion yang tersambung di bawahnya." },
              "Gerak dengan Tombol", "Sekarang karaktermu bergerak karena kamu menekan tombol, bukan hanya bendera hijau!",
              "Ambil \"when space key pressed\" dari Events, lalu pasang \"change x by 10\" dari Motion di bawahnya. Klik bendera hijau, lalu coba tekan tombolnya."),
            editor({ materi: ["Beberapa blok event sekaligus", "Memilih tombol yang berbeda", "Gerak ke atas, bawah, kiri, dan kanan"],
                     sukses: "Ada minimal 4 blok \"when key pressed\" dengan tombol yang berbeda-beda, masing-masing tersambung ke blok Motion, lalu bendera hijau diklik.",
                     gagal: "Blok \"when key pressed\" kurang dari 4, tombolnya ada yang sama, atau ada yang belum punya blok Motion." },
              "Pahat ke Empat Arah", "Buat karaktermu bisa digerakkan ke atas, bawah, kiri, dan kanan dengan tombol panah.",
              "Buat 4 rangkaian. Ganti tombol tiap \"when key pressed\" menjadi panah atas, bawah, kiri, kanan. Pakai \"change y by 10\" untuk atas/bawah (angka negatif untuk bawah) dan \"change x by 10\" untuk kanan/kiri."),
            editor({ materi: ["Blok Events: when this sprite clicked", "Blok Looks: next costume dan say", "Karakter yang bereaksi saat diklik"],
                     sukses: "Ada blok \"when this sprite clicked\" yang tersambung ke minimal 2 blok Looks, lalu bendera hijau diklik.",
                     gagal: "Belum ada \"when this sprite clicked\", atau blok Looks di bawahnya kurang dari 2." },
              "Sentuh untuk Berubah", "Buat karaktermu berubah bentuk dan berbicara saat diklik.",
              "Ambil \"when this sprite clicked\" dari Events. Pasang \"next costume\" dan \"say\" dari Looks di bawahnya."),
            editor({ materi: ["Blok Looks: change size by", "Angka positif membesar, angka negatif mengecil", "Dua tombol berbeda untuk dua aksi"],
                     sukses: "Ada satu tombol yang membesarkan karakter (angka positif), satu tombol lain yang mengecilkannya (angka negatif), lalu bendera hijau diklik.",
                     gagal: "Belum ada blok change size dengan angka positif dan negatif di dua tombol yang berbeda." },
              "Besar dan Kecil", "Seperti memahat: satu tombol untuk membesarkan, satu tombol untuk mengecilkan karakter.",
              "Buat dua rangkaian \"when key pressed\" dengan tombol berbeda. Yang pertama: \"change size by 10\". Yang kedua: \"change size by -10\"."),
            editor({ materi: ["Menggabungkan event tombol dan klik", "Menggabungkan gerak, ukuran, dan suara"],
                     sukses: "Ada minimal 2 tombol berbeda yang menggerakkan karakter, 1 klik sprite yang mengubah tampilan, dan 1 blok Sound di salah satu rangkaian, lalu bendera hijau diklik.",
                     gagal: "Masih ada bagian yang belum dipakai: tombol gerak, klik sprite, atau blok Sound." },
              "Studio Pahat", "Gabungkan semuanya menjadi satu studio mini: tombol untuk bergerak, klik untuk berubah, dan suara!",
              "Buat 2 rangkaian \"when key pressed\" + gerak (tombol berbeda), 1 rangkaian \"when this sprite clicked\" + blok Looks, lalu tambahkan \"start sound\" di salah satunya.")
          ],
          project: proyek({"jenis": "fisik", "tujuan": "Membuat satu patung tanah liat yang bentuknya jelas dan punya detail.", "kumpul": ["Biarkan karyamu mengering di tempat teduh", "Foto karyamu dari depan", "Unggah fotonya di halaman ini"], "lencana": "🏺 Lencana Pemahat Cilik"}, "Patung Tanah Liat Favoritku", "Pahat satu karya tanah liat yang paling kamu suka.",
            ["Pilih benda atau hewan yang ingin kamu buat.", "Bentuk dan beri detail.", "Biarkan mengering di tempat teduh.", "Foto karyamu."],
            ["Karyaku punya bentuk yang jelas", "Karyaku punya detail", "Aku memakai ide dari Task 1–5"])
        },

        // ---------------- 4. MENDESAIN RUMAH ----------------
        {
          id: "p4", emoji: "🏠", warna: "#3fbf7f", judul: "Mendesain Rumah",
          desc: "Rancang rumah impianmu dari atap sampai taman.",
          tasks: [
            editor({ materi: ["Variabel: tempat menyimpan angka", "Blok set variable", "Menampilkan isi variabel"],
                     sukses: "Ada blok \"set variable\" di bawah \"when 🚩 clicked\", dan nilainya ditampilkan (show variable atau say yang memakai variabel), lalu bendera hijau diklik.",
                     gagal: "Belum ada blok \"set variable\", atau nilainya belum ditampilkan." },
              "Hitung Jendela", "Rumahmu punya beberapa jendela. Simpan jumlahnya di sebuah variabel, lalu tampilkan.",
              "Dari Variables, pakai \"set my variable to 4\". Lalu pakai \"show variable\", atau taruh blok variabel \"my variable\" di dalam blok \"say\"."),
            editor({ materi: ["Blok change variable", "Variabel di dalam perulangan", "Menghitung satu per satu"],
                     sukses: "Ada \"set variable\", lalu repeat yang berisi \"change variable\", dan hasilnya diucapkan dengan blok say, lalu bendera hijau diklik.",
                     gagal: "Blok \"change variable\" belum ada di dalam repeat, atau belum ada say yang memakai variabel." },
              "Tambah Satu-satu", "Hitung jumlah jendela sampai 5 dengan menambah satu demi satu.",
              "Susun: set my variable to 0 → repeat 5 { change my variable by 1 } → say (taruh blok \"my variable\" di dalam say)."),
            editor({ materi: ["Percabangan: blok if", "Syarat dengan sensor (key pressed, touching)", "Perulangan yang terus mengecek"],
                     sukses: "Ada blok if di dalam repeat, memakai syarat dari Sensing, dan di dalamnya ada blok Motion atau Looks, lalu bendera hijau diklik.",
                     gagal: "Blok if belum ada di dalam repeat, belum memakai syarat dari Sensing, atau masih kosong." },
              "Pintu Otomatis", "Buat pintu yang hanya terbuka kalau tombol ditekan.",
              "Susun: repeat 30 { if <key space pressed?> then { say \"Pintu terbuka!\" }, wait 0.1 seconds }. Syarat \"key pressed?\" ada di Sensing. Lalu klik bendera hijau dan tekan spasi."),
            editor({ materi: ["Blok if-else", "Membandingkan angka (>, <, =)", "Dua pilihan: kalau ya dan kalau tidak"],
                     sukses: "Ada blok if-else dengan syarat perbandingan, kedua jalurnya berisi blok, dan salah satunya mengganti latar, lalu bendera hijau diklik.",
                     gagal: "Blok if-else belum punya syarat perbandingan, salah satu jalurnya masih kosong, atau belum ada blok ganti latar." },
              "Siang atau Malam", "Buat latar berubah jadi malam kalau angkanya besar, dan jadi siang kalau tidak.",
              "Pakai \"if-else\" dari Control. Syaratnya: <my variable > 5> dari Operators. Di jalur \"if\": switch backdrop ke malam. Di jalur \"else\": switch backdrop ke siang."),
            editor({ materi: ["Menggabungkan variabel, perulangan, dan percabangan", "Mengambil keputusan dari hasil hitungan"],
                     sukses: "Ada \"set variable\", repeat yang berisi \"change variable\" dan if/if-else yang membandingkan variabel, serta blok bicara, lalu bendera hijau diklik.",
                     gagal: "Masih ada bagian yang belum dipakai: variabel, repeat, perbandingan variabel di if, atau blok bicara." },
              "Rumah Pintar", "Rumahmu menghitung jumlah lampu yang menyala, lalu mengambil keputusan sendiri!",
              "Susun: set my variable to 0 → repeat 5 { change my variable by 1, if <my variable = 3> then { say \"Separuh lampu menyala!\" } }.")
          ],
          project: proyek({"jenis": "fisik", "tujuan": "Merancang rumah impian lengkap dengan tampak depan, taman, dan denah ruangan.", "kumpul": ["Selesaikan gambar rumah dan denahnya", "Foto atau screenshot hasilnya", "Unggah fotonya di halaman ini"], "lencana": "🏠 Lencana Arsitek Cilik"}, "Rumah Impianku", "Desain rumah impianmu lengkap dengan warna, taman, dan denah ruangan.",
            ["Gambar rumah tampak depan.", "Beri warna dan taman.", "Buat denah sederhana di sampingnya.", "Foto atau screenshot hasilnya."],
            ["Ada gambar rumah tampak depan", "Ada warna dan taman", "Ada denah ruangan", "Aku memakai ide dari Task 1–5"])
        },

        // ---------------- 5. PROYEK ANIMASI SCRATCHJR ----------------
        {
          id: "p5", emoji: "🐷", warna: "#ff6fa5", judul: "Animasi ala Peppa Pig",
          desc: "Bikin animasi cerita keluarga hewan lucu memakai ScratchJr.",
          tasks: [
            editor({ materi: ["Blok Events: broadcast", "Blok Events: when I receive", "Dua rangkaian blok saling mengirim pesan"],
                     sukses: "Ada blok broadcast di bawah \"when 🚩 clicked\", dan ada \"when I receive\" dengan pesan yang sama yang berisi blok say atau think, lalu bendera hijau diklik.",
                     gagal: "Belum ada broadcast, belum ada \"when I receive\", pesannya berbeda, atau rangkaian penerima belum berisi say/think." },
              "Kirim Pesan", "Seorang tokoh mengirim pesan, lalu tokoh lain menerimanya dan menjawab.",
              "Rangkaian 1: when 🚩 clicked → broadcast message1. Rangkaian 2: when I receive message1 → say \"Halo juga!\". Pastikan nama pesannya sama."),
            editor({ materi: ["Pergantian adegan dengan pesan", "Blok say for seconds dan wait", "Menyusun adegan cerita"],
                     sukses: "Ada broadcast di bawah \"when 🚩 clicked\", dan \"when I receive\" berisi ganti latar serta say for seconds atau wait, lalu bendera hijau diklik.",
                     gagal: "Belum ada broadcast, atau rangkaian penerima belum berisi ganti latar dan say for seconds / wait." },
              "Ganti Adegan", "Pesan yang diterima membuat latar berganti dan tokoh bercerita sebentar.",
              "Di rangkaian \"when I receive\", pasang \"switch backdrop to\" lalu \"say Selamat datang! for 2 seconds\"."),
            editor({ materi: ["Blok Sensing: ask and wait", "Blok answer", "Menggabungkan kata dengan blok join"],
                     sukses: "Ada \"ask and wait\", lalu say yang memakai blok join dan answer (jawaban), lalu bendera hijau diklik dan jawabannya diketik.",
                     gagal: "Belum ada \"ask and wait\", atau say belum memakai join dan answer." },
              "Tanya Jawab", "Tokohmu menanyakan nama, lalu menyapa dengan nama itu!",
              "Susun: ask \"Siapa namamu?\" and wait → say <join \"Halo, \" (answer)>. \"ask\" dan \"answer\" ada di Sensing, \"join\" ada di Operators."),
            editor({ materi: ["Gerak berulang saat menerima pesan", "Menambah suara pada adegan", "Gabungan broadcast, repeat, dan Sound"],
                     sukses: "Ada broadcast, dan \"when I receive\" berisi repeat dengan blok Motion di dalamnya serta blok Sound, lalu bendera hijau diklik.",
                     gagal: "Belum ada broadcast, atau rangkaian penerima belum berisi repeat berisi Motion dan blok Sound." },
              "Melompat Riang", "Saat pesan diterima, tokohmu melompat-lompat sambil bersuara.",
              "Di rangkaian \"when I receive\": repeat 5 { change y by 20, wait 0.1 seconds, change y by -20 } lalu tambahkan \"start sound\"."),
            editor({ materi: ["Beberapa pesan untuk beberapa adegan", "Membuat pesan baru (new message)", "Menggabungkan cerita lengkap"],
                     sukses: "Ada minimal 2 pesan berbeda yang diterima oleh 2 rangkaian \"when I receive\", ada ganti latar, bicara, suara, dan repeat, lalu bendera hijau diklik.",
                     gagal: "Pesan belum ada 2 yang berbeda, atau masih ada bagian cerita yang belum dipakai." },
              "Cerita Keluarga Hewan", "Susun cerita lengkap dengan dua adegan: awal dan akhir cerita.",
              "Buat pesan baru lewat \"new message\" di blok broadcast. Adegan 1 (pesan1): ganti latar + say + suara. Adegan 2 (pesan2): repeat gerak + say. Kirim keduanya dari \"when 🚩 clicked\".")
          ],
          project: proyek({"jenis": "external", "aplikasi": "ScratchJr", "tujuan": "Membuat animasi cerita keluarga hewan di ScratchJr dengan gerakan, percakapan, dan suara.", "kumpul": ["Jalankan animasimu sampai selesai", "Foto layar saat animasi berjalan", "Unggah fotonya di halaman ini"], "lencana": "🐷 Lencana Sutradara Cilik"}, "Animasi Cerita Keluarga Hewan", "Buat animasi ceritamu sendiri tentang keluarga hewan lucu memakai ScratchJr. Gambar atau pilih karakter hewan kesukaanmu.",
            ["Pikirkan cerita pendek tentang keluarga hewan.", "Susun halaman demi halaman di ScratchJr.", "Tambahkan gerakan, percakapan, dan suara.", "Foto layar saat animasimu berjalan."],
            ["Ada minimal 1 karakter", "Ada latar belakang", "Ada gerakan dan percakapan", "Ada suara atau efek", "Ada alur cerita sederhana"])
        }
      ]
    },
    // ============================================================
    // TAHAP 2 — EXPLORE (usia 10–12). Anak mencoba SEMUA jalur (tanpa mode pilih-jalur); laporan membaca kecenderungannya.
    // Setiap jalur memakai struktur yang sama: Task 1–5 → Project Akhir.
    // Task Game (Block Editor) dan Website (Text Editor) dicek otomatis; task 3D dikerjakan di aplikasi luar (Tinkercad, Roblox Studio).
    // ============================================================
    {
      id: "explore", no: 2, emoji: "🌟", nama: "Tahap 2 — Explore", usia: "10–12 tahun",
      desc: "Coba semua jalur, temukan mana yang paling seru buatmu!",
      slogan: "Coba semuanya: buat game, bangun dunia 3D, dan bikin website!",
      pembelajaran: [

        // ---------------- JALUR 1: GAME DEVELOPMENT (2D) ----------------
        {
          id: "g1", emoji: "🎮", warna: "#7c3aed", judul: "Game Development",
          tagline: "Buat game dan belajar bagaimana game bekerja!",
          desc: "Jalur 2D Game Development: dari karakter berjalan, kontrol, skor, dan waktu sampai project game sederhana.",
          topik: ["Karakter berjalan", "Kontrol tombol", "Skor dan variabel", "Batas waktu", "Game mini lengkap", "Project game"],
          tasks: [
            editor({"materi": ["Mengganti kostum (costume)", "Blok repeat (ulangi)", "Jeda dengan blok wait"], "sukses": "Di dalam blok repeat ada \"next costume\", \"move\", dan \"wait\", semuanya di bawah \"when 🚩 clicked\", lalu bendera hijau diklik.", "gagal": "Salah satu blok (next costume, move, wait) belum ada di dalam repeat, atau belum di bawah \"when 🚩 clicked\"."}, "Karakter Berjalan", "Buat karaktermu terlihat berjalan dengan mengganti kostum berulang-ulang.",
              "Susun di bawah \"when 🚩 clicked\": repeat 10 { next costume, move 5 steps, wait 0.2 seconds }. Kalau karaktermu cuma punya satu kostum, pilih sprite lain yang punya lebih dari satu kostum."),
            editor({"materi": ["Blok when key pressed", "Gerak ke empat arah dengan change x dan change y", "Lompat: naik, tunggu, lalu turun"], "sukses": "Ada 4 tombol berbeda yang menggerakkan karakter, dan satu tombol membuat karakter melompat (naik, wait, lalu turun), lalu bendera hijau diklik.", "gagal": "Tombol yang berbeda kurang dari 4, ada tombol tanpa blok gerak, atau belum ada tombol untuk melompat."}, "Kendalikan Karakter", "Sekarang kamu yang memegang kendali! Gerakkan karakter dengan tombol, dan buat dia bisa melompat.",
              "Buat 4 rangkaian \"when key pressed\" (panah kiri, kanan, atas, bawah) dengan \"change x by\" atau \"change y by\". Untuk lompat: \"when space key pressed\" → change y by 40 → wait 0.2 seconds → change y by -40."),
            editor({"materi": ["Variabel: tempat menyimpan skor", "Blok change variable", "Pindah ke posisi acak", "Klik sprite"], "sukses": "Skor diisi 0 saat bendera diklik dan ditampilkan, lalu saat sprite diklik skor bertambah dan sprite pindah ke posisi acak.", "gagal": "Belum ada \"set variable\" di bawah bendera, skor belum ditampilkan, atau rangkaian klik sprite belum menambah skor dan pindah posisi acak."}, "Kumpulkan Bintang", "Buat game klik: setiap kali karakter berhasil diklik, skor bertambah dan karakter pindah tempat!",
              "Di Variables, tekan \"Make a Variable\" lalu beri nama skor. Rangkaian 1: when 🚩 clicked → set skor to 0 → show variable skor. Rangkaian 2: when this sprite clicked → change skor by 1 → go to random position."),
            editor({"materi": ["Variabel waktu", "Mengurangi angka (change variable dengan angka negatif)", "Pesan saat game berakhir"], "sukses": "Waktu diisi di awal, berkurang di dalam repeat (change dengan angka negatif) dengan wait, lalu ada say atau stop setelah repeat selesai.", "gagal": "Belum ada \"set variable\", waktu belum berkurang di dalam repeat, belum ada wait, atau belum ada say / stop setelah repeat."}, "Waktu Berjalan Mundur", "Tambahkan batas waktu 10 detik. Saat waktu habis, game selesai!",
              "Buat variabel waktu. Susun: when 🚩 clicked → set waktu to 10 → repeat 10 { wait 1 seconds, change waktu by -1 } → say \"Waktu habis!\" for 2 seconds."),
            editor({"materi": ["Menggabungkan skor, waktu, dan klik", "Percabangan: menang atau kalah", "Menguji dan memperbaiki game"], "sukses": "Ada variabel skor dan waktu, waktu berkurang di dalam repeat dengan wait, klik sprite menambah skor dan pindah posisi acak, dan ada if / if-else yang membandingkan skor lalu say, lalu bendera hijau diklik.", "gagal": "Masih ada bagian yang belum dipakai: dua variabel, waktu berkurang, klik menambah skor, atau if yang membandingkan skor."}, "Game Mini Lengkap", "Satukan semuanya: kejar skor sebelum waktu habis, lalu tampilkan menang atau kalah!",
              "Rangkaian bendera: set skor to 0 → set waktu to 10 → repeat 10 { wait 1, change waktu by -1 } → if-else <skor > 4> { say \"Kamu menang!\" } else { say \"Coba lagi!\" }. Rangkaian klik: when this sprite clicked → change skor by 1 → go to random position.")
            ,editor({"materi": ["Mengganti latar (backdrop)", "Mengganti kostum dan ukuran karakter", "Jeda dengan blok wait agar perubahan terlihat"], "sukses": "Di bawah \"when 🚩 clicked\" ada blok ganti latar, blok ganti kostum, blok ukuran (set size atau change size), dan wait, lalu bendera hijau diklik.", "gagal": "Salah satu blok (ganti latar, ganti kostum, ukuran, wait) belum ada, atau belum di bawah \"when 🚩 clicked\"."}, "Mendekorasi Panggung Game", "Atur tampilan gamemu: ganti latar, pilih kostum, dan atur ukuran karakter supaya game terlihat menarik.",
              "Susun di bawah \"when 🚩 clicked\": switch backdrop to backdrop2 → switch costume to costume2 → set size to 150 % → wait 1 seconds → next backdrop.")
          ],
          project: proyek({"jenis": "block", "tujuan": "Membuat satu game Scratch sederhana yang punya karakter, skor, batas waktu, dan pesan menang atau kalah.", "kumpul": ["Mainkan gamemu sampai selesai", "Screenshot gamemu", "Unggah screenshot di halaman ini"], "lencana": "🎮 Lencana Game Developer"}, "Game Sederhanaku", "Buat game buatanmu sendiri memakai semua yang sudah kamu pelajari. Tantangan bonus (boleh dilewati): game platformer atau Flappy Bird di Scratch asli.",
            ["Tulis ide game: tema, tokoh, dan tujuannya.", "Pilih karakter dan latar belakang.", "Buat gerakan dan kontrol: tombol atau klik.", "Tambahkan skor, batas waktu, dan pesan menang atau kalah.", "Ajak temanmu mencoba, lalu perbaiki bagian yang membingungkan.", "Ambil screenshot gamemu dan unggah di sini."],
            ["Game-ku punya ide dan tema yang jelas", "Ada karakter yang bisa digerakkan atau diklik", "Ada skor", "Ada batas waktu atau tantangan", "Ada pesan menang atau kalah", "Aku memakai ide dari Task 1–5"])
        },

        // ---------------- JALUR 2: 3D & ROBLOX ----------------
        {
          id: "g2", emoji: "🧊", warna: "#c026d3", judul: "3D & Roblox",
          tagline: "Bangun dunia dan karya 3D-mu sendiri!",
          desc: "Jalur 3D: membangun benda dan dunia 3D langsung di 3D Editor, dengan istilah seperti di Roblox.",
          topik: ["Bentuk 3D", "Warna dan ukuran", "Menyusun benda", "Tempat muncul", "Dunia 3D mini", "Project 3D"],
          tasks: [
            model3d({"materi": ["Benda 3D punya lebar, tinggi, dan panjang", "Menambah benda", "Memutar pandangan"], "halamanMateri": "Materi/SD/Tahap 2/3D&Roblox/g2-t1.html", "langkah": ["Klik tombol 🟦 Balok di bagian atas.", "Tahan klik di dunia 3D, lalu geser mouse untuk memutar pandanganmu.", "Putar roda mouse untuk mendekat dan menjauh."], "cek": [
                { teks: "Ada 1 benda di dunia", uji: (c) => bagian(c).length >= 1 },
                { teks: "Kamu sudah memutar pandangan", uji: (c) => c.orbited }
              ]}, "Kenalan dengan 3D", "Tambahkan bendamu yang pertama dan lihat dari berbagai sisi.",
              "Kalau pandangannya aneh, cukup putar lagi pelan-pelan."),
            model3d({"materi": ["Empat bentuk dasar", "Alat Geser", "Explorer"], "langkah": ["Klik 🟦 Balok, ⚪ Bola, 🥫 Tabung, dan 🔺 Kerucut.", "Pilih alat ✋ Geser, lalu seret setiap benda ke tempat yang berbeda.", "Lihat daftar bendamu di panel Explorer."], "cek": [
                { teks: "Ada 4 bentuk yang berbeda", uji: (c) => new Set(bagian(c).map((p) => p.shape)).size >= 4 },
                { teks: "Benda-bendanya tidak menumpuk di tempat yang sama", uji: (c) => new Set(bagian(c).map((p) => p.pos[0] + "," + p.pos[2])).size >= 4 }
              ]}, "Empat Bentuk Dasar", "Coba semua bentuk dasar dan letakkan di tempat berbeda.",
              "Alat ✋ Geser menggeser benda di lantai. Benda baru muncul di tempat berbeda-beda."),
            model3d({"materi": ["Warna", "Ukuran (Size)", "Properties"], "langkah": ["Klik sebuah benda, lalu pilih warna di panel Properties.", "Beri minimal 3 warna yang berbeda.", "Pilih alat 📏 Ukuran lalu seret benda ke atas, atau ubah angka Size di Properties."], "cek": [
                { teks: "Ada minimal 3 warna berbeda", uji: (c) => new Set(bagian(c).map((p) => p.color)).size >= 3 },
                { teks: "Ada benda yang ukurannya sudah diubah", uji: (c) => bagian(c).some((p) => p.size.some((v) => v !== 2)) }
              ]}, "Warna dan Ukuran", "Beri warna dan ubah ukuran bendamu.",
              "Size punya 3 angka: lebar, tinggi, dan panjang."),
            model3d({"materi": ["Menyusun benda", "Position (posisi)", "Memutar benda"], "langkah": ["Tambahkan 🟦 Balok untuk dinding dan 🔺 Kerucut untuk atap.", "Klik atap, lalu di Properties ubah angka Position yang tengah (naik-turun) sampai atap duduk di atas dinding.", "Tambahkan satu benda lagi, misalnya pintu."], "cek": [
                { teks: "Ada minimal 3 benda", uji: (c) => bagian(c).length >= 3 },
                { teks: "Ada balok untuk dinding", uji: (c) => bagian(c).some((p) => p.shape === "box") },
                { teks: "Atap kerucut ada di atas dinding", uji: (c) => { const w = bagian(c).filter((p) => p.shape === "box"); return bagian(c).filter((p) => p.shape === "cone").some((k) => w.some((d) => k.pos[1] - k.size[1] / 2 >= d.pos[1] + d.size[1] / 2 - 0.3)); } }
              ]}, "Susun Jadi Rumah", "Susun beberapa bentuk menjadi sebuah rumah.",
              "Dinding tinggi 2 berada di posisi naik-turun 1. Kerucut tinggi 2 dipasang di posisi 3."),
            model3d({"materi": ["Menyusun ke atas", "Menggandakan benda"], "langkah": ["Tambahkan satu benda, lalu klik 📋 Gandakan.", "Naikkan tiap salinan sampai menara punya 4 tingkat.", "Beri warna yang berbeda untuk tiap tingkat."], "cek": [
                { teks: "Menara punya minimal 4 tingkat", uji: (c) => new Set(bagian(c).map((p) => Math.round(p.pos[1] * 2))).size >= 4 },
                { teks: "Ada minimal 3 warna", uji: (c) => new Set(bagian(c).map((p) => p.color)).size >= 3 }
              ]}, "Menara Tinggi", "Bangun menara yang tinggi dan berwarna-warni.",
              "Tiap tingkat naik 2 dari tingkat di bawahnya jika ukurannya 2."),
            model3d({"materi": ["Tempat Muncul (SpawnLocation)", "Tombol Main"], "langkah": ["Klik ⭐ Tempat Muncul.", "Geser ke tempat yang kamu mau.", "Klik ▶ Main dan lihat tokohmu muncul di sana."], "cek": [
                { teks: "Ada Tempat Muncul", uji: (c) => c.parts.some((p) => p.shape === "spawn") },
                { teks: "Kamu sudah klik ▶ Main", uji: (c) => c.played }
              ]}, "Tempat Muncul", "Tentukan di mana pemain pertama kali muncul.",
              "Klik ⏹ Berhenti untuk kembali membangun."),
            model3d({"materi": ["Anchored (dipaku)", "Benda jatuh karena gravitasi"], "langkah": ["Tambahkan 2 benda. Pastikan benda pertama tetap Anchored.", "Pilih benda kedua, matikan ⚓ Anchored di Properties, lalu naikkan posisinya sampai melayang.", "Klik ▶ Main dan lihat apa yang terjadi."], "cek": [
                { teks: "Ada benda yang Anchored", uji: (c) => bagian(c).some((p) => p.anchored) },
                { teks: "Ada benda tidak Anchored yang melayang", uji: (c) => bagian(c).some((p) => !p.anchored && p.pos[1] - p.size[1] / 2 >= 1) },
                { teks: "Kamu sudah klik ▶ Main", uji: (c) => c.played }
              ]}, "Anchored: Dipaku atau Jatuh", "Benda yang tidak Anchored akan jatuh. Coba sendiri!",
              "Benda Anchored seperti dipaku. Benda tanpa Anchored akan jatuh saat Main."),
            model3d({"materi": ["Menjelajah dunia 3D", "Berjalan dan melompat"], "langkah": ["Pasang ⭐ Tempat Muncul dan minimal 3 benda.", "Klik ▶ Main.", "Jalan dengan W A S D (atau panah), lalu lompat dengan Spasi."], "cek": [
                { teks: "Ada Tempat Muncul", uji: (c) => c.parts.some((p) => p.shape === "spawn") },
                { teks: "Ada minimal 3 benda", uji: (c) => bagian(c).length >= 3 },
                { teks: "Kamu sudah berjalan", uji: (c) => c.walked },
                { teks: "Kamu sudah melompat", uji: (c) => c.jumped }
              ]}, "Jalan-jalan di Duniamu", "Coba jalan dan melompat di dunia buatanmu.",
              "Tokohmu bisa naik ke benda yang rendah, dan melompat ke benda yang lebih tinggi.")
          ],
          project: proyek({"jenis": "model3d", "tujuan": "Membangun dunia 3D mini dengan minimal 3 bendamu sendiri dan tempat muncul pemain.", "kumpul": ["Uji duniamu dengan tombol Main", "Ambil screenshot duniamu", "Unggah screenshot di halaman ini"], "lencana": "🧊 Lencana Pembangun 3D"}, "Dunia 3D-ku", "Bangun dunia 3D mini buatanmu sendiri.",
            ["Pilih tema duniamu: kota mini, taman, atau pulau.", "Bangun minimal 3 benda buatanmu.", "Pasang Tempat Muncul, lalu uji dengan ▶ Main.", "Klik 📸 Screenshot, lalu unggah gambarnya di halaman Project."],
            ["Duniaku punya tema yang jelas", "Ada minimal 3 benda", "Ada Tempat Muncul dan sudah diuji", "Aku memakai ide dari Task 1–8"])
        },

        // ---------------- JALUR 3: WEBSITE DEVELOPMENT ----------------
        {
          id: "g3", emoji: "🌐", warna: "#437f08", judul: "Website Development",
          tagline: "Belajar membuat website dengan kode!",
          desc: "Jalur Website Development: HTML dan CSS, sampai project website sederhana.",
          topik: ["HTML", "CSS", "Daftar dan menu", "Website statis", "Project website"],
          tasks: [
            // ---- Task 1–4: satu website yang sama dibangun bertahap di Text Editor (tema bebas: hobi / hal yang disukai) ----
            // Langkah-langkah (`langkah`) tampil di kartu misi Text Editor supaya siswa selalu ingat harus ngapain.
            kode({
              materi: ["Coding tekstual", "Fungsi HTML dan CSS", "Kontras warna agar mudah dibaca"],
              langkah: [
                "Kenali dua tab: index.html untuk ISI halaman (HTML), style.css untuk TAMPILAN (CSS).",
                "Di tab index.html, tulis judul websitemu di dalam <h1>, misalnya: Hobi Gamingku.",
                "Tulis 1 kalimat perkenalan di dalam <p>.",
                "Di bawah <h2>Hobiku</h2>, tulis minimal 3 hobimu. Satu hobi = satu <li>.",
                "Pindah ke tab style.css. Beri body warna latar (background-color).",
                "Beri <h1> warna tulisan (color). Pilih warna yang KONTRAS dengan latar supaya mudah dibaca!",
                "Klik ▶ Jalankan. Websitemu yang pertama sudah jadi!"
              ],
              awal: {
                html: "<!DOCTYPE html>\n<html>\n<head>\n  <title>Websiteku</title>\n  <link rel=\"stylesheet\" href=\"style.css\">\n</head>\n<body>\n  <!-- LANGKAH 2: tulis judul websitemu di antara <h1> dan </h1> -->\n  <h1></h1>\n\n  <!-- LANGKAH 3: tulis perkenalan singkat -->\n  <p></p>\n\n  <h2>Hobiku</h2>\n  <!-- LANGKAH 4: satu hobi = satu <li>. Tambahkan sampai minimal 3 -->\n  <ul>\n    <li></li>\n  </ul>\n</body>\n</html>\n",
                css: "/* LANGKAH 5: warna latar halaman */\nbody {\n  \n}\n\n/* LANGKAH 6: warna tulisan judul (pilih yang kontras dengan latar) */\nh1 {\n  \n}\n"
              },
              cek: [
                { teks: "Ada judul <h1> yang ada tulisannya", tag: "h1", isi: true },
                { teks: "Ada perkenalan <p> yang ada tulisannya", tag: "p", isi: true },
                { teks: "Ada minimal 3 hobi di daftar <li>", tag: "ul li", isi: true, min: 3 },
                { teks: "body punya warna latar (background-color)", css: { pada: "body", prop: ["background-color"] } },
                { teks: "h1 punya warna tulisan (color)", css: { pada: "h1", prop: ["color"] } }
              ]
            }, "Dasar Coding Tekstual & Desain", "Mulai membuat websitemu! Susun halaman perkenalan dengan HTML, lalu beri warna dengan CSS.",
              "Isi di antara tag pembuka dan penutup, misalnya <h1>Hobi Gamingku</h1>. Warna: background-color: lightyellow; lalu color: navy;. Pilih warna yang terlihat jelas saat dibaca."),
            kode({
              materi: ["Kerangka HTML", "Tag h1, p, img, a", "Melihat hasil kode di Preview"],
              bahasa: ["html"],
              langkah: [
                "Tulis judul websitemu di dalam <h1>.",
                "Tulis perkenalan di dalam <p>.",
                "Tambahkan gambar: <img src=\"alamat-gambar\">. Boleh pakai alamat gambar dari internet.",
                "Tambahkan tautan: <a href=\"alamat-website\">tulisan tautan</a>.",
                "Klik ▶ Jalankan."
              ],
              awal: { html: "<!DOCTYPE html>\n<html>\n<head>\n  <title>Websiteku</title>\n</head>\n<body>\n  <!-- Ikuti langkah di kartu misi. Tulis kodemu di antara <body> dan </body> -->\n\n</body>\n</html>\n" },
              cek: [
                { teks: "Ada judul <h1> yang ada tulisannya", tag: "h1", isi: true },
                { teks: "Ada paragraf <p> yang ada tulisannya", tag: "p", isi: true },
                { teks: "Ada gambar <img src=...>", tag: "img[src]" },
                { teks: "Ada tautan <a href=...>", tag: "a[href]", isi: true }
              ]
            }, "Belajar HTML", "Tulis halaman web pertamamu dengan kode HTML.",
              "Tulis di antara <body> dan </body>. Judul: <h1>Judulku</h1>. Paragraf: <p>Halo!</p>. Gambar: <img src=\"https://...\">. Tautan: <a href=\"https://...\">Klik aku</a>."),
            kode({
              materi: ["Menghubungkan style.css", "Warna, huruf, dan rata teks", "Class CSS"],
              langkah: [
                "Buka tab style.css.",
                "Beri body warna latar: body { background-color: lightyellow; }",
                "Beri h1 warna tulisan (color) dan p ukuran huruf (font-size).",
                "Buat kotak: .kotak { border: 3px solid blue; padding: 10px; }",
                "Di tab index.html, ubah <div> menjadi <div class=\"kotak\">.",
                "Klik ▶ Jalankan."
              ],
              awal: {
                html: "<!DOCTYPE html>\n<html>\n<head>\n  <title>Websiteku</title>\n  <link rel=\"stylesheet\" href=\"style.css\">\n</head>\n<body>\n  <h1>Halo, Dunia!</h1>\n  <p>Ini websiteku yang pertama.</p>\n  <div>Aku ingin punya kotak!</div>\n</body>\n</html>\n",
                css: "/* Tulis CSS-mu di sini */\n"
              },
              cek: [
                { teks: "body punya warna latar (background-color)", css: { pada: "body", prop: ["background-color"] } },
                { teks: "h1 punya warna tulisan (color)", css: { pada: "h1", prop: ["color"] } },
                { teks: "p punya ukuran huruf (font-size)", css: { pada: "p", prop: ["font-size"] } },
                { teks: "Class .kotak punya border", css: { kelas: true, prop: ["border", "border-style", "border-width"] } },
                { teks: "HTML memakai class=\"kotak\"", tag: ".kotak" }
              ]
            }, "Belajar CSS", "Percantik halaman webmu dengan warna, huruf, dan kotak.",
              "Di tab style.css, tulis: body { background-color: lightyellow; }. Untuk class: .kotak { border: 3px solid blue; padding: 10px; }. Lalu di index.html ubah <div> menjadi <div class=\"kotak\">."),
            kode({"materi": ["Menu <nav> dan tautan ke bagian halaman", "Membagi halaman dengan <section>", "Daftar dengan <ul> dan <li>"], "langkah": ["Lihat kerangkanya: ada menu <nav> di atas dan dua bagian halaman <section>.", "Tulis judul websitemu di dalam <h1>.", "Tulis perkenalan singkat di dalam <p>.", "Di bagian Hobiku, tulis minimal 3 hal. Satu hal = satu <li>.", "Klik ▶ Jalankan, lalu klik menu di Preview. Halamannya akan meluncur ke bagian yang dituju!", "Pindah ke tab style.css. Beri body warna latar (background-color).", "Klik ▶ Jalankan lagi."], "awal": {"html": "<!DOCTYPE html>\n<html>\n<head>\n  <title>Websiteku</title>\n  <link rel=\"stylesheet\" href=\"style.css\">\n</head>\n<body>\n  <header>\n    <!-- LANGKAH 2: tulis judul websitemu di antara <h1> dan </h1> -->\n    <h1></h1>\n    <nav>\n      <a href=\"#tentang\">Tentang Aku</a>\n      <a href=\"#hobi\">Hobiku</a>\n    </nav>\n  </header>\n\n  <section id=\"tentang\">\n    <h2>Tentang Aku</h2>\n    <!-- LANGKAH 3: tulis perkenalan singkat di dalam <p> -->\n    <p></p>\n  </section>\n\n  <section id=\"hobi\">\n    <h2>Hobiku</h2>\n    <!-- LANGKAH 4: satu hobi = satu <li>. Tambahkan sampai minimal 3 -->\n    <ul>\n      <li></li>\n    </ul>\n  </section>\n</body>\n</html>\n", "css": "/* LANGKAH 6: warna latar halaman */\nbody {\n  \n}\n"}, "cek": [{"teks": "Ada judul <h1> yang ada tulisannya", "tag": "h1", "isi": true}, {"teks": "Ada menu <nav> dengan minimal 2 tautan", "tag": "nav a[href]", "min": 2}, {"teks": "Ada perkenalan <p> yang ada tulisannya", "tag": "p", "isi": true}, {"teks": "Ada minimal 3 hobi di daftar <li>", "tag": "ul li", "isi": true, "min": 3}, {"teks": "body punya warna latar (background-color)", "css": {"pada": "body", "prop": ["background-color"]}}]}, "Daftar dan Menu", "Tambahkan menu dan daftar supaya websitemu seperti website sungguhan.",
              "Isi bagian yang kosong. Daftar: <li>Bermain bola</li>. Warna latar: background-color: lightyellow;"),
            kode({
              materi: ["Website statis", "Menu dan bagian halaman", "Memakai satu CSS untuk seluruh halaman"],
              langkah: [
                "Rencanakan websitemu: pilih tema (hobi, hewan favorit, atau profil dirimu).",
                "HTML: tulis judul di <h1>, lalu isi 2 bagian halaman. Tiap bagian punya <h2> dan paragraf <p>.",
                "HTML: tulis minimal 3 hal di daftar <ul> memakai <li>, lalu tambahkan 1 gambar <img src=...>.",
                "HTML: menu <nav> sudah ada. Pastikan tiap tautan menuju id bagian, misalnya href=\"#hobi\" ke <section id=\"hobi\">.",
                "HTML: beri class=\"kartu\" pada 2 <section> supaya bisa didekorasi.",
                "CSS: atur body (warna latar dan font-family), h1 (warna), dan .kartu (border atau warna latar).",
                "Klik ▶ Jalankan, lalu cek tampilannya di Preview."
              ],
              awal: {
                html: "<!DOCTYPE html>\n<html>\n<head>\n  <title>Websiteku</title>\n  <link rel=\"stylesheet\" href=\"style.css\">\n</head>\n<body>\n  <header>\n    <!-- Judul websitemu -->\n    <h1></h1>\n    <nav>\n      <a href=\"#tentang\">Tentang Aku</a>\n      <a href=\"#hobi\">Hobiku</a>\n    </nav>\n  </header>\n\n  <section id=\"tentang\">\n    <h2>Tentang Aku</h2>\n    <p></p>\n  </section>\n\n  <section id=\"hobi\">\n    <h2>Hobiku</h2>\n    <ul>\n      <li></li>\n    </ul>\n    <!-- Tambahkan gambar di sini: <img src=\"...\"> -->\n  </section>\n\n  <footer>\n    <p></p>\n  </footer>\n</body>\n</html>\n",
                css: "/* Warna latar dan jenis huruf seluruh halaman */\nbody {\n  \n}\n\n/* Judul */\nh1 {\n  \n}\n\n/* Kotak bagian: pakai class=\"kartu\" di HTML */\n.kartu {\n  \n}\n"
              },
              cek: [
                { teks: "Ada judul <h1> yang ada tulisannya", tag: "h1", isi: true },
                { teks: "Ada menu <nav> dengan minimal 2 tautan", tag: "nav a[href]", min: 2 },
                { teks: "Ada minimal 2 bagian <h2> yang ada tulisannya", tag: "h2", isi: true, min: 2 },
                { teks: "Ada minimal 2 paragraf <p> yang ada tulisannya", tag: "p", isi: true, min: 2 },
                { teks: "Ada daftar dengan minimal 3 <li>", tag: "ul li", isi: true, min: 3 },
                { teks: "Ada gambar <img src=...>", tag: "img[src]" },
                { teks: "body punya warna latar atau jenis huruf", css: { pada: "body", prop: ["background-color", "background", "font-family"], min: 1 } },
                { teks: "h1 punya warna tulisan (color)", css: { pada: "h1", prop: ["color"] } },
                { teks: "Class .kartu punya border atau warna latar", css: { kelas: true, prop: ["border", "background-color", "background"] } },
                { teks: "HTML memakai class=\"kartu\" minimal 2 kali", tag: ".kartu", min: 2 }
              ]
            }, "Membuat Website Statis", "Satukan semuanya: buat website sederhana tentang hobimu dengan HTML dan CSS. Website statis isinya tetap, tidak berubah sendiri.",
              "Ikuti langkah di kartu misi. Kerangka sudah ada: isi tulisannya, tambahkan gambar, lalu atur tampilannya di style.css."),
          ],
          project: proyek({"jenis": "text", "tujuan": "Membuat website pribadi 2 halaman dengan teks, gambar, menu, dan tampilan CSS.", "kumpul": ["Buka websitemu di browser dan cek semua halaman", "Screenshot websitemu, atau tempel link-nya", "Unggah screenshot atau tempel link di halaman ini"], "lencana": "🌐 Lencana Web Developer"}, "Website Sederhanaku", "Buat website pribadi sederhana tentang hobi atau hal yang kamu sukai.",
            ["Pilih tema: hobi, hewan favorit, atau profil dirimu.",
             "Rancang tata letak di kertas: judul, menu, isi, dan gambar.",
             "Tulis kode HTML dan CSS-nya.",
             "Buka di browser, lalu perbaiki bagian yang belum rapi.",
             "Ambil screenshot websitemu, atau tempel link-nya."],
            ["Websiteku punya minimal 2 halaman", "Ada gambar dan teks", "Tampilan diatur dengan CSS (warna dan huruf)", "Ada menu untuk berpindah halaman", "Aku memakai ide dari Task 1–5"])
        }
      ]
    }
  ]
};

})();
