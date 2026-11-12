"use strict";

// ============================================================
// STREAK & KEHADIRAN MENTORING — PERHITUNGAN SERVER
//
// Semua tanggal "hari ini" memakai WIB (Asia/Jakarta), bukan jam perangkat
// atau zona waktu server. Ini dipakai halaman Jadwal Saya (streak), rekap
// absen siswa, dan rekap instruktur/admin.
//
// Sesi yang dihitung sebagai "sudah berlangsung" adalah jadwal yang jam
// selesainya sudah lewat. Sesi yang belum selesai tidak masuk pembagi agar
// murid tidak dianggap tidak hadir sebelum kelasnya selesai.
// ============================================================

const { parseGrades, visibleForGrades } = require("./jadwal-api");

const GRADES = ["SD", "SMP", "SMK"];
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const ATTENDANCE_OPEN_MIN = 15;
const DEFAULT_DURATION_MIN = 120;
const REPORT_MONTHS = 12;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function jakartaToday(now = Date.now()) {
  return new Date(now + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

function currentMonth(now = Date.now()) {
  return jakartaToday(now).slice(0, 7);
}

function addMonth(month, delta) {
  const year = Number(month.slice(0, 4));
  const mon = Number(month.slice(5, 7));
  return new Date(Date.UTC(year, mon - 1 + delta, 1)).toISOString().slice(0, 7);
}

function dayShift(day, delta) {
  const parts = day.split("-");
  const date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) + delta));
  return date.toISOString().slice(0, 10);
}

function monthKey(dateOnly) {
  return String(dateOnly || "").slice(0, 7);
}

// Epoch milidetik untuk tanggal + jam WIB. Tanggal/jam dari database
// diperlakukan sebagai waktu dinding WIB, bukan UTC.
function wibEpoch(tanggal, jam) {
  const date = String(tanggal || "").split("-");
  const time = String(jam || "00:00").split(":");
  if (date.length !== 3) return NaN;
  return Date.UTC(
    Number(date[0]),
    Number(date[1]) - 1,
    Number(date[2]),
    Number(time[0]) || 0,
    Number(time[1]) || 0
  ) - WIB_OFFSET_MS;
}

function scheduleStartMs(row) {
  return wibEpoch(row.tanggal, row.mulai);
}

function scheduleEndMs(row) {
  const start = scheduleStartMs(row);
  if (!Number.isFinite(start)) return NaN;
  if (!row.selesai) return start + DEFAULT_DURATION_MIN * 60000;
  const end = wibEpoch(row.tanggal, row.selesai);
  return Number.isFinite(end) ? end : start + DEFAULT_DURATION_MIN * 60000;
}

function toIsoUtc(value) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  if (!text) return null;
  let ms;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(text)) {
    ms = Date.parse(text.replace(" ", "T") + "Z");
  } else {
    ms = Date.parse(text);
  }
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function allowedGrades(user) {
  if (!user || !user.allowed_grades) return [];
  try {
    const value = JSON.parse(user.allowed_grades);
    if (!Array.isArray(value)) return [];
    return value.map((grade) => String(grade).toUpperCase()).filter((grade) => GRADES.includes(grade));
  } catch (_) {
    return [];
  }
}

function scheduleVisible(row, grades) {
  return visibleForGrades(parseGrades(row.grades), grades);
}

function studentName(user) {
  const full = String((user && user.full_name) || "").trim();
  return full || String((user && user.username) || "Siswa");
}

// ------------------------------------------------------------
// Streak harian
// ------------------------------------------------------------

function readStreak(db, userId, now = Date.now()) {
  const rows = db.prepare("SELECT day FROM study_streak_days WHERE user_id = ? ORDER BY day ASC").all(userId);
  const days = rows.map((row) => row.day).filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day));
  const set = new Set(days);
  const today = jakartaToday(now);

  let current = 0;
  let cursor = set.has(today) ? today : dayShift(today, -1);
  while (set.has(cursor)) {
    current += 1;
    cursor = dayShift(cursor, -1);
  }

  let longest = 0;
  let run = 0;
  let previous = null;
  for (const day of days) {
    run = previous && dayShift(previous, 1) === day ? run + 1 : 1;
    if (run > longest) longest = run;
    previous = day;
  }

  return {
    current,
    longest,
    today: set.has(today),
    days: days.slice(-60)
  };
}

function claimStreak(db, userId, now = Date.now()) {
  const day = jakartaToday(now);
  db.prepare("INSERT OR IGNORE INTO study_streak_days (user_id, day) VALUES (?, ?)").run(userId, day);
  return readStreak(db, userId, now);
}

// ------------------------------------------------------------
// Kehadiran
// ------------------------------------------------------------

function chunk(list, size = 500) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// Jadwal yang sudah selesai dalam rentang bulan (inklusif).
function completedSchedules(db, fromMonth, toMonth, now = Date.now()) {
  const rows = db.prepare(`SELECT * FROM mentoring_schedules
    WHERE substr(tanggal, 1, 7) >= ? AND substr(tanggal, 1, 7) <= ?
    ORDER BY tanggal ASC, mulai ASC, id ASC`).all(fromMonth, toMonth);
  return rows.filter((row) => {
    const end = scheduleEndMs(row);
    return Number.isFinite(end) && end <= now;
  });
}

function attendanceMap(db, studentUserId, scheduleIds) {
  const map = new Map();
  for (const ids of chunk(scheduleIds)) {
    if (!ids.length) continue;
    const placeholders = ids.map(() => "?").join(",");
    const rows = db.prepare(`SELECT jadwal_id, checked_in_at FROM mentoring_attendance
      WHERE student_user_id = ? AND jadwal_id IN (${placeholders})`).all(studentUserId, ...ids);
    for (const row of rows) map.set(Number(row.jadwal_id), toIsoUtc(row.checked_in_at));
  }
  return map;
}

// Peta student_user_id -> Map(jadwal_id -> checkedInAt) untuk banyak murid.
function attendanceByStudent(db, scheduleIds) {
  const out = new Map();
  for (const ids of chunk(scheduleIds)) {
    if (!ids.length) continue;
    const placeholders = ids.map(() => "?").join(",");
    const rows = db.prepare(`SELECT student_user_id, jadwal_id, checked_in_at FROM mentoring_attendance
      WHERE jadwal_id IN (${placeholders})`).all(...ids);
    for (const row of rows) {
      const studentId = Number(row.student_user_id);
      if (!out.has(studentId)) out.set(studentId, new Map());
      out.get(studentId).set(Number(row.jadwal_id), toIsoUtc(row.checked_in_at));
    }
  }
  return out;
}

function summarize(rows, checkedIn) {
  let hadir = 0;
  for (const row of rows) {
    if (checkedIn && checkedIn.has(Number(row.id))) hadir += 1;
  }
  const total = rows.length;
  return {
    hadir,
    total,
    pct: total ? Math.round((hadir * 100) / total) : null
  };
}

function sessionDto(row, checkedInAt) {
  return {
    jadwalId: Number(row.id),
    judul: row.judul,
    tanggal: row.tanggal,
    mulai: row.mulai,
    selesai: row.selesai,
    hadir: checkedInAt !== null && checkedInAt !== undefined,
    checkedInAt: checkedInAt || null
  };
}

function reportMonths(month) {
  const out = [];
  for (let i = REPORT_MONTHS - 1; i >= 0; i -= 1) out.push(addMonth(month, -i));
  return out;
}

// Rekap satu murid untuk satu bulan + keseluruhan 12 bulan.
function buildStudentReport(db, user, month, now = Date.now()) {
  const grades = allowedGrades(user);
  const from = addMonth(month, -(REPORT_MONTHS - 1));
  const completed = completedSchedules(db, from, month, now).filter((row) => scheduleVisible(row, grades));
  const checkedIn = attendanceMap(db, Number(user.id), completed.map((row) => Number(row.id)));
  const monthRows = completed.filter((row) => monthKey(row.tanggal) === month);

  const perBulan = reportMonths(month).map((ym) => {
    const rows = completed.filter((row) => monthKey(row.tanggal) === ym);
    return { bulan: ym, ...summarize(rows, checkedIn) };
  });

  return {
    bulan: month,
    siswa: {
      id: Number(user.id),
      username: user.username,
      nama: studentName(user)
    },
    ringkasan: summarize(monthRows, checkedIn),
    keseluruhan: summarize(completed, checkedIn),
    perBulan,
    sesi: monthRows.map((row) => sessionDto(row, checkedIn.get(Number(row.id))))
  };
}

// Ringkasan keseluruhan untuk banyak murid sekaligus (dipakai daftar siswa
// admin agar tidak melakukan query jadwal berulang per baris).
function summariesForUsers(db, users, now = Date.now()) {
  const out = new Map();
  if (!users.length) return out;

  const month = currentMonth(now);
  const from = addMonth(month, -(REPORT_MONTHS - 1));
  const completed = completedSchedules(db, from, month, now);
  const byStudent = attendanceByStudent(db, completed.map((row) => Number(row.id)));

  for (const user of users) {
    const grades = allowedGrades(user);
    const visible = completed.filter((row) => scheduleVisible(row, grades));
    out.set(Number(user.id), summarize(visible, byStudent.get(Number(user.id)) || new Map()));
  }
  return out;
}

function pctValue(summary) {
  return summary && summary.pct !== null && summary.pct !== undefined ? summary.pct : null;
}

function byName(a, b) {
  return String(a.nama || "").localeCompare(String(b.nama || ""), "id", { sensitivity: "base" });
}

// Rekap untuk portal instruktur: daftar murid (dipaging), ringkasan per sesi,
// dan agregat 12 bulan.
function buildStaffReport(db, options = {}) {
  const now = options.now || Date.now();
  const month = options.month || currentMonth(now);
  const q = String(options.q || "").trim().slice(0, 100);
  const qLower = q.toLowerCase();
  const urut = options.urut === "nama" ? "nama" : "rendah";
  const page = Math.max(1, Number.parseInt(options.page, 10) || 1);
  const limit = Math.max(1, Math.min(100, Number.parseInt(options.limit, 10) || 10));

  const students = db.prepare(`SELECT id, username, full_name, allowed_grades FROM users
    WHERE role = 'student' AND status = 'active' ORDER BY username ASC`).all();
  const from = addMonth(month, -(REPORT_MONTHS - 1));
  const completed = completedSchedules(db, from, month, now);
  const byStudent = attendanceByStudent(db, completed.map((row) => Number(row.id)));

  const rows = students.map((student) => {
    const grades = allowedGrades(student);
    const visibleAll = completed.filter((row) => scheduleVisible(row, grades));
    const visibleMonth = visibleAll.filter((row) => monthKey(row.tanggal) === month);
    const checkedIn = byStudent.get(Number(student.id)) || new Map();
    const name = studentName(student);
    return {
      id: Number(student.id),
      username: student.username,
      nama: name,
      fullName: String(student.full_name || "").trim() || null,
      grades,
      checkedIn,
      visibleAll,
      visibleMonth,
      ringkasan: summarize(visibleMonth, checkedIn),
      keseluruhan: summarize(visibleAll, checkedIn)
    };
  });

  const monthRows = completed.filter((row) => monthKey(row.tanggal) === month);

  const sesi = monthRows.map((row) => {
    const eligible = rows.filter((student) => scheduleVisible(row, student.grades));
    const hadir = [];
    const tidakHadir = [];
    for (const student of eligible) {
      if (student.checkedIn.has(Number(row.id))) hadir.push(student.nama);
      else tidakHadir.push(student.nama);
    }
    return {
      jadwalId: Number(row.id),
      judul: row.judul,
      tanggal: row.tanggal,
      mulai: row.mulai,
      selesai: row.selesai,
      hadir: hadir.length,
      total: eligible.length,
      pct: eligible.length ? Math.round((hadir.length * 100) / eligible.length) : null,
      siswaHadir: hadir,
      siswaTidakHadir: tidakHadir
    };
  });

  let totalHadir = 0;
  let totalSesi = 0;
  for (const row of rows) {
    totalHadir += row.ringkasan.hadir;
    totalSesi += row.ringkasan.total;
  }

  const months = reportMonths(month);
  const monthAgg = new Map(months.map((ym) => [ym, { bulan: ym, hadir: 0, total: 0 }]));
  for (const student of rows) {
    for (const row of student.visibleAll) {
      const agg = monthAgg.get(monthKey(row.tanggal));
      if (!agg) continue;
      agg.total += 1;
      if (student.checkedIn.has(Number(row.id))) agg.hadir += 1;
    }
  }
  const perBulan = months.map((ym) => {
    const agg = monthAgg.get(ym);
    return { ...agg, pct: agg.total ? Math.round((agg.hadir * 100) / agg.total) : null };
  });

  const filtered = rows.filter((row) => !qLower
    || row.nama.toLowerCase().includes(qLower)
    || String(row.username || "").toLowerCase().includes(qLower));

  filtered.sort((a, b) => {
    if (urut === "nama") return byName(a, b);
    const pa = pctValue(a.ringkasan);
    const pb = pctValue(b.ringkasan);
    const ka = pa === null ? 999 : pa;
    const kb = pb === null ? 999 : pb;
    return ka - kb || byName(a, b);
  });

  const total = filtered.length;
  const pages = Math.ceil(total / limit) || 1;
  const safePage = Math.min(page, pages);
  const start = (safePage - 1) * limit;
  const items = filtered.slice(start, start + limit).map((row) => ({
    id: row.id,
    username: row.username,
    nama: row.nama,
    fullName: row.fullName,
    hadir: row.ringkasan.hadir,
    total: row.ringkasan.total,
    pct: row.ringkasan.pct,
    keseluruhan: row.keseluruhan,
    sesi: row.visibleMonth.map((session) => sessionDto(session, row.checkedIn.get(Number(session.id))))
  }));

  return {
    bulan: month,
    q,
    urut,
    page: safePage,
    limit,
    total,
    pages,
    ringkasan: {
      hadir: totalHadir,
      total: totalSesi,
      pct: totalSesi ? Math.round((totalHadir * 100) / totalSesi) : null
    },
    perBulan,
    sesi,
    items
  };
}

module.exports = {
  GRADES,
  ATTENDANCE_OPEN_MIN,
  DEFAULT_DURATION_MIN,
  REPORT_MONTHS,
  jakartaToday,
  currentMonth,
  addMonth,
  dayShift,
  monthKey,
  wibEpoch,
  scheduleStartMs,
  scheduleEndMs,
  toIsoUtc,
  allowedGrades,
  scheduleVisible,
  studentName,
  readStreak,
  claimStreak,
  completedSchedules,
  attendanceMap,
  attendanceByStudent,
  summarize,
  sessionDto,
  buildStudentReport,
  summariesForUsers,
  buildStaffReport
};
