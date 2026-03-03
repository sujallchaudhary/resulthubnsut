const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema(
  {
    year: { type: String, required: true, index: true },
    departmentCode: { type: String, required: true, index: true },
    Name: { type: String, required: true },
    AverageCGPA: { type: Number, default: 0 },
    highestCGPA: { type: Number, default: 0 },
    lowestCGPA: { type: Number, default: 0 },
    medianCGPA: { type: Number, default: 0 },
    modeCGPA: { type: Number, default: 0 },
    branchSize: { type: Number, default: 0 },
  },
  { timestamps: true }
);

departmentSchema.index({ year: 1, departmentCode: 1 }, { unique: true });

module.exports = mongoose.model('Department', departmentSchema);
