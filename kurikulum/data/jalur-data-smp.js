(function () {
  const TXT = "TextEditor/index.html", D3 = "Editor3D/index.html";
  const N = (url, id, title, deskripsi, pertemuan, level, ringkasan, teori, materi, tasks) => ({ id, title, deskripsi, pertemuan, level, ringkasan, teori, materi,
    tasks: tasks.map((t) => Object.assign({ judul: t[0], langkah: t[1] }, t[2] === "p" ? { project: true } : t[2] === "k" ? { project: true, kumpul: true } : {})), urlEditor: url });
  window.LP_SMP = [
    { id: "python", c: "#3d8bf5", nama: "Python Start", meta: "36 Pertemuan · 90 Menit/Sesi",
      ringkas: "Dari print() pertama sampai game 2D dan Hackathon.", proyek: "Game 2D buatan sendiri + karya tim", nodes: [
      N(TXT, "py1", "Dasar Python & Variabel", "print, variabel, tipe data, input.", "1–6", "Pemula", "Python membaca kode baris demi baris. Variabel adalah kotak bernama untuk menyimpan nilai.",
        ["print() menampilkan teks","Tipe data: int, float, str","input() selalu menghasilkan teks"], ["print","variabel","tipe data","input"],
        [
          ["Perkenalan diri", ["Simpan namamu di variabel nama","Tampilkan dengan print()","Tambahkan umur lewat input()"]],
          ["Kalkulator mini", ["Minta dua angka dengan input()","Ubah ke int()","Cetak hasil tambah dan kali"]],
          ["Tipe data", ["Buat variabel bertipe int, float, dan str","Cetak tipe tiap variabel dengan type()","Ubah teks \"15\" menjadi angka dengan int() lalu tambahkan 5"]],
          ["Operator hitung", ["Pakai +, -, *, / dan // pada dua angka","Coba % untuk mencari sisa bagi","Cetak semua hasilnya dengan keterangan yang jelas"]],
          ["Cetak rapi", ["Gabungkan teks dan variabel dengan f-string","Tampilkan nama, kelas, dan hobi dalam satu kalimat","Coba \\n supaya hasilnya tampil di dua baris"]],
          ["Proyek: Kartu Identitas Digital", ["Minta nama, umur, dan hobi dengan input()","Ubah umur ke int lalu hitung umurmu tahun depan","Cetak kartu identitas yang rapi dengan f-string"], "p"]]),
      N(TXT, "py2", "Struktur Kontrol", "if/elif/else, for, while.", "7–12", "Pemula", "Struktur kontrol membuat program memilih jalan dan mengulang pekerjaan.",
        ["if memeriksa kondisi","for mengulang sejumlah kali","while mengulang selama kondisi benar"], ["if/elif/else","for","while","and/or"],
        [
          ["Cek nilai", ["Minta nilai dari pengguna","Tulis if/elif/else untuk predikat","Uji dengan 3 nilai berbeda"]],
          ["Tebak angka", ["Simpan angka rahasia","Ulangi tebakan dengan while","Beri petunjuk lebih besar atau kecil"]],
          ["Menu pilihan", ["Tampilkan menu 1, 2, dan 3 lewat print()","Pakai if/elif/else untuk menjawab tiap pilihan","Beri pesan khusus kalau pilihan tidak dikenal"]],
          ["Hitung mundur", ["Pakai for dan range() untuk mencetak 10 sampai 1","Cetak kata \"Mulai!\" setelah perulangan selesai","Ubah supaya hitung mundur bisa dimulai dari angka pilihan pengguna"]],
          ["Pintu rahasia", ["Simpan kata sandi di sebuah variabel","Pakai while untuk meminta tebakan sampai benar","Beri batas 3 kali coba dengan operator and"]],
          ["Proyek: Kuis Pengetahuan Umum", ["Tulis 5 pertanyaan dengan jawaban singkat","Pakai perulangan dan if untuk memeriksa tiap jawaban","Hitung skor dan tampilkan nilai akhir beserta predikatnya"], "p"]]),
      N(TXT, "py3", "Fungsi & Modul math", "def, parameter, return, math.", "13–18", "Menengah", "Fungsi membungkus langkah yang bisa dipakai berulang. Modul math menyediakan rumus siap pakai.",
        ["def membuat fungsi","return mengirim hasil keluar","import math memberi sqrt, pi"], ["def","parameter","return","math"],
        [
          ["Fungsi luas", ["Buat luas_lingkaran(r)","Pakai math.pi","Panggil dengan 3 jari-jari"]],
          ["Kalkulator sains", ["Buat fungsi akar dan pangkat","Pakai math.sqrt","Tampilkan menu pilihan"]],
          ["Parameter dan return", ["Buat fungsi tambah(a, b) yang memakai return","Panggil fungsinya dengan tiga pasang angka","Simpan hasilnya di variabel lalu cetak"]],
          ["Konversi suhu", ["Buat fungsi celcius_ke_fahrenheit(c)","Buat fungsi kebalikannya","Cetak tabel suhu 0 sampai 100 dengan loncatan 20"]],
          ["Hitung diskon", ["Buat fungsi harga_akhir(harga, diskon)","Beri parameter diskon nilai bawaan 10","Uji dengan tiga harga berbeda"]],
          ["Proyek: Kalkulator Geometri", ["Buat fungsi luas dan keliling untuk persegi, persegi panjang, dan lingkaran","Pakai math.pi dan math.sqrt bila perlu","Buat menu agar pengguna bisa memilih bangun datar"], "p"]]),
      N(TXT, "py4", "OOP: Kelas & Inheritance", "class, object, method, pewarisan.", "19–26", "Menengah", "Class adalah cetakan, object adalah hasil cetakannya. Inheritance membuat class baru dari class lama.",
        ["class berisi atribut dan method","__init__ mengisi atribut awal","Class anak mewarisi class induk"], ["class","object","method","inheritance"],
        [
          ["Class Karakter", ["Buat class dengan nama dan hp","Tambah method serang()","Buat dua object lalu panggil"]],
          ["Pewarisan", ["Buat class Penyihir dari Karakter","Tambah method sihir()","Cetak hp setelah diserang"]],
          ["Method menyerang", ["Tambahkan method serang(lawan) pada class Karakter","Kurangi nyawa lawan sesuai kekuatan serangan","Cetak sisa nyawa setelah serangan"]],
          ["Banyak karakter", ["Buat tiga object karakter dengan nama berbeda","Simpan semuanya di dalam sebuah list","Pakai for untuk menampilkan data tiap karakter"]],
          ["Kartu karakter", ["Tambahkan method info() yang mencetak nama dan nyawa","Coba juga method __str__","Cetak kartu untuk semua karakter di list"]],
          ["Proyek: Arena Pertarungan Mini", ["Buat dua karakter dengan kekuatan berbeda","Buat mereka bergantian menyerang dengan perulangan while","Umumkan pemenang saat nyawa salah satunya habis"], "p"]]),
      N(TXT, "py5", "Game 2D", "game loop, gerak, tabrakan, skor.", "27–32", "Lanjut", "Game berjalan dalam loop: baca input, ubah keadaan, gambar ulang.",
        ["Game loop berulang tiap frame","Tabrakan = dua kotak bertumpuk","Skor dan nyawa adalah variabel"], ["game loop","gerak","tabrakan","skor"],
        [
          ["Gerakkan pemain", ["Siapkan loop utama","Ubah posisi dari tombol","Batasi pemain di layar"]],
          ["Kumpulkan koin", ["Buat koin di posisi acak","Deteksi tabrakan","Tambah skor tiap koin"]],
          ["Skor dan nyawa", ["Buat variabel skor dan nyawa di game-mu","Tambah skor saat pemain mengambil koin","Tampilkan skor dan nyawa di layar"]],
          ["Rintangan bergerak", ["Tambahkan satu rintangan di sisi layar","Gerakkan rintangan dengan kecepatan tetap di setiap putaran game loop","Kembalikan rintangan ke sisi awal saat keluar layar"]],
          ["Game over dan ulang", ["Kurangi nyawa saat pemain menabrak rintangan","Tampilkan tulisan Game Over saat nyawa habis","Beri tombol untuk mengulang permainan"]],
          ["Proyek: Game Hindari Rintangan", ["Gabungkan pemain, koin, dan rintangan dalam satu game","Pastikan ada skor, nyawa, dan layar Game Over","Minta temanmu mencoba, lalu perbaiki satu hal dari masukannya"], "p"]]),
      N(TXT, "py6", "Hackathon Finale", "Game tim dari rencana sampai presentasi.", "33–36", "Lanjut", "Hackathon: tim membuat game utuh dalam waktu terbatas lalu mempresentasikannya.",
        ["Bagi tugas sesuai keahlian","Uji sebelum demo","Presentasi: masalah, solusi, demo"], ["rencana","kerja tim","pengujian","presentasi"],
        [
          ["Kumpulkan Game 2D Final", ["Selesaikan game 2D-mu sampai bisa dimainkan dari awal sampai Game Over","Ambil screenshot layar game dan siapkan kode utamanya","Isi link karya atau catatan tentang game-mu di kolom pengumpulan","Klik tombol selesai untuk mengumpulkan"], "k"]])
    ] },
    { id: "ai", c: "#8f6bff", nama: "AI & Creative Tech", meta: "36 Pertemuan · 90 Menit/Sesi",
      ringkas: "Prompt engineering, 14 tools AI, dan portofolio web.", proyek: "Portofolio website online", nodes: [
      N(TXT, "ai1", "Prompt Engineering", "Menulis prompt yang jelas dan terarah.", "1–6", "Pemula", "Prompt yang baik punya peran, tugas, konteks, dan format hasil.",
        ["Beri peran pada AI","Sebut konteks dan batasan","Perbaiki prompt bertahap"], ["peran","konteks","format","iterasi"],
        [
          ["Prompt pertama", ["Tulis tugas yang ingin dibantu AI","Tambahkan peran dan format hasil","Simpan prompt di editor"]],
          ["Perbaiki hasil", ["Bandingkan dua versi prompt","Catat apa yang berubah","Pilih prompt terbaik"]],
          ["Peran dan konteks", ["Tulis prompt tanpa peran, lalu simpan jawabannya","Tulis ulang dengan peran dan konteks yang jelas","Bandingkan kedua jawaban dan catat bedanya"]],
          ["Atur format jawaban", ["Minta jawaban dalam bentuk daftar atau tabel","Batasi panjang jawaban, misalnya 50 kata","Catat format mana yang paling mudah kamu pakai"]],
          ["Belajar dari contoh", ["Beri AI dua contoh jawaban yang kamu inginkan","Minta AI membuat contoh ketiga dengan pola yang sama","Periksa apakah polanya sudah sesuai"]],
          ["Proyek: Buku Prompt Andalanku", ["Kumpulkan 5 prompt terbaikmu dari latihan sebelumnya","Tulis kapan tiap prompt cocok dipakai","Tambahkan catatan perbaikan untuk tiap prompt"], "p"]]),
      N(TXT, "ai2", "Web HTML/CSS via AI", "Dasar HTML/CSS dan memeriksa kode AI.", "7–12", "Pemula", "AI bisa menulis kode web, tapi kamu yang harus memahami dan memeriksanya.",
        ["HTML menyusun isi halaman","CSS mengatur tampilan","Selalu uji kode dari AI"], ["HTML","CSS","prompt kode","review kode"],
        [
          ["Halaman pertama", ["Minta AI membuat halaman perkenalan","Tempel kodenya ke editor","Jalankan dan lihat Preview"]],
          ["Edit sendiri", ["Ganti warna dan judul","Tambah satu bagian baru","Jelaskan 3 baris kode"]],
          ["Tag dasar HTML", ["Buat halaman dengan h1, p, img, dan a","Isi dengan perkenalan dirimu","Buka hasilnya di tab pratinjau"]],
          ["Warna dan font", ["Ubah warna latar dan warna teks dengan CSS","Pilih satu font dan ukuran yang nyaman dibaca","Beri jarak antar bagian dengan margin dan padding"]],
          ["Periksa kode AI", ["Minta AI membuat satu halaman web sederhana","Cari satu bagian yang tampilannya kurang rapi","Perbaiki sendiri kodenya dan jelaskan apa yang kamu ubah"]],
          ["Proyek: Halaman Tentang Aku", ["Rancang isi halaman: foto, profil singkat, dan hobi","Buat halamannya dengan bantuan AI, lalu edit sendiri","Pastikan tampilannya rapi dan semua tulisan terbaca jelas"], "p"]]),
      N(TXT, "ai3", "14 Tools AI", "Audio, video, dan gambar dengan AI.", "13–20", "Menengah", "Tiap tool AI punya kekuatan berbeda. Memilih tool yang tepat menghemat waktu.",
        ["Kenali jenis tool: teks, gambar, audio, video","Bandingkan hasil antar tool","Etika: sebut sumber, hormati hak cipta"], ["audio","video","gambar","etika AI"],
        [
          ["Katalog tools", ["Pilih 5 tool yang kamu coba","Tulis fungsi dan kekurangannya","Susun jadi halaman katalog"]],
          ["Uji banding", ["Beri prompt sama ke dua tool","Bandingkan hasilnya","Tulis kesimpulan singkat"]],
          ["Kelompokkan tools", ["Bagi 14 tools ke kelompok teks, gambar, audio, dan video","Tulis satu kegunaan utama tiap tool","Tandai tool yang paling ingin kamu coba"]],
          ["Etika memakai AI", ["Cari tahu aturan pemakaian dari satu tool","Tulis 3 hal yang boleh dan tidak boleh kamu lakukan","Cantumkan bahwa karyamu dibuat dengan bantuan AI"]],
          ["Alur kerja tools", ["Pilih satu ide, misalnya poster kegiatan sekolah","Pakai tiga tools secara berurutan untuk mengerjakannya","Catat apa yang dihasilkan tiap tool"]],
          ["Proyek: Katalog Tools AI Kelasku", ["Pilih 5 tools paling berguna untuk teman sekelas","Tulis kegunaan, kelebihan, dan batasan tiap tool","Susun katalognya jadi satu halaman yang rapi"], "p"]]),
      N(TXT, "ai4", "Aset Gambar, Audio & Video", "Membuat paket aset kreatif.", "21–26", "Menengah", "Aset kreatif perlu konsisten: gaya, ukuran, dan format yang sama.",
        ["Tentukan gaya visual dulu","Beri nama file yang rapi","Cek ukuran file untuk web"], ["gambar","musik","suara","video pendek"],
        [
          ["Paket aset", ["Tentukan tema dan gaya","Buat 3 aset dengan AI","Beri nama file yang rapi"]],
          ["Galeri aset", ["Buat halaman galeri","Tampilkan aset dengan tag img","Tambah keterangan tiap aset"]],
          ["Prompt gambar", ["Tentukan gaya, warna, dan suasana gambarmu","Tulis prompt gambar yang detail","Buat 2 versi lalu pilih yang terbaik"]],
          ["Musik dan suara", ["Tentukan suasana: tenang, seru, atau menegangkan","Buat satu musik latar atau efek suara","Dengarkan dan catat apakah cocok dengan gambarmu"]],
          ["Video pendek", ["Tulis skenario video 15 detik","Buat videonya dengan salah satu tools","Periksa apakah ada bagian yang aneh lalu buat ulang"]],
          ["Proyek: Paket Aset Bertema", ["Pilih satu tema, misalnya hutan ajaib atau kota masa depan","Buat 3 gambar, 1 audio, dan 1 video dengan tema itu","Beri nama file yang rapi dan catat tools yang dipakai"], "p"]]),
      N(TXT, "ai5", "Game & Storytelling", "Board game dan cerita bercabang.", "27–32", "Lanjut", "Cerita bercabang memberi pembaca pilihan, tiap pilihan membuka bagian cerita berbeda.",
        ["Alur: awal, konflik, akhir","Cabang = pilihan pembaca","Uji coba bersama teman"], ["aturan main","cerita bercabang","playtest"],
        [
          ["Peta cerita", ["Gambar alur dengan 2 cabang","Tulis tiap bagian dibantu AI","Edit supaya gayanya konsisten"]],
          ["Cerita interaktif", ["Buat halaman tiap bagian","Hubungkan dengan tautan","Minta teman mencoba"]],
          ["Tokoh dan latar", ["Tentukan tokoh utama dan sifatnya","Tentukan tempat dan suasana ceritamu","Minta AI membantu membuat gambar tokoh dan latar"]],
          ["Aturan permainan", ["Tulis tujuan permainan dalam satu kalimat","Tulis 5 aturan yang mudah dipahami","Tentukan siapa pemenangnya dan bagaimana caranya"]],
          ["Uji coba bersama", ["Ajak dua temanmu mencoba permainanmu","Catat bagian yang membingungkan","Perbaiki satu aturan berdasarkan masukan mereka"]],
          ["Proyek: Board Game atau Cerita Interaktif", ["Pilih salah satu: board game atau cerita bercabang","Buat papan, kartu, atau halaman ceritanya","Tulis petunjuk bermain satu halaman"], "p"]]),
      N(TXT, "ai6", "Portofolio Web", "Website portofolio online.", "33–36", "Lanjut", "Portofolio menunjukkan karya terbaikmu dengan tampilan rapi dan mudah dibuka.",
        ["Pilih karya terbaik saja","Struktur: profil, karya, kontak","Publikasi agar bisa dibuka siapa saja"], ["struktur halaman","tampilan","publikasi"],
        [
          ["Kumpulkan Website Portofolio", ["Pastikan website portofoliomu sudah rapi dan semua bagiannya terbaca","Publikasikan websitenya dan salin alamat linknya","Isi link portofolio atau catatan tentang karyamu di kolom pengumpulan","Klik tombol selesai untuk mengumpulkan"], "k"]])
    ] },
    { id: "d3", c: "#ff9f1c", nama: "Game Dev 3D Lanjutan", meta: "36 Pertemuan · 90 Menit/Sesi",
      ringkas: "Dunia 3D, kontrol karakter, fisika, dan game utuh.", proyek: "Game 3D untuk Showcase", nodes: [
      N(D3, "d1", "World Building & Transformasi", "Sumbu X Y Z dan menyusun dunia.", "1–6", "Menengah", "Setiap benda 3D punya posisi, rotasi, dan skala pada sumbu X, Y, Z.",
        ["X kiri-kanan, Y atas-bawah, Z depan-belakang","Posisi, rotasi, skala","Susun dunia dari bentuk dasar"], ["sumbu","transformasi","menyusun dunia"],
        [
          ["Pulau mini", ["Tambah tanah sebagai dasar","Letakkan 3 benda berbeda","Atur skala agar proporsional"]],
          ["Desa kecil", ["Susun 4 bangunan","Putar agar menghadap jalan","Beri warna berbeda"]],
          ["Sumbu X, Y, Z", ["Taruh sebuah balok di tengah dunia","Geser balok ke arah X, lalu Y, lalu Z","Catat apa yang terjadi pada tiap arah"]],
          ["Putar dan ubah ukuran", ["Putar sebuah balok sampai miring 45 derajat","Ubah ukurannya jadi panjang dan tipis","Bentuk sebuah tangga dari beberapa balok"]],
          ["Warna dan suasana", ["Beri warna berbeda untuk tanah, bangunan, dan pohon","Atur supaya warnanya terlihat serasi","Ambil screenshot sebelum dan sesudah memberi warna"]],
          ["Proyek: Dunia 3D Mini Bertema", ["Pilih tema: pulau, desa, atau kota","Susun minimal 10 benda dengan posisi, putaran, dan ukuran yang tepat","Ambil screenshot dunia 3D-mu"], "p"]]),
      N(D3, "d2", "Kontrol Karakter", "Gerak WASD, kamera, animasi.", "7–12", "Menengah", "Kontrol karakter membaca tombol lalu mengubah posisi tiap frame.",
        ["WASD menggerakkan karakter","Kamera mengikuti karakter","Animasi memberi kesan hidup"], ["WASD","kamera","animasi"],
        [
          ["Karakter bergerak", ["Tambah karakter","Atur gerak maju dan mundur","Uji di Mode Main"]],
          ["Kamera ikut", ["Letakkan kamera di belakang","Atur jarak dan tinggi","Coba berjalan keliling dunia"]],
          ["Lompat", ["Tambahkan aksi lompat untuk karaktermu","Atur tinggi lompatan agar tidak terlalu tinggi","Uji lompat di atas satu benda"]],
          ["Animasi karakter", ["Buat karakter terlihat berbeda saat diam dan saat bergerak","Uji dari arah depan dan samping","Catat bagian yang masih kaku"]],
          ["Atur kecepatan", ["Tentukan kecepatan jalan dan kecepatan lari","Uji di jalan lurus sepanjang 20 langkah","Pilih kecepatan yang paling nyaman dimainkan"]],
          ["Proyek: Karakter Penjelajah", ["Buat dunia kecil yang punya jalan dan beberapa rintangan","Pastikan karakter bisa berjalan, berlari, dan melompat","Pastikan kamera selalu mengikuti karakter"], "p"]]),
      N(D3, "d3", "Fisika & Raycast", "Gravitasi, bounding box, raycasting.", "13–20", "Lanjut", "Fisika membuat benda jatuh dan bertabrakan. Raycast adalah sinar tak terlihat untuk mendeteksi benda di depan.",
        ["Gravitasi menarik ke bawah","Bounding box = kotak pelindung","Raycast mengecek apa yang terkena sinar"], ["gravitasi","bounding box","raycast"],
        [
          ["Rintangan", ["Tambah dinding dan kotak","Aktifkan tabrakan","Uji karakter menabraknya"]],
          ["Deteksi benda", ["Arahkan raycast ke depan","Ubah warna benda yang terkena","Uji dari beberapa sudut"]],
          ["Gravitasi", ["Taruh sebuah benda di udara","Pastikan benda jatuh sampai menyentuh tanah","Ubah tinggi awalnya dan amati waktu jatuhnya"]],
          ["Tabrakan dua benda", ["Buat dua benda yang bisa saling bertabrakan","Tampilkan pesan saat keduanya bersentuhan","Uji dari tiga arah berbeda"]],
          ["Pilih benda dengan klik", ["Coba arahkan pandangan atau klik ke sebuah benda","Ubah warna benda yang kamu pilih","Pastikan benda lain tidak ikut berubah"]],
          ["Proyek: Level Rintangan", ["Rancang jalur dengan 5 rintangan","Beri satu titik awal dan satu titik finish","Minta temanmu menyelesaikan levelmu dan catat waktunya"], "p"]]),
      N(D3, "d4", "Game Loop, Audio & AI Musuh", "Loop game, suara 3D, musuh sederhana.", "21–28", "Lanjut", "Game loop memperbarui dunia berkali-kali per detik. Musuh sederhana mengejar pemain.",
        ["Loop: input, update, gambar","Audio 3D makin keras saat dekat","Musuh menghitung arah ke pemain"], ["game loop","audio 3D","AI musuh"],
        [
          ["Musuh pengejar", ["Tambah musuh","Gerakkan ke arah pemain","Beri jarak berhenti"]],
          ["Suara dan nyawa", ["Pasang suara latar","Kurangi nyawa saat kena","Tampilkan game over"]],
          ["Game loop dan waktu", ["Tambahkan penghitung waktu di gamemu","Hentikan game saat waktu habis","Tampilkan sisa waktu agar pemain tahu"]],
          ["Suara berdasarkan jarak", ["Tambahkan satu suara dari sebuah benda","Buat suaranya makin keras saat karakter mendekat","Uji dari jauh dan dari dekat"]],
          ["Musuh patroli", ["Buat musuh yang berjalan bolak-balik di satu jalur","Buat musuh berhenti mengejar saat pemain jauh","Atur kecepatan supaya masih adil untuk pemain"]],
          ["Proyek: Game Bertahan Hidup 3D", ["Gabungkan karakter, musuh, nyawa, dan penghitung waktu","Tentukan syarat menang dan kalah","Uji minimal 3 kali dan perbaiki bagian yang terlalu sulit"], "p"]]),
      N(D3, "d5", "Optimasi Performa", "Mengurangi beban dan menguji.", "29–32", "Lanjut", "Game yang lancar butuh benda lebih sedikit dan perhitungan lebih hemat.",
        ["Kurangi jumlah benda","Gunakan bentuk sederhana","Uji di banyak perangkat"], ["jumlah objek","profiling","uji perangkat"],
        [
          ["Kurangi beban", ["Hitung jumlah benda di dunia","Gabungkan atau hapus yang tidak perlu","Bandingkan kelancaran"]],
          ["Uji lapangan", ["Jalankan di dua perangkat","Catat bagian yang lambat","Perbaiki satu masalah"]],
          ["Hitung jumlah objek", ["Hitung berapa benda di duniamu","Tandai benda yang sebenarnya tidak perlu","Hapus benda itu lalu bandingkan kelancaran game"]],
          ["Pakai ulang bentuk", ["Cari benda yang bentuknya sama","Ganti beberapa benda dengan hasil gandakan yang lebih sederhana","Catat berapa benda yang berhasil dikurangi"]],
          ["Sembunyikan yang jauh", ["Tentukan benda yang tidak terlihat dari titik awal","Kurangi benda yang jauh dari jalur pemain","Uji apakah pemain masih merasa dunianya lengkap"]],
          ["Proyek: Laporan Optimasi Game", ["Catat kondisi game sebelum dioptimasi","Lakukan minimal 3 perbaikan dari latihan sebelumnya","Tulis laporan sebelum dan sesudah dalam satu halaman"], "p"]]),
      N(D3, "d6", "3D Game Showcase", "Finalisasi dan pameran game.", "33–36", "Lanjut", "Showcase adalah demo game utuh: ada tujuan, tantangan, dan akhir.",
        ["Tentukan tujuan pemain","Poles detail kecil","Siapkan demo singkat"], ["finalisasi","demo","pameran"],
        [
          ["Kumpulkan Game 3D Final", ["Pastikan game 3D-mu bisa dimainkan dari awal sampai selesai","Ambil screenshot terbaik dari duniamu","Isi link karya atau catatan tentang game-mu di kolom pengumpulan","Klik tombol selesai untuk mengumpulkan"], "k"]])
    ] }
  ];
    // ---------- MATERI: tombol "📺 Materi" di tiap task ----------
  //   "idModul"        → berlaku untuk SEMUA task di modul itu
  //   "idModul:nomor"  → hanya satu task (nomor mulai dari 0); menang atas kunci modul
  const MATERI = {
    d2: "Materi/SMP/3D/kontrol-karakter.html", d3: "Materi/SMP/3D/fisika-raycast.html", d4: "Materi/SMP/3D/game-loop-audio-ai.html", d5: "Materi/SMP/3D/optimasi-performa.html",
    ai2: "Materi/SMP/AI/web-html-css-ai.html", ai3: "Materi/SMP/AI/tools-ai.html", ai4: "Materi/SMP/AI/aset-kreatif.html", ai5: "Materi/SMP/AI/game-storytelling.html",
    py4: "Materi/SMP/Python/oop.html", py5: "Materi/SMP/Python/game-2d.html",
    "py2:4": "Materi/SMP/Python/pintu-rahasia-kuis.html", "py2:5": "Materi/SMP/Python/pintu-rahasia-kuis.html",
    py1: "Materi/SMP/Python/python1.html",
    "py1:1": "Materi/SMP/Python/python2.html", "py1:2": "Materi/SMP/Python/python3.html", "py1:3": "Materi/SMP/Python/python4.html", "py1:4": "Materi/SMP/Python/python5.html",
    "py2:0": "Materi/SMP/Python/ceknilai.html", "py2:1": "Materi/SMP/Python/tebakangka.html", "py2:2": "Materi/SMP/Python/menupilihan.html", "py2:3": "Materi/SMP/Python/hitungmundur.html",
    py3: "Materi/SMP/Python/fungsi-math.html",
    ai1: "Materi/SMP/AI/prompt-engineering.html",
    d1: "Materi/SMP/3D/world-building.html",
  };
  window.LP_SMP.forEach((t) => t.nodes.forEach((n) => n.tasks.forEach((k, i) => { k.halamanMateri = MATERI[n.id + ":" + i] || MATERI[n.id] || ""; })));
})();