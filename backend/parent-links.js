// Query bersama untuk relasi orang tua <-> siswa.
// Dipakai endpoint Admin (mengelola tautan) dan endpoint orang tua (membaca).
"use strict";

const MAX_CHILDREN = 20;
const GRADES = ["SD", "SMP", "SMK"];

function parseGrades(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map((g) => String(g).toUpperCase()).filter((g) => GRADES.includes(g)))];
  } catch (_) {
    return [];
  }
}

const SUMMARY_COLUMNS = `
  u.id, u.username, u.full_name, u.allowed_grades, u.status,
  COALESCE(p.total, 0) AS points,
  (SELECT COUNT(*) FROM progress pr WHERE pr.user_id = u.id AND pr.completed = 1) AS completed_tasks,
  (SELECT COUNT(*) FROM progress pr WHERE pr.user_id = u.id) AS total_progress,
  (SELECT MAX(pr.completed_at) FROM progress pr WHERE pr.user_id = u.id AND pr.completed = 1) AS last_completed_at
`;

function childDto(row) {
  return {
    id: Number(row.id),
    username: row.username,
    name: row.full_name || row.username,
    grades: parseGrades(row.allowed_grades),
    status: row.status,
    points: Number(row.points || 0),
    completedTasks: Number(row.completed_tasks || 0),
    totalProgress: Number(row.total_progress || 0),
    lastCompletedAt: row.last_completed_at || null
  };
}

function listChildren(db, parentId) {
  return db.prepare(`
    SELECT ${SUMMARY_COLUMNS}
    FROM parent_students ps
    JOIN users u ON u.id = ps.student_user_id
    LEFT JOIN points p ON p.user_id = u.id
    WHERE ps.parent_user_id = ? AND u.status <> 'deleted'
    ORDER BY (u.full_name IS NULL), u.full_name COLLATE NOCASE, u.username
  `).all(parentId).map(childDto);
}

function getChild(db, parentId, studentId) {
  const row = db.prepare(`
    SELECT ${SUMMARY_COLUMNS}
    FROM parent_students ps
    JOIN users u ON u.id = ps.student_user_id
    LEFT JOIN points p ON p.user_id = u.id
    WHERE ps.parent_user_id = ? AND ps.student_user_id = ? AND u.status <> 'deleted'
  `).get(parentId, studentId);
  if (!row) return null;

  const progress = db.prepare(`
    SELECT pr.task_id, pr.completed, pr.completed_at, t.title, t.points
    FROM progress pr
    LEFT JOIN tasks t ON t.task_id = pr.task_id
    WHERE pr.user_id = ?
    ORDER BY pr.id DESC
    LIMIT 50
  `).all(studentId);

  const submissions = db.prepare(`
    SELECT s.task_id, s.status, s.score, s.feedback, s.submitted_at, s.graded_at, t.title
    FROM admin_task_submissions s
    LEFT JOIN admin_tasks t ON t.id = s.task_id
    WHERE s.user_id = ?
    ORDER BY s.id DESC
    LIMIT 20
  `).all(studentId);

  return { child: childDto(row), progress, submissions };
}

function childIds(db, parentId) {
  return db.prepare("SELECT student_user_id FROM parent_students WHERE parent_user_id = ?")
    .all(parentId)
    .map((row) => Number(row.student_user_id));
}

function replaceChildren(db, parentId, studentIds, createdBy) {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM parent_students WHERE parent_user_id = ?").run(parentId);
    const insert = db.prepare(`
      INSERT INTO parent_students (parent_user_id, student_user_id, created_by)
      VALUES (?, ?, ?)
    `);
    for (const studentId of studentIds) insert.run(parentId, studentId, createdBy || null);
  });
  tx();
}

module.exports = {
  MAX_CHILDREN,
  parseGrades,
  childDto,
  listChildren,
  getChild,
  childIds,
  replaceChildren
};
