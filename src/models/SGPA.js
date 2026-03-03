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

module.exports = mongoose.model('SGPA', sgpaSchema);
