const PAGE_LIMIT = 20;

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * GET /api/filter/options
 * Returns the available filter options (distinct years and branches).
 */
const getFilterOptions = async (_req, res, next) => {
  try {
    const { Student } = _req.models;
    const [years, branches] = await Promise.all([
      Student.distinct('year_of_study'),
      Student.distinct('branch_code'),
    ]);

    res.json({
      success: true,
      data: {
        years: years.sort(),
        branches: branches.sort(),
      },
      message: 'Filter options retrieved successfully',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/filter
 * Filters students by year and/or branch(es), then recalculates ranks within
 * the filtered set based on CGPA descending order.
 * Page size is fixed at 20.
 *
 * Query params:
 *   year   - single batch year (e.g. "2022")
 *   branch - comma-separated branch codes (e.g. "UBT,UEC")
 *   query  - partial or full roll number or name to search (case-insensitive)
 *   page   - page number (default 1)
 */
const filterStudents = async (req, res, next) => {
  try {
    const { Student, SGPA } = req.models;
    const { year, branch, query: searchQuery } = req.query;
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
    if (searchQuery) {
      const regex = { $regex: escapeRegex(searchQuery.trim()), $options: 'i' };
      filter.$or = [{ rollNo: regex }, { name: regex }];
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
        appliedFilters: { year: year || null, branch: branch || null, query: searchQuery || null },
      });
    }

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

    // Ranking logic (search query never affects which rank is used):
    // - No year & no branch → stored overall rank
    // - Single branch, matches student's own branch → stored branch_rank
    // - Single branch, different from student's branch → calculated rank within that branch
    // - Year only, or year+branch, or multiple branches → calculated filtered rank
    const parsedBranches = branch
      ? branch.split(',').map((b) => b.trim().toUpperCase()).filter(Boolean)
      : [];
    const noYearFilter = !year;
    const noBranchFilter = parsedBranches.length === 0;
    const singleBranch = parsedBranches.length === 1;

    // Identify students that need a computed rank
    const needsComputed = [];
    if (noYearFilter && noBranchFilter) {
      // All use stored overall rank — nothing to compute
    } else if (noYearFilter && singleBranch) {
      // Students whose own branch matches the filter use stored branch_rank;
      // others need a computed rank within that branch
      pageSlice.forEach((s, i) => {
        if (s.branch_code !== parsedBranches[0]) needsComputed.push({ student: s, index: i });
      });
    } else {
      // All students need a computed rank within the year/branch set
      pageSlice.forEach((s, i) => needsComputed.push({ student: s, index: i }));
    }

    // Compute ranks for students that need it: rank = (# with higher cgpa in base set) + 1
    const filteredRankMap = {};
    if (needsComputed.length > 0) {
      const baseFilter = {};
      if (year) baseFilter.year_of_study = year.trim();
      if (parsedBranches.length > 0) baseFilter.branch_code = { $in: parsedBranches };

      const counts = await Promise.all(
        needsComputed.map(({ student }) =>
          Student.countDocuments({ ...baseFilter, cgpa: { $gt: student.cgpa } })
        )
      );
      needsComputed.forEach(({ student }, i) => {
        filteredRankMap[student.rollNo] = counts[i] + 1;
      });
    }

    const getRank = (student) => {
      if (noYearFilter && noBranchFilter) return student.rank;
      if (noYearFilter && singleBranch && student.branch_code === parsedBranches[0]) {
        return student.branch_rank;
      }
      return filteredRankMap[student.rollNo] || 0;
    };

    const getRankType = (student) => {
      if (noYearFilter && noBranchFilter) return 'overall';
      if (noYearFilter && singleBranch && student.branch_code === parsedBranches[0]) return 'branch';
      return 'filtered';
    };

    const data = pageSlice.map((student) => ({
      rollNo: student.rollNo,
      name: student.name,
      branch_code: student.branch_code,
      year_of_study: student.year_of_study,
      cgpa: student.cgpa,
      rank: getRank(student),
      rank_type: getRankType(student),
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
      appliedFilters: { year: year || null, branch: branch || null, query: searchQuery || null },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { filterStudents, getFilterOptions };
