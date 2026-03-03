/**
 * In-memory data store for the Academic Twins feature.
 *
 * Loads Student, SGPA and Score collections into indexed Maps on startup so
 * that the twins endpoint can compute results with ZERO database round-trips.
 *
 * Memory footprint:  ~15-25 MB for a typical university dataset.
 * Refresh interval:  every 6 hours (configurable via TWINS_REFRESH_HOURS env).
 *
 * Usage:
 *   const dataStore = require('./cache/twinsDataStore');
 *   await dataStore.init();          // call once after DB connects
 *   const student = dataStore.getStudent('2024UCA1953');
 */

const Student = require('../models/Student');
const SGPA = require('../models/SGPA');
const Score = require('../models/Score');

const REFRESH_MS =
  (parseInt(process.env.TWINS_REFRESH_HOURS, 10) || 6) * 60 * 60 * 1000;

/* ── internal state ── */

/** @type {Map<string, object>}  rollNo → student doc */
let studentsMap = new Map();

/** @type {Map<string, object[]>}  branch_code → [ student, … ] */
let studentsByBranch = new Map();

/** @type {Map<string, object>}  rollNo → { [semester]: sgpa } */
let sgpaMap = new Map();

/** @type {Map<string, object[]>}  rollNo → [ scoreDoc, … ] */
let scoresRawMap = new Map();

/**
 * rollNo → { [subject_code]: { marks, grade } }
 * @type {Map<string, object>}
 */
let scoresIndexMap = new Map();

let _ready = false;
let _loading = false;
let _refreshTimer = null;
let _lastLoaded = null;

/* ── loader ── */

async function load() {
  if (_loading) return;
  _loading = true;

  try {
    const t0 = Date.now();

    const [students, sgpaRecords, scoreRecords] = await Promise.all([
      Student.find(
        {},
        'rollNo name branch_code year_of_study cgpa',
      ).lean(),
      SGPA.find({}, 'roll_no semester sgpa').lean(),
      Score.find(
        {},
        'roll_no subject_code grade marks semester',
      ).lean(),
    ]);

    /* ── build maps ── */

    const newStudents = new Map();
    const newByBranch = new Map();
    for (const s of students) {
      newStudents.set(s.rollNo, s);
      if (!newByBranch.has(s.branch_code)) newByBranch.set(s.branch_code, []);
      newByBranch.get(s.branch_code).push(s);
    }

    const newSgpa = new Map();
    for (const r of sgpaRecords) {
      if (!newSgpa.has(r.roll_no)) newSgpa.set(r.roll_no, {});
      newSgpa.get(r.roll_no)[r.semester] = r.sgpa;
    }

    const newScoresRaw = new Map();
    const newScoresIdx = new Map();
    for (const r of scoreRecords) {
      // raw array
      if (!newScoresRaw.has(r.roll_no)) newScoresRaw.set(r.roll_no, []);
      newScoresRaw.get(r.roll_no).push(r);
      // indexed
      if (!newScoresIdx.has(r.roll_no)) newScoresIdx.set(r.roll_no, {});
      newScoresIdx.get(r.roll_no)[r.subject_code] = {
        marks: r.marks,
        grade: r.grade,
      };
    }

    /* ── swap atomically ── */

    studentsMap = newStudents;
    studentsByBranch = newByBranch;
    sgpaMap = newSgpa;
    scoresRawMap = newScoresRaw;
    scoresIndexMap = newScoresIdx;
    _ready = true;
    _lastLoaded = new Date();

    console.log(
      `[TwinsDataStore] Loaded ${students.length} students, ` +
        `${sgpaRecords.length} SGPA records, ${scoreRecords.length} scores ` +
        `in ${Date.now() - t0}ms`,
    );
  } finally {
    _loading = false;
  }
}

/* ── public API ── */

/**
 * Initialise the store.  Call once after DB connection is established.
 * Starts background auto-refresh.
 */
async function init() {
  await load();
  // Schedule periodic refresh
  if (_refreshTimer) clearInterval(_refreshTimer);
  _refreshTimer = setInterval(() => {
    load().catch((err) =>
      console.error('[TwinsDataStore] Refresh failed:', err.message),
    );
  }, REFRESH_MS);
  // Don't prevent Node from exiting
  if (_refreshTimer.unref) _refreshTimer.unref();
}

/** Is the store ready to serve requests? */
function isReady() {
  return _ready;
}

/** Get a single student by rollNo. */
function getStudent(rollNo) {
  return studentsMap.get(rollNo) || null;
}

/** Get all students in a given CGPA range, optionally filtered by branch. */
function getCandidates(rollNo, cgpaLow, cgpaHigh, branchCode) {
  const results = [];
  const source = branchCode
    ? studentsByBranch.get(branchCode) || []
    : studentsMap.values();

  for (const s of source) {
    if (s.rollNo === rollNo) continue;
    if (s.cgpa >= cgpaLow && s.cgpa <= cgpaHigh) results.push(s);
  }
  return results;
}

/** Get all students NOT in the given branch within CGPA range. */
function getCandidatesOtherDept(rollNo, cgpaLow, cgpaHigh, excludeBranch) {
  const results = [];
  for (const [branch, students] of studentsByBranch) {
    if (branch === excludeBranch) continue;
    for (const s of students) {
      if (s.rollNo === rollNo) continue;
      if (s.cgpa >= cgpaLow && s.cgpa <= cgpaHigh) results.push(s);
    }
  }
  return results;
}

/** Get SGPA map { semester: sgpa } for a roll number. */
function getSgpa(rollNo) {
  return sgpaMap.get(rollNo) || {};
}

/** Get raw score records array for a roll number. */
function getScoresRaw(rollNo) {
  return scoresRawMap.get(rollNo) || [];
}

/** Get indexed scores { subject_code: { marks, grade } } for a roll number. */
function getScoresIndex(rollNo) {
  return scoresIndexMap.get(rollNo) || {};
}

/** When the store was last loaded. */
function lastLoaded() {
  return _lastLoaded;
}

/** Force an immediate reload (e.g. after a data import). */
async function refresh() {
  await load();
}

module.exports = {
  init,
  isReady,
  getStudent,
  getCandidates,
  getCandidatesOtherDept,
  getSgpa,
  getScoresRaw,
  getScoresIndex,
  lastLoaded,
  refresh,
};
