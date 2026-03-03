const dataStore = require('../cache/twinsDataStore');

/* ── constants ── */

const GRADE_TO_NUMERIC = {
  O: 10, 'A+': 9, A: 8, 'B+': 7, B: 6, C: 5, D: 4, F: 0, AB: 0,
};
const GRADE_LIST = ['O', 'A+', 'A', 'B+', 'B', 'C', 'D', 'F', 'AB'];

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;
const CGPA_SEARCH_RANGE = 2.5;
const CANDIDATE_CAP_SAME_DEPT = 600;
const CANDIDATE_CAP_OTHER_DEPT = 400;
const PHASE1_SHORTLIST = 120;
const DIVERSITY_RATIO = 0.3;

const RESULT_CACHE = new Map();

/* ── weight presets ── */

const WEIGHTS = {
  full:      { sgpa: 0.25, subject: 0.30, cgpa: 0.15, overlap: 0.15, gradeDist: 0.15 },
  noSubject: { sgpa: 0.40, subject: 0,    cgpa: 0.30, overlap: 0,    gradeDist: 0.30 },
  noSgpa:    { sgpa: 0,    subject: 0.45, cgpa: 0.20, overlap: 0.15, gradeDist: 0.20 },
  cgpaOnly:  { sgpa: 0,    subject: 0,    cgpa: 0.50, overlap: 0,    gradeDist: 0.50 },
};

/* ── helpers ── */

function gradeNumeric(grade) {
  return GRADE_TO_NUMERIC[grade] ?? 0;
}

function buildGradeDistribution(scores) {
  const dist = {};
  if (!scores || scores.length === 0) return dist;
  for (const s of scores) {
    dist[s.grade] = (dist[s.grade] || 0) + 1;
  }
  const total = scores.length;
  for (const g of Object.keys(dist)) dist[g] /= total;
  return dist;
}

function computeGradeDistSimilarity(targetDist, candDist) {
  let dotProduct = 0, magTarget = 0, magCand = 0;
  for (const g of GRADE_LIST) {
    const a = targetDist[g] || 0;
    const b = candDist[g] || 0;
    dotProduct += a * b;
    magTarget += a * a;
    magCand += b * b;
  }
  magTarget = Math.sqrt(magTarget);
  magCand = Math.sqrt(magCand);
  if (magTarget === 0 || magCand === 0) return { score: 0 };
  return { score: (dotProduct / (magTarget * magCand)) * 100 };
}

function buildSemesterGradeDists(scores) {
  const bySem = {};
  for (const s of scores) {
    if (!bySem[s.semester]) bySem[s.semester] = [];
    bySem[s.semester].push(s);
  }
  const dists = {};
  for (const sem of Object.keys(bySem)) dists[sem] = buildGradeDistribution(bySem[sem]);
  return dists;
}

function computeSgpaSimilarity(targetMap, candMap) {
  const common = Object.keys(targetMap).filter((s) => candMap[s] != null);
  if (common.length === 0) return { score: 0, count: 0 };
  const totalDiff = common.reduce((sum, s) => sum + Math.abs(targetMap[s] - candMap[s]), 0);
  return { score: Math.max(0, 1 - totalDiff / common.length / 3) * 100, count: common.length };
}

function computeSubjectSimilarity(targetScores, candScores) {
  const targetCodes = Object.keys(targetScores);
  const common = targetCodes.filter((s) => candScores[s] != null);
  if (common.length === 0) return { score: 0, count: 0, overlapRatio: 0 };
  const totalDiff = common.reduce((sum, code) => {
    const tgt = targetScores[code], cnd = candScores[code];
    if (tgt.marks > 0 && cnd.marks > 0) return sum + Math.abs(tgt.marks - cnd.marks) / 50;
    return sum + Math.abs(gradeNumeric(tgt.grade) - gradeNumeric(cnd.grade)) / 6;
  }, 0);
  return {
    score: Math.max(0, 1 - totalDiff / common.length) * 100,
    count: common.length,
    overlapRatio: common.length / targetCodes.length,
  };
}

function computeCgpaSimilarity(a, b) {
  return Math.max(0, 1 - Math.abs(a - b) / 3) * 100;
}

function selectWeights(hasSubjects, hasSgpa) {
  if (hasSubjects && hasSgpa) return WEIGHTS.full;
  if (!hasSubjects && hasSgpa) return WEIGHTS.noSubject;
  if (hasSubjects && !hasSgpa) return WEIGHTS.noSgpa;
  return WEIGHTS.cgpaOnly;
}

function identifyStrongWeak(scores, n = 3) {
  const valid = scores.filter((s) => s.grade !== 'F' && s.grade !== 'AB');
  const sorted = [...valid].sort((a, b) => {
    if (a.marks > 0 && b.marks > 0) return b.marks - a.marks;
    return gradeNumeric(b.grade) - gradeNumeric(a.grade);
  });
  return {
    strong: sorted.slice(0, n).map((s) => s.subject_code),
    weak: sorted.slice(-n).map((s) => s.subject_code),
  };
}

/* ── result cache helpers ── */

function getCached(key) {
  return RESULT_CACHE.get(key) ?? null;
}

function setCache(key, data) {
  RESULT_CACHE.set(key, data);
}

/** Clear result cache (called when data store refreshes). */
function clearResultCache() {
  RESULT_CACHE.clear();
}

/* ── main handler ── */

/**
 * GET /api/students/:rollNo/twins?limit=10
 *
 * ZERO database queries at request time.  All data is served from the
 * in-memory data store that is loaded on startup and refreshed every 6 h.
 *
 * Result-level cache (12 h TTL) makes repeat requests ~1 ms.
 * Cold computation for a new rollNo is ~20-50 ms (pure JS, no I/O).
 */
const getAcademicTwins = async (req, res, next) => {
  try {
    const { rollNo } = req.params;
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );

    /* ── guard: data store must be ready ── */
    if (!dataStore.isReady()) {
      return res.status(503).json({
        success: false,
        data: null,
        message: 'Academic twins data is still loading. Please retry in a few seconds.',
      });
    }

    /* ── result cache hit? ── */
    const cacheKey = `${rollNo}:${limit}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    /* ── 1. Target student (in-memory) ── */

    const student = dataStore.getStudent(rollNo);
    if (!student) {
      return res.status(404).json({
        success: false,
        data: null,
        message: `Student with roll number '${rollNo}' not found`,
      });
    }

    const targetSgpaMap = dataStore.getSgpa(rollNo);
    const targetScoreRecords = dataStore.getScoresRaw(rollNo);
    const targetSubjectMap = dataStore.getScoresIndex(rollNo);
    const targetSW = identifyStrongWeak(targetScoreRecords);
    const targetGradeDist = buildGradeDistribution(targetScoreRecords);
    const targetSemGradeDists = buildSemesterGradeDists(targetScoreRecords);

    /* ── 2. Candidates (in-memory, sorted by CGPA proximity) ── */

    const cgpaLow = student.cgpa - CGPA_SEARCH_RANGE;
    const cgpaHigh = student.cgpa + CGPA_SEARCH_RANGE;
    const targetCgpa = student.cgpa;

    let sameDeptCandidates = dataStore.getCandidates(
      rollNo, cgpaLow, cgpaHigh, student.branch_code,
    );
    let otherDeptCandidates = dataStore.getCandidatesOtherDept(
      rollNo, cgpaLow, cgpaHigh, student.branch_code,
    );

    // Sort by CGPA proximity & cap
    const byCgpaProx = (a, b) => Math.abs(a.cgpa - targetCgpa) - Math.abs(b.cgpa - targetCgpa);
    sameDeptCandidates.sort(byCgpaProx);
    otherDeptCandidates.sort(byCgpaProx);
    if (sameDeptCandidates.length > CANDIDATE_CAP_SAME_DEPT)
      sameDeptCandidates = sameDeptCandidates.slice(0, CANDIDATE_CAP_SAME_DEPT);
    if (otherDeptCandidates.length > CANDIDATE_CAP_OTHER_DEPT)
      otherDeptCandidates = otherDeptCandidates.slice(0, CANDIDATE_CAP_OTHER_DEPT);

    const allCandidates = [...sameDeptCandidates, ...otherDeptCandidates];

    if (allCandidates.length === 0) {
      const emptyResp = {
        success: true,
        data: {
          student: { rollNo, name: student.name, branch_code: student.branch_code, year_of_study: student.year_of_study, cgpa: student.cgpa },
          twins: [],
          poolStats: { totalCompared: 0, sameDepartment: 0, otherDepartment: 0, sameYear: 0, differentYear: 0 },
        },
        message: 'No academic twins found',
      };
      setCache(cacheKey, emptyResp);
      return res.json(emptyResp);
    }

    /* ═══════════════════════════════════════════════════════════
     *  PHASE 1 — cheap SGPA + CGPA ranking (all in-memory)
     * ═══════════════════════════════════════════════════════════ */

    const phase1Scored = allCandidates.map((cand) => {
      const cSgpa = dataStore.getSgpa(cand.rollNo);
      const sgpa = computeSgpaSimilarity(targetSgpaMap, cSgpa);
      const cgpaSim = computeCgpaSimilarity(targetCgpa, cand.cgpa);
      const quickScore = sgpa.count > 0 ? sgpa.score * 0.6 + cgpaSim * 0.4 : cgpaSim;
      const sameDepartment = cand.branch_code === student.branch_code;
      const sameYear = cand.year_of_study === student.year_of_study;
      return { ...cand, quickScore, sameDepartment, sameYear, _sgpa: sgpa, _cgpaSim: cgpaSim };
    });

    phase1Scored.sort((a, b) => b.quickScore - a.quickScore);

    const p1SameYear = phase1Scored.filter((c) => c.sameYear).slice(0, PHASE1_SHORTLIST);
    const p1DiffYear = phase1Scored.filter((c) => !c.sameYear).slice(0, PHASE1_SHORTLIST);
    const shortlist = [...p1SameYear, ...p1DiffYear];

    /* ═══════════════════════════════════════════════════════════
     *  PHASE 2 — full 5-dimension scoring (all in-memory)
     * ═══════════════════════════════════════════════════════════ */

    const scored = shortlist.map((cand) => {
      const cScores = dataStore.getScoresIndex(cand.rollNo);
      const cRawScores = dataStore.getScoresRaw(cand.rollNo);

      const sgpa = cand._sgpa;
      const cgpaSim = cand._cgpaSim;
      const subj = computeSubjectSimilarity(targetSubjectMap, cScores);

      const candGradeDist = buildGradeDistribution(cRawScores);
      const gradeDist = computeGradeDistSimilarity(targetGradeDist, candGradeDist);

      const candSemDists = buildSemesterGradeDists(cRawScores);
      const commonSems = Object.keys(targetSemGradeDists).filter((s) => candSemDists[s] != null);
      if (commonSems.length > 0) {
        const semAvg = commonSems.reduce(
          (sum, s) => sum + computeGradeDistSimilarity(targetSemGradeDists[s], candSemDists[s]).score,
          0,
        ) / commonSems.length;
        gradeDist.score = (gradeDist.score + semAvg) / 2;
      }

      const w = selectWeights(subj.count > 0, sgpa.count > 0);
      const overlapScore = subj.overlapRatio * 100;

      let matchPct =
        sgpa.score * w.sgpa +
        subj.score * w.subject +
        cgpaSim * w.cgpa +
        overlapScore * w.overlap +
        gradeDist.score * w.gradeDist;

      if (cand.sameDepartment) matchPct = Math.min(100, matchPct + 2);

      return {
        rollNo: cand.rollNo,
        name: cand.name,
        branch_code: cand.branch_code,
        year_of_study: cand.year_of_study,
        cgpa: cand.cgpa,
        matchPercentage: parseFloat(matchPct.toFixed(1)),
        sameDepartment: cand.sameDepartment,
        sameYear: cand.sameYear,
        commonSubjectsCount: subj.count,
        commonSemestersCount: sgpa.count,
        similarity: {
          sgpa: parseFloat(sgpa.score.toFixed(1)),
          subjects: parseFloat(subj.score.toFixed(1)),
          cgpa: parseFloat(cgpaSim.toFixed(1)),
          subjectOverlap: parseFloat((subj.overlapRatio * 100).toFixed(1)),
          gradeDistribution: parseFloat(gradeDist.score.toFixed(1)),
        },
      };
    });

    scored.sort((a, b) => {
      const diff = b.matchPercentage - a.matchPercentage;
      if (Math.abs(diff) < 0.5 && a.sameDepartment !== b.sameDepartment) return a.sameDepartment ? -1 : 1;
      return diff;
    });

    /* ── Diversity-aware selection ── */

    const diversitySlots = Math.ceil(limit * DIVERSITY_RATIO);
    const mainSlots = limit - diversitySlots;
    const sameYearPool = scored.filter((c) => c.sameYear);
    const diffYearPool = scored.filter((c) => !c.sameYear);
    const diffYearPicks = diffYearPool.slice(0, diversitySlots);
    const sameYearPicks = sameYearPool.slice(0, mainSlots);

    const remaining = limit - sameYearPicks.length - diffYearPicks.length;
    let extraPicks = [];
    if (remaining > 0) {
      extraPicks = sameYearPicks.length < mainSlots
        ? diffYearPool.slice(diffYearPicks.length, diffYearPicks.length + remaining)
        : sameYearPool.slice(sameYearPicks.length, sameYearPicks.length + remaining);
    }

    const topTwins = [...sameYearPicks, ...diffYearPicks, ...extraPicks].sort(
      (a, b) => b.matchPercentage - a.matchPercentage,
    );

    /* ── Enrich top twins ── */

    for (const twin of topTwins) {
      const scores = dataStore.getScoresRaw(twin.rollNo);
      const sw = identifyStrongWeak(scores);
      twin.sharedStrongSubjects = targetSW.strong.filter((s) => sw.strong.includes(s));
      twin.sharedWeakSubjects = targetSW.weak.filter((s) => sw.weak.includes(s));

      const cSgpa = dataStore.getSgpa(twin.rollNo);
      twin.sgpaTrend = Object.entries(cSgpa)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([, val]) => val);
    }

    /* ── Pool stats ── */

    const sameYearCount = allCandidates.filter((c) => c.year_of_study === student.year_of_study).length;

    const response = {
      success: true,
      data: {
        student: { rollNo, name: student.name, branch_code: student.branch_code, year_of_study: student.year_of_study, cgpa: student.cgpa },
        twins: topTwins,
        poolStats: {
          totalCompared: allCandidates.length,
          sameDepartment: sameDeptCandidates.length,
          otherDepartment: otherDeptCandidates.length,
          sameYear: sameYearCount,
          differentYear: allCandidates.length - sameYearCount,
        },
      },
      message: 'Academic twins found successfully',
    };

    setCache(cacheKey, response);
    return res.json(response);
  } catch (err) {
    next(err);
  }
};

module.exports = { getAcademicTwins, clearResultCache };
