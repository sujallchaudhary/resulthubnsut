const PAGE_LIMIT = 20;

const GRADE_ORDER = ['O', 'A+', 'A', 'B+', 'B', 'C', 'D', 'F', 'AB'];

/**
 * GET /api/:college/students
 * Returns paginated list of all students with semester-wise SGPA.
 * Page size is fixed at 20.
 */
const getAllStudents = async (req, res, next) => {
  try {
    const { Student, SGPA } = req.models;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = PAGE_LIMIT;
    const skip = (page - 1) * limit;

    const [students, total] = await Promise.all([
      Student.find({}, '-__v -createdAt -updatedAt')
        .sort({ rank: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Student.countDocuments(),
    ]);

    if (students.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: 'No students found',
        pagination: { total: 0, page, limit, totalPages: 0 },
      });
    }

    const rollNos = students.map((s) => s.rollNo);
    const sgpaRecords = await SGPA.find({ roll_no: { $in: rollNos } }, '-__v -createdAt -updatedAt').lean();

    const sgpaByRoll = {};
    for (const record of sgpaRecords) {
      if (!sgpaByRoll[record.roll_no]) sgpaByRoll[record.roll_no] = [];
      sgpaByRoll[record.roll_no].push({
        semester: record.semester,
        sgpa: record.sgpa,
        credits_registered: record.credits_registered,
        credits_secured: record.credits_secured,
      });
    }

    for (const roll of Object.keys(sgpaByRoll)) {
      sgpaByRoll[roll].sort((a, b) => a.semester - b.semester);
    }

    const data = students.map((student) => ({
      rollNo: student.rollNo,
      name: student.name,
      branch_code: student.branch_code,
      year_of_study: student.year_of_study,
      cgpa: student.cgpa,
      rank: student.rank,
      branch_rank: student.branch_rank,
      percentile: student.percentile,
      credits_completed: student.credits_completed,
      semesters: sgpaByRoll[student.rollNo] || [],
    }));

    const totalPages = Math.ceil(total / limit);

    return res.json({
      success: true,
      data,
      message: 'Students retrieved successfully',
      pagination: { total, page, limit, totalPages },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/students/:rollNo
 * Returns a single student's full profile including scores grouped by semester.
 */
const getStudentByRollNo = async (req, res, next) => {
  try {
    const { Student, SGPA, Score } = req.models;
    const { rollNo } = req.params;

    const student = await Student.findOne({ rollNo }, '-__v -createdAt -updatedAt').lean();
    if (!student) {
      return res.status(404).json({
        success: false,
        data: null,
        message: `Student with roll number '${rollNo}' not found`,
      });
    }

    const [sgpaRecords, scoreRecords] = await Promise.all([
      SGPA.find({ roll_no: rollNo }, '-__v -createdAt -updatedAt').sort({ semester: 1 }).lean(),
      Score.find({ roll_no: rollNo }, '-__v -createdAt -updatedAt').sort({ semester: 1 }).lean(),
    ]);

    const semesterMap = {};
    for (const sg of sgpaRecords) {
      semesterMap[sg.semester] = {
        semester: sg.semester,
        sgpa: sg.sgpa,
        credits_registered: sg.credits_registered,
        credits_secured: sg.credits_secured,
        subjects: [],
      };
    }

    const gradeCounts = {};
    let totalCreditsRegistered = 0;
    let totalCreditsSecured = 0;

    for (const score of scoreRecords) {
      if (!semesterMap[score.semester]) {
        semesterMap[score.semester] = {
          semester: score.semester,
          sgpa: null,
          credits_registered: null,
          credits_secured: null,
          subjects: [],
        };
      }
      semesterMap[score.semester].subjects.push({
        subject_code: score.subject_code,
        grade: score.grade,
        marks: score.marks,
      });

      gradeCounts[score.grade] = (gradeCounts[score.grade] || 0) + 1;
    }

    for (const sg of sgpaRecords) {
      totalCreditsRegistered += sg.credits_registered || 0;
      totalCreditsSecured += sg.credits_secured || 0;
    }

    const highestGradeOrder = GRADE_ORDER;
    const highestGradeSubjects = scoreRecords
      .filter((s) => s.grade === highestGradeOrder.find((g) => gradeCounts[g]))
      .map((s) => ({ subject_code: s.subject_code, grade: s.grade, semester: s.semester }));

    const semesters = Object.values(semesterMap).sort((a, b) => a.semester - b.semester);

    return res.json({
      success: true,
      data: {
        rollNo: student.rollNo,
        name: student.name,
        branch_code: student.branch_code,
        year_of_study: student.year_of_study,
        cgpa: student.cgpa,
        rank: student.rank,
        branch_rank: student.branch_rank,
        percentile: student.percentile,
        credits_completed: student.credits_completed,
        semesters,
        stats: {
          total_subjects: scoreRecords.length,
          grade_distribution: gradeCounts,
          highest_grade_subjects: highestGradeSubjects,
          total_credits_registered: totalCreditsRegistered,
          total_credits_secured: totalCreditsSecured,
        },
      },
      message: 'Student retrieved successfully',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAllStudents, getStudentByRollNo };
