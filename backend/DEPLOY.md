# Deploy / Hosting Backend

Checklist singkat agar backend + frontend statis jalan di hosting.

## 1. Prasyarat

- **Node.js >= 20** (disarankan 20/22 LTS).
- `better-sqlite3` adalah native module. Di hosting Alpine kadang butuh build tools;
  paling aman pakai image Debian/Ubuntu (mis. `node:20-bookworm-slim`).
- Folder database harus **persistent** (bukan ephemeral). Kalau tidak, data user,
  progres, dan koin belajar hilang setiap redeploy.

## 2. Environment variable

| Variabel | Wajib | Default | Keterangan |
|---|---|---|---|
| `PORT` | tidak | `3000` | Port HTTP (banyak hosting mengisi otomatis). |
| `NODE_ENV` | ya | - | Isi `production` untuk mematikan endpoint `/api/dev/*`. |
| `DB_PATH` | disarankan | `backend/database.sqlite` | Arahkan ke volume persistent, mis. `/data/database.sqlite`. |
| `FRONTEND_ORIGIN` | tidak | - | Isi kalau frontend di domain terpisah. Kalau satu domain, tidak perlu. |
| `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | tidak | - | Untuk AI Tutor. Tanpa ini AI Tutor membalas error konfigurasi, fitur lain tetap jalan. |
| `AI_MOCK` | tidak | - | `1` untuk mode jawaban dummy saat testing. |
| `FIRST_TRY_BONUS` | tidak | `5` | Bonus koin percobaan pertama. |
| `AI_TUTOR_ALLOWED_MODULES` | tidak | `ai1,ai2,ai3,ai4` | Modul SMP yang boleh memakai AI Tutor. |
| `LOG_LEVEL` | tidak | `info` | Level log pino. |

`.env` dan `*.sqlite` **tidak ikut git** (lihat `.gitignore`), jadi harus disiapkan di server.

## 3. Langkah deploy

```bash
cd backend
npm ci
npm run seed     # sekali saja; idempotent (INSERT OR IGNORE)
npm start
```

`npm run seed` mengisi modul, task, dan materi dari file kurikulum frontend:
- 44 modul
- 238 task (SD 52, SMP 93, SMK 93)
- 89 materi SMP

Kalau database sudah ada isinya, seed aman dijalankan ulang (tidak menghapus data).

## 4. Migrasi database

Migrasi berjalan **otomatis saat server start** dan idempotent:

- kolom baru di `users` (`email`, `firebase_uid`, profil, `equipped_frame`, `equipped_title`)
- tabel `user_items` (kepemilikan bingkai/gelar)
- kolom `attempts.time_spent`, `progress.bonus_awarded`, dll.

Tidak perlu menjalankan SQL manual.

## 5. Reverse proxy

Di `NODE_ENV=production`, server mengaktifkan `trust proxy = 1` supaya `req.ip`
membaca IP asli dari `X-Forwarded-For`. Pastikan reverse proxy (Nginx/Caddy/
platform hosting) meneruskan header tersebut, kalau tidak semua user akan
berbagi satu rate limit login.

## 6. Health check

```
GET /api/health
```

- `200` + `{ status: "ok", database: "connected" }` → siap.
- `503` + `{ status: "degraded", database: "disconnected" }` → database bermasalah.

## 7. Keamanan file statis

Server menyajikan frontend dari root repo, tetapi memblokir:

- `/backend/*` (termasuk `.env` dan service account Firebase)
- `/.env`, `/.git`, `/node_modules`
- semua file `*.sqlite`, `*.sqlite-shm`, `*.sqlite-wal`

Sudah ada test otomatis untuk ini (`test-endpoints.js`).

## 8. Login: Firebase vs database

Backend mendukung **dua jalur**:

1. `POST /api/auth/firebase-login` `{ idToken }` — butuh service account Firebase
   di server (file JSON, gitignored). Kalau file tidak ada, endpoint ini gagal
   tetapi server tetap boot.
2. `POST /api/auth/login` `{ email, password }` atau `{ username, password }` —
   murni database, tanpa Firebase/Google.

**Penting:** halaman `register.html` menyimpan user ke database, sedangkan
`index.html` saat ini masih login lewat Firebase. Artinya user yang mendaftar
lewat `register.html` belum bisa login sampai frontend memakai
`POST /api/auth/login`. Pilih salah satu sebelum hosting:

- **A.** Upload service account Firebase ke server (login tetap seperti sekarang), atau
- **B.** Frontend mengganti login ke `POST /api/auth/login` (backend sudah siap).

## 9. Smoke test setelah deploy

```bash
curl https://domain-anda/api/health
curl -X POST https://domain-anda/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"tes@sekolah.id","password":"rahasia123"}'
curl -X POST https://domain-anda/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"tes@sekolah.id","password":"rahasia123"}'
```

Gunakan token dari respons login untuk:

```bash
curl https://domain-anda/api/shop -H "Authorization: Bearer <token>"
```

## 10. Backup

Salin file `database.sqlite` secara berkala (atau pakai `sqlite3 .backup`).
File `-wal` dan `-shm` akan dibuat otomatis saat server berjalan.
