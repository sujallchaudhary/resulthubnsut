const mongoose = require('mongoose');

const sgpaSchema = new mongoose.Schema(
  {
    roll_no: { type: String, required: true, index: true },
    semester: { type: Number, required: true },
    sgpa: { type: Number, default: 0 },
    credits_registered: { type: Number, default: 0 },
    credits_secured: { type: Number, default: 0 },
  },
  { timestamps: true }
);

sgpaSchema.index({ roll_no: 1, semester: 1 }, { unique: true });
// For twins: bulk lookup by multiple roll_nos filtered to specific semesters
sgpaSchema.index({ semester: 1, roll_no: 1, sgpa: 1 });

module.exports = mongoose.model('SGPA', sgpaSchema);
