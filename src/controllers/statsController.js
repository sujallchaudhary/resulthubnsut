const Student = require('../models/Student');
const SGPA = require('../models/SGPA');
const Score = require('../models/Score');
const Department = require('../models/Department');

/**
 * GET /api/stats
 * Returns overall, department-wise, year-wise, and distribution statistics.
 */
const getStats = async (req, res, next) => {
  try {
    const [
      overallAgg,
      departmentStats,
      yearAgg,
      cgpaDistRaw,
      top10,
      semesterAvgAgg,
      gradeDistAgg,
    ] = await Promise.all([
      Student.aggregate([
        {
          $group: {
            _id: null,
            totalStudents: { $sum: 1 },
            averageCGPA: { $avg: '$cgpa' },
            highestCGPA: { $max: '$cgpa' },
            lowestCGPA: { $min: '$cgpa' },
          },
        },
      ]),

      Department.find({}, '-__v -createdAt -updatedAt').sort({ year: 1, departmentCode: 1 }).lean(),

      Student.aggregate([
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

      Student.aggregate([
        {
          $bucket: {
            groupBy: '$cgpa',
            boundaries: [0, 4, 5, 6, 7, 8, 9, 10.01],
            default: 'other',
            output: { count: { $sum: 1 } },
          },
        },
      ]),

      Student.find({}, 'rollNo name branch_code year_of_study cgpa rank percentile -_id')
        .sort({ rank: 1 })
        .limit(10)
        .lean(),

      SGPA.aggregate([
        {
          $group: {
            _id: '$semester',
            averageSGPA: { $avg: '$sgpa' },
            studentCount: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      Score.aggregate([
        {
          $group: {
            _id: '$grade',
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const overall = overallAgg[0]
      ? {
          totalStudents: overallAgg[0].totalStudents,
          averageCGPA: parseFloat((overallAgg[0].averageCGPA || 0).toFixed(4)),
          highestCGPA: overallAgg[0].highestCGPA,
          lowestCGPA: overallAgg[0].lowestCGPA,
        }
      : { totalStudents: 0, averageCGPA: 0, highestCGPA: 0, lowestCGPA: 0 };

    const cgpaDistribution = cgpaDistRaw.map((bucket) => {
      const low = bucket._id;
      const ranges = { 0: '0-4', 4: '4-5', 5: '5-6', 6: '6-7', 7: '7-8', 8: '8-9', 9: '9-10' };
      return { range: ranges[low] || String(low), count: bucket.count };
    });

    const semesterAverages = semesterAvgAgg.map((s) => ({
      semester: s._id,
      averageSGPA: parseFloat((s.averageSGPA || 0).toFixed(4)),
      studentCount: s.studentCount,
    }));

    const gradeDistribution = gradeDistAgg.reduce((acc, g) => {
      acc[g._id] = g.count;
      return acc;
    }, {});

    const yearStats = yearAgg.map((y) => ({
      year: y._id,
      totalStudents: y.totalStudents,
      averageCGPA: parseFloat((y.averageCGPA || 0).toFixed(4)),
      highestCGPA: y.highestCGPA,
      lowestCGPA: y.lowestCGPA,
    }));

    return res.json({
      success: true,
      data: {
        overall,
        departmentStats,
        yearStats,
        cgpaDistribution,
        top10Students: top10,
        semesterAverages,
        gradeDistribution,
      },
      message: 'Statistics retrieved successfully',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getStats };
