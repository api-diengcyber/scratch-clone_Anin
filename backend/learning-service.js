"use strict";

const DEFAULT_GRADES = ["SD", "SMP", "SMK"];

function firstTryBonus() {
  const value = Number(process.env.FIRST_TRY_BONUS);
  return Number.isSafeInteger(value) && value >= 0 ? value : 5;
}

function parseAllowedGrades(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item).toUpperCase()).filter((item) => DEFAULT_GRADES.includes(item)))];
  }
  try {
    const parsed = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map((item) => String(item).toUpperCase()).filter((item) => DEFAULT_GRADES.includes(item)))];
  } catch (_) {
    return [];
  }
}

function recalculatePoints(db, userId, bonus = firstTryBonus()) {
  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN p.completed = 1 THEN t.points ELSE 0 END), 0) AS base_points,
      COALESCE(SUM(CASE WHEN p.completed = 1 AND p.bonus_awarded = 1 THEN ? ELSE 0 END), 0) AS bonus_points
    FROM progress p
    JOIN tasks t ON t.task_id = p.task_id
    WHERE p.user_id = ?
  `).get(bonus, userId);

  const total = Math.max(0, Number(totals.base_points || 0) + Number(totals.bonus_points || 0));
  db.prepare(`
    INSERT INTO points (user_id, total, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      total = excluded.total,
      updated_at = CURRENT_TIMESTAMP
  `).run(userId, total);
  return total;
}

/**
 * Simpan perubahan progress dan hitung ulang points dalam satu transaksi.
 * points.total selalu menjadi hasil progress aktif + bonus yang pernah diperoleh,
 * sehingga selisih data lama tidak terus terbawa ke transaksi berikutnya.
 */
function applyProgress(db, userId, taskId, completed) {
  const task = db.prepare("SELECT points FROM tasks WHERE task_id = ?").get(taskId);
  if (!task) return { error: "NOT_FOUND" };

  const taskPoints = Number.isSafeInteger(task.points) && task.points >= 0 ? task.points : 10;
  const bonusValue = firstTryBonus();

  return db.transaction(() => {
    const previousPointsRow = db.prepare("SELECT total FROM points WHERE user_id = ?").get(userId);
    const previousPoints = previousPointsRow ? Number(previousPointsRow.total) || 0 : 0;
    const previous = db.prepare(`
      SELECT completed, completed_at, bonus_awarded
      FROM progress
      WHERE user_id = ? AND task_id = ?
    `).get(userId, taskId);

    const wasCompleted = Boolean(previous && previous.completed === 1);
    const hadBonus = Boolean(previous && previous.bonus_awarded === 1);
    let earnedBase = 0;
    let earnedBonus = 0;
    let giveBonus = false;

    if (!wasCompleted && completed) {
      const attempt = db.prepare(`
        SELECT fails FROM attempts WHERE user_id = ? AND task_id = ?
      `).get(userId, taskId);
      giveBonus = !hadBonus && (!attempt || Number(attempt.fails) === 0);
      earnedBase = taskPoints;
      earnedBonus = giveBonus ? bonusValue : 0;
    } else if (wasCompleted && !completed) {
      earnedBase = -taskPoints;
      earnedBonus = hadBonus ? -bonusValue : 0;
    }

    const completedAt = completed
      ? (wasCompleted && previous && previous.completed_at ? previous.completed_at : new Date().toISOString())
      : null;

    db.prepare(`
      INSERT INTO progress (user_id, task_id, completed, completed_at, bonus_awarded)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, task_id) DO UPDATE SET
        completed = excluded.completed,
        completed_at = excluded.completed_at,
        bonus_awarded = excluded.bonus_awarded
    `).run(
      userId,
      taskId,
      completed ? 1 : 0,
      completedAt,
      hadBonus || giveBonus ? 1 : 0
    );

    const total = recalculatePoints(db, userId, bonusValue);
    return {
      completed,
      points: total,
      earned: { base: earnedBase, bonus: earnedBonus },
      reconciledDifference: total - previousPoints
    };
  })();
}

function isoFromSqlite(value) {
  if (!value) return null;
  const text = String(value);
  if (text.includes("T")) return text;
  return text.replace(" ", "T") + "Z";
}

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function buildLearningAnalytics(db, userId) {
  const student = db.prepare(`
    SELECT id, username, full_name, allowed_grades, role, status
    FROM users
    WHERE id = ? AND role = 'student' AND status <> 'deleted'
  `).get(userId);
  if (!student) return null;

  const allowedGrades = parseAllowedGrades(student.allowed_grades);
  const grades = allowedGrades.length ? allowedGrades : [...DEFAULT_GRADES];
  const placeholders = grades.map(() => "?").join(", ");

  const rows = db.prepare(`
    SELECT
      t.grade, t.module_id, t.task_id, t.task_index, t.title, t.points,
      t.is_project, t.requires_submission,
      COALESCE(p.completed, 0) AS completed,
      p.completed_at,
      COALESCE(p.bonus_awarded, 0) AS bonus_awarded,
      COALESCE(a.fails, 0) AS failed_attempts,
      COALESCE(a.time_spent, 0) AS time_spent_seconds,
      a.updated_at AS attempt_updated_at
    FROM tasks t
    LEFT JOIN progress p
      ON p.user_id = ? AND p.task_id = t.task_id
    LEFT JOIN attempts a
      ON a.user_id = ? AND a.task_id = t.task_id
    WHERE t.grade IN (${placeholders})
    ORDER BY t.grade ASC, t.module_id ASC, t.task_index ASC, t.id ASC
  `).all(userId, userId, ...grades).map((row) => ({
    grade: row.grade,
    moduleId: row.module_id,
    taskId: row.task_id,
    taskIndex: Number(row.task_index),
    title: row.title,
    points: Number(row.points || 0),
    isProject: Boolean(row.is_project),
    requiresSubmission: Boolean(row.requires_submission),
    completed: Number(row.completed) === 1,
    completedAt: isoFromSqlite(row.completed_at),
    bonusAwarded: Number(row.bonus_awarded) === 1,
    failedAttempts: Number(row.failed_attempts || 0),
    timeSpentSeconds: Number(row.time_spent_seconds || 0),
    attemptUpdatedAt: isoFromSqlite(row.attempt_updated_at)
  }));

  const moduleMap = new Map();
  for (const task of rows) {
    const key = `${task.grade}:${task.moduleId}`;
    if (!moduleMap.has(key)) {
      moduleMap.set(key, {
        grade: task.grade,
        moduleId: task.moduleId,
        tasks: [],
        totalTasks: 0,
        completedTasks: 0,
        capstoneTasks: [],
        capstoneCompleted: 0,
        completionRate: 0,
        achievement: null
      });
    }
    const module = moduleMap.get(key);
    module.tasks.push(task);
    module.totalTasks += 1;
    if (task.completed) module.completedTasks += 1;
    if (task.isProject || task.requiresSubmission) module.capstoneTasks.push(task);
  }

  const modules = [...moduleMap.values()].map((module) => {
    module.capstoneCompleted = module.capstoneTasks.filter((task) => task.completed).length;
    module.completionRate = module.totalTasks
      ? round1((module.completedTasks / module.totalTasks) * 100)
      : 0;
    const earned = module.totalTasks > 0
      && module.completedTasks === module.totalTasks
      && module.capstoneTasks.length > 0
      && module.capstoneCompleted === module.capstoneTasks.length;
    const completionDates = module.tasks
      .filter((task) => task.completed && task.completedAt)
      .map((task) => new Date(task.completedAt).getTime())
      .filter(Number.isFinite);
    const earnedAt = earned && completionDates.length
      ? new Date(Math.max(...completionDates)).toISOString()
      : null;

    module.achievement = {
      key: `course:${module.grade}:${module.moduleId}`,
      title: `Lencana ${module.moduleId.toUpperCase()}`,
      earned,
      earnedAt,
      completedTasks: module.completedTasks,
      totalTasks: module.totalTasks,
      capstoneCompleted: module.capstoneCompleted,
      capstoneTotal: module.capstoneTasks.length
    };
    module.nextIncompleteTask = module.tasks.find((task) => !task.completed)
      ? {
          taskId: module.tasks.find((task) => !task.completed).taskId,
          title: module.tasks.find((task) => !task.completed).title
        }
      : null;
    module.tasks = module.tasks.map((task) => ({
      ...task,
      estimatedAttempts: task.failedAttempts + (task.completed ? 1 : 0)
    }));
    return module;
  });

  const gradeMap = new Map();
  for (const module of modules) {
    if (!gradeMap.has(module.grade)) {
      gradeMap.set(module.grade, {
        grade: module.grade,
        totalTasks: 0,
        completedTasks: 0,
        totalModules: 0,
        completedModules: 0,
        completionRate: 0
      });
    }
    const grade = gradeMap.get(module.grade);
    grade.totalTasks += module.totalTasks;
    grade.completedTasks += module.completedTasks;
    grade.totalModules += 1;
    if (module.achievement.earned) grade.completedModules += 1;
  }
  const gradeSummaries = [...gradeMap.values()].map((grade) => ({
    ...grade,
    completionRate: grade.totalTasks
      ? round1((grade.completedTasks / grade.totalTasks) * 100)
      : 0
  }));

  const totalTasks = rows.length;
  const completedTasks = rows.filter((task) => task.completed).length;
  const totalFailedAttempts = rows.reduce((sum, task) => sum + task.failedAttempts, 0);
  const totalTimeSpentSeconds = rows.reduce((sum, task) => sum + task.timeSpentSeconds, 0);
  const achievements = modules.map((module) => ({
    ...module.achievement,
    grade: module.grade,
    moduleId: module.moduleId
  }));
  const pointsRow = db.prepare("SELECT total FROM points WHERE user_id = ?").get(userId);
  const spentRow = db.prepare("SELECT COALESCE(SUM(harga), 0) AS spent FROM user_items WHERE user_id = ?").get(userId);
  const earnedPoints = Number(pointsRow ? pointsRow.total : 0);
  const spentPoints = Number(spentRow ? spentRow.spent : 0);

  const activeModules = modules
    .filter((module) => module.completedTasks > 0 && module.completedTasks < module.totalTasks)
    .sort((a, b) => b.completionRate - a.completionRate);
  const nextFocus = activeModules[0] || modules.find((module) => module.completedTasks === 0 && module.totalTasks > 0) || null;
  const recommendation = nextFocus
    ? {
        grade: nextFocus.grade,
        moduleId: nextFocus.moduleId,
        message: nextFocus.completedTasks > 0
          ? `Lanjutkan modul ${nextFocus.moduleId.toUpperCase()}. ${nextFocus.completedTasks} dari ${nextFocus.totalTasks} task sudah selesai.`
          : `Mulai modul ${nextFocus.moduleId.toUpperCase()} untuk membangun kebiasaan belajar.`
      }
    : (totalTasks > 0 ? { message: "Semua task pada jenjang yang diizinkan sudah selesai. Pertahankan konsistensi belajarmu!" } : null);

  const completedTaskHistory = rows
    .filter((task) => task.completed)
    .sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime())
    .slice(0, 100);

  return {
    generatedAt: new Date().toISOString(),
    student: {
      id: Number(student.id),
      username: student.username,
      name: student.full_name || student.username,
      grades
    },
    summary: {
      totalTasks,
      completedTasks,
      completionRate: totalTasks ? round1((completedTasks / totalTasks) * 100) : 0,
      totalModules: modules.length,
      completedModules: modules.filter((module) => module.achievement.earned).length,
      achievementsEarned: achievements.filter((item) => item.earned).length,
      failedAttempts: totalFailedAttempts,
      timeSpentSeconds: totalTimeSpentSeconds,
      points: {
        earned: earnedPoints,
        spent: spentPoints,
        balance: Math.max(0, earnedPoints - spentPoints)
      }
    },
    grades: gradeSummaries,
    modules,
    taskDetails: rows.map((task) => ({
      ...task,
      estimatedAttempts: task.failedAttempts + (task.completed ? 1 : 0)
    })),
    completedTaskHistory,
    achievements,
    recommendations: recommendation ? [recommendation] : [],
    tracking: {
      failedAttemptsSource: "attempts.fails",
      timeSpentSource: "attempts.time_spent",
      timeSpentNote: "Waktu hanya mencakup durasi yang dikirim saat pencatatan attempt; bukan total waktu aktif belajar."
    }
  };
}

function getMentorNote(db, studentId) {
  const row = db.prepare(`
    SELECT n.note, n.created_at, n.updated_at,
           u.id AS author_id,
           COALESCE(u.full_name, u.username) AS author_name
    FROM student_mentor_notes n
    LEFT JOIN users u ON u.id = n.author_user_id
    WHERE n.student_user_id = ?
  `).get(studentId);
  if (!row) return null;
  return {
    text: row.note,
    authorId: row.author_id === null ? null : Number(row.author_id),
    authorName: row.author_name || null,
    createdAt: isoFromSqlite(row.created_at),
    updatedAt: isoFromSqlite(row.updated_at)
  };
}

module.exports = {
  firstTryBonus,
  parseAllowedGrades,
  recalculatePoints,
  applyProgress,
  buildLearningAnalytics,
  getMentorNote
};
