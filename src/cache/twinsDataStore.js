/**
 * In-memory data store for the Academic Twins feature.
 *
 * Loads Student, SGPA and Score collections into indexed Maps on startup so
 * that the twins endpoint can compute results with ZERO database round-trips.
 *
 * Multi-college: maintains one independent dataset per connected college.
 *
 * Memory footprint:  ~15-25 MB per college.
 * Refresh interval:  every 6 hours (configurable via TWINS_REFRESH_HOURS env).
 */

const { getActiveColleges, getConnection } = require('../db');
const { getModels } = require('../models');

const REFRESH_MS =
  (parseInt(process.env.TWINS_REFRESH_HOURS, 10) || 6) * 60 * 60 * 1000;

/* ── per-college state ── */

/**
 * @type {Map<string, {
 *   studentsMap: Map<string, object>,
 *   studentsByBranch: Map<string, object[]>,
 *   sgpaMap: Map<string, object>,
 *   scoresRawMap: Map<string, object[]>,
 *   scoresIndexMap: Map<string, object>,
 *   ready: boolean,
 *   loading: boolean,
 *   lastLoaded: Date|null,
 * }>}
 */
const stores = new Map();

let _refreshTimer = null;

function getStore(college) {
  if (!stores.has(college)) {
    stores.set(college, {
      studentsMap: new Map(),
      studentsByBranch: new Map(),
      sgpaMap: new Map(),
      scoresRawMap: new Map(),
      scoresIndexMap: new Map(),
      ready: false,
      loading: false,
      lastLoaded: null,
    });
  }
  return stores.get(college);
}

/* ── loader ── */

async function loadCollege(college) {
  const store = getStore(college);
  if (store.loading) return;
  store.loading = true;

  try {
    const conn = getConnection(college);
    if (!conn) return;
    const { Student, SGPA, Score } = getModels(conn, college);
    const t0 = Date.now();

    const [students, sgpaRecords, scoreRecords] = await Promise.all([
      Student.find({}, 'rollNo name branch_code year_of_study cgpa').lean(),
      SGPA.find({}, 'roll_no semester sgpa').lean(),
      Score.find({}, 'roll_no subject_code grade marks semester').lean(),
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
      if (!newScoresRaw.has(r.roll_no)) newScoresRaw.set(r.roll_no, []);
      newScoresRaw.get(r.roll_no).push(r);
      if (!newScoresIdx.has(r.roll_no)) newScoresIdx.set(r.roll_no, {});
      newScoresIdx.get(r.roll_no)[r.subject_code] = {
        marks: r.marks,
        grade: r.grade,
      };
    }

    /* ── swap atomically ── */

    store.studentsMap = newStudents;
    store.studentsByBranch = newByBranch;
    store.sgpaMap = newSgpa;
    store.scoresRawMap = newScoresRaw;
    store.scoresIndexMap = newScoresIdx;
    store.ready = true;
    store.lastLoaded = new Date();

    console.log(
      `[TwinsDataStore:${college}] Loaded ${students.length} students, ` +
        `${sgpaRecords.length} SGPA records, ${scoreRecords.length} scores ` +
        `in ${Date.now() - t0}ms`,
    );
  } finally {
    store.loading = false;
  }
}

/* ── public API ── */

/**
 * Initialise the store for all connected colleges.
 * Call once after DB connections are established.
 */
async function init() {
  const colleges = getActiveColleges();
  await Promise.all(colleges.map((c) => loadCollege(c)));

  if (_refreshTimer) clearInterval(_refreshTimer);
  _refreshTimer = setInterval(() => {
    const cols = getActiveColleges();
    for (const c of cols) {
      loadCollege(c).catch((err) =>
        console.error(`[TwinsDataStore:${c}] Refresh failed:`, err.message),
      );
    }
  }, REFRESH_MS);
  if (_refreshTimer.unref) _refreshTimer.unref();
}

function isReady(college) {
  return getStore(college).ready;
}

function getStudent(college, rollNo) {
  return getStore(college).studentsMap.get(rollNo) || null;
}

function getCandidates(college, rollNo, cgpaLow, cgpaHigh, branchCode) {
  const store = getStore(college);
  const results = [];
  const source = branchCode
    ? store.studentsByBranch.get(branchCode) || []
    : store.studentsMap.values();

  for (const s of source) {
    if (s.rollNo === rollNo) continue;
    if (s.cgpa >= cgpaLow && s.cgpa <= cgpaHigh) results.push(s);
  }
  return results;
}

function getCandidatesOtherDept(college, rollNo, cgpaLow, cgpaHigh, excludeBranch) {
  const store = getStore(college);
  const results = [];
  for (const [branch, students] of store.studentsByBranch) {
    if (branch === excludeBranch) continue;
    for (const s of students) {
      if (s.rollNo === rollNo) continue;
      if (s.cgpa >= cgpaLow && s.cgpa <= cgpaHigh) results.push(s);
    }
  }
  return results;
}

function getSgpa(college, rollNo) {
  return getStore(college).sgpaMap.get(rollNo) || {};
}

function getScoresRaw(college, rollNo) {
  return getStore(college).scoresRawMap.get(rollNo) || [];
}

function getScoresIndex(college, rollNo) {
  return getStore(college).scoresIndexMap.get(rollNo) || {};
}

function lastLoaded(college) {
  return getStore(college).lastLoaded;
}

async function refresh(college) {
  if (college) {
    await loadCollege(college);
  } else {
    const colleges = getActiveColleges();
    await Promise.all(colleges.map((c) => loadCollege(c)));
  }
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
