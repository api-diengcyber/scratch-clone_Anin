"use strict";

const learning = require("./learning-service");

function registerLearningApi(app, deps) {
  const { db, auth, sendApiError, sendApiSuccess } = deps;

  function requireStudent(req, res, next) {
    if (req.role !== "student") {
      return sendApiError(res, 403, "Endpoint ini khusus akun siswa.", "STUDENT_REQUIRED");
    }
    next();
  }

  app.get("/api/learning/analytics", auth.requireAuth, requireStudent, (req, res) => {
    try {
      const analytics = learning.buildLearningAnalytics(db, req.userId);
      if (!analytics) return sendApiError(res, 404, "Data siswa tidak ditemukan.", "STUDENT_NOT_FOUND");
      return sendApiSuccess(res, { analytics });
    } catch (error) {
      console.error("Gagal membuat learning analytics:", error);
      return sendApiError(res, 500, "Gagal mengambil analisis belajar.", "INTERNAL_ERROR");
    }
  });

  app.get("/api/achievements", auth.requireAuth, requireStudent, (req, res) => {
    try {
      const analytics = learning.buildLearningAnalytics(db, req.userId);
      if (!analytics) return sendApiError(res, 404, "Data siswa tidak ditemukan.", "STUDENT_NOT_FOUND");
      const achievements = analytics.achievements;
      return sendApiSuccess(res, {
        achievements,
        total: achievements.length,
        earned: achievements.filter((item) => item.earned).length
      });
    } catch (error) {
      console.error("Gagal mengambil achievement:", error);
      return sendApiError(res, 500, "Gagal mengambil achievement.", "INTERNAL_ERROR");
    }
  });

  app.get("/api/mentor-note", auth.requireAuth, requireStudent, (req, res) => {
    try {
      return sendApiSuccess(res, { item: learning.getMentorNote(db, req.userId) });
    } catch (error) {
      console.error("Gagal mengambil pesan mentor:", error);
      return sendApiError(res, 500, "Gagal mengambil pesan mentor.", "INTERNAL_ERROR");
    }
  });
}

module.exports = { registerLearningApi };
