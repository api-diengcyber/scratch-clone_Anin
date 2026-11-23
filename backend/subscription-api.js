"use strict";

// ------------------------------------------------------------
// API LANGGANAN & PEMBAYARAN MANUAL
//
// Endpoint siswa (butuh login role student):
//   GET  /api/subscription                  status + invoice terakhir
//   GET  /api/subscription/packages         daftar paket aktif
//   POST /api/subscription/checkout         buat invoice (idempoten per paket)
//   GET  /api/subscription/payments/:id     status satu invoice
//   POST /api/subscription/payments/:id/cancel
//
// Endpoint admin:
//   GET/PUT/DELETE /api/admin/subscription/packages
//   GET  /api/admin/subscription/payments
//   GET  /api/admin/subscription/payments/:id
//   POST /api/admin/subscription/payments/:id/confirm
//   POST /api/admin/subscription/payments/:id/reject
//
// Konfirmasi admin (atau hook Finance) langsung mengaktifkan/memperpanjang
// langganan. Gateway nanti cukup memanggil alur konfirmasi yang sama.
// ------------------------------------------------------------

const service = require("./subscription-service");

function registerSubscriptionApi(app, deps) {
  const { db, auth, sendApiError, sendApiSuccess, rateLimitMiddleware } = deps;

  function dataResponse(res, fn) {
    try {
      return fn();
    } catch (error) {
      if (error && error.code === "SUBSCRIPTION_INVALID") {
        return sendApiError(res, 400, error.message, "VALIDATION_ERROR",
          error.field ? { field: error.field } : undefined);
      }
      if (error && error.code === "SUBSCRIPTION_CONFLICT") {
        return sendApiError(res, 409, error.message, "CONFLICT");
      }
      if (error && error.code === "SUBSCRIPTION_NOT_FOUND") {
        return sendApiError(res, 404, error.message, "NOT_FOUND");
      }
      throw error;
    }
  }

  function requireStudent(req, res, next) {
    if (req.role !== "student") {
      return sendApiError(res, 403, "Akses murid diperlukan.", "STUDENT_REQUIRED");
    }
    next();
  }

  function actor(req) {
    return { actorId: req.userId, actorUsername: req.user, ip: req.ip || null };
  }

  const adminGuard = [auth.requireAuth, auth.requireAdmin];
  const studentGuard = [auth.requireAuth, requireStudent];
  const checkoutLimit = typeof rateLimitMiddleware === "function"
    ? rateLimitMiddleware(20)
    : (req, res, next) => next();

  // ----------------------------------------------------------
  // Siswa
  // ----------------------------------------------------------

  app.get("/api/subscription", ...studentGuard, (req, res) => dataResponse(res, () => {
    return sendApiSuccess(res, service.getStudentOverview(db, req.userId));
  }));

  app.get("/api/subscription/packages", ...studentGuard, (req, res) => dataResponse(res, () => {
    const result = service.listPackages(db, {
      activeOnly: true,
      grade: req.query.grade
    });
    return sendApiSuccess(res, result);
  }));

  app.post("/api/subscription/checkout", ...studentGuard, checkoutLimit, (req, res) => dataResponse(res, () => {
    const result = service.createCheckout(db, req.userId, req.body || {}, {
      env: process.env,
      ip: req.ip || null
    });
    return sendApiSuccess(res, {
      item: result.item,
      instructions: result.instructions,
      reused: result.reused
    }, result.reused ? "Invoice yang masih berlaku dipakai kembali." : "Invoice langganan dibuat.", result.reused ? 200 : 201);
  }));

  app.get("/api/subscription/payments/:id", ...studentGuard, (req, res) => dataResponse(res, () => {
    const item = service.getStudentPayment(db, req.params.id, req.userId);
    if (!item) return sendApiError(res, 404, "Pembayaran tidak ditemukan.", "NOT_FOUND");
    return sendApiSuccess(res, { item });
  }));

  app.post("/api/subscription/payments/:id/cancel", ...studentGuard, (req, res) => dataResponse(res, () => {
    const body = req.body || {};
    const result = service.cancelPayment(db, req.params.id, req.userId, {
      actorUsername: req.user,
      ip: req.ip || null,
      reason: body.reason
    });
    if (!result.found) return sendApiError(res, 404, "Pembayaran tidak ditemukan.", "NOT_FOUND");
    return sendApiSuccess(res, { item: result.item }, "Pembayaran dibatalkan.");
  }));

  // ----------------------------------------------------------
  // Admin: paket harga
  // ----------------------------------------------------------

  app.get("/api/admin/subscription/packages", ...adminGuard, (req, res) => dataResponse(res, () => {
    const result = service.listPackages(db, {
      activeOnly: false,
      grade: req.query.grade
    });
    return sendApiSuccess(res, result);
  }));

  app.put("/api/admin/subscription/packages", ...adminGuard, (req, res) => dataResponse(res, () => {
    const result = service.upsertPackage(db, req.body || {}, actor(req));
    return sendApiSuccess(res, { item: result.item },
      result.created ? "Paket langganan dibuat." : "Paket langganan diperbarui.",
      result.created ? 201 : 200);
  }));

  app.delete("/api/admin/subscription/packages/:id", ...adminGuard, (req, res) => dataResponse(res, () => {
    const result = service.deletePackage(db, req.params.id, actor(req));
    if (!result) return sendApiError(res, 404, "Paket langganan tidak ditemukan.", "NOT_FOUND");
    return sendApiSuccess(res, { id: result.id }, "Paket langganan dihapus.");
  }));

  // ----------------------------------------------------------
  // Admin: invoice & konfirmasi pembayaran manual
  // ----------------------------------------------------------

  app.get("/api/admin/subscription/payments", ...adminGuard, (req, res) => dataResponse(res, () => {
    return sendApiSuccess(res, service.listPayments(db, req.query));
  }));

  app.get("/api/admin/subscription/payments/:id", ...adminGuard, (req, res) => dataResponse(res, () => {
    const item = service.getAdminPayment(db, req.params.id);
    if (!item) return sendApiError(res, 404, "Pembayaran tidak ditemukan.", "NOT_FOUND");
    return sendApiSuccess(res, { item });
  }));

  app.post("/api/admin/subscription/payments/:id/confirm", ...adminGuard, (req, res) => dataResponse(res, () => {
    const body = req.body || {};
    const result = service.confirmPayment(db, req.params.id, {
      ...actor(req),
      paidOn: body.paidAt,
      note: body.note,
      admin: true
    });
    if (!result.found) return sendApiError(res, 404, "Pembayaran tidak ditemukan.", "NOT_FOUND");
    return sendApiSuccess(res, {
      item: result.item,
      subscription: result.subscription,
      activation: result.activation || null,
      alreadyPaid: !!result.alreadyPaid
    }, result.alreadyPaid ? "Pembayaran ini sudah lunas." : "Pembayaran dikonfirmasi dan langganan diperbarui.");
  }));

  app.post("/api/admin/subscription/payments/:id/reject", ...adminGuard, (req, res) => dataResponse(res, () => {
    const body = req.body || {};
    const result = service.rejectPayment(db, req.params.id, {
      ...actor(req),
      reason: body.reason
    });
    if (!result.found) return sendApiError(res, 404, "Pembayaran tidak ditemukan.", "NOT_FOUND");
    return sendApiSuccess(res, { item: result.item }, "Pembayaran ditolak.");
  }));
}

module.exports = { registerSubscriptionApi };
