"use strict";

/**
 * Modul Galeri Proyek Scratch Komunitas Ruang KKA
 * Mendukung pembacaan katalog, publikasi karya oleh siswa,
 * detail proyek, dan interaksi like.
 */

function registerGalleryApi(app, deps) {
  const { db, auth, sendApiError, sendApiSuccess, sanitizeString } = deps;

  const CATEGORIES = ["All", "Animations", "Art", "Games", "Music", "Stories", "Tutorials"];

  // 1. GET Daftar Proyek Galeri Komunitas (Publik)
  app.get("/api/gallery/projects", (req, res) => {
    try {
      const category = sanitizeString(req.query.category || "All", 30);
      const grade = sanitizeString(req.query.grade || "", 10).toUpperCase();
      const search = sanitizeString(req.query.search || "", 100);
      const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
      const limit = Math.max(1, Math.min(50, Number.parseInt(req.query.limit, 10) || 20));
      const offset = (page - 1) * limit;

      const where = ["status = 'published'"];
      const params = [];

      if (category && category !== "All") {
        where.push("category = ?");
        params.push(category);
      }
      if (grade && ["SD", "SMP", "SMK"].includes(grade)) {
        where.push("grade = ?");
        params.push(grade);
      }
      if (search) {
        where.push("(title LIKE ? OR author_name LIKE ?)");
        params.push(`%${search}%`, `%${search}%`);
      }

      const whereClause = where.join(" AND ");
      const total = db.prepare(`SELECT COUNT(*) AS count FROM gallery_projects WHERE ${whereClause}`).get(...params).count;

      const items = db.prepare(`
        SELECT id, title, description, instructions, category, grade, author_user_id, author_name,
               thumbnail_url, views_count, likes_count, stars_count, created_at
        FROM gallery_projects
        WHERE ${whereClause}
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset);

      return sendApiSuccess(res, {
        items,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      });
    } catch (err) {
      console.error("[GALLERY] Gagal mengambil daftar galeri:", err);
      return sendApiError(res, 500, "Gagal memuat galeri proyek.", "INTERNAL_ERROR");
    }
  });

  // 2. GET Detail Satu Proyek (Termasuk data JSON untuk player/editor)
  app.get("/api/gallery/projects/:id", (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1) {
        return sendApiError(res, 400, "ID proyek tidak valid.", "VALIDATION_ERROR");
      }

      const item = db.prepare(`
        SELECT id, title, description, instructions, category, grade, author_user_id, author_name,
               project_data_json, thumbnail_url, views_count, likes_count, stars_count, created_at
        FROM gallery_projects
        WHERE id = ? AND status = 'published'
      `).get(id);

      if (!item) {
        return sendApiError(res, 404, "Proyek tidak ditemukan.", "NOT_FOUND");
      }

      // Tambahkan view count
      db.prepare("UPDATE gallery_projects SET views_count = views_count + 1 WHERE id = ?").run(id);
      item.views_count += 1;

      return sendApiSuccess(res, { item });
    } catch (err) {
      console.error("[GALLERY] Gagal mengambil detail proyek:", err);
      return sendApiError(res, 500, "Gagal memuat detail proyek.", "INTERNAL_ERROR");
    }
  });

  // 3. POST Publikasikan Proyek Baru (Khusus Siswa Login)
  app.post("/api/gallery/projects", auth.requireAuth, (req, res) => {
    try {
      const body = req.body || {};
      const title = sanitizeString(body.title || "", 120);
      if (!title) {
        return sendApiError(res, 400, "Judul proyek wajib diisi.", "VALIDATION_ERROR");
      }

      const category = CATEGORIES.includes(body.category) && body.category !== "All" ? body.category : "Games";
      const description = sanitizeString(body.description || "", 500);
      const instructions = sanitizeString(body.instructions || "", 500);
      const projectDataJson = typeof body.projectData === "object" ? JSON.stringify(body.projectData) : String(body.projectDataJson || "{}");
      const thumbnailUrl = sanitizeString(body.thumbnailUrl || "", 2000);

      const user = db.prepare("SELECT username, full_name, allowed_grades FROM users WHERE id = ?").get(req.userId);
      const authorName = (user && user.full_name) || (user && user.username) || "Siswa KKA";

      let grade = "SD";
      if (user && user.allowed_grades) {
        try {
          const g = JSON.parse(user.allowed_grades);
          if (Array.isArray(g) && g[0]) grade = g[0];
        } catch (_) {}
      }

      const info = db.prepare(`
        INSERT INTO gallery_projects (
          title, description, instructions, category, grade,
          author_user_id, author_name, project_data_json, thumbnail_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(title, description, instructions, category, grade, req.userId, authorName, projectDataJson, thumbnailUrl);

      const createdId = Number(info.lastInsertRowid);
      return sendApiSuccess(res, {
        id: createdId,
        title,
        category,
        authorName
      }, "Proyek berhasil dipublikasikan ke galeri!");
    } catch (err) {
      console.error("[GALLERY] Gagal mempublikasikan proyek:", err);
      return sendApiError(res, 500, "Gagal mempublikasikan proyek.", "INTERNAL_ERROR");
    }
  });

  // 4. POST Like / Unlike Proyek
  app.post("/api/gallery/projects/:id/like", auth.requireAuth, (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1) {
        return sendApiError(res, 400, "ID proyek tidak valid.", "VALIDATION_ERROR");
      }

      const project = db.prepare("SELECT id, likes_count FROM gallery_projects WHERE id = ?").get(id);
      if (!project) {
        return sendApiError(res, 404, "Proyek tidak ditemukan.", "NOT_FOUND");
      }

      const existing = db.prepare("SELECT 1 FROM gallery_project_likes WHERE project_id = ? AND user_id = ?").get(id, req.userId);
      let liked = false;

      if (existing) {
        db.prepare("DELETE FROM gallery_project_likes WHERE project_id = ? AND user_id = ?").run(id, req.userId);
        db.prepare("UPDATE gallery_projects SET likes_count = MAX(0, likes_count - 1) WHERE id = ?").run(id);
        liked = false;
      } else {
        db.prepare("INSERT INTO gallery_project_likes (project_id, user_id) VALUES (?, ?)").run(id, req.userId);
        db.prepare("UPDATE gallery_projects SET likes_count = likes_count + 1 WHERE id = ?").run(id);
        liked = true;
      }

      const updated = db.prepare("SELECT likes_count FROM gallery_projects WHERE id = ?").get(id);

      return sendApiSuccess(res, {
        id,
        liked,
        likesCount: updated.likes_count
      }, liked ? "Proyek disukai!" : "Batal menyukai proyek.");
    } catch (err) {
      console.error("[GALLERY] Gagal memproses like:", err);
      return sendApiError(res, 500, "Gagal memproses apresiasi proyek.", "INTERNAL_ERROR");
    }
  });
}

module.exports = { registerGalleryApi };
