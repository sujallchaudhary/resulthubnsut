const LOW_GRADES = ['C', 'D', 'F', 'FD'];
const KILLER_THRESHOLD = 0.2;

/**
 * Classify a subject's difficulty based on average marks (0–10 scale).
 *   avg >= 8  → "Easy"
 *   avg >= 6  → "Medium"
 *   avg <  6  → "Hard"
 */
const classifyDifficulty = (avg) => {
  if (avg >= 8) return 'Easy';
  if (avg >= 6) return 'Medium';
  return 'Hard';
};

/**
 * GET /api/:college/subjects/codes
 * Returns every distinct subject code on record, for autocomplete/typeahead.
 */
const getSubjectCodes = async (req, res, next) => {
  try {
    const { Score } = req.models;
    const codes = await Score.distinct('subject_code');
    codes.sort();

    return res.json({
      success: true,
      data: codes,
      message: 'Subject codes retrieved successfully',
    });
  } catch (err) {
    next(err);
  }
};

const MARKS_BUCKETS = [
  { range: '0-2', min: 0, max: 2 },
  { range: '2-4', min: 2, max: 4 },
  { range: '4-6', min: 4, max: 6 },
  { range: '6-8', min: 6, max: 8 },
  { range: '8-10', min: 8, max: 10.01 },
];

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Some records store `marks` as a numeric string (bulk import bypassed Mongoose's
// Number cast) — parse defensively instead of relying on typeof.
const parseMarks = (raw) => {
  const n = typeof raw === 'number' ? raw : parseFloat(raw);
  return Number.isFinite(n) ? n : undefined;
};

// Grades come in inconsistent casing ("C" vs "c") — normalize before grouping/matching.
const normalizeGrade = (raw) => (raw ?? '').toString().trim().toUpperCase() || 'UNGRADED';

const median = (sortedNums) => {
  const n = sortedNums.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sortedNums[mid - 1] + sortedNums[mid]) / 2 : sortedNums[mid];
};

const stdDev = (nums, avg) => {
  if (nums.length === 0) return 0;
  const variance = nums.reduce((sum, n) => sum + (n - avg) ** 2, 0) / nums.length;
  return Math.sqrt(variance);
};

const buildVerdict = ({ isKiller, lowGradePct, avgMarks }) => {
  if (isKiller || lowGradePct > 30) {
    return { label: 'Risky Pick', reason: `Over ${lowGradePct.toFixed(0)}% of students scored C or below. Go in prepared or with a backup plan.` };
  }
  if (avgMarks >= 8 && lowGradePct < 10) {
    return { label: 'Safe Pick', reason: `Strong average grades and less than ${Math.ceil(lowGradePct)}% low scorers historically.` };
  }
  return { label: 'Moderate Pick', reason: 'Performance has been mixed — outcomes depend a lot on preparation and faculty.' };
};

const ANALYTICS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — refreshed lazily on next request after expiry

/**
 * Computes the full analytics payload for a subject code from scratch.
 * Returns null if the subject has no records at all.
 */
const computeSubjectAnalytics = async (models, code) => {
  const { Score, Student } = models;
  const codeMatch = { subject_code: new RegExp(`^${escapeRegex(code)}$`, 'i') };

  const scores = await Score.find(codeMatch, 'roll_no branch_code grade marks semester').lean();
  if (scores.length === 0) return null;

  // Precompute parsed marks + normalized grade once per record so every breakdown
  // below reads consistent values instead of re-deriving them (and disagreeing).
  const enriched = scores.map((s) => ({ ...s, _marks: parseMarks(s.marks), _grade: normalizeGrade(s.grade) }));
  const numericScores = enriched.filter((s) => s._marks !== undefined);
  const marksArr = numericScores.map((s) => s._marks).sort((a, b) => a - b);

  const totalStudents = enriched.length;
  const avgMarks = marksArr.length ? marksArr.reduce((a, b) => a + b, 0) / marksArr.length : 0;
  const medianMarks = median(marksArr);
  const highestMarks = marksArr.length ? marksArr[marksArr.length - 1] : 0;
  const lowestMarks = marksArr.length ? marksArr[0] : 0;
  const standardDeviation = stdDev(marksArr, avgMarks);

  /* ── Grade distribution & pass/fail ─────────────────────────────── */
  const gradeDistribution = {};
  let lowCount = 0;
  let failCount = 0;
  for (const s of enriched) {
    gradeDistribution[s._grade] = (gradeDistribution[s._grade] || 0) + 1;
    if (LOW_GRADES.includes(s._grade)) lowCount += 1;
    if (s._grade === 'F' || s._grade === 'FD') failCount += 1;
  }
  const gradeDistributionPct = {};
  for (const [g, count] of Object.entries(gradeDistribution)) {
    gradeDistributionPct[g] = parseFloat(((count / totalStudents) * 100).toFixed(2));
  }
  const lowGradePct = (lowCount / totalStudents) * 100;
  const passPct = 100 - (failCount / totalStudents) * 100;

  /* ── Marks histogram ────────────────────────────────────────────── */
  const marksHistogram = MARKS_BUCKETS.map((b) => ({
    range: b.range,
    count: marksArr.filter((m) => m >= b.min && m < b.max).length,
  }));

  /* ── Branch-wise breakdown ──────────────────────────────────────── */
  const byBranch = {};
  for (const s of enriched) {
    const key = s.branch_code || 'Unknown';
    if (!byBranch[key]) byBranch[key] = { marks: [], low: 0, total: 0 };
    byBranch[key].total += 1;
    if (s._marks !== undefined) byBranch[key].marks.push(s._marks);
    if (LOW_GRADES.includes(s._grade)) byBranch[key].low += 1;
  }
  const branchBreakdown = Object.entries(byBranch)
    .map(([branch_code, v]) => ({
      branch_code,
      total_students: v.total,
      avg_marks: v.marks.length ? parseFloat((v.marks.reduce((a, b) => a + b, 0) / v.marks.length).toFixed(2)) : 0,
      low_grade_percentage: parseFloat(((v.low / v.total) * 100).toFixed(2)),
    }))
    .sort((a, b) => b.total_students - a.total_students);

  /* ── Semester-wise breakdown ─────────────────────────────────────── */
  const bySemester = {};
  for (const s of enriched) {
    const key = String(s.semester);
    if (!bySemester[key]) bySemester[key] = { marks: [], total: 0 };
    bySemester[key].total += 1;
    if (s._marks !== undefined) bySemester[key].marks.push(s._marks);
  }
  const semesterBreakdown = Object.entries(bySemester)
    .map(([semester, v]) => ({
      semester: isNaN(Number(semester)) ? semester : Number(semester),
      total_students: v.total,
      avg_marks: v.marks.length ? parseFloat((v.marks.reduce((a, b) => a + b, 0) / v.marks.length).toFixed(2)) : 0,
    }))
    .sort((a, b) => Number(a.semester) - Number(b.semester));

  /* ── Year-wise trend (joins Student for year_of_study) ───────────── */
  const rollNos = [...new Set(enriched.map((s) => s.roll_no))];
  const students = await Student.find({ rollNo: { $in: rollNos } }, 'rollNo year_of_study').lean();
  const yearByRoll = {};
  for (const st of students) yearByRoll[st.rollNo] = st.year_of_study;

  const byYear = {};
  for (const s of enriched) {
    const year = yearByRoll[s.roll_no];
    if (!year) continue;
    if (!byYear[year]) byYear[year] = { marks: [], low: 0, total: 0 };
    byYear[year].total += 1;
    if (s._marks !== undefined) byYear[year].marks.push(s._marks);
    if (LOW_GRADES.includes(s._grade)) byYear[year].low += 1;
  }
  const yearBreakdown = Object.entries(byYear)
    .map(([year_of_study, v]) => ({
      year_of_study,
      total_students: v.total,
      avg_marks: v.marks.length ? parseFloat((v.marks.reduce((a, b) => a + b, 0) / v.marks.length).toFixed(2)) : 0,
      low_grade_percentage: parseFloat(((v.low / v.total) * 100).toFixed(2)),
    }))
    .sort((a, b) => a.year_of_study.localeCompare(b.year_of_study));

  /* ── Top scorers ─────────────────────────────────────────────────── */
  const topScorers = [...numericScores]
    .sort((a, b) => b._marks - a._marks)
    .slice(0, 5)
    .map((s) => ({ roll_no: s.roll_no, marks: s._marks, grade: s._grade, branch_code: s.branch_code }));

  /* ── Comparison against the overall subject pool ─────────────────── */
  const allSubjectAverages = await Score.aggregate([
    {
      $addFields: {
        _marksNum: { $convert: { input: '$marks', to: 'double', onError: null, onNull: null } },
      },
    },
    { $match: { _marksNum: { $ne: null } } },
    { $group: { _id: '$subject_code', avg_marks: { $avg: '$_marksNum' } } },
  ]);
  const overallAvgAcrossSubjects = allSubjectAverages.length
    ? allSubjectAverages.reduce((sum, s) => sum + s.avg_marks, 0) / allSubjectAverages.length
    : avgMarks;
  const harderCount = allSubjectAverages.filter((s) => s.avg_marks < avgMarks).length;
  const harderThanPct = allSubjectAverages.length
    ? parseFloat(((harderCount / allSubjectAverages.length) * 100).toFixed(1))
    : 0;

  const difficulty = classifyDifficulty(avgMarks);
  const isKiller = lowGradePct > KILLER_THRESHOLD * 100;

  return {
    // Use the searched code, not scores[0].subject_code — real records occasionally
    // have a null/blank subject_code from bad imports even though they matched the regex.
    subject_code: code,
    total_students: totalStudents,
    avg_marks: parseFloat(avgMarks.toFixed(2)),
    median_marks: parseFloat(medianMarks.toFixed(2)),
    highest_marks: highestMarks,
    lowest_marks: lowestMarks,
    std_dev: parseFloat(standardDeviation.toFixed(2)),
    pass_percentage: parseFloat(passPct.toFixed(2)),
    fail_percentage: parseFloat((100 - passPct).toFixed(2)),
    difficulty,
    is_killer: isKiller,
    low_grade_percentage: parseFloat(lowGradePct.toFixed(2)),
    grade_distribution: gradeDistribution,
    grade_distribution_pct: gradeDistributionPct,
    marks_histogram: marksHistogram,
    branch_breakdown: branchBreakdown,
    semester_breakdown: semesterBreakdown,
    year_breakdown: yearBreakdown,
    top_scorers: topScorers,
    comparison: {
      overall_avg_marks_all_subjects: parseFloat(overallAvgAcrossSubjects.toFixed(2)),
      difference_from_overall: parseFloat((avgMarks - overallAvgAcrossSubjects).toFixed(2)),
      harder_than_percentage: harderThanPct,
    },
    verdict: buildVerdict({ isKiller, lowGradePct, avgMarks }),
  };
};

const getSubjectAnalytics = async (req, res, next) => {
  try {
    const { CachedStats } = req.models;
    const code = req.params.code.trim().toUpperCase();
    // v2: bumped after fixing marks-as-string parsing and percentage math bugs,
    // so stale bad cache entries from before the fix are automatically bypassed.
    const cacheKey = `subjectAnalyticsV2:${code}`;

    const cached = await CachedStats.findOne({ key: cacheKey }).lean();
    const isFresh = cached && Date.now() - new Date(cached.updatedAt).getTime() < ANALYTICS_CACHE_TTL_MS;

    if (isFresh) {
      return res.json({
        success: true,
        data: cached.data,
        cachedAt: cached.updatedAt,
        message: 'Subject analytics retrieved successfully (cached)',
      });
    }

    const data = await computeSubjectAnalytics(req.models, code);

    if (!data) {
      if (cached) {
        // Stale cache but no records found on recompute (e.g. code was renamed) — serve stale rather than 404.
        return res.json({
          success: true,
          data: cached.data,
          cachedAt: cached.updatedAt,
          message: 'Subject analytics retrieved successfully (stale cache)',
        });
      }
      return res.status(404).json({
        success: false,
        data: null,
        message: `No records found for subject '${code}'`,
      });
    }

    const doc = await CachedStats.findOneAndUpdate(
      { key: cacheKey },
      { data },
      { upsert: true, new: true },
    );

    return res.json({
      success: true,
      data,
      cachedAt: doc.updatedAt,
      message: 'Subject analytics retrieved successfully',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getSubjectAnalytics, getSubjectCodes };
