// Endpoint baca untuk akun orang tua. Tautan anak dikelola lewat Admin API
// (`/api/admin/instructors/:id/children`), sedangkan di sini hanya data
// siswa yang sudah ditautkan ke akun orang tua yang sedang login.
"use strict";

function registerParentApi(app, deps) {
  const { db, auth, sendApiError, sendApiSuccess, rateLimitMiddleware } = deps;
  const links = require("./parent-links");
  const limit = rateLimitMiddleware(60);

  function requireParent(req, res, next) {
    if (req.role !== "ortu") {
      return sendApiError(res, 403, "Endpoint ini hanya untuk akun orang tua.", "PARENT_REQUIRED");
    }
    next();
  }

  app.get(
    "/api/ortu/children",
    auth.requireAuth,
    requireParent,
    auth.requirePermission("anak.lihat"),
    limit,
    (req, res) => {
      const items = links.listChildren(db, req.userId);
      return sendApiSuccess(res, { items, total: items.length });
    }
  );

  app.get(
    "/api/ortu/children/:id",
    auth.requireAuth,
    requireParent,
    auth.requirePermission("anak.lihat"),
    limit,
    (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1) {
        return sendApiError(res, 400, "ID siswa tidak valid.", "VALIDATION_ERROR");
      }
      const detail = links.getChild(db, req.userId, id);
      if (!detail) {
        return sendApiError(res, 404, "Siswa tidak ditemukan atau tidak ditautkan ke akun Anda.", "NOT_FOUND");
      }
      return sendApiSuccess(res, detail);
    }
  );
}

module.exports = { registerParentApi };
