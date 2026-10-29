// Seed contoh Code Lab & Blockly.
// Idempotent: kalau tabel sudah berisi data, seed dilewati.
"use strict";

const db = require("./database");

const count = Number(db.prepare("SELECT COUNT(*) AS n FROM code_lab_challenges").get().n || 0);
if (count > 0) {
  console.log(`Code Lab sudah berisi ${count} tantangan; seed dilewati.`);
  db.close();
  process.exit(0);
}

const items = [
  {
    title: "Robot menuju bintang",
    type: "blockly",
    grade: "SD",
    language: "Blockly",
    instructions: "Bantu robot berjalan ke bintang. Susun blok perintah supaya robot sampai.",
    goal: "Sampai ke bintang",
    blocks: ["Maju", "Belok kiri", "Belok kanan", "Ulangi"],
    blockLimit: 6,
    status: "published"
  },
  {
    title: "Logika percabangan IF-ELSE",
    type: "blockly",
    grade: "SD",
    language: "Blockly",
    instructions: "Robot harus memilih jalan. Pakai blok Jika supaya robot tidak menabrak dinding.",
    goal: "Kumpulkan semua koin",
    blocks: ["Maju", "Belok kiri", "Belok kanan", "Jika"],
    blockLimit: 8,
    status: "published"
  },
  {
    title: "Membuat kartu profil dengan HTML",
    type: "kode",
    grade: "SMP",
    language: "HTML/CSS",
    instructions: "Buat kartu profil berisi foto, nama, dan satu paragraf tentang dirimu.",
    starterCode: "<!-- tulis HTML kamu di sini -->",
    criteria: "Ada elemen <img>\nAda elemen <h2> berisi nama\nAda minimal satu <p>",
    status: "published"
  },
  {
    title: "Menata tombol dengan Flexbox",
    type: "kode",
    grade: "SMP",
    language: "HTML/CSS",
    instructions: "Susun tiga tombol sejajar dan rata tengah memakai Flexbox.",
    starterCode: "",
    criteria: "Container memakai display: flex\nTombol berjumlah tiga",
    status: "draft"
  },
  {
    title: "Hitung luas persegi",
    type: "kode",
    grade: "SMK",
    language: "Python",
    instructions: "Tulis fungsi luas_persegi(sisi) yang mengembalikan luas persegi.",
    starterCode: "def luas_persegi(sisi):\n    # tulis jawabanmu di sini\n    pass",
    tests: [{ i: "2", o: "4" }, { i: "3", o: "9" }, { i: "5", o: "25" }],
    status: "published"
  },
  {
    title: "Cek bilangan prima",
    type: "kode",
    grade: "SMK",
    language: "JavaScript",
    instructions: "Tulis fungsi isPrima(n) yang mengembalikan true jika n bilangan prima.",
    starterCode: "function isPrima(n) {\n  // tulis jawabanmu di sini\n}",
    tests: [{ i: "2", o: "true" }, { i: "9", o: "false" }, { i: "13", o: "true" }],
    status: "published"
  }
];

const insert = db.prepare(`INSERT INTO code_lab_challenges
  (title,type,grade,language,instructions,goal,blocks_json,block_limit,starter_code,tests_json,criteria,status,created_by)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL)`);

const seed = db.transaction(() => {
  for (const item of items) {
    insert.run(
      item.title,
      item.type,
      item.grade,
      item.language,
      item.instructions,
      item.goal || "",
      JSON.stringify(item.blocks || []),
      item.blockLimit === undefined ? null : item.blockLimit,
      item.starterCode || "",
      JSON.stringify(item.tests || []),
      item.criteria || "",
      item.status || "draft"
    );
  }
});
seed();

console.log(`Seed Code Lab selesai: ${items.length} tantangan.`);
db.close();
