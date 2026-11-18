"use strict";

// ============================================================
// HADIAH TOKO (Lencana & Hadiah) — portal admin
//
// Sumber katalog `shop_rewards` untuk bingkai avatar dan gelar julukan.
// Endpoint ini dipakai menu Lencana & Hadiah; `/api/shop` membaca katalog yang
// sama, jadi harga/nama yang diubah admin langsung dipakai saat siswa membeli.
//
// Semua endpoint memakai permission `badge.kelola` (sama seperti badge).
// ============================================================

const shop = require("./shop-catalog");

const MAX_PRICE = 1_000_000;
const MAX_ORNAMENTS = 5;
const POSITIONS = ["top", "tl", "tr", "bl", "br", "orbit"];
const ANIMATIONS = ["", "peek", "wiggle"];
const ID_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const FRAME_RE = /^frame-[a-z0-9-]{1,40}$/;

function invalid(message, field) {
  const err = new Error(message);
  err.code = "REWARD_INVALID";
  err.field = field || null;
  throw err;
}

function text(value, field, max, required = false) {
  if (value === undefined || value === null) {
    if (required) invalid(`${field} wajib diisi.`, field);
    return "";
  }
  if (typeof value !== "string") invalid(`${field} harus berupa teks.`, field);
  const clean = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  if (required && !clean) invalid(`${field} wajib diisi.`, field);
  if (clean.length > max) invalid(`${field} maksimal ${max} karakter.`, field);
  return clean;
}

function money(value, field) {
  if (value === undefined || value === null || value === "") invalid(`${field} wajib diisi.`, field);
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    invalid(`${field} harus berupa angka bulat.`, field);
  }
  if (num < 0 || num > MAX_PRICE) invalid(`${field} harus antara 0 dan ${MAX_PRICE}.`, field);
  return num;
}

function jenisOf(value, fallback = "") {
  if (value === undefined || value === null || value === "") {
    if (!fallback) invalid("jenis wajib diisi.", "jenis");
    return fallback;
  }
  const clean = String(value).trim().toLowerCase();
  if (!shop.SHOP_TYPES.includes(clean)) {
    invalid("jenis harus 'bingkai' atau 'gelar'.", "jenis");
  }
  return clean;
}

function ornamentsOf(value) {
  if (value === undefined) return undefined;
  if (value === null) return [];
  if (!Array.isArray(value)) invalid("orn harus berupa array.", "orn");
  if (value.length > MAX_ORNAMENTS) invalid(`orn maksimal ${MAX_ORNAMENTS} item.`, "orn");
  return value.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) invalid("Setiap orn harus berupa objek.", "orn");
    const e = text(raw.e, "orn.e", 8, true);
    const p = raw.p === undefined || raw.p === "" ? "top" : String(raw.p);
    if (!POSITIONS.includes(p)) invalid("orn.p tidak dikenal.", "orn");
    const a = raw.a === undefined || raw.a === null ? "" : String(raw.a);
    if (!ANIMATIONS.includes(a)) invalid("orn.a tidak dikenal.", "orn");
    const s = raw.s === undefined || raw.s === null || raw.s === "" ? 1 : Number(raw.s);
    if (!Number.isFinite(s) || s < 0.5 || s > 3) invalid("orn.s harus antara 0.5 dan 3.", "orn");
    const out = { e, p };
    if (a) out.a = a;
    out.s = s;
    if (raw.code === true) out.code = true;
    return out;
  });
}

function slugify(value) {
  const base = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return base || "hadiah";
}

function registerRewardsApi(app, deps) {
  const { db, auth, sendApiError, sendApiSuccess } = deps;

  // Pastikan katalog awal ada sebelum endpoint dipakai.
  shop.seedItems(db);

  const guard = [auth.requireAuth, auth.requirePermission("badge.kelola")];

  function dataResponse(res, fn) {
    try {
      return fn();
    } catch (err) {
      if (err && err.code === "REWARD_INVALID") {
        return sendApiError(res, 400, err.message, "VALIDATION_ERROR", err.field ? { field: err.field } : undefined);
      }
      throw err;
    }
  }

  function audit(req, action, id, details) {
    db.prepare(`INSERT INTO admin_audit (actor_user_id, actor_username, action, target_type, target_id, details, ip)
      VALUES (?, ?, ?, 'reward', ?, ?, ?)`).run(
      req.userId,
      req.user || "unknown",
      action,
      String(id ?? ""),
      JSON.stringify(details || {}),
      req.ip || null
    );
  }

  function findReward(id) {
    if (typeof id !== "string" || !ID_RE.test(id)) return null;
    return shop.rowToItem(db.prepare("SELECT * FROM shop_rewards WHERE id = ?").get(id));
  }

  function uniqueId(jenis, nama) {
    const prefix = jenis === "bingkai" ? "bg_" : "gl_";
    const base = `${prefix}${slugify(nama)}`.slice(0, 64);
    let candidate = base;
    let n = 2;
    const exists = db.prepare("SELECT 1 FROM shop_rewards WHERE id = ?");
    while (exists.get(candidate)) {
      const suffix = `_${n++}`;
      candidate = base.slice(0, 64 - suffix.length) + suffix;
    }
    return candidate;
  }

  function normalize(body, current = null) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      invalid("Body hadiah harus berupa objek.", "body");
    }
    const isNew = !current;
    const jenis = jenisOf(body.jenis, current ? current.jenis : "");
    if (current && jenis !== current.jenis) invalid("jenis hadiah tidak bisa diubah.", "jenis");

    const nama = body.nama === undefined && current
      ? current.nama
      : text(body.nama, "nama", 40, true);
    const emoji = body.emoji === undefined && current
      ? current.emoji
      : text(body.emoji, "emoji", 8, true);
    const harga = body.harga === undefined && current ? current.harga : money(body.harga, "harga");

    let id;
    if (isNew) {
      if (body.id !== undefined && body.id !== null && body.id !== "") {
        const raw = String(body.id).trim().toLowerCase();
        if (!ID_RE.test(raw)) invalid("id harus 2-64 karakter huruf kecil, angka, '-' atau '_'.", "id");
        if (findReward(raw)) invalid("id hadiah sudah dipakai.", "id");
        id = raw;
      } else {
        id = uniqueId(jenis, nama);
      }
    }

    const item = { id: isNew ? id : current.id, jenis, nama, emoji, harga };
    if (jenis === "bingkai") {
      const frameClass = body.frameClass === undefined && current
        ? current.frameClass
        : (text(body.frameClass, "frameClass", 48) || "frame-gold");
      if (!FRAME_RE.test(frameClass)) invalid("frameClass harus diawali 'frame-'.", "frameClass");
      const desc = body.desc === undefined && current
        ? current.desc
        : text(body.desc, "desc", 160);
      const ornInput = body.orn === undefined && current
        ? current.orn
        : ornamentsOf(body.orn);
      item.frameClass = frameClass;
      item.desc = desc;
      item.orn = ornInput || [];
    }
    return item;
  }

  function save(row) {
    db.prepare(`INSERT INTO shop_rewards
        (id, jenis, emoji, nama, harga, frame_class, description, orn, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`).run(
      row.id,
      row.jenis,
      row.emoji,
      row.nama,
      row.harga,
      row.frameClass || "",
      row.desc || "",
      JSON.stringify(row.orn || [])
    );
  }

  app.get("/api/admin/rewards", guard, (req, res) => {
    const items = shop.listItems(db);
    return sendApiSuccess(res, { items, total: items.length });
  });

  app.post("/api/admin/rewards", guard, (req, res) => dataResponse(res, () => {
    const item = normalize(req.body, null);
    save(item);
    audit(req, "reward.create", item.id, { jenis: item.jenis, nama: item.nama, harga: item.harga });
    return sendApiSuccess(res, { item }, "Hadiah dibuat.", 201);
  }));

  app.patch("/api/admin/rewards/:id", guard, (req, res) => dataResponse(res, () => {
    const current = findReward(req.params.id);
    if (!current) return sendApiError(res, 404, "Hadiah tidak ditemukan.", "NOT_FOUND");
    const item = normalize(req.body, current);
    db.prepare(`UPDATE shop_rewards SET jenis = ?, emoji = ?, nama = ?, harga = ?,
        frame_class = ?, description = ?, orn = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`).run(
      item.jenis,
      item.emoji,
      item.nama,
      item.harga,
      item.frameClass || "",
      item.desc || "",
      JSON.stringify(item.orn || []),
      current.id
    );
    audit(req, "reward.update", current.id, { jenis: item.jenis, nama: item.nama, harga: item.harga });
    return sendApiSuccess(res, { item: findReward(current.id) }, "Hadiah diperbarui.");
  }));

  app.delete("/api/admin/rewards/:id", guard, (req, res) => {
    const current = findReward(req.params.id);
    if (!current) return sendApiError(res, 404, "Hadiah tidak ditemukan.", "NOT_FOUND");
    db.transaction(() => {
      // Lepas dari avatar pengguna yang sedang memakainya agar tidak menunjuk
      // ke id yang sudah tidak ada. Riwayat pembelian di user_items tetap utuh.
      if (current.jenis === "bingkai") {
        db.prepare("UPDATE users SET equipped_frame = NULL WHERE equipped_frame = ?").run(current.id);
      } else {
        db.prepare("UPDATE users SET equipped_title = NULL WHERE equipped_title = ?").run(current.id);
      }
      db.prepare("DELETE FROM shop_rewards WHERE id = ?").run(current.id);
    })();
    audit(req, "reward.delete", current.id, { jenis: current.jenis, nama: current.nama });
    return sendApiSuccess(res, { id: current.id }, "Hadiah dihapus.");
  });
}

module.exports = {
  registerRewardsApi,
  POSITIONS,
  ANIMATIONS
};
