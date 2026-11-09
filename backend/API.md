# API Dieng Cyber Coding

Semua alamat diawali `http://localhost:3000`.
Kecuali endpoint publik (`/api/auth/login`, `/api/auth/register`, `/api/auth/firebase-*`, `/api/health`, `/api/plugins`, `/api/plugins/:id`), permintaan wajib membawa header:

    Authorization: Bearer <token>

Envelope sukses: `{ ok: true, message, ...data }`.
Envelope error: `{ ok: false, code, message, details? }`.

## Auth

| Method | Alamat | Isi (body) | Hasil |
|---|---|---|---|
| POST | `/api/auth/register` | `{ email, password }` atau `{ username, password }` | `{ id, token, username, email, role, accountStatus }` |
| POST | `/api/auth/login` | `{ email, password }` atau `{ username, password }` | `{ id, token, username, email, status, role, accountStatus }` |
| POST | `/api/auth/firebase-login` | `{ idToken }` | `{ id, token, username, email, role, accountStatus }` |
| POST | `/api/auth/firebase-register` | `{ idToken }` | `{ id, token, username, email, role, accountStatus }` |
| GET  | `/api/auth/me` | - | `{ id, username, email, fullName, role, status, mustChangePassword, lastLoginAt, hasPassword }` |
| POST | `/api/auth/change-password` | `{ currentPassword?, newPassword }` | `{ id, username }` |
| POST | `/api/auth/logout` | - | `{ message }` |

Catatan auth:

- Login menerima **email atau username**. Email tidak peka huruf besar/kecil, dan disimpan dalam bentuk lowercase.
- Register dengan `email` akan otomatis membuat `username` dari bagian sebelum `@` (contoh `budi.santoso@mail.com` → `budisantoso`). Jika bentrok, diberi akhiran angka.
- `status` pada login hanya menandai cara login: `claimed` (akun legacy yang baru mengklaim password) atau `login` (login biasa).
- Akun Firebase (punya `email`/`firebase_uid` tetapi belum punya password) **tidak bisa diklaim lewat login biasa**. Pemilik harus login lewat Firebase dulu, lalu memanggil `POST /api/auth/change-password` untuk mengatur password DB.
- `POST /api/auth/change-password` mewajibkan `currentPassword` bila akun sudah punya password. Sesi di perangkat lain otomatis dicabut; sesi yang sedang dipakai tetap aktif.
- Profil (`PUT /api/profile`) juga menerima `email`; email yang sudah dipakai akun lain ditolak `409 EMAIL_EXISTS`.
- Masa sesi login (`sessionHours`) dan password minimum (`minPassword`) diambil dari pengaturan instansi yang disimpan lewat `PUT /api/admin/settings`; default backend: sesi 12 jam, password minimal 8 karakter. Login/register/firebase-register membuat sesi dengan TTL sesuai pengaturan; `POST /api/auth/change-password` memakai batas password minimum yang sama.

Kode error auth: `400` input salah, `401` kredensial salah/belum login/sesi habis, `403` akun suspended/deleted atau membuka data user lain, `409` email/username sudah terdaftar, `429` terlalu banyak percobaan.

## Identitas, role, dan status

- Identitas kanonis adalah `users.id`. Tabel `sessions`, `progress`, `points`, `attempts`, dan `user_items` memakai `user_id` dengan FK ke `users(id)`.
- `username` adalah nama login/display yang **boleh diubah admin**. Rename tidak memindahkan progress, poin, attempt, item, atau sesi karena semuanya memakai `user_id`.
- Role DB saat ini: `student`, `admin`, dan `instruktur`. Orang tua/wali **bukan** akun login; laporan mereka diakses lewat tautan bertoken. Akun admin dibuat lewat CLI, bukan lewat UI admin:
  `cd backend && npm run create-admin`.
- Akun yang **sudah ada** bisa dipromosikan tanpa membuat akun baru dan tanpa mengubah password:
  `cd backend && npm run promote-admin -- admin@diengcyber.local`. Idempoten; menulis audit `admin.promoted.cli`.
  Status akun tidak diubah otomatis, jadi pastikan `status = active`.
- Status akun: `active`, `suspended`, `deleted`. Akun suspended/deleted ditolak saat login dan saat memakai token lama.
- Endpoint lama `/api/progress/:username`, `/api/points/:username`, dan `/api/attempts/:username` masih menerima username untuk kompatibilitas frontend. Otorisasi tetap membandingkan `users.id`; setelah rename, frontend harus memakai username baru (ambil ulang `/api/auth/me`).
- Akses upload/review/publish plugin memakai allowlist admin developer: `PLUGIN_DEVELOPER_USER_IDS` (daftar `users.id` dipisah koma). Role `superadmin` belum diaktifkan di schema; allowlist ini adalah mekanisme developer untuk MVP.

## Data murid

| Method | Alamat | Isi (body) | Hasil |
|---|---|---|---|
| GET  | `/api/progress/:username` | - | `{ progress: [{ task_id, completed, completed_at, bonus_awarded }] }` |
| GET  | `/api/progress/:username?grade=SMP&module=py1` | - | sama, difilter via JOIN tasks |
| POST | `/api/progress/:username` | `{ taskId, completed }` | `{ username, taskId, completed, points, earned, reconciledDifference }` |
| GET  | `/api/points/:username` | - | `{ username, total, earned, spent, balance }` |
| POST | `/api/points/:username` | - | `410 GONE` — total dihitung server dari task selesai |
| POST | `/api/attempts/:username` | `{ taskId, timeSpent? }` | `{ username, taskId, fails, timeSpent }` |
| GET  | `/api/attempts/:username` | - | `{ username, attempts: [{ task_id, fails, time_spent, updated_at }] }` |
| POST | `/api/dev/attempts` | `{ taskId, timeSpent? }` | `{ username: "dev", taskId, fails, timeSpent }` |

Menyelesaikan task (`POST /api/progress` → `completed: true`) otomatis mengkredit `tasks.points` (default task 10 / project 50, bisa per-task dari kurikulum); un-check mendebit kembali. Idempoten.

Bonus percobaan pertama (semua task): selesai tanpa gagal tercatat (`POST /api/attempts/:username` `{ taskId }` per cek misi yang gagal) + belum pernah dapat bonus → tambah `FIRST_TRY_BONUS` (default 5, via env). Bonus hanya sekali seumur (user, task); un-check mendebit basis + bonus.

Setiap perubahan progress menghitung ulang `points.total` dari seluruh task yang masih selesai dan bonus yang memang pernah diperoleh. Dengan demikian, selisih lama di tabel points tidak terus terbawa ke request berikutnya. Gunakan `npm run backfill:points` untuk audit/perbaikan data lama secara manual setelah backup.

`taskId` harus berupa string maksimal 128 karakter. `timeSpent` (detik) opsional, bilangan bulat 0–86400 per request, lalu dijumlahkan ke total waktu aktif per task.

### Jadwal mentoring

| Method | Alamat | Isi (body) | Hasil |
|---|---|---|---|
| GET | `/api/jadwal?bulan=YYYY-MM` | - | `{ jadwal: [{ id, judul, jenis, level, mentor, keterangan, tanggal, mulai, selesai, zoomUrl, meetingId, passcode, grades }], bulan }` |
| GET | `/api/admin/jadwal?bulan=YYYY-MM&limit=200` | - | `{ items, total, bulan }`; tanpa `bulan` memuat jadwal terbaru |
| POST | `/api/admin/jadwal` | `{ judul, tanggal, mulai, selesai, grades?, jenis?, level?, mentor?, keterangan?, zoomUrl?, meetingId?, passcode? }` | `{ item }`; `201` |
| PATCH | `/api/admin/jadwal/:id` | field yang ingin diubah | `{ item }` |
| DELETE | `/api/admin/jadwal/:id` | - | `{ id }` |

- `tanggal` wajib `YYYY-MM-DD` yang sah (tahun 2000-2100), `mulai`/`selesai` wajib `HH:MM`, dan `selesai` harus lebih lambat dari `mulai`. Waktu disimpan sebagai waktu lokal WIB, bukan UTC.
- `grades` berisi `SD`/`SMP`/`SMK`; array kosong berarti jadwal berlaku untuk semua jenjang. Murid dengan `allowed_grades` kosong juga melihat semua jadwal.
- `zoomUrl` opsional, tetapi bila diisi wajib URL `https` tanpa kredensial. `judul` maksimal 120 karakter, `jenis` 60, `level`/`mentor` 80, `keterangan` 500, `zoomUrl` 500.
- Endpoint murid hanya mengembalikan jadwal pada bulan yang diminta dan menyaring berdasarkan jenjang murid. Respons tidak memuat kolom internal seperti `created_by`.
- Endpoint admin memakai permission `kurikulum.kelola`. Semua perubahan dicatat di `admin_audit` (`jadwal.create`, `jadwal.update`, `jadwal.delete`).

### Learning analytics, achievement, dan pesan mentor

| Method | Alamat | Hasil |
|---|---|---|
| GET | `/api/learning/analytics` | `{ analytics }` untuk siswa yang sedang login |
| GET | `/api/achievements` | `{ achievements, total, earned }` untuk siswa yang sedang login |
| GET | `/api/mentor-note` | `{ item }` pesan mentor milik siswa yang sedang login |
| GET | `/api/admin/users/:id/learning/analytics` | `{ analytics }`; admin/instruktur dengan permission `siswa.kelola` |
| GET | `/api/admin/users/:id/achievements` | `{ achievements, total, earned }`; admin/instruktur dengan permission `siswa.kelola` |
| GET | `/api/admin/users/:id/mentor-note` | `{ item }`; admin/instruktur dengan permission `siswa.kelola` |
| PUT | `/api/admin/users/:id/mentor-note` | `{ note }`; admin/instruktur dengan permission `siswa.kelola` |

`analytics.summary` menyimpan total task, task selesai, completion rate, modul selesai, jumlah achievement, total kegagalan yang tercatat, waktu yang tercatat saat endpoint attempt dipanggil, serta poin earned/spent/balance. Nilai `timeSpentSeconds` **bukan** total waktu aktif belajar; hanya durasi yang dikirim bersama pencatatan attempt. `analytics.modules` menyimpan ringkasan per grade dan module, termasuk rincian task, status capstone, dan achievement. `estimatedAttempts` hanya estimasi (`failedAttempts + 1` untuk task yang selesai), bukan jumlah run yang dicatat oleh editor. Metadata `analytics.tracking` menjelaskan sumber hitungan tersebut.

Achievement kurikulum dihitung dari database: semua task pada modul harus selesai dan minimal satu task pada modul itu harus ditandai `is_project` atau `requires_submission`, serta seluruh task capstone harus selesai. API bersifat derived/read-only; tidak ada status achievement yang bisa diubah langsung oleh klien.

Pesan mentor maksimal 400 karakter. Hanya admin/instruktur yang lolos permission `siswa.kelola` yang dapat menulis atau menghapus pesan (`PUT` dengan `note: ""` menghapus). Siswa hanya dapat membaca pesannya sendiri. Pesan ikut dimasukkan ke response laporan wali. Belum ada relasi penugasan mentor-ke-siswa di skema saat ini; akses instruktur mengikuti permission `siswa.kelola` yang berlaku.

### Notifikasi siswa

| Method | Alamat | Isi (body) | Hasil |
|---|---|---|---|
| GET | `/api/notifications?limit=20` | - | `{ notifications, unreadCount }`; hanya notifikasi milik siswa yang login |
| POST | `/api/notifications/:id/read` | - | `{ id, read: true, unreadCount }` |
| POST | `/api/notifications/read-all` | - | `{ updated, unreadCount: 0 }` |

Notifikasi siswa disimpan di tabel `student_notifications` (terpisah dari `admin_notifications`). Notifikasi dibuat otomatis saat pengumpulan tugas berubah menjadi `dinilai` (nilai baru/berubah) atau `revisi` (feedback baru/berubah). Menyimpan ulang nilai yang sama tidak membuat notifikasi ganda karena memakai `dedupe_key`. Item berisi `{ id, kind, title, body, view, icon, tone, read, readAt, createdAt }`; `kind` saat ini `task.graded` dan `task.revision`. Notifikasi hanya dibuat bila pengaturan admin "Hasil review & nilai" (`notifGraded`, default menyala) tidak dimatikan. Nilai, audit, dan notifikasi disimpan dalam satu transaksi (kalau notifikasi gagal dibuat, nilai ikut batal), dan nilai yang kembali ke angka lama (90 → 80 → 90) tetap diberitahukan. Endpoint hanya untuk role `student` (`403 STUDENT_REQUIRED` untuk akun lain) dan siswa tidak bisa membaca/menandai notifikasi siswa lain.

## Profil & preferensi

| Method | Alamat | Isi (body) | Hasil |
|---|---|---|---|
| GET | `/api/profile` | - | `{ profile: { username, email, fullName, bio, avatarUrl, equippedFrame, equippedTitle, ... } }` |
| PUT | `/api/profile` | `{ fullName?, email?, bio?, avatarUrl? }` | `{ profile: { ... } }` |
| GET | `/api/user/allowed-grades` | - | `{ grades: ["SD","SMP","SMK"] }` |
| PUT | `/api/user/allowed-grades` | `{ grades: ["SD","SMP"] }` | `{ grades }` |

## Koin Belajar & Toko Hadiah

Istilah UI: **Koin Belajar** = saldo yang bisa dibelanjakan (dashboard kanan atas).

```
saldo = max(0, total koin - harga item yang sudah dibeli)
```

`points.total` **tidak berkurang** saat berbelanja — total tetap dipakai untuk level. Harga item disimpan sebagai snapshot saat pembelian, jadi perubahan harga katalog tidak mengubah saldo lama.

| Method | Alamat | Isi (body) | Hasil |
|---|---|---|---|
| GET | `/api/shop/items` | - | `{ items: [{ id, jenis, nama, harga, ... }] }` |
| GET | `/api/shop` | - | `{ items, owned, equipped: { bingkai, gelar }, earned, spent, balance }` |
| POST | `/api/shop/buy` | `{ itemId }` | `{ owned, equipped, earned, spent, balance }` |
| POST | `/api/shop/equip` | `{ itemId }` | `{ equipped }` |
| POST | `/api/shop/unequip` | `{ jenis: "bingkai"\|"gelar" }` | `{ equipped }` |

Aturan:

- `buy` langsung memasang item yang dibeli (sama seperti `LP.beli` di frontend).
- Item yang sudah dimiliki → `409 ALREADY_OWNED`.
- Saldo kurang → `400 INSUFFICIENT_COINS`.
- Item tidak dikenal → `404 ITEM_NOT_FOUND`.
- Memasang item yang belum dimiliki → `400 NOT_OWNED`.
- Beli tidak bisa dibatalkan/refund. Jika task di-uncheck setelah belanja, saldo mentok di `0` (tidak minus).

**Sinkronisasi katalog:** `backend/shop-catalog.js` adalah salinan server-side dari `LP.HADIAH` di `kurikulum/core/jalur-belajar.js`. Id, jenis, dan harga harus sama persis. Kalau frontend menambah/mengubah item, backend wajib ikut diperbarui.

## Admin API

Semua endpoint di bawah wajib role `admin` atau `instruktur` (dibatasi permission per fitur lewat matriks `admin_role_permissions`; `admin` selalu punya semua). Endpoint plugin juga wajib `users.id` admin ada di `PLUGIN_DEVELOPER_USER_IDS`.

| Method | Alamat | Isi (body) | Hasil |
|---|---|---|---|
| GET | `/api/admin/me` | - | `{ id, username, fullName, email, phone, role, status, mustChangePassword, createdAt, permissions }` |
| PATCH | `/api/admin/me` | `{ fullName?, email?, phone? }` | `{ ...identitas }`; email unik (409 `EMAIL_EXISTS`), telepon 8–20 digit/`+`/spasi/strip |
| POST | `/api/admin/me/password` | `{ currentPassword, newPassword }` | `{ id }`; password minimal mengikuti pengaturan instansi, sesi lain dicabut |
| GET | `/api/admin/roles` | - | `{ roles: { admin, instruktur, siswa } }`; permission array tiap peran |
| PUT | `/api/admin/roles` | `{ roles: { admin?, instruktur?, siswa? } }` | `{ roles }`; permission wajib dikenal; admin selalu semua; hanya admin yang boleh menulis |
| GET | `/api/admin/audit?action=&actor=&targetType=&targetId=&page=&limit=` | - | `{ entries, page, limit, total, pages }`; `details` sudah di-parse |
| GET | `/api/admin/stats` | - | `{ students, content, plugins, activity, grades, curriculum }` |
| GET | `/api/admin/activity?limit=5` | - | `{ entries: [{ completed_at, task_id, user_id, username, full_name, title, points }] }`; submisi selesai terbaru (limit maks. 100) |
| GET | `/api/admin/curriculum` | - | `{ exists, curriculum: { tahap, jalur }, version, updatedAt }` |
| PUT | `/api/admin/curriculum` | `{ version, tahap, jalur }` | `{ exists, curriculum, version, updatedAt }`; `version` untuk optimistic concurrency |
| GET | `/api/admin/notifications?limit=20` | - | `{ notifications, unreadCount }`; notifikasi milik admin yang login |
| POST | `/api/admin/notifications/:id/read` | - | `{ id, read, unreadCount }` |
| POST | `/api/admin/notifications/read-all` | - | `{ updated, unreadCount: 0 }` |
| DELETE | `/api/admin/notifications` | - | `{ deleted, unreadCount: 0 }` |
| DELETE | `/api/admin/notifications/:id` | - | `{ id, deleted, unreadCount }` |
| GET | `/api/admin/badges` | - | `{ items, total }`; `rule` = `manual`, `tasks`, atau `points` |
| POST | `/api/admin/badges` | `{ name, description?, icon?, color?, rule?, threshold?, active? }` | `{ item }`; nama unik (409 `BADGE_NAME_EXISTS`) |
| PATCH | `/api/admin/badges/:id` | field yang diubah | `{ item }` |
| DELETE | `/api/admin/badges/:id` | - | `{ id }`; badge otomatis dilepas dari tugas |
| GET | `/api/admin/lencana` | - | `{ items, total }`; lencana jalur belajar sama dengan yang dilihat siswa (dibaca dari `users/kurikulum/data`), tiap item punya `key`, `grade`, `jalur`, `emoji`, `label`, `totalTasks`, `awarded`. Izin `badge.kelola` |
| GET | `/api/admin/lencana/:key/students` | - | `{ item, students, total }`; siswa yang menyelesaikan SEMUA task jalur itu (dasar sertifikat), tiap siswa punya `userId`, `username`, `fullName`, `completedAt`, `certificateNo`. `404` bila `key` tidak dikenal |
| GET | `/api/admin/curriculum-tasks?grade=SD\|SMP\|SMK` | - | `{ items, total }`; tugas kurikulum yang dilihat siswa (tabel `tasks`), hanya baca, dengan `completed` = jumlah siswa yang menyelesaikan. Izin `tugas.kelola` |
| GET | `/api/admin/tasks?search=&grade=&status=` | - | `{ items, total }`; tiap item memuat `submitted` dan `pending` |
| POST | `/api/admin/tasks` | `{ title, description?, grade, type, points?, due, status?, badgeId? }` | `{ item }` |
| PATCH | `/api/admin/tasks/:id` | field yang diubah | `{ item }` |
| DELETE | `/api/admin/tasks/:id` | - | `{ id }`; pengumpulan ikut terhapus |
| GET | `/api/admin/tasks/:id/submissions` | - | `{ items, total }`; berisi `student_id`, `student_name`, `status`, `answer`, `score`, `feedback` |
| PATCH | `/api/admin/submissions/:id` | `{ status, score?, feedback? }` | `{ item }`; `status` = `revisi` atau `dinilai` |
| GET | `/api/admin/settings` | - | `{ settings, updatedAt }` |
| PUT | `/api/admin/settings` | `{ settings }` | `{ settings }` |
| GET | `/api/admin/users?search=&status=&grade=&page=&limit=` | - | `{ users, page, limit, total, pages, stats }`; hanya role `student`; `grade` = `SD`, `SMP`, atau `SMK` |
| GET | `/api/admin/users/:id` | - | `{ user, points, progress, progressRows, items, sessions, activeSessions }` |
| POST | `/api/admin/users` | `{ username?, email?, fullName?, password?, allowedGrades? }` | `{ id, username, email, allowedGrades, temporaryPassword? }` |
| PATCH | `/api/admin/users/:id` | `{ username?, email?, fullName?, bio?, avatarUrl?, allowedGrades? }` | `{ user }` |
| POST | `/api/admin/users/:id/reset-password` | `{ password? }` | `{ id, temporaryPassword? }`; semua sesi dicabut |
| POST | `/api/admin/users/:id/suspend` | `{}` atau `{ status: "active" }` | `{ id, status }` |
| POST | `/api/admin/users/:id/revoke-sessions` | - | `{ revoked }` |
| DELETE | `/api/admin/users/:id` | - | soft delete `{ id, status: "deleted" }` |
| GET | `/api/admin/instructors?limit=500` | - | `{ items, total }`; `{ id, username, name, email, role, grades, active }`; `role` = `admin`, `instruktur`, atau `siswa`; hanya akun non-deleted |
| POST | `/api/admin/instructors` | `{ name, email, role, grades, password?, active }` | `{ item, temporaryPassword? }` | 201; `must_change_password = 1`; `password` default dibuat otomatis |
| PATCH | `/api/admin/instructors/:id` | `{ name?, email?, role?, grades?, active? }` | `{ item }` | boleh diubah kecuali akun sendiri; admin tidak bisa diubah oleh instruktur |
| DELETE | `/api/admin/instructors/:id` | - | soft delete `{ id, status: "deleted" }`; sesi dicabut |
| GET | `/api/admin/users/:id/guardians` | - | `{ items, total }`; daftar wali `{ id, name, email, relation, createdAt, updatedAt }` |
| PUT | `/api/admin/users/:id/guardians` | `{ guardians: [{ name, email, relation? }] }` | `{ items, total, queued: { created, revived, total } }`; **replace** seluruh wali (dicocokkan lewat email: wali yang dipertahankan tetap memakai `id` dan tautannya, wali yang dihilangkan dihapus dan tautannya otomatis dicabut), maks. 5; `relation` = `ayah`/`ibu`/`wali`/`lainnya` (default `wali`); email unik per siswa. Wali baru otomatis diantrekan bila siswa sudah punya tanggal berlangganan |
| GET | `/api/admin/users/:id/report-links` | - | `{ items, total }`; daftar tautan `{ id, guardianId, guardianName, guardianEmail, status, expiresAt, revokedAt, lastAccessedAt, accessCount, createdAt }`; `status` = `active`/`expired`/`revoked` |
| POST | `/api/admin/users/:id/report-links` | `{ guardianId?, expiresInDays? }` | `{ item: { id, studentId, guardianId, url, pageUrl, expiresAt, createdAt } }`; `url` = alamat API (JSON), `pageUrl` = alamat halaman wali yang dikirim ke email; token asli hanya muncul sekali (di `url` dan `pageUrl`) |
| DELETE | `/api/admin/users/:id/report-links/:linkId` | - | `{ id, revoked: true }`; tautan langsung tidak bisa diakses lagi |
| PUT | `/api/admin/users/:id/subscription` | `{ startedAt: "YYYY-MM-DD" \| null }` | `{ item: { userId, subscriptionStartedAt, firstReportDueDate }, deliveries: { rescheduled, skipped }, queued: { created, revived, total } }`; `null` menghapus tanggal; field `startedAt` wajib ada. Email untuk semua wali ikut diantrekan saat tanggal diisi |
| GET | `/api/admin/users/:id/report-deliveries` | query `status?`, `page?`, `limit?` (maks. 100) | `{ items, total, page, limit, pages, subscription }`; catatan pengiriman email laporan siswa itu |
| GET | `/api/admin/report-deliveries` | query `status?`, `page?`, `limit?` | `{ items, total, page, limit, pages }`; semua siswa, berguna untuk memantau yang `failed` |
| POST | `/api/admin/report-deliveries/run` | `{ today?, studentId?, limit? }` | `{ summary: { today, provider, processed, sent, failed, skipped, errors } }`; menjalankan pengiriman yang jatuh tempo sekarang. `today` (`YYYY-MM-DD`) hanya boleh hari ini atau sebelumnya (`400` bila lebih maju, supaya jadwal tidak bisa dipercepat); `studentId` membatasi ke satu siswa; `limit` maks. 200. Mengikuti kebijakan percobaan ulang yang sama dengan penjadwal |
| POST | `/api/admin/report-deliveries/:id/retry` | - | `{ item }`; mengembalikan baris `pending`/`failed`/`skipped` menjadi `pending`, mereset `attempts`, membersihkan error, dan memajukan `dueDate` ke hari ini. Baris `sent` ditolak `409 DELIVERY_ALREADY_SENT` |
| POST | `/api/admin/report-deliveries/:id/preview` | - | `{ item, email: { subject, text, html }, preview: true }`; pratinjau isi email memakai token placeholder, tidak membuat tautan asli dan tidak mengubah status |

Perilaku penting:

- Semua endpoint admin (termasuk `/api/admin/roles` dan `/api/admin/instructors`) diblokir instruktur kecuali memiliki permission dari matriks `admin_role_permissions`; `admin` selalu punya semua. Penolakan memakai kode `PERMISSION_DENIED`. Mutasi berat (`PUT /roles`) hanya boleh admin.
- Peran yang didukung: `student`, `admin`, dan `instruktur`. Role lama `ortu` tidak lagi dibuat dan ditolak saat login (`ROLE_NOT_SUPPORTED`); sisa baris `ortu` di database perlu dimigrasikan manual.
- Akun dengan role `instruktur` login memakai `/api/auth/*` normal, tetapi akses ke panel Admin masih dibatasi UI (hanya akun admin yang masuk ke `/admin/`). Permission server tetap ditegakkan per endpoint.

- Admin tidak bisa membuat/mengubah akun admin lewat API; akun admin hanya lewat CLI.
- Admin hanya melihat dan mengelola user role `student`.
- Filter `grade` pada daftar siswa menyertakan murid dengan `allowed_grades` kosong karena kosong berarti semua jenjang.
- `GET /api/admin/users` mengembalikan `stats.tasks_total` agar UI dapat menghitung persentase progres terhadap total task.
- `GET /api/admin/stats` menghitung `grades` dari penempatan jenjang eksplisit; satu murid dengan beberapa jenjang dapat terhitung di lebih dari satu jenjang.
- `POST /api/admin/users` selalu membuat role `student` dan `must_change_password = 1`.
- `username` boleh dihilangkan. Server akan membuat username unik dari bagian sebelum `@` pada email (atau `fullName`), sehingga form Admin cukup mengirim `email`, `fullName`, dan `allowedGrades`.
- Reset password dan suspend mencabut semua sesi murid. Soft delete mencabut sesi dan menolak login.
- Rename username aman untuk data murid karena relasi memakai `user_id`.
- `PUT /api/admin/curriculum` menyimpan seluruh dokumen `tahap` + `jalur` + `materi` secara atomik. Kirim `version` yang didapat dari GET; jika sudah berubah, server membalas `409 CURRICULUM_VERSION_CONFLICT` dengan `details.currentVersion`.
- HTML materi ditolak bila mengandung `<script>`, `<iframe>`, `<object>`, `<embed>`, event handler inline, `javascript:`, `vbscript:`, `srcdoc`, atau `data:text/html`.
- Endpoint kurikulum masih khusus Admin. Halaman murid saat ini tetap memakai data statis di `users/kurikulum/data/`; endpoint publik untuk murid belum dibuat.
- Soal kode wajib `grade: "SMP"` atau `"SMK"` dan `language`: `HTML/CSS`, `Python`, atau `JavaScript`. `Python`/`JavaScript` wajib punya 1-100 `tests` berisi `{ i, o }`; `HTML/CSS` wajib punya `criteria`.
- Notifikasi admin disimpan di tabel `admin_notifications` per akun admin, sehingga status baca/hapus admin1 tidak memengaruhi admin2. Notifikasi dibuat untuk `student.create`, `progress.complete`, `curriculum.update`, `plugin.upload`, dan `plugin.publish`; `dedupe_key` mencegah duplikasi.
- **Badge & Tugas Admin** disimpan di tabel `admin_badges`, `admin_tasks`, dan `admin_task_submissions` (bukan localStorage). Tabel `admin_tasks` terpisah dari `tasks` kurikulum.
- Lencana jalur belajar tidak disimpan di database: katalognya dibaca dari file data jalur siswa (`jalur-data*.js`) lewat `lencana-catalog.js`, dan siswa berhak bila semua task jalurnya (termasuk Project Akhir / Capstone) tercatat selesai di tabel `progress`. Nomor sertifikat dibuat deterministik (`DCC/<tahun>/<jenjang>/<jalur>/<id siswa>`), jadi tidak ada tabel sertifikat.
- Tugas Kurikulum (`tasks`) dan Tugas Admin (`admin_tasks`) adalah dua daftar terpisah. Impor tugas lewat file (CSV/JSON) dilakukan di halaman admin dan memakai `POST /api/admin/tasks` per tugas (maks. 50 tugas per file).
- Badge: `name` wajib (maks. 40, unik tanpa beda kapital), `rule` = `manual`/`tasks`/`points`, `threshold` ≥ 1 untuk rule non-manual, `color` = `sky`/`indigo`/`emerald`/`amber`/`rose`.
- Tugas admin: `grade` = `SD`/`SMP`/`SMK`, `type` = `kode`/`proyek`/`kuis`, `status` = `draft`/`terbit`/`ditutup`, `points` 0-1000, `due` wajib format `YYYY-MM-DD`, `badgeId` harus ada bila diisi.
- Pengumpulan: `status` = `dikumpulkan`/`revisi`/`dinilai`. `dinilai` wajib `score` 0-100; `revisi` wajib `feedback`. Aksi penilaian tercatat sebagai `admin_task.grade`.
- `GET /api/admin/settings` mengembalikan `{}` bila belum pernah disimpan. `logo` disimpan sebagai data URL gambar (maks. ±900.000 karakter) atau URL http(s).
- Endpoint `/api/admin/roles` dan `/api/admin/instructors` tersedia. Hak akses disimpan di tabel `admin_role_permissions` (peran → daftar permission); `PUT /api/admin/roles` hanya boleh admin dan melakukan validasi permission yang dikenal.
- Wali siswa untuk laporan publik disimpan di tabel `student_guardians` (`student_user_id`, `name`, `email`, `relation`, `created_by`). Wali bukan akun login dan tidak punya password/sesi. Satu siswa maksimal 5 wali; email unik per siswa.
- Tautan laporan publik disimpan di tabel `report_links` (`token_hash`, `student_user_id`, `guardian_id`, `expires_at`, `revoked_at`, `access_count`). Token asli hanya dikembalikan sekali saat pembuatan; database menyimpan SHA-256. Default berlaku 30 hari, maksimal 365 hari, dan bisa dicabut kapan saja.
- Orang tua tidak lagi punya akun login; kontak wali disimpan di `student_guardians` dan laporan dibagikan lewat tautan publik `report_links`.
- Tanggal mulai berlangganan disimpan di `users.subscription_started_at` (`YYYY-MM-DD`, tanpa jam; kosong = belum berlangganan). Tanggal harus sah (mis. `2026-02-30` ditolak) dengan tahun 2000-2100. `GET /api/admin/users/:id` dan daftar user memuat `subscriptionStartedAt`; detail juga memuat `firstReportDueDate`.
- Email laporan pertama jatuh tempo **1 bulan kalender setelah** tanggal mulai; bila tanggalnya tidak ada di bulan tujuan, dipotong ke hari terakhir bulan itu (31 Jan → 28/29 Feb).
- Catatan pengiriman disimpan di tabel `report_deliveries`, satu baris per email per penerima. Indeks unik (siswa + email penerima tanpa beda huruf besar/kecil + `kind` + `period`) mencegah email ganda walaupun penjadwal berjalan dua kali atau server restart. Email penerima disimpan sebagai salinan; token mentah tidak pernah disimpan (hanya `report_link_id`).
- `status`: `pending` → `sent` | `failed` | `skipped`. `sent` bersifat final (tidak bisa dibatalkan atau dikirim ulang). `failed` boleh dicoba lagi (`attempts` bertambah, alasan di `lastError`, maks. 500 karakter). `skipped` boleh dihidupkan lagi oleh antrean bila tanggal atau wali diisi kembali.
- Mengubah tanggal berlangganan menggeser `dueDate` pengiriman `pending`; menghapus tanggal membatalkan yang `pending`/`failed` (`skipped`). Yang sudah `sent` tidak disentuh. Menghapus wali membatalkan email yang belum terkirim ke wali itu, sejalan dengan tautannya yang dicabut.
- Pengiriman email otomatis ke wali dijalankan penjadwal (`report-scheduler.js`) lewat `mailer.js`; cara mengaktifkan dan kebijakannya ada di bagian [Pengiriman email laporan](#pengiriman-email-laporan).
- Semua aksi admin dicatat di tabel `admin_audit` (`actor_user_id`, `actor_username`, `action`, `target_type`, `target_id`, `details`, `ip`); perubahan wali memakai `guardian.update`, pembuatan tautan `report_link.create`, pencabutan `report_link.revoke`, dan perubahan tanggal berlangganan `subscription.update` (berisi `from`, `to`, `rescheduled`, `skipped`).
- Rate limit admin: 60 request/menit per admin per path.

## Laporan Wali (publik)

Wali tidak punya akun. Admin membuat tautan laporan per siswa lalu mengirim URL-nya ke email wali; selain itu, email berisi tautan dikirim otomatis satu bulan setelah siswa mulai berlangganan (lihat [Pengiriman email laporan](#pengiriman-email-laporan)). Siapa pun yang memegang tautan dapat membaca laporan sampai tautan kedaluwarsa atau dicabut.

| Method | Alamat | Hasil |
|---|---|---|
| GET | `/api/reports/:token` | `{ child, progress, attempts, report, link }`; tanpa login |

Isi respons ini adalah **whitelist**: apa pun yang tidak tercantum di bawah tidak pernah dikirim, karena siapa pun yang memegang tautan bisa membacanya. Tidak ada username, ID, atau email siswa; tidak ada data lencana (`achievements`, `analytics`, `summary.achievementsEarned`); dan ID internal penulis pesan mentor tidak ikut. Daftar kunci dikunci oleh test, jadi menambah field adalah keputusan sadar.

Data mentah untuk halaman wali (halaman menghitung tampilannya di browser dengan mesin yang sama seperti "Laporan Saya"):

```json
{
  "child": { "fullName": "Nama Siswa" },
  "progress": [{ "task_id": "py1:0", "completed": true }],
  "attempts": [{ "task_id": "py1:1", "fails": 1, "time_spent": 120 }]
}
```

- `child.fullName` bisa `null` (siswa tanpa nama lengkap). Tampilkan nama netral, jangan username.
- `progress` hanya berisi tugas yang sudah selesai; `attempts` berisi percobaan gagal dan waktu per tugas. Maksimal 5000 baris per daftar.

Bentuk `report` (ringkasan yang sudah dihitung server):

```json
{
  "generatedAt": "2026-11-03T08:00:00.000Z",
  "institution": { "name": "Dieng Cyber Coding", "year": null, "semester": null, "kkm": null },
  "student": { "name": "Nama Siswa", "grades": ["SMP"] },
  "summary": {
    "points": 120,
    "totalTasks": 40,
    "completedTasks": 25,
    "completionRate": 62.5,
    "gradedSubmissions": 3,
    "averageScore": 85.3,
    "completedModules": 4,
    "failedAttempts": 8,
    "timeSpentSeconds": 7200
  },
  "grades": [{ "grade": "SMP", "totalTasks": 40, "completedTasks": 25, "completionRate": 62.5 }],
  "completedTasks": [{ "taskId": "py1:0", "title": "Judul", "grade": "SMP", "points": 10, "completedAt": "..." }],
  "submissions": [{ "id": 1, "taskId": 2, "title": "Tugas", "grade": "SMP", "status": "dinilai", "score": 90, "feedback": "...", "submittedAt": "...", "gradedAt": "..." }],
  "mentorNote": { "text": "Pertahankan semangat belajarmu!", "authorName": "Kak Mentor", "updatedAt": "..." }
}
```

`link` berisi `{ expiresAt, guardianName }`. `student.name` dan `mentorNote` bisa `null`.

### Halaman wali

Admin mengirim `pageUrl` (bukan `url`) ke email wali: `https://domain/orangtua/laporan.html#<token>`. Token ditaruh setelah `#` supaya tidak dikirim browser ke server, tidak masuk log, dan tidak ikut header Referer. Kontrak untuk frontend:

1. Baca token dari `location.hash` (tanpa `#`).
2. Panggil `GET /api/reports/<token>` tanpa header `Authorization`.
3. Token salah/kedaluwarsa/dicabut → `404 REPORT_NOT_FOUND`; terlalu sering → `429 RATE_LIMITED` (cek `Retry-After`).
4. Jangan menyimpan token di `localStorage`. Wali tidak punya akun maupun sesi.

Perubahan dari versi sebelumnya (tidak kompatibel bagi pemakai lama): `report.analytics`, `report.achievements`, dan `report.summary.achievementsEarned` dihapus; `report.student.name` bernilai `null` untuk siswa tanpa nama lengkap (dulu memakai username); `report.mentorNote` tidak lagi memuat `authorId` dan `createdAt`.

Perilaku penting:

- Token salah, kedaluwarsa, atau dicabut → `404 REPORT_NOT_FOUND` (tidak membedakan ketiganya).
- Response memakai `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, dan `X-Robots-Tag: noindex, nofollow`; endpoint dibatasi 60 request/menit per IP. Semua token dihitung dalam satu bucket per IP, jadi mengganti token di tiap request tidak menghindari batas. Melewati batas → `429 RATE_LIMITED` dengan header `Retry-After`.
- Setiap akses menambah `access_count` dan `last_accessed_at` pada tautan.
- Menghapus wali (menghilangkannya dari `PUT .../guardians`) otomatis mencabut tautan milik wali tersebut. Mengedit wali lain tidak memengaruhi tautan wali yang dipertahankan. Daftar wali diurutkan menurut `id` (wali lama dulu, lalu yang baru).
- Tautan hanya bisa dibuat/dicabut admin/instruktur dengan permission `siswa.kelola`.

### Pengiriman email laporan

Satu bulan setelah `subscriptionStartedAt`, tiap wali siswa menerima satu email berisi ringkasan dan tautan halaman wali (`pageUrl`). Barisnya masuk antrean (`report_deliveries`) saat admin mengisi tanggal berlangganan atau menyimpan daftar wali; penjadwal lalu memproses baris yang `dueDate`-nya sudah tiba.

**Mengaktifkan.** Penjadwal mati secara default. Atur di `.env`:

| Variabel | Arti |
|---|---|
| `REPORT_EMAIL_ENABLED` | `true` untuk menjalankan penjadwal |
| `REPORT_EMAIL_PROVIDER` (atau `EMAIL_PROVIDER`) | `mock`, `resend`, atau `smtp`. **Wajib dipilih** bila penjadwal aktif; tidak ada default |
| `APP_PUBLIC_ORIGIN` | Origin publik aplikasi, dipakai membentuk tautan di email. Wajib |
| `REPORT_EMAIL_FROM` / `REPORT_EMAIL_REPLY_TO` | Pengirim dan alamat balasan |
| `RESEND_API_KEY` | Wajib untuk `resend` (HTTP API, tanpa dependensi tambahan) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Untuk `smtp`; jalankan `npm install nodemailer` lebih dulu |
| `REPORT_EMAIL_INTERVAL_MINUTES` | Jeda antar putaran (default 60) |
| `REPORT_EMAIL_BATCH_SIZE` | Maksimum baris per putaran (default 25, maks. 200) |
| `REPORT_EMAIL_MAX_ATTEMPTS` | Maksimum percobaan per email (default 5, maks. 20) |
| `REPORT_EMAIL_RETRY_MINUTES` | Jeda minimum sebelum email yang gagal dicoba lagi (default 60) |
| `REPORT_LINK_EXPIRY_DAYS` | Umur tautan di email (default 30, maks. 365) |

Kalau konfigurasinya belum lengkap (provider belum dipilih, `RESEND_API_KEY`/`SMTP_HOST` kosong, `APP_PUBLIC_ORIGIN` kosong, atau `mock` di production), penjadwal **tidak dijalankan** dan alasannya dicatat di log saat server start.

**Mode dry-run (`mock`).** Tidak ada email yang dikirim; isi email (penerima, subjek, teks, termasuk tautan laporan yang asli) dicetak ke log, lalu baris ditandai `sent`. Karena `sent` bersifat final, jangan menjalankan `mock` pada database produksi: email itu tidak akan pernah dikirim ulang. `mock` ditolak bila `NODE_ENV=production`.

**Kebijakan percobaan ulang.**
- Baris `pending` selalu didahulukan; baris `failed` hanya mengisi sisa kuota batch, sehingga penyedia email yang down tidak menyumbat pengiriman baru.
- Baris `failed` dicoba lagi paling cepat `REPORT_EMAIL_RETRY_MINUTES` setelah gagal, dan berhenti otomatis setelah `REPORT_EMAIL_MAX_ATTEMPTS` percobaan. Setelah itu statusnya tetap `failed` (terlihat di `GET /api/admin/report-deliveries?status=failed`) sampai admin memanggil `POST .../:id/retry`, yang mereset `attempts`.
- Tiap percobaan membuat tautan baru; tautan yang gagal terkirim langsung dicabut.
- Siswa yang sudah dihapus, wali yang sudah dihapus, atau email wali yang berubah sejak diantrekan membuat baris `skipped`.

**Batasan yang perlu diketahui.**
- Pengiriman bersifat *at-least-once*: bila server mati tepat setelah email terkirim tetapi sebelum barisnya ditandai `sent`, email itu bisa terkirim sekali lagi pada putaran berikutnya.
- "Hari ini" dihitung dari zona waktu server. Bila server memakai UTC, atur `TZ=Asia/Jakarta` di environment supaya tanggal jatuh tempo mengikuti WIB.
- Penjadwal berjalan di dalam proses server (satu instance). Menjalankan beberapa instance dengan database yang sama belum didukung.

## Plugin API (M4–M5)

Manifest ZIP wajib berada di root dengan bentuk minimal:

```json
{
  "id": "sample-game",
  "name": "Sample Game",
  "version": "1.0.0",
  "sdk": 1,
  "entry": "index.html",
  "category": { "id": "learning-games", "name": "Learning Games" },
  "grades": ["SMP"],
  "permissions": ["progress:complete"],
  "network": { "allow": [] }
}
```

| Method | Alamat | Isi (body) | Hasil |
|---|---|---|---|
| POST | `/api/admin/plugins/upload` | raw ZIP, `Content-Type: application/zip` | `{ uploadId, pluginId, version, status: "needs_review", sha256, report }` |
| GET | `/api/admin/plugins` | - | `{ plugins: [{ id, plugin_id, version, status, scanReport, ... }] }` |
| POST | `/api/admin/plugins/:versionId/approve` | - | `{ id, status: "approved" }` |
| POST | `/api/admin/plugins/:versionId/reject` | `{ reason? }` | `{ id, status: "rejected" }` |
| POST | `/api/admin/plugins/:versionId/publish` | - | `{ id, status: "published", url }` |
| POST | `/api/admin/plugins/:versionId/preview-ticket` | - | `{ url, expiresInSeconds: 300 }` |
| POST | `/api/admin/plugins/:versionId/disable` | - | `{ id, status: "disabled" }` |
| POST | `/api/admin/plugins/:versionId/rollback` | - | `{ id, status: "published", version, url }` |
| GET | `/api/plugins` | - | `{ plugins: [{ id, name, version, entry, grades, network, origin, url }] }` |
| GET | `/api/plugins/:id` | - | `{ plugin: { ... } }` |

Aturan plugin:

- ZIP divalidasi: path traversal, symlink, ZIP bomb, ekstensi, checksum, ukuran, manifest, dan scan statis dasar.
- Upload masuk **quarantine**; file tidak disajikan publik sampai `approve` + `publish`.
- `publish` menyalin ke direktori live yang immutable per versi.
- `rollback` hanya untuk versi yang pernah dipublish (`published`/`disabled`/`rolled_back`) dan file live-nya masih ada. Versi published lain untuk plugin yang sama menjadi `rolled_back`, sehingga hanya satu versi aktif.
- Preview memakai ticket HMAC berumur 5 menit dan **tidak** membawa token sesi API.
- Runtime plugin harus berada di origin terpisah dan dijalankan dengan `npm run start:plugins`.
- `network.allow` default `[]`; domain harus eksplisit dan ditinjau manual. CSP runtime memakai daftar itu untuk `connect-src`.
- Iframe memakai sandbox dan host SDK menolak plugin yang berada di origin yang sama dengan aplikasi utama.

## Environment plugin

| Variabel | Fungsi |
|---|---|
| `PLUGIN_DIR` | Folder data plugin (`quarantine/` dan `live/`). Default dev: `backend/plugin-data`, production: `/data/plugins`. |
| `PLUGIN_PORT` | Port runtime plugin (default `3001`). |
| `PLUGIN_PUBLIC_ORIGIN` | Origin publik runtime plugin, mis. `https://plugins.example.com`. |
| `APP_PUBLIC_ORIGIN` | Origin aplikasi utama untuk `frame-ancestors` runtime plugin. Wajib di production. |
| `PLUGIN_PREVIEW_SECRET` | Secret HMAC preview, minimal 32 karakter. |
| `PLUGIN_DEVELOPER_USER_IDS` | Daftar `users.id` admin yang boleh upload/review/publish, dipisah koma. |

## Lain-lain

| Method | Alamat | Hasil |
|---|---|---|
| GET | `/api/health` | `{ status: "ok" }` |