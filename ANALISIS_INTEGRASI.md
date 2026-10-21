# ANALISIS INTEGRASI FRONTEND-BACKEND
## Dieng Cyber Coding Academy (scratch-clone_Anin)

Tanggal: 21 Oktober 2026  
Lokasi backend: D:\scratch-clone_Anin\backend\server.js  
Lokasi frontend: berkas HTML/JS di root dan subfolder (dashboard/, profil/, SD/, SMP/, shared/js/, tools/)

---

## 1. DAFTAR SEMUA FILE FRONTEND YANG MEMANGGIL /api/

Tabel berikut mencantumkan setiap panggilan fetch ke endpoint /api/ yang ditemukan di kode frontend (kecuali backend/test-endpoints.js yang adalah skrip uji backend, bukan frontend produksi).

### 1.1 index.html — Halaman Login (Firebase)

| No | Endpoint | Metode | Body yang dikirim | Field yang dibaca dari respons | Token auth dikirim? |
|---|----------|--------|-------------------|-------------------------------|---------------------|
| 1 | /api/auth/firebase-login | POST | { idToken: string } | data.email, data.token (digunakan untuk localStorage) | Tidak (ini login pertama, belum ada token) |

Detail:
- Sebelum memanggil endpoint ini, frontend melakukan signInWithEmailAndPassword(auth, email, password) di Firebase client, lalu mengambil firebaseUser.getIdToken().
- Respons disimpan ke localStorage: isLoggedIn=true, email=data.email, scratch_user=data.email (perhatikan: email, bukan username), authToken=data.token.
- localStorage.setItem(username, ...) TIDAK dipanggil di sini (hanya di auth-guard.js dan dashboard.js setelah /api/auth/me).
- Alih-alih redirect ke /dashboard.html.

### 1.2 register.html — Halaman Pendaftaran (Legacy email/password)

| No | Endpoint | Metode | Body yang dikirim | Field yang dibaca dari respons | Token auth dikirim? |
|---|----------|--------|-------------------|-------------------------------|---------------------|
| 2 | /api/auth/register | POST | { email: string, password: string } | Hanya data.message saat error. Saat sukses: tidak ada field yang dibaca (token/username diabaikan) | Tidak |

Detail:
- Frontend memvalidasi password === confirmPassword di sisi klien sebelum kirim.
- Tidak mengirim field username (backend accepts email-only dan generate username otomatis).
- Setelah sukses: hanya menampilkan toast dan redirect ke index.html setelah 1,5 detik. Token yang dikembalikan backend disimpan — user harus login ulang secara manual.

### 1.3 shared/js/auth-guard.js — Penjaga login (dimuat di halaman terlindungi)

| No | Endpoint | Metode | Body | Field yang dibaca | Token auth dikirim? |
|---|----------|--------|------|-------------------|---------------------|
| 3 | /api/auth/me | GET | — | user.username → disimpan ke localStorage (username, scratch_user, isLoggedIn) | Ya (Authorization: Bearer <token>) |

Detail:
- Jika tidak ada token di localStorage → redirect ke /index.html.
- Jika 401/403 → bersihkan session dan redirect ke login.
- Jaringan putus → halaman dibiarkan terbuka (backend tetap menolak).
- Berkas HTML yang memuat skrip ini perlu dicek (lihat bagian Missing Connections).

### 1.4 dashboard/dashboard.js — Dashboard utama

| No | Endpoint | Metode | Body | Field yang dibaca | Token auth dikirim? |
|---|----------|--------|------|-------------------|---------------------|
| 4 | /api/auth/me | GET | — | user.username → localStorage (username, scratch_user, isLoggedIn) | Ya |
| 5 | /api/auth/logout | POST | — | Tidak membaca body | Ya |

Detail:
- Dashboard TIDAK memanggil /api/profile atau GET /api/user/allowed-grades.
- Nama dan avatar diambil sepenuhnya dari localStorage (profile_<currentUser>), bukan dari backend.
- currentUser = localStorage.getItem(username) || localStorage.getItem(scratch_user) || 'tamu'.
- profile = JSON.parse(localStorage.getItem(profile_ + currentUser)). Digunakan profile.fullName dan profile.avatar.
- Avatar dicek: jika profile.avatar ada → buat img dengan src = profile.avatar; jika tidak → huruf pertama username huruf besar.

### 1.5 SD/belajar.js — Halaman belajar SD

| No | Endpoint | Metode | Body | Field yang dibaca | Token auth dikirim? |
|---|----------|--------|------|-------------------|---------------------|
| 6 | /api/auth/me | GET | — | user.username → localStorage | Ya |

Detail: Sama pola dengan dashboard.js — cek sesi, lalu sinkronkan username. Tidak memanggil profile API.

### 1.6 tools/TextEditor/editor.js — Text Editor

| No | Endpoint | Metode | Body | Field yang dibaca | Token auth dikirim? |
|---|----------|--------|------|-------------------|---------------------|
| 7 | /api/auth/me | GET | — | user.username → localStorage | Ya |

### 1.7 tools/Editor3D/editor3d.js — 3D Editor

| No | Endpoint | Metode | Body | Field yang dibaca | Token auth dikirim? |
|---|----------|--------|------|-------------------|---------------------|
| 8 | /api/auth/me | GET | — | user.username → localStorage | Ya |

### 1.8 kurikulum/core/jalur-belajar.js — Modul LP (Learning Progress, digunakan oleh halaman belajar)

| No | Endpoint | Metode | Body | Field yang dibaca | Token auth dikirim? |
|---|----------|--------|------|-------------------|---------------------|
| 9 | /api/progress/<username> | GET | — | progressData.progress atau progressData (fallback); pointsData.total | Ya |
| 10 | /api/progress/<username> | POST | { taskId, completed } | body.points, body.data.earned (menangani baik flat {points, earned} maupun nested {data: {points, earned}} | Ya |
| 11 | /api/points/<username> | GET | — | pointsData.total ?? pointsData | Ya |
| 12 | /api/attempts/<username> | POST | { taskId } | b.fails | Ya |

Header auth: this.authHeaders() mengembalikan { Authorization: 'Bearer ' + token } (dilihat di baris ~200-202, pemanggilan di baris 214-219 dan 335).

Detail saveProgressToServer (baris 275-324): body dikirim { taskId: id, completed: completed === true }. Respons parsing di baris 307:
const d = (body && typeof body.points !== 'number' && body.data && typeof body.data === 'object') ? body.data : (body || {});
→ Frontend siamang terima respons dari backend dalam bentuk flat { ok, message, points, earned } ATAU nested { ok, message, data: { points, earned } }.

### 1.9 SMP/belajar-smp.js — Halaman belajar SMP

| No | Endpoint | Metode | Body | Field yang dibaca | Token auth dikirim? |
|---|----------|--------|------|-------------------|---------------------|
| 13 | /api/materials/SMP/<moduleId> | GET | — | body.materials atau body jika array (Array.isArray(body) ? body : body.materials) | Tidak |
| 14 | /api/tasks/SMP/<moduleId> | GET | — | body.tasks atau body jika array | Tidak |

Detail: Tidak mengirim auth token. Endpoint ini tidak memerlukan auth di backend.

### 1.10 tools/TextEditor/ai-tutor.js — AI Tutor (Text Editor)

| No | Endpoint | Metode | Body | Field yang dibaca | Token auth dikirim? |
|---|----------|--------|------|-------------------|---------------------|
| 15 | /api/ai/tutor | POST | { message, ...context, editorHtml, editorCss, editorLanguage, editorCode, smpTask } | Tidak dijelaskan dalam potongan yang dibaca (fetch tanpa penanganan respons detail dalam rentang yang dilihat) | Opsional (if (token) tambahkan header Authorization) |

Detail: Token ditambahkan hanya jika ada. Backend auth.requireAuth akan menolak jika tidak ada token → 401.

---

## 2. DAFTAR SEMUA ROUTE BACKEND (backend/server.js)

Semua respons menggunakan envelope JSON { ok: boolean, message?: string, ...data } melalui helper sendApiSuccess / sendApiError.

| No | Path | Metode | Auth? | Field yang diwajibkan (request) | Respons yang dikembalikan |
|---|------|--------|-------|---------------------------------|-------------------------|
| B1 | /api/health | GET | Tidak | — | { ok, message, status, info, time, version, database } |
| B2 | /api/materials/:grade/:moduleId | GET | Tidak | grade, moduleId (path params) | { ok, message, materials: [...] } |
| B3 | /api/materials | GET | Tidak | — | { ok, message, materials: [...] } |
| B4 | /api/tasks/:grade/:moduleId | GET | Tidak | grade, moduleId | { ok, message, tasks: [...] } |
| B5 | /api/tasks | GET | Tidak | — | { ok, message, tasks: [...] } |
| B6 | /api/modules/:grade | GET | Tidak | grade | { ok, message, modules: [...] } |
| B7 | /api/auth/login | POST | Tidak | username, password | { ok, message, username, token, status } |
| B8 | /api/auth/firebase-login | POST | Tidak | idToken | { ok, message, username, token, email } |
| B9 | /api/auth/register | POST | Tidak | email atau username (salah satu), password | { ok, message, username, token, email } |
| B10 | /api/auth/firebase-register | POST | Tidak | idToken | { ok, message, username, token, email } |
| B11 | /api/auth/me | GET | Ya (Bearer) | — | { ok, message, username } |
| B12 | /api/auth/logout | POST | Ya (Bearer) | — | { ok, message } |
| B13 | /api/profile | GET | Ya (Bearer) | — | { ok, message, profile: { username, email, fullName, bio, avatarUrl, firebaseUid, createdAt } } |
| B14 | /api/profile | PUT | Ya (Bearer) | Opsional: fullName, email, bio, avatarUrl, avatar | { ok, message, profile: { ... } } |
| B15 | /api/user/allowed-grades | GET | Ya | — | { ok, message, grades: [...] } |
| B16 | /api/user/allowed-grades | PUT | Ya | grades (array non-kosong, nilai SD/SMP/SMK) | { ok, message, grades: [...] } |
| B17 | /api/dev/progress | GET | Tidak (dev only) | — | { ok, message, username, progress: [...] } |
| B18 | /api/dev/progress | POST | Tidak (dev only) | taskId, completed (boolean) | { ok, message, username, taskId, completed, points, earned } |
| B19 | /api/dev/points | GET | Tidak (dev only) | — | { ok, message, username, total } |
| B20 | /api/dev/points | POST | Tidak (dev only) | total (integer >= 0) | { ok, message, username, total } |
| B21 | /api/progress/:username | GET | Ya + sameUser | username (path param = user login) | { ok, message, progress: [...] } |
| B22 | /api/progress/:username | POST | Ya + sameUser | taskId, completed (boolean) | { ok, message, username, taskId, completed, points, earned } |
| B23 | /api/attempts/:username | POST | Ya + sameUser | taskId | { ok, message, username, taskId, fails, timeSpent } |
| B24 | /api/attempts/:username | GET | Ya + sameUser | — | { ok, message, username, attempts: [...] } |
| B25 | /api/points/:username | GET | Ya + sameUser | — | { ok, message, username, total } |
| B26 | /api/points/:username | POST | Ya + sameUser | — | 410 GONE (dimatikan, pakai /api/progress) |
| B27 | /api/ai/tutor | POST | Ya (Bearer) | message (wajib), smpTask.nodeId harus di daftar izinkan | { ok, message, ...result } |

Detail validasi profil (B14, server.js baris 635-677):
- Terima fullName (max 100), email (max 255, harus mengandung @), bio (max 1000), avatarUrl (max 500000), avatar (max 500000).
- avatar_url di DB di-set via COALESCE(avatarUrl, avatar_url, ?) dengan parameter (avatarUrl, avatar). Jika keduanya dikirim, avatarUrl yang menang.
- Tidak ada upload file/multipart; avatar harus berupa string (URL atau data URL) dalam JSON body.

Detail auth Firebase (server.js baris 466-493, auth.js baris 34-54):
- verifyFirebaseToken mengharuskan email berakhiran @diengcyber.local, otherwise error Format email Firebase tidak dikenali.
- Username diambil dari prefix email sebelum @diengcyber.local.

---

## 3. ANALISIS ALUR PROFILE / AVATAR

### 3.1 profil.html — cara avatar upload bekerja

Berkas: D:\scratch-clone_Anin\profil\profil.html (skrip inline di baris 201-375)

Elemen yang relevan:
- <input type=file id=avatarInput accept=image/* class=hidden> — dipicu oleh label kamera di atas avatar.
- <img id=avatarImage src= ...> — preview avatar besar.
- <img id=navAvatarPreview src= ...> — mini avatar di top bar.
- <button id=btnRandomAvatar>🎲 Acak Karakter Robot Baru</button> — avatar acak dari DiceBear.
- <form id=profileForm> — field fullName, username (readonly), email, bio.

Alur avatar upload (baris 325-343):
1. User pilih file gambar lewat avatarInput.
2. Dicecek ukuran ≤ 2 MB.
3. shrinkImage(file, 256, cb) mengecilkan gambar ke canvas 256×256 (crop tengah), output JPEG data URL kualitas 0.85.
4. setAvatar(dataUrl) memperbarui currentAvatar, avatarImage.src, dan navAvatarPreview.src secara langsung (optimistic UI).
5. Muncul notifikasi: Foto dipilih! Klik Simpan Perubahan Profil supaya tersimpan.

Alur avatar acak (baris 345-349):
- robotUrl(seed) → https://api.dicebear.com/7.x/bottts/svg?seed=<seed>.
- setAvatar(robotUrl(...)). Notifikasi serupa.

saveProfile() — apa yang dilakukan (baris 351-374):
const ok = saveProfile({
  fullName: fullNameVal,
  email: emailInput.value.trim(),
  bio: bioInput.value.trim(),
  avatar: currentAvatar   // data URL atau DiceBear URL
});
- saveProfile(data) (baris 232-239) hanya menulis ke localStorage.setItem(PROFILE_KEY, JSON.stringify(data)), di mana PROFILE_KEY = 'profile_' + currentUser.
- Tidak ada panggilan fetch ke backend (/api/profile tidak pernah dipanggil).
- Data disimpan hanya di browser ini, per akun (currentUser), bukan di server.

loadProfile() (baris 229-231): hanya baca dari localStorage.

Inisialisasi tampilan (baris 245-278):
- Baca profile dari localStorage.
- currentAvatar = profile.avatar || robotUrl('DiengCoder-' + currentUser).
- Isi form: fullNameInput.value, emailInput.value, bioInput.value, avatar.
- paintNames(fullName) memperbarui displayFullName, topBarUser, displayUsername.

Masalah utama di sini: currentUser diambil dari localStorage.getItem(username) || localStorage.getItem(scratch_user). Karena index.html menyimpan scratch_user = data.email (email lengkap, mis. budi@diengcyber.local), maka PROFILE_KEY bisa jadi profile_budi@diengcyber.local — berbeda dengan profile_budi yang digunakan dashboard setelah /api/auth/me mengeset username. Profil tidak terpartai antar halaman.

### 3.2 dashboard.js — cara membaca profile/avatar untuk ditampilkan

Berkas: D:\scratch-clone_Anin\dashboard\dashboard.js

- Tidak memanggil GET /api/profile sama sekali.
- profile = JSON.parse(localStorage.getItem(profile_ + currentUser)) || {} (baris 57-58).
- shownName = profile.fullName || '@' + savedUser (baris 60).
- Avatar: jika profile.avatar ada → buat img dengan src = profile.avatar; jika tidak → huruf pertama currentUser (baris 64-72).
- Bingkai hadiah (AvatarFrame) dipasang di avatar box dan navAvatarBox (baris 74-78) — tapi ini dari LP.hadiahAktif(), bukan dari avatar_url di DB.

Kesimpulan: dashboard menampilkan profil dari localStorage, tidak pernah menyinkronkan dengan backend /api/profile.

### 3.3 Backend — GET/PUT /api/profile

Berkas: D:\scratch-clone_Anin\backend\server.js baris 611-677

GET /api/profile (auth required):
- Query DB: SELECT username, email, full_name, bio, avatar_url, firebase_uid, created_at FROM users WHERE username = ?
- Respons:
  { ok: true, message: OK, profile: { username: ..., email: ..., fullName: ..., bio: ..., avatarUrl: ..., firebaseUid: ..., createdAt: ... } }

PUT /api/profile (auth required):
- Body yang diterima: fullName, email, bio, avatarUrl, avatar (semua opsional).
- avatar_url di-set dengan COALESCE(avatarUrl, avatar_url_existing, avatar) — jika avatarUrl dikirim maka pakai itu, kalau tidak pakai avatar, kalau keduanya tidak ada biarkan yang lama.
- Respons sama dengan GET (kembalikan profile lengkap setelah update).
- Tidak ada frontend yang memanggil endpoint ini (lihat Missing Connections).

---

## 4. MISMATCHES (KETIDAKCUKUPAN / KESEPIAN)

### 4.1 CRITICAL MISMATCHES (akan menyebabkan error atau gagal fungsi)

#### C1. register.html tidak menyimpan token sesi setelah pendaftaran berhasil
- Frontend POST /api/auth/register menerima respons { ok, message, username, token, email } tetapi mengabaikan data.token dan data.username.
- Hanya menampilkan toast sukses dan redirect ke index.html setelah 1,5 detik.
- Akibat: user harus login ulang secara manual di halaman login. Sesi tidak otomatis dibuat di browser.

#### C2. index.html menyimpan scratch_user = data.email (email lengkap) bukan data.username
- Baris 243: localStorage.setItem(scratch_user, data.email).
- data.email dari backend firebase-login adalah email lengkap (mis. budi@diengcyber.local), sedangkan data.username adalah prefix (mis. budi).
- dashboard.js dan auth-guard.js memperbaiki ini setelah memanggil /api/auth/me (menimpa scratch_user dengan user.username). Tapi profil.html tidak pernah memanggil /api/auth/me, jadi scratch_user tetap berupa email lengkap.
- Akibat: PROFILE_KEY = 'profile_' + currentUser di profil.html menjadi profile_budi@diengcyber.local, sedangkan dashboard (setelah /api/auth/me) menggunakan profile_budi. Data profil tersimpan di dua localStorage key yang berbeda tergantung urutan kunjungan halaman — profil yang diatur di halaman Profil tidak akan muncul di Dashboard dan sebaliknya.

#### C3. /api/auth/login (legacy username/password) di backend tidak pernah dipanggil oleh frontend mana pun
- Backend menyediakan POST /api/auth/login yang menerima { username, password }.
- index.html melewati endpoint ini sepenuhnya: menggunakan Firebase signInWithEmailAndPassword lalu POST /api/auth/firebase-login.
- register.html membuat akun legacy (email+password di SQLite) tapi tidak ada cara untuk login dengan kredensial tersebut lewat antarmuka — index.html hanya support Firebase login yang mengharuskan email @diengcyber.local.
- Akibat: user yang mendaftar lewat register.html (dengan email non-@diengcyber.local) tidak dapat login melalui index.html karena Firebase akan menolak email yang bukan domain @diengcyber.local di verifyFirebaseToken.

#### C4. Firebase login terbatas pada domain @diengcyber.local
- auth.verifyFirebaseToken (auth.js baris 46-48) melempar error jika email tidak berakhiran @diengcyber.local.
- Firebase config di shared/js/firebase.js adalah project nyata (dieng-cyber-coding). User yang login dengan email biasa (mis. siswa@gmail.com) akan sukses di Firebase client tapi gagal di backend /api/auth/firebase-login.
- Akibat: login Firebase hanya berfungsi untuk akun dengan domain internal.

#### C5. profil.html tidak memiliki validasi token terhadap backend
- Hanya memeriksa if (!localStorage.getItem('authToken')) location.replace('/index.html') (baris 203-205).
- Tidak memanggil /api/auth/me untuk memvalidasi sesi. Token yang sudah expired atau invalid masih memungkinkan akses halaman profil (meski tidak ada panggilan backend yang dilakukan).
- Ini adalah lapisan UX yang lemah dibandingkan auth-guard.js.

### 4.2 MINOR MISMATCHES (gagal secara sepi / inkonsisten)

#### M1. Respons API menggunakan envelope { ok, message, ...data }, tapi beberapa frontend mengasumsikan field top-level
- Backend sendApiSuccess selalu mengembalikan { ok: true, message, ...data }.
- auth-guard.js dan dashboard.js membaca user.username langsung dari top-level respons — berfungsi karena username di-spread ke top-level.
- API.md mendokumentasikan /api/auth/me mengembalikan { username } (flat), padahal sebenarnya { ok, message, username }. Frontend sudah menangani dengan benar, tapi dokumentasi tidak sinkron.
- jalur-belajar.js saveProgressToServer (baris 307) secara sengaja menangani kedua bentuk (flat dan nested {data: ...}) — ini indikasi bahwa ketidakkonsistenan envelope sudah diantisipasi di satu tempat namun tidak di semua tempat.

#### M2. localStorage.setItem(email, data.email) di index.html tidak pernah dibaca oleh kode mana pun
- Data email disimpan tetapi tidak ada localStorage.getItem(email) di seluruh kode frontend. Data mati.

#### M3. PUT /api/profile menerima avatarUrl dan avatar sebagai field terpisah
- Backend: avatar_url = COALESCE(avatarUrl, avatar_url, avatar) — parameter (avatarUrl, avatar), jadi jika keduanya dikirim avatarUrl yang menang. Penamaan yang membingungkan (avatarUrl vs avatar).
- Tidak ada frontend yang memakai, jadi tidak menyebabkan error saat ini, tetapi adalah sumber kebingungan saat diimplementasikan.

#### M4. Nama field profile tidak sinkron antara localStorage dan backend
- localStorage (profil.html/dashboard.js): fullName, email, bio, avatar.
- Backend DB/response: full_name, email, bio, avatar_url → di-respons sebagai fullName, avatarUrl.
- avatar di localStorage adalah data URL (base64) yang bisa besar; avatar_url di backend adalah string (max 500.000 char). Tidak ada pemapping yang mengkonversi salah satu ke yang lain karena tidak ada panggilan API profile.

### 4.3 MISSING CONNECTIONS (frontend memanggil endpoint yang tidak ada, atau backend endpoint tidak pernah dipanggil)

#### MC1. Backend endpoint yang tidak pernah dipanggil oleh frontend produksi:
- POST /api/auth/login (legacy username/password) — orang tua login sistem yang seharusnya cocok dengan register.html, tapi tidak ada UI yang memanggilnya.
- GET /api/profile — endpoint profil GET tidak pernah dipanggil.
- PUT /api/profile — endpoint profil PUT tidak pernah dipanggil (avatar/biodata tidak pernah tersimpan ke server).
- GET /api/user/allowed-grades dan PUT /api/user/allowed-grades — dashboard.js memiliki komentar TODO (baris 182-183) tentang allowedGrades tetapi tidak pernah memanggil endpoint ini. allowedGrades() hanya baca localStorage dengan fallback ['sd','smp','smak'].
- POST /api/ai/tutor — dipanggil oleh tools/TextEditor/ai-tutor.js tetapi token hanya ditambahkan if (token); backend akan menolak (401) jika tidak ada token.

#### MC2. Tidak ada frontend yang memanggil /api/auth/login meski register.html membuat akun legacy
- Seperti disebutkan di C3: user terdaftar lewat register.html tidak bisa login lewat index.html (Firebase-only + domain restrictions).

### 4.4 PROFILE/AVATAR SPECIFIC ISSUES

#### P1. Profil tidak disimpan ke server sama sekali
- saveProfile() di profil.html hanya menulis ke localStorage. PUT /api/profile dan GET /api/profile di backend tidak tersentuh.
- Avatar (file upload atau DiceBear) disimpan sebagai data URL di localStorage, tidak tersimpan ke kolom avatar_url di tabel users.
- fullName, email, bio di form profil tidak pernah dikirim ke server.

#### P2. Nama field avatar tidak konsisten
- Frontend localStorage: avatar (data URL string).
- Backend DB: avatar_url.
- Backend response: avatarUrl.
- Tidak ada konversi/pemapping karena tidak ada integrasi.

#### P3. Avatar acak dari DiceBear mungkin diblokir CSP
- robotUrl() mengarah ke https://api.dicebear.com/7.x/bottts/svg?seed=...
- CSP backend (server.js baris 190): img-src 'self' data:. api.dicebear.com tidak tercantum di img-src atau connect-src.
- Akibat: <img src=https://api.dicebear.com/...> akan diblokir oleh CSP browser. Tombol Acak Karakter Robot Baru tidak akan menampilkan gambar.

#### P4. Key profil bervariasi tergantung halaman yang pertama dikunjungi
- Seperti C2: scratch_user di index.html = email lengkap. Jika user buka profil.html dulu (belum lewat dashboard), currentUser = email lengkap, PROFILE_KEY = profile_budi@diengcyber.local. Jika buka dashboard dulu, currentUser = budi, PROFILE_KEY = profile_budi. Data profil terpecah di dua key.

#### P5. Tidak ada sinkronisasi profil antar perangkat
- Karena semua di localStorage, profil (nama, avatar, bio) hilang jika user login dari browser/perangkat lain.

### 4.5 CORS / CSP / HEADER ISSUES

#### H1. CORS
- server.js baris 112-120: jika NODE_ENV === production dan FRONTEND_ORIGIN di-set → CORS terbatas. Jika development atau tidak ada env → app.use(cors()) (boleh semua origin).
- Frontend disajikan oleh Express yang sama (express.static(PROJECT_ROOT)), sehingga panggilan /api/ adalah same-origin — CORS tidak menjadi masalah untuk panggilan frontend ke backend yang sama.
- Tidak ada file .env di repositori (glob .env* tidak menemukan apa-apa), jadi FRONTEND_ORIGIN tidak terdefinisi dan NODE_ENV kemungkinan tidak diset → CORS membuka semua origin di development. Ini aman untuk development tapi harus dikonfigurasi untuk production.

#### H2. CSP (Content Security Policy) — server.js baris 190
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://www.gstatic.com;
  style-src 'self' 'unsafe-inline'; img-src 'self' data:;
  connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://dieng-cyber-coding.firebaseapp.com;

- connect-src mencakup same-origin ('self') + Firebase Auth endpoints. Panggilan /api/ dari frontend aman.
- connect-src tidak mencakup https://dieng-cyber-coding.firebasestorage.app (storageBucket dari firebaseConfig). Jika di masa depan avatar di-upload ke Firebase Storage, akan diblokir.
- img-src adalah 'self' data: — tidak mencakup https://api.dicebear.com (digunakan profil.html untuk avatar acak). Gambar robot acak akan diblokir.
- script-src mencakup https://www.gstatic.com (Firebase SDK) dan 'unsafe-inline' (skrip inline di profil.html dan index.html). Modul ES dari /shared/js/firebase.js (same-origin) terpaksa oleh 'self'.

#### H3. Header keamanan lain
- X-Content-Type-Options: nosniff — diterapkan.
- X-Frame-Options: DENY — diterapkan.
- Referrer-Policy: no-referrer — diterapkan.
- Tidak ada header Authorization masalah; frontend mengirim Authorization: Bearer <token> dengan benar di semua panggilan yang memerlukan auth.

---

## 5. RINGKASAN REKOMENDASI PERBAIKAN

Berikut deskripsi perubahan yang harus dilakukan (belum ditulis kode):

### R1 (Critical) — Sinkronkan scratch_user dengan username dari backend
Di index.html, setelah respons /api/auth/firebase-login, simpan data.username ke localStorage.setItem(username, data.username) dan localStorage.setItem(scratch_user, data.username) (bukan data.email). Simpan data.email ke localStorage.setItem(email, data.email) jika diperlukan. Ini memastikan currentUser di profil.html konsisten dengan dashboard.

### R2 (Critical) — Hubungkan profil.html ke backend /api/profile
- Tambahkan pemanggilan GET /api/profile saat halaman profil dimuat (dengan header Authorization: Bearer <token>) untuk mengambil nama, email, bio, dan avatarUrl dari server sebagai sumber kebenaran.
- Ubah saveProfile() agar memanggil PUT /api/profile dengan body { fullName, email, bio, avatarUrl: currentAvatar } setelah menyimpan ke localStorage (atau ganti localStorage sepenuhnya dengan server).
- Saat respons sukses, perbarui tampilan dari data server (termasuk avatarUrl).

### R3 (Critical) — Atasi kesenjangan sistem login register vs login
- Opsi A: Buat halaman login yang juga mendukung POST /api/auth/login dengan { username, password } untuk akun yang terdaftar lewat register.html.
- Opsi B: Ubah register.html untuk membuat akun Firebase (dengan email @diengcyber.local) alih-alih legacy SQLite, agar cocok dengan alur login Firebase yang ada.
- Jika memilih Opsi A, pastikan index.html memiliki fallback: coba Firebase login dulu, jika gagal (atau email bukan @diengcyber.local) coba POST /api/auth/login dengan { username: emailPrefix, password }.

### R4 (Critical) — register.html simpan token setelah pendaftaran
Setelah POST /api/auth/register sukses, simpan data.token, data.username, dan data.email ke localStorage, lalu redirect langsung ke /dashboard.html (alias alirkan ke login jika ingin memaksa konfirmasi).

### R5 (Minor) — frontend profil.html harus memvalidasi sesi via /api/auth-me
Muat shared/js/auth-guard.js di profil.html atau tambahkan pemanggilan fetch('/api/auth/me', { Authorization: Bearer token }) dengan penanganan 401/403 yang redirect ke login. Hindari akses dengan token expired.

### R6 (Minor) — Konsistenkan envelope respons API
Pastikan semua frontend yang membaca respons API mengecek response.ok dan menahan body dalam envelope { ok, message, ...data }. Dokumentasi API.md harus diperbarui untuk mencerminkan bentuk sebenarnya (termasuk profile di bawah kunci profile).

### R7 (Minor) — Panggil /api/user/allowed-grades di dashboard
Dashboard.js memiliki komentar TODO tentang allowedGrades. Implementasikan pemanggilan GET /api/user/allowed-grades setelah login untuk menyaring tab jenjang (SD/SMP/SMK) yang benar-benar diizinkan per user, alih-alih fallback ke semua jenjang.

### R8 (Profile/Avatar) — Atasi perbedaan key profil antara halaman
Pastikan currentUser selalu berupa username (bukan email) di semua halaman. Dengan R1 dan pemanggilan /api/auth-me di profil.html, username dan scratch_user akan konsisten, sehingga PROFILE_KEY = 'profile_' + currentUser akan sama di dashboard dan profil.

### R9 (Profile/Avatar) — Perbaiki CSP untuk avatar acak
Tambahkan https://api.dicebear.com ke img-src (atau ganti sumber avatar acak ke origin sendiri) di header CSP server.js agar tombol Acak Karakter Robot Baru bekerja. Jika berencana meng-upload avatar ke Firebase Storage, tambahkan https://dieng-cyber-coding.firebasestorage.app ke connect-src.

### R10 (Minor) — Hapus atau dokumentasikan localStorage.setItem(email, ...) yang tidak digunakan
Atau mulai gunakan nilai email tersebut di profil.html (isi awal field email dari server lewat /api/profile alih-alih localStorage).

### R11 (Minor) — Sederhanakan field avatar di backend PUT /api/profile
Terima hanya satu field avatarUrl (atau avatar, pilih satu) untuk menghindari kebingungan COALESCE(avatarUrl, avatar_url, avatar). Update dokumentasi API.md untuk mencantumkan endpoint /api/profile dan field yang diterima/dikembalikan.

### R12 (Header) — Konfigurasikan FRONTEND_ORIGIN untuk production
Buat file backend/.env dan set NODE_ENV=production serta FRONTEND_ORIGIN ke domain frontend sebenarnya agar CORS tidak membuka semua origin di production.

---

## 6. TABEL CEKLIS KORRELASI FRONTEND ↔ BACKEND

| Endpoint | Dipanggil Frontend? | File pemanggil | Status |
|---|---|---|---|
| POST /api/auth/login | Tidak | — | Orphan (backend ada, frontend tidak ada) |
| POST /api/auth/firebase-login | Ya | index.html | OK |
| POST /api/auth/register | Ya | register.html | OK (tapi token disimpan tidak) |
| POST /api/auth/firebase-register | Tidak | — | Orphan |
| GET /api/auth/me | Ya | auth-guard.js, dashboard.js, SD/belajar.js, editor.js, editor3d.js | OK |
| POST /api/auth/logout | Ya | dashboard.js | OK |
| GET /api/profile | Tidak | — | Orphan |
| PUT /api/profile | Tidak | — | Orphan |
| GET /api/user/allowed-grades | Tidak | — | Orphan (dashboard.js hanya komentar TODO) |
| PUT /api/user/allowed-grades | Tidak | — | Orphan |
| GET /api/progress/:username | Ya | jalur-belajar.js (LP) | OK |
| POST /api/progress/:username | Ya | jalur-belajar.js (LP) | OK |
| GET /api/points/:username | Ya | jalur-belajar.js (LP) | OK |
| POST /api/attempts/:username | Ya | jalur-belajar.js (LP) | OK |
| GET /api/materials/SMP/:id | Ya | SMP/belajar-smp.js | OK |
| GET /api/tasks/SMP/:id | Ya | SMP/belajar-smp.js | OK |
| POST /api/ai/tutor | Ya | tools/TextEditor/ai-tutor.js | OK (tapi token opsional) |
| GET /api/health | Tidak (hanya test) | — | Digunakan test-endpoints.js |

---

File analisis ini ditulis ke: D:\scratch-clone_Anin\ANALISIS_INTEGRASI.md
Tidak ada berkas yang dimodifikasi selama penulisan laporan ini.
