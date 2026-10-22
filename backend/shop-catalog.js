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

function findItem(itemId) {
    if (typeof itemId !== "string") return null;
    return SHOP_BY_ID.get(itemId) || null;
}

module.exports = {
    SHOP_ITEMS,
    SHOP_TYPES,
    findItem
};
