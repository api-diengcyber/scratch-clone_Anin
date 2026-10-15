# API Dieng Cyber Coding

Semua alamat diawali `http://localhost:3000`.
Kecuali `/api/auth/login` dan `/api/health`, setiap permintaan wajib membawa header:

    Authorization: Bearer <token>

## Auth

| Method | Alamat | Isi (body) | Hasil |
|---|---|---|---|
| POST | `/api/auth/login` | `{ username, password }` | `{ token, username, status }` |
| GET  | `/api/auth/me` | - | `{ username }` |
| POST | `/api/auth/logout` | - | `{ message }` |

`status` pada login:
- `claimed` : username lama (punya data, belum punya password); password yang diketik jadi passwordnya.
- `login`   : login biasa.

Username yang belum ada tidak otomatis dibuat lewat login. `claimed` hanya dipakai untuk akun lama yang sudah ada di database tetapi belum memiliki password.

Kode error: `400` input salah, `401` username/password salah / belum login / sesi habis, `403` membuka data user lain, `429` terlalu banyak percobaan login (blok 15 menit).

## Data (hanya boleh milik user yang sedang login)

| Method | Alamat | Isi (body) | Hasil |
|---|---|---|---|
| GET  | `/api/progress/:username` | - | `[{ task_id, completed, completed_at }]` |
| GET  | `/api/progress/:username?grade=SMP&module=py1` | - | sama, difilter via JOIN tasks |
| POST | `/api/progress/:username` | `{ taskId, completed }` | `{ message, ... }` |
| GET  | `/api/points/:username` | - | `{ username, total }` |
| GET  | `/api/points/:username` | - | `{ username, total }` (dihitung server) |
| POST | `/api/points/:username` | - | `410 GONE` — total dihitung server dari task selesai |

Menyelesaikan task (`POST /api/progress` → `completed: true`) otomatis mengkredit `tasks.points` (default task 10 / project 50, bisa per-task dari kurikulum); un-check mendebit kembali. Idempoten.

## Lain-lain
| GET | `/api/health` | - | `{ status: "ok" }` |
