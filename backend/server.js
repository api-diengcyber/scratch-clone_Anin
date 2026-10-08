const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
    path: path.join(__dirname, ".env")
});

const express = require("express");
const { askTutor, hasApiKey } = require("./ai-tutor-api");
const cors = require("cors");

const db = require("./database");
const auth = require("./auth");

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// PATH PROJECT
// ============================================================

const PROJECT_ROOT = path.join(__dirname, "..");

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(cors());
app.use(express.json());

// ============================================================
// FRONTEND FILE SERVER
// ============================================================
//
// Frontend lama tetap menggunakan HTML + CSS + JS.
// Express hanya mengambil alih tugas "menyajikan file".
//
// Folder backend sengaja diblok supaya:
// database.sqlite
// server.js
// node_modules
// dll.
// tidak bisa diakses dari browser.
// ============================================================

app.use((req, res, next) => {
    if (
        req.path === "/backend" ||
        req.path.startsWith("/backend/") ||
        req.path.startsWith("/node_modules") ||
        req.path === "/package.json" ||
        req.path === "/package-lock.json"
    ) {
        return res.status(404).send("Not Found");
    }

    next();
});

app.use(
    express.static(PROJECT_ROOT, {
        index: false
    })
);

// ============================================================
// HALAMAN UTAMA
// ============================================================

app.get("/", (req, res) => {
    res.sendFile(
        path.join(PROJECT_ROOT, "index.html")
    );
});

// ============================================================
// HALAMAN FRONTEND
// ============================================================

// Dashboard
app.get("/dashboard.html", (req, res) => {
    res.sendFile(
        path.join(PROJECT_ROOT, "dashboard", "dashboard.html")
    );
});

// Alias lama untuk halaman belajar SD
app.get("/belajar.html", (req, res) => {
    res.sendFile(
        path.join(PROJECT_ROOT, "SD", "belajar.html")
    );
});

// Halaman belajar SMP
app.get("/belajar-smp.html", (req, res) => {
    res.sendFile(
        path.join(PROJECT_ROOT, "SMP", "belajar-smp.html")
    );
});

// Halaman belajar SMK
app.get("/belajar-smk.html", (req, res) => {
    res.sendFile(
        path.join(PROJECT_ROOT, "SMK", "belajar-smk.html")
    );
});

// Alias untuk halaman kurikulum SMP lama
app.get("/smp.html", (req, res) => {
    res.redirect("/belajar-smp.html");
});

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        message: "Backend Scratch Anin berjalan",
        time: new Date().toISOString()
    });
});

// ============================================================
// AUTH (LOGIN)
// ============================================================
//
// Satu endpoint login yang ramah untuk frontend lama:
//
// 1. Username belum ada -> ditolak.
// 2. Username lama tanpa password -> password pertama menjadi password
//    akun tersebut (migrasi akun lama).
// 3. Username sudah punya password -> password harus cocok.
//
// Hasilnya sebuah "token" (tiket). Frontend menyimpannya dan
// mengirimnya di setiap permintaan ke /api/progress dan /api/points.
// ============================================================

app.post("/api/auth/login", (req, res) => {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");

    if (!username || !password) {
        return res.status(400).json({
            message: "Username dan password wajib diisi"
        });
    }

    if (username.length > 32) {
        return res.status(400).json({
            message: "Username maksimal 32 karakter"
        });
    }

    if (password.length < 4) {
        return res.status(400).json({
            message: "Password minimal 4 karakter"
        });
    }

    const attemptKey = req.ip + "|" + username;

    if (auth.isBlocked(attemptKey)) {
        return res.status(429).json({
            message: "Terlalu banyak percobaan. Coba lagi 15 menit lagi."
        });
    }

    const user = db.prepare(`
        SELECT username, password_hash, password_salt
        FROM users
        WHERE username = ?
    `).get(username);

    let status = "login";

    if (!user) {
        auth.recordFail(attemptKey);

        return res.status(401).json({
            message: "Username atau password salah"
        });
    }

    if (!user.password_hash) {
        // Akun lama dari sebelum sistem password dibuat.
        // Password pertama hanya boleh dipasang pada username yang memang sudah ada.
        const { salt, hash } = auth.hashPassword(password);

        db.prepare(`
            UPDATE users
            SET password_hash = ?, password_salt = ?
            WHERE username = ?
        `).run(hash, salt, username);

        status = "claimed";
    } else if (
        !auth.verifyPassword(password, user.password_salt, user.password_hash)
    ) {
        auth.recordFail(attemptKey);

        return res.status(401).json({
            message: "Username atau password salah"
        });
    }

    auth.clearFails(attemptKey);

    res.json({
        message: "Login berhasil",
        status,
        username,
        token: auth.createSession(username)
    });
});

app.post("/api/auth/firebase-login", async (req, res) => {
    try {
        const idToken = String(
            req.body.idToken || ""
        ).trim();

        if (!idToken) {
            return res.status(400).json({
                message: "Firebase ID token wajib diisi"
            });
        }

        const firebaseUser =
            await auth.verifyFirebaseToken(idToken);

        const username =
            firebaseUser.username;

        // Pastikan user juga tersedia di SQLite
        db.prepare(`
            INSERT INTO users (username)
            VALUES (?)
            ON CONFLICT(username) DO NOTHING
        `).run(username);

        // Buat session token backend seperti sistem lama
        const token =
            auth.createSession(username);

        return res.json({
            message: "Login Firebase berhasil",
            username,
            token
        });

    } catch (error) {

        console.error(
            "Firebase login error:",
            error
        );

        return res.status(401).json({
            message:
                "Login Firebase gagal."
        });
    }
});

app.get("/api/auth/me", auth.requireAuth, (req, res) => {
    res.json({ username: req.user });
});

app.post("/api/auth/logout", auth.requireAuth, (req, res) => {
    auth.deleteSession(req.token);
    res.json({ message: "Logout berhasil" });
});

// ============================================================
// GET PROGRESS
// ============================================================

app.get("/api/progress/:username", auth.requireAuth, auth.requireSameUser, (req, res) => {
    const username = req.params.username.trim();

    if (!username) {
        return res.status(400).json({
            message: "Username wajib diisi"
        });
    }

    const progress = db.prepare(`
        SELECT
            task_id,
            completed,
            completed_at
        FROM progress
        WHERE username = ?
        ORDER BY id ASC
    `).all(username);

    res.json(progress);
});

// ============================================================
// SAVE PROGRESS
// ============================================================

app.post("/api/progress/:username", auth.requireAuth, auth.requireSameUser, (req, res) => {
    const username = req.params.username.trim();
    const { taskId, completed } = req.body;

    if (!username) {
        return res.status(400).json({
            message: "Username wajib diisi"
        });
    }

    if (!taskId) {
        return res.status(400).json({
            message: "taskId wajib diisi"
        });
    }

    db.prepare(`
        INSERT INTO users (username)
        VALUES (?)
        ON CONFLICT(username) DO NOTHING
    `).run(username);

    const isCompleted = completed === true;

    db.prepare(`
        INSERT INTO progress (
            username,
            task_id,
            completed,
            completed_at
        )
        VALUES (?, ?, ?, ?)

        ON CONFLICT(username, task_id)
        DO UPDATE SET
            completed = excluded.completed,
            completed_at = excluded.completed_at
    `).run(
        username,
        taskId,
        isCompleted ? 1 : 0,
        isCompleted
            ? new Date().toISOString()
            : null
    );

    res.json({
        message: "Progress berhasil disimpan",
        username,
        taskId,
        completed: isCompleted
    });
});

// ============================================================
// GET POINTS
// ============================================================

app.get("/api/points/:username", auth.requireAuth, auth.requireSameUser, (req, res) => {
    const username = req.params.username.trim();

    if (!username) {
        return res.status(400).json({
            message: "Username wajib diisi"
        });
    }

    const row = db.prepare(`
        SELECT total
        FROM points
        WHERE username = ?
    `).get(username);

    res.json({
        username,
        total: row ? row.total : 0
    });
});

// ============================================================
// SAVE POINTS
// ============================================================

app.post("/api/points/:username", auth.requireAuth, auth.requireSameUser, (req, res) => {
    const username = req.params.username.trim();
    const total = Number(req.body.total);

    if (!username) {
        return res.status(400).json({
            message: "Username wajib diisi"
        });
    }

    if (!Number.isFinite(total) || total < 0) {
        return res.status(400).json({
            message: "total points tidak valid"
        });
    }

    db.prepare(`
        INSERT INTO users (username)
        VALUES (?)
        ON CONFLICT(username) DO NOTHING
    `).run(username);

    db.prepare(`
        INSERT INTO points (
            username,
            total,
            updated_at
        )
        VALUES (?, ?, CURRENT_TIMESTAMP)

        ON CONFLICT(username)
        DO UPDATE SET
            total = excluded.total,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        username,
        Math.floor(total)
    );

    res.json({
        message: "Points berhasil disimpan",
        username,
        total: Math.floor(total)
    });
});
// ============================================================
// AI TUTOR
// ============================================================

app.post("/api/ai/tutor", async (req, res) => {
    try {

        const {
            message,

            // Task dari Learning Path biasa
            taskId,
            taskTitle,
            taskDescription,
            taskSteps,
            taskMaterial,
            taskHint,

            // Isi editor HTML/CSS
            editorHtml,
            editorCss,

            // Bahasa aktif (web | python | php) dan kodenya
            editorLanguage,
            editorCode,

            // Task SMP / SMA-K
            smpTask,

        } = req.body || {};

        // --------------------------------------------------------
        // VALIDASI PESAN
        // --------------------------------------------------------

        if (
            typeof message !== "string" ||
            !message.trim()
        ) {
            return res.status(400).json({
                error: "Pesan tidak boleh kosong.",
            });
        }

        if (message.length > 4000) {
            return res.status(400).json({
                error: "Pesan terlalu panjang.",
            });
        }

        // --------------------------------------------------------
        // API KEY
        // --------------------------------------------------------

        if (!hasApiKey()) {

            console.error(
                "GROQ_API_KEY belum diatur di backend/.env"
            );

            return res.status(500).json({
                error: "AI Tutor belum dikonfigurasi.",
            });
        }

        // --------------------------------------------------------
        // AI
        // --------------------------------------------------------

        const result = await askTutor({

            message: message.trim(),

            // Learning Path biasa
            taskId,
            taskTitle,
            taskDescription,
            taskSteps,
            taskMaterial,
            taskHint,

            // Editor
            editorHtml,
            editorCss,
            editorLanguage,
            editorCode,

            // SMP / SMA-K
            smpTask,

        });

        // --------------------------------------------------------
        // RESPONSE
        // --------------------------------------------------------

        return res.json(result);

    } catch (error) {

        console.error(
            "AI Tutor error:",
            error
        );

        return res.status(500).json({
            error: "AI Tutor gagal merespons.",
        });
    }
});

// ============================================================
// 404
// ============================================================

app.use((req, res) => {
    res.status(404).json({
        message: "Route tidak ditemukan",
        path: req.path
    });
});


// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
    console.log("");
    console.log("==========================================");
    console.log("  DIENG CYBER CODING - SERVER");
    console.log("==========================================");
    console.log("");
    console.log(`Frontend : http://localhost:${PORT}`);
    console.log(`Dashboard: http://localhost:${PORT}/dashboard.html`);
    console.log(`Belajar  : http://localhost:${PORT}/belajar.html`);
    console.log(`API      : http://localhost:${PORT}/api`);
    console.log("");
    console.log("Server siap digunakan.");
    console.log("");
});