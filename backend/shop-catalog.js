// backend/shop-catalog.js
// ============================================================
// Salinan server-side dari LP.HADIAH di kurikulum/core/jalur-belajar.js.
//
// Kenapa disalin, bukan hanya di frontend?
// - Harga adalah uang (Koin Belajar). Kalau server tidak tahu harga,
//   siswa bisa mengubah harga dari console browser sebelum membeli.
// - Server memvalidasi item, harga, dan saldo sebelum mencatat pembelian.
//
// SYNC POINT: kalau frontend menambah/mengubah item atau harga di
// kurikulum/core/jalur-belajar.js (LP.HADIAH), file ini WAJIB ikut diubah.
// Id dan harga harus sama persis.
// ============================================================

const SHOP_ITEMS = [
    // Bingkai avatar — harga mengikuti LP.HADIAH
    {
        id: "bg_gold", jenis: "bingkai", emoji: "👑", nama: "Bingkai Mahkota Emas", harga: 50,
        frameClass: "frame-gold", desc: "Mahkota emas berkilau di atas kepala avatarmu.",
        orn: [{ e: "👑", p: "top", a: "peek", s: 1.6 }]
    },
    {
        id: "bg_neon", jenis: "bingkai", emoji: "💫", nama: "Bingkai Neon Cyber", harga: 75,
        frameClass: "frame-neon", desc: "Laser neon biru pendar murni berdenyut tajam.",
        orn: [{ e: "💫", p: "tl", a: "wiggle", s: 1.3 }]
    },
    {
        id: "bg_matrix", jenis: "bingkai", emoji: "🤖", nama: "Bingkai Matrix Terminal", harga: 100,
        frameClass: "frame-matrix", desc: "Neon hacker hijau digital dengan kode terminal.",
        orn: [{ e: "⚡", p: "tr", a: "wiggle", s: 1 }, { e: "0101", p: "bl", code: true }]
    },
    {
        id: "bg_fire", jenis: "bingkai", emoji: "🔥", nama: "Kobaran Api Petualang", harga: 120,
        frameClass: "frame-fire", desc: "Api membara dengan letupan energi koding penuh semangat.",
        orn: [{ e: "🔥", p: "tr", a: "peek", s: 1.6 }, { e: "💥", p: "bl", s: 1.2 }]
    },
    {
        id: "bg_cat", jenis: "bingkai", emoji: "🐱", nama: "Kucing Mengintip Ceria", harga: 130,
        frameClass: "frame-cat", desc: "Kucing imut yang selalu mengintip dari atas bingkai neon.",
        orn: [{ e: "🐱", p: "top", a: "peek", s: 1.6 }, { e: "🐾", p: "br", s: 1 }]
    },
    {
        id: "bg_sea", jenis: "bingkai", emoji: "🐬", nama: "Akuarium Lumba-lumba", harga: 140,
        frameClass: "frame-sea", desc: "Gelembung laut toska dengan lumba-lumba yang ceria melompat.",
        orn: [{ e: "🐬", p: "tr", a: "wiggle", s: 1.6 }, { e: "🫧", p: "bl", s: 1 }]
    },
    {
        id: "bg_rainbow", jenis: "bingkai", emoji: "🍭", nama: "Bingkai Permen Pelangi", harga: 150,
        frameClass: "frame-rainbow", desc: "Gradasi pelangi neon lengkap dengan permen manis.",
        orn: [{ e: "🍭", p: "tr", a: "wiggle", s: 1.5 }, { e: "⭐", p: "bl", a: "peek", s: 1.2 }]
    },
    {
        id: "bg_space", jenis: "bingkai", emoji: "🚀", nama: "Roket Orbit Antariksa", harga: 180,
        frameClass: "frame-space", desc: "Roket luar angkasa yang terbang mengitari lingkaran avatarmu.",
        orn: [{ e: "🚀", p: "orbit", s: 1.2 }, { e: "🪐", p: "br", s: 1 }]
    },
    {
        id: "bg_galaxy", jenis: "bingkai", emoji: "🔮", nama: "Bingkai Galaksi Kosmik", harga: 200,
        frameClass: "frame-galaxy", desc: "Aura kosmik ungu dengan taburan bintang bercahaya.",
        orn: [{ e: "✨", p: "tl", a: "wiggle", s: 1.6 }, { e: "🔮", p: "br", a: "peek", s: 1.4 }]
    },

    // Gelar / julukan di bawah nama
    { id: "gl_star", jenis: "gelar", emoji: "⭐", nama: "Bintang Kelas", harga: 80 },
    { id: "gl_python", jenis: "gelar", emoji: "🐍", nama: "Pawang Python", harga: 120 },
    { id: "gl_bug", jenis: "gelar", emoji: "🕵️", nama: "Detektif Bug", harga: 150 },
    { id: "gl_web", jenis: "gelar", emoji: "🌐", nama: "Arsitek Web", harga: 180 },
    { id: "gl_robot", jenis: "gelar", emoji: "🤖", nama: "Sahabat Robot", harga: 250 },
    { id: "gl_master", jenis: "gelar", emoji: "⚡", nama: "Master Algoritma", harga: 300 }
];

const SHOP_TYPES = ["bingkai", "gelar"];

const SHOP_BY_ID = new Map(SHOP_ITEMS.map((item) => [item.id, item]));

// ------------------------------------------------------------
// Katalog dari database
//
// Tabel `shop_rewards` adalah sumber utama setelah server start; data statis
// di atas hanya benih awal dan cadangan bila fungsi dipanggil tanpa db.
// Pembelian tetap memakai harga di tabel ini, bukan harga dari browser.
// ------------------------------------------------------------
function rowToItem(row) {
    if (!row) return null;
    let orn = [];
    try {
        const parsed = JSON.parse(row.orn || "[]");
        if (Array.isArray(parsed)) orn = parsed;
    } catch (_) { /* biarkan kosong */ }
    const item = {
        id: row.id,
        jenis: row.jenis,
        emoji: row.emoji || "",
        nama: row.nama,
        harga: Number(row.harga) || 0
    };
    if (row.jenis === "bingkai") {
        item.frameClass = row.frame_class || "frame-gold";
        item.desc = row.description || "";
        item.orn = orn;
    }
    return item;
}

// Isi katalog awal. Aman dipanggil berkali-kali: baris yang sudah ada
// (termasuk yang sudah diubah admin) tidak ditimpa.
function seedItems(db) {
    if (!db) return { seeded: 0 };
    const insert = db.prepare(`
        INSERT OR IGNORE INTO shop_rewards
            (id, jenis, emoji, nama, harga, frame_class, description, orn)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    let seeded = 0;
    for (const item of SHOP_ITEMS) {
        const info = insert.run(
            item.id,
            item.jenis,
            item.emoji || "",
            item.nama,
            item.harga,
            item.frameClass || "",
            item.desc || "",
            JSON.stringify(item.orn || [])
        );
        seeded += Number(info.changes) || 0;
    }
    return { seeded };
}

function listItems(db) {
    if (!db) return SHOP_ITEMS.map((item) => ({ ...item }));
    const rows = db.prepare(`
        SELECT * FROM shop_rewards
        ORDER BY CASE jenis WHEN 'bingkai' THEN 0 ELSE 1 END, harga ASC, nama COLLATE NOCASE ASC
    `).all();
    return rows.map(rowToItem);
}

// findItem(db, id) memakai tabel; findItem(id) tetap didukung untuk pemanggil
// lama yang hanya butuh katalog statis.
function findItem(dbOrId, maybeId) {
    const hasDb = maybeId !== undefined;
    const db = hasDb ? dbOrId : null;
    const itemId = hasDb ? maybeId : dbOrId;
    if (typeof itemId !== "string") return null;
    if (db) {
        return rowToItem(db.prepare("SELECT * FROM shop_rewards WHERE id = ?").get(itemId));
    }
    return SHOP_BY_ID.get(itemId) || null;
}

module.exports = {
    SHOP_ITEMS,
    SHOP_TYPES,
    SHOP_BY_ID,
    rowToItem,
    seedItems,
    listItems,
    findItem
};

