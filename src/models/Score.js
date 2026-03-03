const mongoose = require('mongoose');

const scoreSchema = new mongoose.Schema(
  {
    roll_no: { type: String, required: true, index: true },
    subject_code: { type: String, required: true },
    branch_code: { type: String, required: true, index: true },
    grade: { type: String, default: '' },
    marks: { type: Number, default: 0 },
    semester: { type: Number, required: true, index: true },
  },
  { timestamps: true }
);

scoreSchema.index({ roll_no: 1, subject_code: 1, semester: 1 }, { unique: true });

module.exports = mongoose.model('Score', scoreSchema);
