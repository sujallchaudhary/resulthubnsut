const Student = require('../models/Student');
const SGPA = require('../models/SGPA');
const Score = require('../models/Score');

const GRADE_ORDER = ['O', 'A+', 'A', 'B+', 'B', 'C', 'D', 'F', 'AB'];

const gradeRank = (grade) => {
  const idx = GRADE_ORDER.indexOf(grade);
  return idx === -1 ? GRADE_ORDER.length : idx;
};

/**
 * Determine an academic personality label based on SGPA history and grade spread.
 */
const determinePersonality = (allSgpa, currentSemester, currentSgpa, subjectRankings) => {
  if (currentSgpa == null) return { type: 'The Mystery', emoji: '🔮' };

  if (currentSgpa >= 9.5) return { type: 'The Topper', emoji: '👑' };
  if (currentSgpa >= 9.0) return { type: 'The Perfectionist', emoji: '🎯' };

  const sgpas = allSgpa
    .filter((s) => s.semester <= currentSemester)
    .map((s) => s.sgpa);

  if (sgpas.length >= 2) {
    const isRising = sgpas.every((val, i) => i === 0 || val >= sgpas[i - 1]);
    const isFalling = sgpas.every((val, i) => i === 0 || val <= sgpas[i - 1]);

    if (sgpas.length >= 3 && !isRising) {
      const prevMin = Math.min(...sgpas.slice(0, -1));
      if (currentSgpa > prevMin) return { type: 'The Comeback Kid', emoji: '🔥' };
    }

    if (isRising) return { type: 'The Steady Climber', emoji: '🦊' };
    if (isFalling) return { type: 'The Chill One', emoji: '😎' };

    const range = Math.max(...sgpas) - Math.min(...sgpas);
    if (range <= 0.5) return { type: 'The Consistent Performer', emoji: '🧠' };
  }

  const uniqueGrades = [...new Set(subjectRankings.map((s) => s.grade))];
  if (uniqueGrades.length >= 4) return { type: 'The Explorer', emoji: '🗺️' };

  if (currentSgpa >= 8.0) return { type: 'The Balanced Achiever', emoji: '⚖️' };
  if (currentSgpa >= 7.0) return { type: 'The Steady Player', emoji: '🎮' };
  return { type: 'The Underdog', emoji: '💪' };
};

/**
 * GET /api/wrapped/:rollNo/:semester
 * Returns a "Spotify Wrapped"-style academic summary for a student's semester.
 */
const getWrapped = async (req, res, next) => {
  try {
    const { rollNo } = req.params;
    const semesterNum = parseInt(req.params.semester, 10);

    const student = await Student.findOne({ rollNo }, '-__v -createdAt -updatedAt').lean();
    if (!student) {
      return res.status(404).json({
        success: false,
        data: null,
        message: `Student with roll number '${rollNo}' not found`,
      });
    }

    const [scores, allSgpa] = await Promise.all([
      Score.find({ roll_no: rollNo, semester: semesterNum }, '-__v -createdAt -updatedAt').lean(),
      SGPA.find({ roll_no: rollNo }, '-__v -createdAt -updatedAt').sort({ semester: 1 }).lean(),
    ]);

    if (scores.length === 0) {
      return res.status(404).json({
        success: false,
        data: null,
        message: `No records found for semester ${semesterNum}`,
      });
    }

    const semesterSgpa = allSgpa.find((s) => s.semester === semesterNum);
    const currentSgpa = semesterSgpa ? semesterSgpa.sgpa : null;

    /* ── Best & toughest grade ────────────────────────────────────── */
    const bestScore = scores.reduce(
      (best, s) => (gradeRank(s.grade) < gradeRank(best.grade) ? s : best),
      scores[0],
    );
    const toughestScore = scores.reduce(
      (worst, s) => (gradeRank(s.grade) > gradeRank(worst.grade) ? s : worst),
      scores[0],
    );

    /* ── SGPA trend ──────────────────────────────────────────────── */
    let sgpaChange = null;
    let sgpaTrend = null;
    if (semesterNum > 1 && currentSgpa !== null) {
      const prevSgpa = allSgpa.find((s) => s.semester === semesterNum - 1);
      if (prevSgpa) {
        sgpaChange = parseFloat((currentSgpa - prevSgpa.sgpa).toFixed(2));
        if (sgpaChange > 0) sgpaTrend = 'UP';
        else if (sgpaChange < 0) sgpaTrend = 'DOWN';
        else sgpaTrend = 'STABLE';
      }
    }

    /* ── Batch percentile for this semester ───────────────────────── */
    let batchPercentile = null;
    if (currentSgpa !== null) {
      const batchRollNos = (
        await Student.find({ year_of_study: student.year_of_study }, 'rollNo').lean()
      ).map((s) => s.rollNo);

      const batchSgpas = await SGPA.find(
        { roll_no: { $in: batchRollNos }, semester: semesterNum },
        'sgpa',
      ).lean();

      if (batchSgpas.length > 0) {
        const below = batchSgpas.filter((s) => s.sgpa < currentSgpa).length;
        batchPercentile = Math.round((below / batchSgpas.length) * 100);
      }
    }

    /* ── Per-subject percentile rankings ─────────────────────────── */
    const subjectCodes = scores.map((s) => s.subject_code);
    const allSubjectScores = await Score.find(
      { subject_code: { $in: subjectCodes }, semester: semesterNum },
      'subject_code marks',
    ).lean();

    const subjectScoresMap = {};
    for (const s of allSubjectScores) {
      if (!subjectScoresMap[s.subject_code]) subjectScoresMap[s.subject_code] = [];
      subjectScoresMap[s.subject_code].push(s);
    }

    const subjectRankings = [];
    const topSubjects = [];
    const bottomSubjects = [];

    for (const score of scores) {
      const pool = subjectScoresMap[score.subject_code] || [];
      const totalInSubject = pool.length;
      const below = pool.filter((s) => s.marks < score.marks).length;
      const percentile = totalInSubject > 0 ? Math.round((below / totalInSubject) * 100) : null;

      const ranking = {
        subject_code: score.subject_code,
        grade: score.grade,
        marks: score.marks,
        percentile,
        total_students: totalInSubject,
      };
      subjectRankings.push(ranking);

      if (percentile !== null && percentile >= 90) topSubjects.push(ranking);
      if (percentile !== null && percentile <= 30) bottomSubjects.push(ranking);
    }

    /* ── Academic personality ─────────────────────────────────────── */
    const personality = determinePersonality(allSgpa, semesterNum, currentSgpa, subjectRankings);

    return res.json({
      success: true,
      data: {
        rollNo: student.rollNo,
        name: student.name,
        branch_code: student.branch_code,
        year_of_study: student.year_of_study,
        semester: semesterNum,
        subjects_count: scores.length,
        best_grade: {
          subject_code: bestScore.subject_code,
          grade: bestScore.grade,
          marks: bestScore.marks,
        },
        toughest_subject: {
          subject_code: toughestScore.subject_code,
          grade: toughestScore.grade,
          marks: toughestScore.marks,
        },
        sgpa: currentSgpa,
        sgpa_change: sgpaChange,
        sgpa_trend: sgpaTrend,
        batch_percentile: batchPercentile,
        academic_personality: personality.type,
        personality_emoji: personality.emoji,
        top_subjects: topSubjects,
        bottom_subjects: bottomSubjects,
        subject_rankings: subjectRankings,
      },
      message: 'Semester wrapped generated successfully',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getWrapped };
