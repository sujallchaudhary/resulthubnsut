const Student = require('../models/Student');
const SGPA = require('../models/SGPA');

const PAGE_LIMIT = 20;

/**
 * GET /api/filter
 * Filters students by year and/or branch(es), then recalculates ranks within
 * the filtered set based on CGPA descending order.
 * Page size is fixed at 20.
 *
 * Query params:
 *   year   - single batch year (e.g. "2022")
 *   branch - comma-separated branch codes (e.g. "UBT,UEC")
 *   page   - page number (default 1)
 */
const filterStudents = async (req, res, next) => {
  try {
    const { year, branch } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = PAGE_LIMIT;

    const filter = {};
    if (year) {
      filter.year_of_study = year.trim();
    }
    if (branch) {
      const branches = branch
        .split(',')
        .map((b) => b.trim().toUpperCase())
        .filter(Boolean);
      if (branches.length > 0) {
        filter.branch_code = { $in: branches };
      }
    }

    const [pageSlice, total] = await Promise.all([
      Student.find(filter, '-__v -createdAt -updatedAt')
        .sort({ cgpa: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Student.countDocuments(filter),
    ]);

    if (total === 0) {
      return res.json({
        success: true,
        data: [],
        message: 'No students found matching the given filters',
        pagination: { total: 0, page, limit, totalPages: 0 },
        appliedFilters: { year: year || null, branch: branch || null },
      });
    }

    const rankOffset = (page - 1) * limit;
    const rollNos = pageSlice.map((s) => s.rollNo);

    const sgpaRecords = await SGPA.find(
      { roll_no: { $in: rollNos } },
      '-__v -createdAt -updatedAt'
    ).lean();

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

    const data = pageSlice.map((student, index) => ({
      rollNo: student.rollNo,
      name: student.name,
      branch_code: student.branch_code,
      year_of_study: student.year_of_study,
      cgpa: student.cgpa,
      overall_rank: student.rank,
      branch_rank: student.branch_rank,
      filtered_rank: rankOffset + index + 1,
      percentile: student.percentile,
      credits_completed: student.credits_completed,
      semesters: sgpaByRoll[student.rollNo] || [],
    }));

    const totalPages = Math.ceil(total / limit);

    return res.json({
      success: true,
      data,
      message: 'Filtered students retrieved successfully',
      pagination: { total, page, limit, totalPages },
      appliedFilters: { year: year || null, branch: branch || null },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { filterStudents };
