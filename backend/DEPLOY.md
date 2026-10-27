# Deploy / Hosting Backend

Checklist **P0 sebelum go-live**. Semua perintah dijalankan dari folder `backend`
kecuali disebutkan lain.

## 0. Ringkasan

- [ ] 1.1 Database di volume persistent (`DB_PATH`)
- [ ] 1.2 `npm ci` + `npm run seed` + cek log
- [ ] 1.3 `.env` production (`NODE_ENV=production`, permission ketat)
- [ ] 1.4 Node & `better-sqlite3` ter-build
- [ ] 1.5 Domain + HTTPS + `X-Forwarded-For`
- [ ] 1.6 Process manager (systemd/pm2) auto-restart
- [ ] 1.7 Backup pertama + salinan `.env`
- [ ] 1.8 Smoke test production
- [ ] 1.9 Admin pertama + runtime plugin (jika plugin dipakai)

## 1. Prasyarat

- **Node.js 22.23.4 / 24.22.1 / 26.12.1 atau lebih baru** (wajib, karena patch
  keamanan Oktober 2026). Node 20 sudah EOL dan tidak menerima patch CVE tersebut.
  File `.nvmrc` berisi `26.12.1`.
- `better-sqlite3` adalah native module. Di hosting Alpine kadang butuh build tools;
  paling aman pakai image Debian/Ubuntu (mis. `node:26.12.1-bookworm-slim` atau
  `node:24.22.1-bookworm-slim`).
- Folder database harus **persistent** (bukan ephemeral). Kalau tidak, data user,
  progres, dan koin belajar hilang setiap redeploy.

## 1.1 Database persistent

**VPS:**

```bash
sudo mkdir -p /data
sudo chown -R dcc:dcc /data
```

Lalu di `.env`:

```env
DB_PATH=/data/database.sqlite
```

**Platform (Railway/Render/Fly.io):**

1. Tambahkan volume/disk persistent, mount ke `/data`.
2. Set `DB_PATH=/data/database.sqlite`.
3. Pastikan proses Node boleh menulis ke `/data`.

Catatan:

- Jangan taruh DB di folder repo yang ikut dihapus saat redeploy.
- Folder parent dibuat otomatis oleh aplikasi, tetapi permission parent harus benar.
- File `*.sqlite`, `*.sqlite-shm`, `*.sqlite-wal` tidak pernah disajikan sebagai
  file statis (sudah diblokir dan dites).

## 1.2 Migrasi + seed

```bash
cd backend
npm ci --omit=dev
npm run seed
```

`npm run seed` idempotent (`INSERT OR IGNORE`), jadi aman dijalankan ulang dan
tidak menghapus data user. Target data:

- 44 modul
- 238 task (SD 52, SMP 93, SMK 93)
- 89 materi SMP

Cek log yang harus muncul:

```text
Database berhasil terhubung.
Lokasi database: /data/database.sqlite
```

Migrasi schema berjalan otomatis saat server/seed start (kolom profil, `user_items`,
`attempts.time_spent`, `progress.bonus_awarded`, migrasi identitas `username` →
`user_id`, index, dll). Tidak perlu SQL manual. Migrasi identitas menolak boot jika
ada baris anak yang tidak punya user valid; sesi lama tanpa user dihapus.

Kalau jumlah data tidak sesuai, cek `DB_PATH` — kemungkinan seed masuk ke DB lain.

## 1.3 Environment production

```bash
cp .env.example .env
chmod 600 .env
```

Wajib:

| Variabel | Contoh | Keterangan |
|---|---|---|
| `NODE_ENV` | `production` | Mematikan `/api/dev/*` dan mengaktifkan `trust proxy`. |
| `PORT` | `3000` | Sering diisi otomatis oleh platform. |
| `DB_PATH` | `/data/database.sqlite` | Harus di volume persistent. |

Opsional:

| Variabel | Default | Keterangan |
|---|---|---|
| `FRONTEND_ORIGIN` | - | Isi kalau frontend beda domain; kalau satu domain, kosongkan. |
| `TRUST_PROXY` | `1` | `1` = Nginx/Caddy langsung, `2` = Cloudflare + Nginx. |
| `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | - | AI Tutor; tanpa ini fitur lain tetap jalan. |
| `AI_MOCK` | - | `1` untuk jawaban dummy saat testing. |
| `FIRST_TRY_BONUS` | `5` | Bonus koin percobaan pertama. |
| `AI_TUTOR_ALLOWED_MODULES` | `ai1,ai2,ai3,ai4` | Modul SMP yang boleh memakai AI Tutor. |
| `LOG_LEVEL` | `info` | Level log pino. |
| `BACKUP_DIR` | `backend/backups` | Sebaiknya `/data/backups`. |
| `BACKUP_KEEP` | `7` | Jumlah backup terakhir yang disimpan. |
| `PLUGIN_DIR` | `/data/plugins` | Harus sama untuk backend dan runtime plugin. |
| `PLUGIN_PUBLIC_ORIGIN` | `https://plugins.example.com` | Origin runtime plugin (subdomain terpisah). |
| `APP_PUBLIC_ORIGIN` | `https://example.com` | Origin aplikasi utama untuk `frame-ancestors` runtime. Wajib di production. |
| `PLUGIN_PREVIEW_SECRET` | random 32+ karakter | HMAC tiket preview; jangan commit. |
| `PLUGIN_DEVELOPER_USER_IDS` | `1,7` | `users.id` admin yang boleh upload/review/publish plugin. |
| `PLUGIN_PORT` | `3001` | Port runtime plugin. |

Pastikan `.env` **tidak ikut git** dan hanya bisa dibaca user service:

```bash
sudo chown dcc:dcc /opt/dcc/backend/.env
sudo chmod 600 /opt/dcc/backend/.env
```

## 1.4 Build/runtime

```bash
node -v          # 22.23.4 / 24.22.1 / 26.12.1+
npm ci --omit=dev
```

- `npm ci` memakai `package-lock.json` (reproducible).
- `--omit=dev` aman karena tidak ada devDependency; tetap lebih kecil.
- Kalau pindah versi Node dan muncul error `NODE_MODULE_VERSION`:

```bash
npm rebuild better-sqlite3
```

- Di Alpine, kalau tidak ada prebuilt binary, pasang `python3 make g++` atau
  gunakan image Debian/Ubuntu.

## 1.5 Domain + HTTPS

### Caddy (paling mudah, TLS otomatis)

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
# edit example.com -> domain asli
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

### Nginx + Certbot

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/dcc
# edit example.com + path sertifikat
sudo ln -s /etc/nginx/sites-available/dcc /etc/nginx/sites-enabled/dcc
sudo nginx -t
sudo systemctl reload nginx
```

Contoh ambil sertifikat:

```bash
sudo certbot --nginx -d example.com
```

### Cloudflare

- SSL/TLS mode: **Full (strict)**.
- Kalau Cloudflare → Nginx → Node, set `TRUST_PROXY=2`.
- Jangan cache `/api/*` di Cloudflare (response bertoken sudah `no-store`,
  tetapi tetap aman untuk mengecualikan `/api/*`).

Pastikan HTTP redirect ke HTTPS. Nginx/Caddy di atas sudah melakukannya.

## 1.6 Process manager

### systemd (VPS)

```bash
sudo useradd --system --home /opt/dcc --shell /usr/sbin/nologin dcc
sudo mkdir -p /opt/dcc
# clone/copy repo ke /opt/dcc, lalu:
sudo cp deploy/dcc-backend.service /etc/systemd/system/dcc-backend.service
# edit User, WorkingDirectory, ExecStart, ReadWritePaths jika perlu
sudo systemctl daemon-reload
sudo systemctl enable --now dcc-backend
sudo systemctl status dcc-backend
sudo journalctl -u dcc-backend -f
```

### pm2

```bash
cd backend
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup
pm2 logs dcc-backend
```

**Penting:** SQLite hanya boleh satu proses. Jangan set `instances > 1` atau
menjalankan dua service terhadap DB yang sama.

Start command: `npm start` (atau `node server.js` dari folder `backend`).

## 1.7 Backup pertama

Sebelum go-live, buat backup awal walaupun DB masih kosong:

```bash
sudo mkdir -p /data/backups
sudo chown -R dcc:dcc /data/backups

DB_PATH=/data/database.sqlite BACKUP_DIR=/data/backups npm run backup
```

Script memakai SQLite backup API, jadi konsisten walau server sedang jalan dan
otomatis menyimpan hanya `BACKUP_KEEP` file terakhir.

Contoh cron harian 02:00:

```cron
0 2 * * * cd /opt/dcc/backend && DB_PATH=/data/database.sqlite BACKUP_DIR=/data/backups /usr/bin/npm run backup >> /var/log/dcc-backup.log 2>&1
```

Simpan juga salinan `.env` di tempat aman (password manager/offline), **bukan git**.
Tes restore ke DB sementara sebelum benar-benar dibutuhkan:

```bash
cp /data/backups/database-....sqlite /tmp/restore-test.sqlite
DB_PATH=/tmp/restore-test.sqlite node -e "require('./database'); console.log('restore ok')"
```

## 1.8 Smoke test production

Otomatis:

```bash
BASE_URL=https://domain-anda npm run smoke
```

Yang dicek:

- `GET /api/health` → `200` + `database: connected`
- `GET /` → `200`
- `GET /api/dev/progress` → `404`
- `GET /backend/.env` → `404`
- `GET /backend/database.sqlite` → `404`
- `GET /.git/config` → `404`
- `GET /api/shop` tanpa token → `401`

Manual (opsional):

```bash
curl -i https://domain-anda/api/health
curl -i https://domain-anda/
curl -i https://domain-anda/api/dev/progress
curl -i https://domain-anda/backend/.env
curl -i https://domain-anda/api/shop
```

## 1.9 Admin pertama & runtime plugin

Buat akun admin lewat CLI (bukan lewat UI admin):

```bash
cd /opt/dcc/backend
npm run create-admin
```

CLI meminta username, email opsional, dan password. Role yang dibuat adalah
`admin`; admin hanya mengelola murid. Simpan `users.id` yang dicetak CLI.

Kalau plugin dipakai:

1. Set `PLUGIN_DIR` ke volume persistent yang sama untuk backend dan runtime.
2. Isi `PLUGIN_DEVELOPER_USER_IDS` dengan `users.id` admin tepercaya. Tanpa ini,
   upload/review/publish plugin ditolak `403 PLUGIN_DEVELOPER_REQUIRED`.
3. Isi `PLUGIN_PUBLIC_ORIGIN` (mis. `https://plugins.example.com`) dan
   `APP_PUBLIC_ORIGIN` (mis. `https://example.com`).
4. Buat `PLUGIN_PREVIEW_SECRET` acak minimal 32 karakter.
5. Jalankan runtime sebagai proses/service terpisah:

```bash
cd /opt/dcc/backend
npm run start:plugins
```

Runtime membuka database secara **read-only**; backend tetap satu-satunya penulis.
Arahkan subdomain plugin ke port `PLUGIN_PORT` (default `3001`). Backend hanya
menampilkan plugin yang sudah `published`; file quarantine tidak pernah disajikan
publik.

Kalau plugin belum dipakai, runtime tidak perlu dijalankan dan
`PLUGIN_DEVELOPER_USER_IDS` boleh kosong.

## 2. Login: Firebase vs database

Backend mendukung **dua jalur**:

1. `POST /api/auth/login` `{ email, password }` atau `{ username, password }` —
   murni database, tanpa Firebase/Google. Frontend siswa di `users/` memakai
   jalur ini.
2. `POST /api/auth/firebase-login` `{ idToken }` — opsional; butuh service account
   Firebase di server (file JSON, gitignored). Kalau file tidak ada, endpoint ini
   gagal tetapi server tetap boot.

Akun Firebase yang belum punya password DB tidak bisa diklaim lewat login biasa.
Pemilik harus login Firebase dulu, lalu memanggil `POST /api/auth/change-password`.

## 3. Keamanan file statis

Server menyajikan frontend dari root repo, tetapi memblokir:

- `/backend/*` (termasuk `.env` dan service account Firebase)
- `/.env`, `/.git`, `/node_modules`
- semua file `*.sqlite`, `*.sqlite-shm`, `*.sqlite-wal`

Sudah ada test otomatis untuk ini (`test-endpoints.js` dan `npm run smoke`).

## 4. Troubleshooting

| Gejala | Cek |
|---|---|
| `502 Bad Gateway` | Service mati / port salah. `systemctl status dcc-backend`, `pm2 logs`, `curl localhost:3000/api/health`. |
| `SQLITE_CANTOPEN` / read-only | Permission `/data`, `DB_PATH`, owner user service. |
| `NODE_MODULE_VERSION` mismatch | `npm rebuild better-sqlite3`. |
| Seed 0 data | `DB_PATH` salah; lihat log `Lokasi database: ...`. |
| Semua user kena rate limit yang sama | `TRUST_PROXY` salah atau proxy tidak mengirim `X-Forwarded-For`. |
| Login user baru gagal | Cek jalur login frontend dan endpoint auth yang dipakai (lihat bagian 2). |
| Data hilang setelah redeploy | `DB_PATH` masih di folder ephemeral. |
| Upload plugin `403 PLUGIN_DEVELOPER_REQUIRED` | `PLUGIN_DEVELOPER_USER_IDS` belum berisi `users.id` admin. |
| Iframe plugin kosong / ditolak | `APP_PUBLIC_ORIGIN`, `PLUGIN_PUBLIC_ORIGIN`, dan CSP `frame-src` harus cocok; runtime harus di origin terpisah. |
| Murid 403 setelah username diubah | Frontend masih memakai username lama; ambil ulang `/api/auth/me` lalu pakai username baru. |

## 5. Rollback

1. Stop service (`systemctl stop dcc-backend` / `pm2 stop dcc-backend`).
2. Simpan DB saat ini sebagai backup.
3. Restore backup DB yang valid.
4. Checkout release sebelumnya.
5. `npm ci --omit=dev`.
6. Start service dan jalankan `npm run smoke`.
