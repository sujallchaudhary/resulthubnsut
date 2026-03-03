const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    rollNo: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    branch_code: { type: String, required: true, index: true },
    cgpa: { type: Number, default: 0 },
    rank: { type: Number, default: 0 },
    credits_completed: { type: Number, default: 0 },
    percentile: { type: Number, default: 0 },
    year_of_study: { type: String, required: true, index: true },
    branch_rank: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Student', studentSchema);
