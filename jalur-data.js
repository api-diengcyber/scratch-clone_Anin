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
//   poin:    15                         (kalau kosong → POIN_TASK / POIN_PROJECT)
//   sukses:  "kapan task interactive dianggap berhasil"
//   gagal:   "kapan task interactive dianggap belum berhasil"
//   awal:    { html: "...", css: "..." } (khusus kode: isi editor saat dibuka & saat Reset)
//   bahasa:  ["html"]                   (khusus kode: tab yang tampil; kosong = html dan css)
//   langkah: ["langkah 1", ...]         (khusus kode: daftar langkah yang tampil di kartu misi Text Editor, supaya siswa ingat harus ngapain)
//   cek:     [ { teks, tag | css | uji } ]  (khusus kode: syarat berhasil, lihat contoh di jalur Website)
//              tag: "h1", isi: true, min: 1        → ada elemen HTML (isi:true = ada tulisannya)
//              css: { pada: "body", prop: ["color"] } → ada aturan CSS (atau kelas: true = ada class)
//              uji: (ctx) => true/false            → syarat bebas (ctx.doc, ctx.rules, ctx.html, ctx.css)
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
            kuis({"materi": ["Perangkat keras: yang bisa dipegang", "Perangkat lunak: program atau aplikasi", "Mouse, keyboard, dan layar"]}, "Perangkat Keras & Lunak", "Kenali bagian komputer yang bisa dipegang dan yang berupa program.", [
              { q: "Mana yang termasuk perangkat KERAS (bisa dipegang)?", options: ["Mouse", "Aplikasi menggambar", "Game"], answer: 0 },
              { q: "Mana yang termasuk perangkat LUNAK (program)?", options: ["Layar monitor", "Aplikasi menggambar", "Keyboard"], answer: 1 },
              { q: "Alat apa yang dipakai untuk menggerakkan penunjuk di layar?", options: ["Mouse", "Speaker", "Printer"], answer: 0 }
            ]),
            luar({"materi": ["Aplikasi menggambar (Paint)", "Kuas, warna, dan penghapus", "Garis lurus, lengkung, dan lingkaran"]}, "Coba Menggambar", "Buka aplikasi menggambar (misalnya Paint) dan kenalan dengan kuasnya.",
              ["Minta bantuan orang dewasa untuk membuka aplikasi menggambar.", "Pilih kuas dan satu warna.",
               "Gambar garis lurus, garis melengkung, dan lingkaran.", "Coba hapus dengan penghapus."],
              ["Aku sudah membuka aplikasi menggambar", "Aku sudah mencoba kuas dan warna", "Aku sudah menggambar garis dan lingkaran"]),
            luar({"materi": ["Bentuk dasar: lingkaran, kotak, segitiga", "Menyusun bentuk menjadi gambar", "Menyimpan file gambar"]}, "Gambar Hewan dari Bentuk", "Susun lingkaran, kotak, dan segitiga menjadi hewan lucu.",
              ["Pilih satu hewan kesukaanmu.", "Gambar badannya memakai lingkaran atau kotak.", "Tambahkan kepala, telinga, dan kaki.", "Simpan gambarmu."],
              ["Aku memilih satu hewan", "Aku memakai minimal 3 bentuk", "Aku sudah menyimpan gambarku"]),
            luar({"materi": ["Alat tuang warna", "Memilih warna yang serasi", "Latar belakang dan hiasan"]}, "Warna dan Hiasan", "Beri warna cerah, latar, dan hiasan pada gambarmu.",
              ["Buka lagi gambar hewanmu.", "Isi warna dengan alat tuang warna.", "Tambahkan latar belakang dan hiasan.", "Simpan sebagai gambar baru."],
              ["Gambarku sudah diberi warna", "Gambarku punya latar belakang", "Gambarku punya hiasan"]),
            luar({"materi": ["Menggabungkan gambar dan tulisan", "Tata letak sederhana", "Membuat karya untuk orang lain"]}, "Kartu Ucapan Digital", "Gabungkan gambar, warna, dan tulisan menjadi kartu ucapan.",
              ["Siapkan satu halaman kosong.", "Masukkan gambar hewanmu.", "Tulis ucapan untuk keluarga atau temanmu.", "Hias pinggiran kartu."],
              ["Kartuku punya gambar", "Kartuku punya tulisan ucapan", "Kartuku sudah dihias"]),
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
            kuis({"materi": ["Sifat tanah liat", "Cara menyimpan tanah liat", "Alat pahat yang aman"]}, "Kenalan dengan Tanah Liat", "Pelajari cara menjaga dan memakai tanah liat dengan aman.", [
              { q: "Supaya tanah liat tidak cepat kering, sebaiknya...", options: ["Ditutup kain basah atau plastik", "Dijemur di matahari", "Dibiarkan terbuka"], answer: 0 },
              { q: "Alat mana yang aman untuk membuat garis di tanah liat?", options: ["Spatula kecil dari plastik", "Pisau tajam", "Gunting besar"], answer: 0 }
            ]),
            luar({"praktik": "physical", "materi": ["Meremas dan melembutkan tanah liat", "Membuat bola", "Membuat gulungan"]}, "Bola dan Gulungan", "Latihan dasar: membuat bola dan gulungan.",
              ["Ambil segenggam tanah liat.", "Remas sampai lembut.", "Bulatkan di antara dua telapak tangan jadi bola.", "Gulung di meja jadi bentuk panjang."],
              ["Aku sudah membuat bola", "Aku sudah membuat gulungan", "Aku mencuci tangan setelahnya"]),
            luar({"praktik": "physical", "materi": ["Menyusun bentuk dasar menjadi hewan", "Menyambung bagian dengan rapi"]}, "Pahat Hewan Kecil", "Ubah bola dan gulungan menjadi hewan kecil.",
              ["Pilih hewan yang mudah, misalnya kura-kura atau kucing.", "Buat badan dari bola.", "Tempelkan kepala dan kaki.", "Rapikan sambungannya dengan jari."],
              ["Aku memilih satu hewan", "Badan, kepala, dan kaki sudah menyatu", "Hewanku bisa berdiri"]),
            luar({"praktik": "physical", "materi": ["Membuat mata, hidung, dan tekstur", "Merapikan permukaan"]}, "Tambah Detail", "Beri mata, hidung, dan tekstur supaya hewanmu lebih hidup.",
              ["Buat mata dengan bola kecil atau ujung pensil.", "Gores tekstur seperti bulu atau cangkang.", "Rapikan permukaan yang kasar."],
              ["Hewanku punya mata", "Hewanku punya tekstur", "Permukaannya sudah rapi"]),
            luar({"praktik": "physical", "materi": ["Membuat alas", "Menata karya dan hiasan", "Menyimpan karya dengan aman"]}, "Diorama Mini", "Letakkan hewanmu di sebuah alas dan beri hiasan sekitar.",
              ["Buat alas pipih dari tanah liat.", "Letakkan hewanmu di atas alas.", "Tambahkan hiasan kecil: pohon, batu, atau rumput."],
              ["Hewanku berada di atas alas", "Ada minimal 2 hiasan", "Hasilnya sudah kuletakkan di tempat aman"]),
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
            kuis({"materi": ["Atap, dinding, pintu, jendela, lantai", "Fungsi tiap bagian rumah"]}, "Bagian-bagian Rumah", "Kenali bagian rumah dan gunanya.", [
              { q: "Bagian rumah yang ada di paling atas adalah...", options: ["Atap", "Pintu", "Lantai"], answer: 0 },
              { q: "Bagian rumah yang membuat cahaya masuk adalah...", options: ["Jendela", "Lantai", "Pagar"], answer: 0 },
              { q: "Kita masuk ke dalam rumah lewat...", options: ["Pintu", "Atap", "Cerobong"], answer: 0 }
            ]),
            luar({"praktik": "physical", "materi": ["Bentuk dasar rumah: kotak dan segitiga"]}, "Gambar Bentuk Rumah", "Mulai dengan bentuk rumah paling sederhana.",
              ["Siapkan kertas atau aplikasi menggambar.", "Gambar kotak untuk dinding.", "Gambar segitiga untuk atap."],
              ["Aku menggambar dinding", "Aku menggambar atap", "Bentuk rumahku sudah terlihat"]),
            luar({"praktik": "physical", "materi": ["Letak pintu dan jendela", "Halaman dan pagar"]}, "Pintu, Jendela, dan Halaman", "Lengkapi rumahmu dengan pintu, jendela, dan halaman.",
              ["Tambahkan pintu di tengah.", "Tambahkan jendela di kiri dan kanan.", "Gambar pagar dan halaman."],
              ["Rumahku punya pintu", "Rumahku punya jendela", "Rumahku punya halaman"]),
            luar({"praktik": "physical", "materi": ["Memilih warna", "Menambahkan taman, langit, dan matahari"]}, "Warna dan Taman", "Beri warna dan tambahkan taman yang indah.",
              ["Pilih warna dinding dan atap.", "Tambahkan pohon dan bunga.", "Beri langit dan matahari."],
              ["Rumahku berwarna", "Ada pohon atau bunga", "Ada langit atau matahari"]),
            luar({"praktik": "physical", "materi": ["Denah: rumah dilihat dari atas", "Membagi ruangan", "Memberi nama ruangan"]}, "Denah Rumah Sederhana", "Lihat rumahmu dari atas dan bagi menjadi beberapa ruangan.",
              ["Gambar kotak besar sebagai batas rumah.", "Bagi menjadi ruangan: kamar, dapur, ruang tamu.", "Tulis nama setiap ruangan."],
              ["Denahku punya minimal 3 ruangan", "Setiap ruangan sudah ada namanya", "Aku tahu letak pintunya"]),
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
            luar({"materi": ["Tampilan ScratchJr: panggung, karakter, area kode", "Tombol bendera hijau"]}, "Kenalan dengan ScratchJr", "Buka ScratchJr dan kenali tombol-tombol utamanya.",
              ["Minta bantuan orang dewasa untuk membuka ScratchJr.", "Lihat karakter kucing dan panggungnya.", "Coba tekan bendera hijau."],
              ["Aku sudah membuka ScratchJr", "Aku sudah menekan bendera hijau", "Aku tahu di mana karakter dan panggungnya"]),
            luar({"materi": ["Blok gerak (biru)", "Menjalankan kode dengan bendera hijau"]}, "Gerakkan Karakter", "Buat karakter berjalan dengan blok biru ScratchJr.",
              ["Tekan karakter, lalu pilih blok gerak (biru).", "Seret blok maju ke area kode.", "Tekan bendera hijau."],
              ["Karakterku sudah bergerak", "Aku memakai minimal 2 blok gerak", "Aku bisa menjalankan dengan bendera hijau"]),
            luar({"materi": ["Memilih latar", "Blok Say (ungu)"]}, "Ganti Latar & Percakapan", "Pilih latar baru dan buat karakter berbicara dengan balon kata.",
              ["Tekan ikon latar dan pilih latar yang kamu suka.", "Pilih blok ungu \"Say\".", "Tulis percakapan sederhana."],
              ["Aku memilih latar baru", "Karakterku bisa berbicara", "Percakapanku punya minimal 2 kalimat"]),
            luar({"materi": ["Blok suara (hijau)", "Merekam suara sendiri"]}, "Tambah Suara", "Rekam suaramu atau pilih suara dari ScratchJr.",
              ["Pilih blok suara (hijau).", "Rekam suaramu atau pilih suara yang ada.", "Pasang di rangkaian kodemu."],
              ["Animasiku punya suara", "Suaranya muncul di saat yang pas", "Aku sudah mencoba menjalankannya"]),
            luar({"materi": ["Menambah halaman", "Alur cerita: awal, tengah, akhir"]}, "Cerita Beberapa Halaman", "Satukan semuanya menjadi cerita dengan lebih dari satu halaman.",
              ["Tambahkan halaman baru dengan tombol +.", "Buat kejadian berbeda di tiap halaman.", "Jalankan dari halaman pertama."],
              ["Ceritaku punya minimal 2 halaman", "Ada gerakan, percakapan, dan suara", "Ceritanya punya awal dan akhir"]),
          ],
          project: proyek({"jenis": "external", "aplikasi": "ScratchJr", "tujuan": "Membuat animasi cerita keluarga hewan di ScratchJr dengan gerakan, percakapan, dan suara.", "kumpul": ["Jalankan animasimu sampai selesai", "Foto layar saat animasi berjalan", "Unggah fotonya di halaman ini"], "lencana": "🐷 Lencana Sutradara Cilik"}, "Animasi Cerita Keluarga Hewan", "Buat animasi ceritamu sendiri tentang keluarga hewan lucu memakai ScratchJr. Gambar atau pilih karakter hewan kesukaanmu.",
            ["Pikirkan cerita pendek tentang keluarga hewan.", "Susun halaman demi halaman di ScratchJr.", "Tambahkan gerakan, percakapan, dan suara.", "Foto layar saat animasimu berjalan."],
            ["Ada minimal 1 karakter", "Ada latar belakang", "Ada gerakan dan percakapan", "Ada suara atau efek", "Ada alur cerita sederhana"])
        }
      ]
    },
    // ============================================================
    // TAHAP 2 — EXPLORE (usia 10–12). Anak memilih SATU jalur.
    // Setiap jalur memakai struktur yang sama: Task 1–5 → Project Akhir.
    // Task di tahap ini hanya kuis & kegiatan di luar website (belum ada editor baru).
    // ============================================================
    {
      id: "explore", no: 2, emoji: "🌟", nama: "Tahap 2 — Explore", usia: "10–12 tahun", mode: "pilih-jalur",
      desc: "Pilih jalur yang paling kamu suka, lalu jelajahi sampai jadi proyek!",
      slogan: "Pilih jalur favoritmu: buat game, bangun dunia 3D, atau bikin website!",
      pembelajaran: [

        // ---------------- JALUR 1: GAME DEVELOPMENT (2D) ----------------
        {
          id: "g1", emoji: "🎮", warna: "#8f6bff", judul: "Game Development",
          tagline: "Buat game dan belajar bagaimana game bekerja!",
          desc: "Jalur 2D Game Development: dari alur pembuatan game sampai project game sederhana.",
          topik: ["Alur pembuatan game", "Animasi sederhana", "Game platformer", "Game ala Flappy Bird", "Game penemuan virus", "Project game"],
          tasks: [
            kuis({"materi": ["Alur membuat game: ide → buat → uji coba → perbaiki", "Peran programmer", "Mengapa uji coba penting"]}, "Bagaimana Game Dibuat?", "Kenali alur proses membuat game, dari ide sampai bisa dimainkan.", [
              { q: "Apa langkah pertama saat membuat game?", options: ["Langsung membuat musik", "Menentukan ide, tema, dan tujuan game", "Mengumumkan game ke teman"], answer: 1 },
              { q: "Memainkan game untuk mencari kesalahan disebut...", options: ["Uji coba (testing)", "Mewarnai", "Menyimpan"], answer: 0 },
              { q: "Urutan yang paling tepat adalah...", options: ["Uji coba → Ide → Buat → Perbaiki", "Perbaiki → Ide → Uji coba → Buat", "Ide → Buat → Uji coba → Perbaiki"], answer: 2 },
              { q: "Orang yang menulis kode supaya game bisa berjalan disebut...", options: ["Programmer", "Penyanyi", "Pelukis"], answer: 0 }
            ]),
            luar({"praktik": "block", "materi": ["Kostum (costume) sprite", "Blok ulangi (repeat)", "Jeda dengan blok tunggu"]}, "Animasi Sederhana", "Buat karakter terlihat berjalan dengan mengganti kostum berulang-ulang.",
              ["Buka Scratch bersama orang dewasa, lalu pilih karakter yang punya lebih dari satu kostum.",
               "Pasang blok “ketika bendera hijau diklik”, lalu blok “ulangi 10 kali”.",
               "Di dalam blok ulangi, taruh “kostum berikutnya”, “gerak 5 langkah”, dan “tunggu 0,2 detik”.",
               "Klik bendera hijau dan lihat karaktermu berjalan."],
              ["Karakterku punya minimal 2 kostum", "Kostum berganti di dalam blok ulangi", "Karakterku terlihat berjalan"]),
            luar({"praktik": "block", "materi": ["Gerak kiri-kanan", "Variabel kecepatan-y", "Gravitasi dan lompat", "Mendeteksi sentuhan warna"]}, "Game Platformer", "Buat karakter yang bisa berlari ke kiri-kanan dan melompat di atas platform.",
              ["Pilih latar yang punya lantai, lalu gambar satu atau dua platform berwarna.",
               "Gerak kiri-kanan: saat tombol panah ditekan, ubah x sebesar 5 atau -5.",
               "Buat variabel “kecepatan-y”. Saat spasi ditekan, isi kecepatan-y dengan 12.",
               "Di dalam blok “selamanya”: ubah y sebesar kecepatan-y, lalu kurangi kecepatan-y 1 (ini gravitasinya).",
               "Jika karakter menyentuh warna platform, hentikan jatuh dan letakkan karakter di atasnya."],
              ["Karakterku bisa bergerak ke kiri dan kanan", "Karakterku bisa melompat", "Karakterku bisa berdiri di atas platform"]),
            luar({"praktik": "block", "materi": ["Gravitasi dengan variabel", "Rintangan yang bergerak", "Angka acak", "Skor dan kondisi kalah"]}, "Game ala Flappy Bird", "Buat burung yang jatuh karena gravitasi dan harus melewati pipa.",
              ["Buat karakter burung di sisi kiri panggung, lalu buat variabel “kecepatan-y”.",
               "Di blok “selamanya”: ubah y sebesar kecepatan-y, lalu kurangi kecepatan-y sedikit setiap putaran.",
               "Saat spasi ditekan, isi kecepatan-y dengan angka positif supaya burung naik.",
               "Buat sprite pipa yang bergerak dari kanan ke kiri, lalu muncul lagi dengan tinggi acak.",
               "Jika burung menyentuh pipa atau tepi bawah, “hentikan semua”. Tambah variabel “skor” setiap pipa terlewati."],
              ["Burungku jatuh dan bisa naik saat spasi ditekan", "Pipa bergerak dengan tinggi yang acak", "Game berhenti saat burung menabrak", "Ada skor yang bertambah"]),
            luar({"praktik": "block", "materi": ["Posisi acak", "Variabel skor dan waktu", "Menghitung mundur", "Menampilkan hasil akhir"]}, "Game Penemuan Virus", "Jadilah peneliti yang mencari dan menemukan virus yang bersembunyi di laboratorium.",
              ["Tulis ceritanya: kamu peneliti yang harus menemukan virus yang bersembunyi (virus komputer atau virus kuman).",
               "Buat sprite virus yang lucu, yang berpindah ke tempat acak setiap 1 detik.",
               "Saat virus diklik, tambah variabel “virus ditemukan” dan mainkan suara.",
               "Buat variabel “waktu” yang mulai dari 30 dan berkurang tiap detik. Saat waktu habis, tampilkan hasilnya.",
               "Tantangan tambahan: makin banyak virus ditemukan, virus bergerak makin cepat."],
              ["Virusku berpindah tempat secara acak", "Ada skor “virus ditemukan”", "Ada batas waktu", "Game menampilkan hasil di akhir"]),
          ],
          project: proyek({"jenis": "external", "aplikasi": "Scratch", "tujuan": "Membuat satu game 2D utuh: ada karakter, aturan menang-kalah, dan skor atau tantangan.", "kumpul": ["Mainkan gamemu sampai selesai", "Screenshot gamemu, atau salin link project-nya", "Unggah foto atau tempel link di halaman ini"], "lencana": "🎮 Lencana Game Developer"}, "Game Sederhanaku", "Rancang dan buat game 2D buatanmu sendiri memakai semua yang sudah kamu pelajari.",
            ["Tulis ide game: tema, tokoh, tujuan, dan cara menang atau kalah.",
             "Rancang gambar: karakter, latar, dan rintangan.",
             "Buat game-nya: gerakan, aturan, dan skor.",
             "Ajak temanmu mencoba, lalu perbaiki bagian yang membingungkan.",
             "Ambil foto atau screenshot gamemu, atau tempel link project-mu."],
            ["Game-ku punya ide dan tema yang jelas", "Ada karakter yang dikendalikan pemain", "Ada aturan menang atau kalah", "Ada skor atau tantangan", "Sudah diuji coba dan diperbaiki", "Aku memakai ide dari Task 1–5"])
        },

        // ---------------- JALUR 2: 3D & ROBLOX ----------------
        {
          id: "g2", emoji: "🧊", warna: "#1fb5d6", judul: "3D & Roblox",
          tagline: "Bangun dunia dan karya 3D-mu sendiri!",
          desc: "Jalur 3D Game Development: mengenal Roblox Studio, desain 3D, sampai membuat dunia 3D sederhana.",
          topik: ["Mengenal Roblox Studio", "Dasar desain 3D", "Membuat objek 3D", "Membuat lingkungan game", "Dasar game 3D", "Project 3D"],
          tasks: [
            kuis({"materi": ["Fungsi Roblox Studio", "Jendela Viewport, Explorer, Properties"]}, "Kenalan dengan Roblox Studio", "Kenali apa itu Roblox Studio dan jendela-jendela utamanya.", [
              { q: "Roblox Studio dipakai untuk...", options: ["Menonton video", "Membuat dunia dan game 3D", "Mengetik surat"], answer: 1 },
              { q: "Jendela besar yang menampilkan dunia 3D-mu bernama...", options: ["Explorer", "Output", "Viewport"], answer: 2 },
              { q: "Jendela yang berisi daftar semua benda di duniamu bernama...", options: ["Explorer", "Viewport", "Properties"], answer: 0 },
              { q: "Untuk mengubah warna dan ukuran sebuah benda, kita memakai jendela...", options: ["Output", "Explorer", "Properties"], answer: 2 }
            ]),
            kuis({"materi": ["Tiga ukuran: panjang, lebar, tinggi", "Bentuk dasar 3D", "Perbedaan 2D dan 3D"]}, "Dasar Desain 3D", "Pelajari ukuran dan bentuk dasar yang dipakai untuk membuat benda 3D.", [
              { q: "Benda 3D punya tiga ukuran, yaitu...", options: ["Warna, suara, dan bau", "Panjang, lebar, dan tinggi", "Atas, bawah, dan nol"], answer: 1 },
              { q: "Bentuk dasar yang seperti kaleng minuman disebut...", options: ["Silinder", "Bola", "Segitiga"], answer: 0 },
              { q: "Benda 3D berbeda dari gambar 2D karena punya...", options: ["Tulisan", "Warna saja", "Kedalaman"], answer: 2 }
            ]),
            luar({"materi": ["Part dan bentuknya", "Mengubah ukuran dan warna", "Group (Ctrl+G)"]}, "Membuat Objek 3D", "Susun bentuk-bentuk dasar menjadi satu benda 3D buatanmu.",
              ["Minta bantuan orang dewasa untuk membuka Roblox Studio dan memilih template Baseplate.",
               "Tambahkan sebuah Part (balok), lalu ubah ukuran dan warnanya.",
               "Coba bentuk lain: bola, silinder, dan wedge.",
               "Susun beberapa Part menjadi satu benda, misalnya meja, pohon, atau menara kecil.",
               "Pilih semua Part benda itu, lalu Group (Ctrl+G) supaya tidak tercecer."],
              ["Aku membuat minimal 3 Part berbeda", "Aku sudah mengubah ukuran dan warna", "Bendaku sudah di-Group"]),
            luar({"materi": ["Terrain", "Menata benda di lingkungan", "SpawnLocation dan Lighting"]}, "Membuat Lingkungan", "Bangun tempat untuk bendamu: tanah, pohon, dan sekitarnya.",
              ["Buka tab Terrain, lalu buat tanah, bukit, atau air.",
               "Letakkan benda buatanmu di lingkungan itu, misalnya rumah, pohon, atau pagar.",
               "Atur SpawnLocation sebagai tempat pemain pertama kali muncul.",
               "Opsional: ubah cahaya atau langit lewat Lighting supaya suasananya berbeda."],
              ["Duniaku punya tanah, air, atau bukit", "Ada minimal 3 benda di lingkunganku", "SpawnLocation sudah kuletakkan"]),
            luar({"materi": ["Tombol Play dan gerak W A S D", "Anchored", "Menyimpan project"]}, "Uji Coba Dunia 3D", "Mainkan duniamu sendiri dan pahami dasar pengembangan game 3D.",
              ["Klik Play, lalu jalan di duniamu memakai tombol W, A, S, D dan spasi.",
               "Cari benda yang melayang atau jatuh. Aktifkan Anchored supaya benda diam di tempatnya.",
               "Pastikan kamu muncul di tempat yang benar (SpawnLocation).",
               "Tulis 2 hal yang ingin kamu perbaiki, lalu perbaiki minimal satu.",
               "Simpan duniamu lewat File → Save."],
              ["Aku sudah menekan Play dan berjalan di duniaku", "Aku tahu fungsi Anchored", "Aku memperbaiki minimal 1 hal", "Duniaku sudah disimpan"]),
          ],
          project: proyek({"jenis": "external", "aplikasi": "Roblox Studio", "tujuan": "Membangun dunia 3D mini dengan benda buatanmu, lingkungan, dan tempat muncul pemain.", "kumpul": ["Uji duniamu dengan tombol Play", "Ambil screenshot duniamu", "Unggah screenshot di halaman ini"], "lencana": "🧊 Lencana Pembangun 3D"}, "Dunia 3D-ku", "Bangun dunia 3D mini buatanmu sendiri dengan benda, lingkungan, dan tempat muncul pemain.",
            ["Pilih tema duniamu: kota mini, taman, pulau, atau yang lain.",
             "Bangun minimal 5 benda 3D buatanmu sendiri.",
             "Tambahkan lingkungan: tanah, pohon, atau air.",
             "Pasang SpawnLocation, lalu uji dengan tombol Play.",
             "Ambil screenshot duniamu dan unggah di sini."],
            ["Duniaku punya tema yang jelas", "Ada minimal 5 benda 3D", "Ada lingkungan (tanah, air, atau pohon)", "Ada SpawnLocation dan sudah diuji dengan Play", "Aku memakai ide dari Task 1–5"])
        },

        // ---------------- JALUR 3: WEBSITE DEVELOPMENT ----------------
        {
          id: "g3", emoji: "🌐", warna: "#ff9f1c", judul: "Website Development",
          tagline: "Belajar membuat website dengan kode!",
          desc: "Jalur Website Development: HTML, CSS, PHP, database, sampai project website sederhana.",
          topik: ["HTML", "CSS", "PHP", "Database", "Website statis", "Project website"],
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
            kuis({"materi": ["PHP dan server", "Database, tabel, dan baris", "Website dinamis"]}, "Mengenal PHP & Database", "Kenali PHP dan database, bahan untuk membuat website yang isinya bisa berubah.", [
              { q: "PHP dijalankan di mana?", options: ["Di dalam keyboard", "Di server (komputer penyedia website)", "Di dalam printer"], answer: 1 },
              { q: "Database dipakai untuk...", options: ["Mengganti warna layar", "Mengecilkan gambar", "Menyimpan dan mengelola data, misalnya daftar nama"], answer: 2 },
              { q: "Dalam tabel database, satu baris biasanya berisi...", options: ["Satu warna", "Satu data lengkap, misalnya data satu teman", "Satu gambar"], answer: 1 },
              { q: "Website yang isinya bisa berubah berdasarkan data disebut...", options: ["Website statis", "Website dinamis", "Website kosong"], answer: 1 }
            ]),
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
