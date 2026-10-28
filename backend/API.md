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

Kode error auth: `400` input salah, `401` kredensial salah/belum login/sesi habis, `403` akun suspended/deleted atau membuka data user lain, `409` email/username sudah terdaftar, `429` terlalu banyak percobaan.

## Identitas, role, dan status

- Identitas kanonis adalah `users.id`. Tabel `sessions`, `progress`, `points`, `attempts`, dan `user_items` memakai `user_id` dengan FK ke `users(id)`.
- `username` adalah nama login/display yang **boleh diubah admin**. Rename tidak memindahkan progress, poin, attempt, item, atau sesi karena semuanya memakai `user_id`.
- Role DB saat ini: `student` dan `admin`. Akun admin dibuat lewat CLI, bukan lewat UI admin:
  `cd backend && npm run create-admin`.
- Status akun: `active`, `suspended`, `deleted`. Akun suspended/deleted ditolak saat login dan saat memakai token lama.
- Endpoint lama `/api/progress/:username`, `/api/points/:username`, dan `/api/attempts/:username` masih menerima username untuk kompatibilitas frontend. Otorisasi tetap membandingkan `users.id`; setelah rename, frontend harus memakai username baru (ambil ulang `/api/auth/me`).
- Akses upload/review/publish plugin memakai allowlist admin developer: `PLUGIN_DEVELOPER_USER_IDS` (daftar `users.id` dipisah koma). Role `superadmin` belum diaktifkan di schema; allowlist ini adalah mekanisme developer untuk MVP.

## Data murid

| Method | Alamat | Isi (body) | Hasil |
|---|---|---|---|
| GET  | `/api/progress/:username` | - | `{ progress: [{ task_id, completed, completed_at, bonus_awarded }] }` |
| GET  | `/api/progress/:username?grade=SMP&module=py1` | - | sama, difilter via JOIN tasks |
| POST | `/api/progress/:username` | `{ taskId, completed }` | `{ username, taskId, completed, points, earned }` |
| GET  | `/api/points/:username` | - | `{ username, total, earned, spent, balance }` |
| POST | `/api/points/:username` | - | `410 GONE` — total dihitung server dari task selesai |
| POST | `/api/attempts/:username` | `{ taskId, timeSpent? }` | `{ username, taskId, fails, timeSpent }` |
| GET  | `/api/attempts/:username` | - | `{ username, attempts: [{ task_id, fails, time_spent, updated_at }] }` |
| POST | `/api/dev/attempts` | `{ taskId, timeSpent? }` | `{ username: "dev", taskId, fails, timeSpent }` |

Menyelesaikan task (`POST /api/progress` → `completed: true`) otomatis mengkredit `tasks.points` (default task 10 / project 50, bisa per-task dari kurikulum); un-check mendebit kembali. Idempoten.

Bonus percobaan pertama (semua task): selesai tanpa gagal tercatat (`POST /api/attempts/:username` `{ taskId }` per cek misi yang gagal) + belum pernah dapat bonus → tambah `FIRST_TRY_BONUS` (default 5, via env). Bonus hanya sekali seumur (user, task); un-check mendebit basis + bonus.

`timeSpent` (detik) dijumlahkan ke total waktu aktif per task.

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

Semua endpoint di bawah wajib role `admin`. Endpoint plugin juga wajib `users.id` admin ada di `PLUGIN_DEVELOPER_USER_IDS`.

| Method | Alamat | Isi (body) | Hasil |
|---|---|---|---|
| GET | `/api/admin/me` | - | `{ id, username, role, status, mustChangePassword }` |
| GET | `/api/admin/audit?action=&actor=&targetType=&targetId=&page=&limit=` | - | `{ entries, page, limit, total, pages }`; `details` sudah di-parse |
| GET | `/api/admin/stats` | - | `{ students, content, plugins, codelab, activity, grades, curriculum }` |
| GET | `/api/admin/activity?limit=5` | - | `{ entries: [{ completed_at, task_id, user_id, username, full_name, title, points }] }`; submisi selesai terbaru |
| GET | `/api/admin/curriculum` | - | `{ exists, curriculum: { tahap, jalur }, version, updatedAt }` |
| PUT | `/api/admin/curriculum` | `{ version, tahap, jalur }` | `{ exists, curriculum, version, updatedAt }`; `version` untuk optimistic concurrency |
| GET | `/api/admin/code-lab?search=&grade=&status=&type=` | - | `{ challenges, total }` |
| GET | `/api/admin/code-lab/:id` | - | `{ challenge }` |
| POST | `/api/admin/code-lab` | `{ title, type, grade, language, instructions, goal?, blocks?, blockLimit?, starterCode?, tests?, criteria?, status? }` | `{ challenge }` |
| PATCH | `/api/admin/code-lab/:id` | field yang diubah | `{ challenge }` |
| DELETE | `/api/admin/code-lab/:id` | - | `{ id }` |
| GET | `/api/admin/notifications?limit=20` | - | `{ notifications, unreadCount }`; notifikasi milik admin yang login |
| POST | `/api/admin/notifications/:id/read` | - | `{ id, read, unreadCount }` |
| POST | `/api/admin/notifications/read-all` | - | `{ updated, unreadCount: 0 }` |
| DELETE | `/api/admin/notifications` | - | `{ deleted, unreadCount: 0 }` |
| DELETE | `/api/admin/notifications/:id` | - | `{ id, deleted, unreadCount }` |
| GET | `/api/admin/users?search=&status=&grade=&page=&limit=` | - | `{ users, page, limit, total, pages, stats }`; hanya role `student`; `grade` = `SD`, `SMP`, atau `SMK` |
| GET | `/api/admin/users/:id` | - | `{ user, points, progress, progressRows, items, sessions, activeSessions }` |
| POST | `/api/admin/users` | `{ username?, email?, fullName?, password?, allowedGrades? }` | `{ id, username, email, allowedGrades, temporaryPassword? }` |
| PATCH | `/api/admin/users/:id` | `{ username?, email?, fullName?, bio?, avatarUrl?, allowedGrades? }` | `{ user }` |
| POST | `/api/admin/users/:id/reset-password` | `{ password? }` | `{ id, temporaryPassword? }`; semua sesi dicabut |
| POST | `/api/admin/users/:id/suspend` | `{}` atau `{ status: "active" }` | `{ id, status }` |
| POST | `/api/admin/users/:id/revoke-sessions` | - | `{ revoked }` |
| DELETE | `/api/admin/users/:id` | - | soft delete `{ id, status: "deleted" }` |

Perilaku penting:

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
- **Code Lab & Blockly** disimpan di tabel `code_lab_challenges`, bukan localStorage. `type` = `blockly` atau `kode`.
- Blockly wajib `grade: "SD"`, `language: "Blockly"`, `goal`, `blocks` (1-20), dan `blockLimit` (1-50). Blok yang dikenal: `Maju`, `Belok kiri`, `Belok kanan`, `Ulangi`, `Jika`.
- Soal kode wajib `grade: "SMP"` atau `"SMK"` dan `language`: `HTML/CSS`, `Python`, atau `JavaScript`. `Python`/`JavaScript` wajib punya 1-100 `tests` berisi `{ i, o }`; `HTML/CSS` wajib punya `criteria`.
- `status` Code Lab = `draft` atau `published`. Hanya `published` yang muncul di endpoint murid.
- Endpoint murid `GET /api/code-lab` dan `GET /api/code-lab/:id` wajib login. `tests` tidak dikirim ke murid agar jawaban tidak bocor. `GET /api/code-lab/:id` membalas `403 GRADE_FORBIDDEN` bila jenjang tantangan tidak ada di `allowed_grades` murid.
- Notifikasi admin disimpan di tabel `admin_notifications` per akun admin, sehingga status baca/hapus admin1 tidak memengaruhi admin2. Notifikasi dibuat untuk `student.create`, `progress.complete`, `curriculum.update`, `code_lab.published`, `plugin.upload`, dan `plugin.publish`; `dedupe_key` mencegah duplikasi.
- Semua aksi admin dicatat di tabel `admin_audit` (`actor_user_id`, `actor_username`, `action`, `target_type`, `target_id`, `details`, `ip`). Aksi Code Lab memakai `code_lab.create`, `code_lab.update`, dan `code_lab.delete`.
- Rate limit admin: 60 request/menit per admin per path.

## Code Lab API untuk Murid

Wajib login. Hanya tantangan `published` yang dikembalikan, dan `tests` tidak disertakan.

| Method | Alamat | Hasil |
|---|---|---|
| GET | `/api/code-lab?grade=SD\|SMP\|SMK` | `{ challenges, total }` |
| GET | `/api/code-lab/:id` | `{ challenge }`; `403 GRADE_FORBIDDEN` bila di luar `allowed_grades` |

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
