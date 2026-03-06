const STATS_KEY = 'yearWiseStats';

/**
 * Compute all year-wise statistics from scratch.
 */
const computeStats = async (models) => {
  const { Student, SGPA, Score, Department } = models;
  const [
    yearAgg,
    departmentStats,
    cgpaDistByYear,
    top10ByYear,
    semesterAvgByYear,
    gradeDistByYear,
    topPerformersByBranch,
  ] = await Promise.all([
      // Year-wise overall stats
      Student.aggregate([
        { $match: { cgpa: { $type: 'number' } } },
        {
          $group: {
            _id: '$year_of_study',
            totalStudents: { $sum: 1 },
            averageCGPA: { $avg: '$cgpa' },
            highestCGPA: { $max: '$cgpa' },
            lowestCGPA: { $min: '$cgpa' },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Department stats (already has year field)
      Department.find({}, '-__v -createdAt -updatedAt').sort({ year: 1, departmentCode: 1 }).lean(),

      // CGPA distribution by year
      Student.aggregate([
        { $match: { cgpa: { $type: 'number' } } },
        {
          $group: {
            _id: {
              year: '$year_of_study',
              bucket: {
                $switch: {
                  branches: [
                    { case: { $lt: ['$cgpa', 4] }, then: '0-4' },
                    { case: { $lt: ['$cgpa', 5] }, then: '4-5' },
                    { case: { $lt: ['$cgpa', 6] }, then: '5-6' },
                    { case: { $lt: ['$cgpa', 7] }, then: '6-7' },
                    { case: { $lt: ['$cgpa', 8] }, then: '7-8' },
                    { case: { $lt: ['$cgpa', 9] }, then: '8-9' },
                    { case: { $lte: ['$cgpa', 10] }, then: '9-10' },
                  ],
                  default: 'other',
                },
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.bucket': 1 } },
      ]),

      // Top 10 students per year (sorted by cgpa descending)
      Student.aggregate([
        { $match: { cgpa: { $type: 'number' } } },
        { $sort: { cgpa: -1 } },
        {
          $group: {
            _id: '$year_of_study',
            students: {
              $push: {
                rollNo: '$rollNo',
                name: '$name',
                branch_code: '$branch_code',
                year_of_study: '$year_of_study',
                cgpa: '$cgpa',
                rank: '$rank',
                percentile: '$percentile',
              },
            },
          },
        },
        { $project: { students: { $slice: ['$students', 10] } } },
        { $sort: { _id: 1 } },
      ]),

      // Semester averages by year
      SGPA.aggregate([
        { $match: { sgpa: { $type: 'number' } } },
        {
          $lookup: {
            from: 'students',
            localField: 'roll_no',
            foreignField: 'rollNo',
            as: 'student',
          },
        },
        { $unwind: '$student' },
        {
          $group: {
            _id: { year: '$student.year_of_study', semester: '$semester' },
            averageSGPA: { $avg: '$sgpa' },
            studentCount: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.semester': 1 } },
      ]),

      // Grade distribution by year
      Score.aggregate([
        {
          $lookup: {
            from: 'students',
            localField: 'roll_no',
            foreignField: 'rollNo',
            as: 'student',
          },
        },
        { $unwind: '$student' },
        {
          $group: {
            _id: { year: '$student.year_of_study', grade: '$grade' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.grade': 1 } },
      ]),

      // Top performers (8.5+ CGPA) count by branch per year
      Student.aggregate([
        { $match: { cgpa: { $type: 'number', $gte: 8.5 } } },
        {
          $group: {
            _id: { year: '$year_of_study', branch: '$branch_code' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, count: -1 } },
      ]),
    ]);

    // Group everything by year
    const yearWiseData = {};

    for (const y of yearAgg) {
      const year = y._id;

      yearWiseData[year] = {
        overall: {
          totalStudents: y.totalStudents,
          averageCGPA: parseFloat((y.averageCGPA || 0).toFixed(4)),
          highestCGPA: y.highestCGPA,
          lowestCGPA: y.lowestCGPA,
        },
        departmentStats: departmentStats.filter((d) => d.year === year),
        cgpaDistribution: cgpaDistByYear
          .filter((b) => b._id.year === year)
          .map((b) => ({ range: b._id.bucket, count: b.count })),
        top10Students: (top10ByYear.find((t) => t._id === year) || { students: [] }).students,
        semesterAverages: semesterAvgByYear
          .filter((s) => s._id.year === year)
          .map((s) => ({
            semester: s._id.semester,
            averageSGPA: parseFloat((s.averageSGPA || 0).toFixed(4)),
            studentCount: s.studentCount,
          })),
        gradeDistribution: gradeDistByYear
          .filter((g) => g._id.year === year)
          .reduce((acc, g) => {
            acc[g._id.grade] = g.count;
            return acc;
          }, {}),
        topPerformersByBranch: topPerformersByBranch
          .filter((t) => t._id.year === year)
          .map((t) => ({ branch: t._id.branch, count: t.count })),
      };
    }

    return yearWiseData;
};

/**
 * GET /api/stats
 * Returns year-wise statistics. Served from cache if available.
 */
const getStats = async (req, res, next) => {
  try {
    const { CachedStats } = req.models;
    const cached = await CachedStats.findOne({ key: STATS_KEY }).lean();

    if (cached) {
      return res.json({
        success: true,
        data: cached.data,
        cachedAt: cached.updatedAt,
        message: 'Statistics retrieved successfully (cached)',
      });
    }

    const yearWiseData = await computeStats(req.models);

    await req.models.CachedStats.findOneAndUpdate(
      { key: STATS_KEY },
      { data: yearWiseData },
      { upsert: true },
    );

    return res.json({
      success: true,
      data: yearWiseData,
      message: 'Statistics retrieved successfully',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/stats/reset
 * Recomputes stats from scratch and updates the cache.
 */
const resetStats = async (req, res, next) => {
  try {
    const { CachedStats } = req.models;
    const yearWiseData = await computeStats(req.models);

    const doc = await CachedStats.findOneAndUpdate(
      { key: STATS_KEY },
      { data: yearWiseData },
      { upsert: true, new: true },
    );

    return res.json({
      success: true,
      data: yearWiseData,
      cachedAt: doc.updatedAt,
      message: 'Statistics recalculated and cached successfully',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/stats/battle?type=branch&a=CSE&b=IT
 * GET /api/stats/battle?type=year&a=1st Year&b=2nd Year
 * Compares two branches or two years head-to-head.
 */
const getBattle = async (req, res, next) => {
  try {
    const { Student, CachedStats } = req.models;
    const { type, a, b } = req.query;

    if (!type || !a || !b) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Query params type, a, and b are required.',
      });
    }

    if (type !== 'branch' && type !== 'year') {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'type must be "branch" or "year".',
      });
    }

    // Normalize key: sort the two sides so battle(a,b) === battle(b,a)
    const sorted = [a, b].sort();
    const cacheKey = `battle:${type}:${sorted[0]}:${sorted[1]}`;
    const cached = await CachedStats.findOne({ key: cacheKey }).lean();

    if (cached) {
      return res.json({
        success: true,
        data: cached.data,
        cachedAt: cached.updatedAt,
        message: `${type === 'branch' ? 'Branch' : 'Year'} battle retrieved successfully (cached)`,
      });
    }

    const groupField = type === 'branch' ? '$branch_code' : '$year_of_study';
    const values = [a, b];
    const matchField = type === 'branch' ? 'branch_code' : 'year_of_study';

    const [statsAgg, topPerformersAgg, cgpaDistAgg] = await Promise.all([
      Student.aggregate([
        { $match: { [matchField]: { $in: values }, cgpa: { $type: 'number' } } },
        {
          $group: {
            _id: groupField,
            totalStudents: { $sum: 1 },
            averageCGPA: { $avg: '$cgpa' },
            highestCGPA: { $max: '$cgpa' },
            lowestCGPA: { $min: '$cgpa' },
          },
        },
      ]),

      Student.aggregate([
        { $match: { [matchField]: { $in: values }, cgpa: { $type: 'number', $gte: 8.5 } } },
        {
          $group: {
            _id: groupField,
            topPerformerCount: { $sum: 1 },
          },
        },
      ]),

      Student.aggregate([
        { $match: { [matchField]: { $in: values }, cgpa: { $type: 'number' } } },
        {
          $group: {
            _id: {
              side: groupField,
              bucket: {
                $switch: {
                  branches: [
                    { case: { $lt: ['$cgpa', 4] }, then: '0-4' },
                    { case: { $lt: ['$cgpa', 5] }, then: '4-5' },
                    { case: { $lt: ['$cgpa', 6] }, then: '5-6' },
                    { case: { $lt: ['$cgpa', 7] }, then: '6-7' },
                    { case: { $lt: ['$cgpa', 8] }, then: '7-8' },
                    { case: { $lt: ['$cgpa', 9] }, then: '8-9' },
                    { case: { $lte: ['$cgpa', 10] }, then: '9-10' },
                  ],
                  default: 'other',
                },
              },
            },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const buildSide = (val) => {
      const stat = statsAgg.find((s) => s._id === val) || {};
      const topP = topPerformersAgg.find((t) => t._id === val);
      return {
        label: val,
        totalStudents: stat.totalStudents || 0,
        averageCGPA: parseFloat((stat.averageCGPA || 0).toFixed(4)),
        highestCGPA: stat.highestCGPA || 0,
        lowestCGPA: stat.lowestCGPA || 0,
        topPerformerCount: topP ? topP.topPerformerCount : 0,
        cgpaDistribution: cgpaDistAgg
          .filter((d) => d._id.side === val)
          .map((d) => ({ range: d._id.bucket, count: d.count })),
      };
    };

    const battleData = {
      type,
      a: buildSide(a),
      b: buildSide(b),
    };

    await CachedStats.findOneAndUpdate(
      { key: cacheKey },
      { data: battleData },
      { upsert: true },
    );

    return res.json({
      success: true,
      data: battleData,
      message: `${type === 'branch' ? 'Branch' : 'Year'} battle retrieved successfully`,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getStats, getBattle, resetStats };
