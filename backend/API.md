# API Dieng Cyber Coding

Semua alamat diawali `http://localhost:3000`.
Kecuali `/api/auth/login`, `/api/auth/register`, dan `/api/health`, setiap permintaan wajib membawa header:

    Authorization: Bearer <token>

## Auth

| Method | Alamat | Isi (body) | Hasil |
|---|---|---|---|
| POST | `/api/auth/register` | `{ email, password }` atau `{ username, password }` | `{ token, username, email }` |
| POST | `/api/auth/login` | `{ email, password }` atau `{ username, password }` | `{ token, username, email, status }` |
| GET  | `/api/auth/me` | - | `{ username, email, fullName, hasPassword }` |
| POST | `/api/auth/change-password` | `{ currentPassword?, newPassword }` | `{ username }` |
| POST | `/api/auth/logout` | - | `{ message }` |

Catatan auth:

- Login menerima **email atau username**. Email tidak peka huruf besar/kecil, dan disimpan dalam bentuk lowercase.
- Register dengan `email` akan otomatis membuat `username` dari bagian sebelum `@` (contoh `budi.santoso@mail.com` → `budisantoso`). Jika bentrok, diberi akhiran angka.
- `status` pada login:
  - `claimed` : akun legacy (belum punya email/Firebase dan belum punya password); password yang diketik saat login pertama menjadi passwordnya.
  - `login`   : login biasa.
- Akun Firebase (punya `email`/`firebase_uid` tetapi belum punya password) **tidak bisa diklaim lewat login biasa**. Pemilik harus login lewat Firebase dulu, lalu memanggil `POST /api/auth/change-password` untuk mengatur password DB.
- `POST /api/auth/change-password` mewajibkan `currentPassword` bila akun sudah punya password. Sesi di perangkat lain otomatis dicabut; sesi yang sedang dipakai tetap aktif.
- Profil (`PUT /api/profile`) juga menerima `email`; email yang sudah dipakai akun lain ditolak `409 EMAIL_EXISTS`.

Kode error: `400` input salah, `401` email/username atau password salah / belum login / sesi habis, `403` membuka data user lain, `409` email/username sudah terdaftar, `429` terlalu banyak percobaan (blok 15 menit).

## Data (hanya boleh milik user yang sedang login)

| Method | Alamat | Isi (body) | Hasil |
|---|---|---|---|
| GET  | `/api/progress/:username` | - | `[{ task_id, completed, completed_at }]` |
| GET  | `/api/progress/:username?grade=SMP&module=py1` | - | sama, difilter via JOIN tasks |
| POST | `/api/progress/:username` | `{ taskId, completed }` | `{ message, ... }` |
| GET  | `/api/points/:username` | - | `{ username, total, earned, spent, balance }` |
| POST | `/api/points/:username` | - | `410 GONE` — total dihitung server dari task selesai |

Menyelesaikan task (`POST /api/progress` → `completed: true`) otomatis mengkredit `tasks.points` (default task 10 / project 50, bisa per-task dari kurikulum); un-check mendebit kembali. Idempoten.

Bonus percobaan pertama (semua task): selesai tanpa gagal tercatat (`POST /api/attempts/:username` `{ taskId }` per cek misi yang gagal) + belum pernah dapat bonus → tambah `FIRST_TRY_BONUS` (default 5, via env). Bonus hanya sekali seumur (user, task); un-check mendebit basis + bonus. Respons progress menyertakan `points` (total kini) dan `earned: { base, bonus }`.

| POST | `/api/attempts/:username` | `{ taskId, timeSpent? }` | `{ username, taskId, fails, timeSpent, earned }` |
| GET | `/api/attempts/:username` | - | `{ attempts: [{ task_id, fails, time_spent, updated_at }] }` |
| POST | `/api/dev/attempts` | `{ taskId, timeSpent? }` | `{ username: "dev", taskId, fails, timeSpent }` |

`timeSpent` (detik) dijumlahkan ke total waktu aktif per task. `earned` berisi koin bonus yang dikreditkan bila ini percobaan pertama yang gagal (biasanya `0`).

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

## Lain-lain
| GET | `/api/health` | - | `{ status: "ok" }` |
