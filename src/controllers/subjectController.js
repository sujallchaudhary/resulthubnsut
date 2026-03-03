const Score = require('../models/Score');
const Student = require('../models/Student');

const PAGE_LIMIT = 20;

const LOW_GRADES = ['C', 'D', 'F','FD'];
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
 * GET /api/subjects/difficulty
 * Returns a paginated Subject Difficulty Map built from Score records.
 *
 * Each entry contains: subject_code, average marks, total students,
 * grade distribution, difficulty level, and a killer flag (>30% students
 * received grade C, D, or F).
 *
 * A summary block with the hardest and easiest subjects is also included.
 *
 * Query params:
 *   semester - filter by semester number
 *   branch   - comma-separated branch codes (e.g. "UBT,UEC")
 *   page     - page number (default 1)
 */
const getSubjectDifficulty = async (req, res, next) => {
  try {
    const { semester, rollNo } = req.query;
    let { branch } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);

    if (rollNo) {
      const student = await Student.findOne({ rollNo }, 'branch_code').lean();
      if (!student) {
        return res.status(404).json({
          success: false,
          data: null,
          message: `Student with roll number '${rollNo}' not found`,
        });
      }
      branch = student.branch_code;
    }
    const limit = PAGE_LIMIT;

    const matchStage = {};
    if (semester) {
      const semInt = parseInt(semester, 10);
      matchStage.semester = { $in: [semInt, String(semInt)] };
    }
    if (branch) {
      const branches = branch
        .split(',')
        .map((b) => b.trim().toUpperCase())
        .filter(Boolean);
      if (branches.length > 0) {
        matchStage.branch_code = { $in: branches };
      }
    }

    const pipeline = [];
    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage });
    }

    pipeline.push({
      $group: {
        _id: '$subject_code',
        avg_marks: { $avg: { $toDouble: '$marks' } },
        total_students: { $sum: 1 },
        grades: { $push: '$grade' },
      },
    });

    const allSubjects = await Score.aggregate(pipeline);

    const subjects = allSubjects.map((s) => {
      const gradeDist = {};
      let lowCount = 0;
      for (const g of s.grades) {
        gradeDist[g] = (gradeDist[g] || 0) + 1;
        if (LOW_GRADES.includes(g)) lowCount += 1;
      }

      const avgMarks = parseFloat((s.avg_marks || 0).toFixed(2));
      const lowPct = s.total_students > 0 ? lowCount / s.total_students : 0;

      return {
        subject_code: s._id,
        avg_marks: avgMarks,
        total_students: s.total_students,
        difficulty: classifyDifficulty(avgMarks),
        is_killer: lowPct > KILLER_THRESHOLD,
        low_grade_percentage: parseFloat((lowPct * 100).toFixed(2)),
        grade_distribution: gradeDist,
      };
    });

    subjects.sort((a, b) => a.avg_marks - b.avg_marks);

    const total = subjects.length;
    const hardest = total > 0 ? subjects[0] : null;
    const easiest = total > 0 ? subjects[subjects.length - 1] : null;

    // Re-sort by total_students descending (most popular on top)
    subjects.sort((a, b) => b.total_students - a.total_students);

    const totalPages = Math.ceil(total / limit);
    const pageSlice = subjects.slice((page - 1) * limit, page * limit);

    return res.json({
      success: true,
      data: {
        subjects: pageSlice,
        summary: {
          total_subjects: total,
          hardest_subject: hardest
            ? { subject_code: hardest.subject_code, avg_marks: hardest.avg_marks, difficulty: hardest.difficulty }
            : null,
          easiest_subject: easiest
            ? { subject_code: easiest.subject_code, avg_marks: easiest.avg_marks, difficulty: easiest.difficulty }
            : null,
          killer_count: subjects.filter((s) => s.is_killer).length,
        },
      },
      message: 'Subject difficulty map retrieved successfully',
      pagination: { total, page, limit, totalPages },
      appliedFilters: { semester: semester || null, branch: branch || null, rollNo: rollNo || null },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getSubjectDifficulty };
