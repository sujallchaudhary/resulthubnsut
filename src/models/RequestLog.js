const mongoose = require('mongoose');

const requestLogSchema = new mongoose.Schema(
  {
    path: { type: String, required: true },
    query: { type: mongoose.Schema.Types.Mixed, default: {} },
    params: { type: mongoose.Schema.Types.Mixed, default: {} },
    statusCode: { type: Number, default: null },
  },
  { timestamps: true }
);

requestLogSchema.index({ path: 1, createdAt: -1 });

module.exports = mongoose.model('RequestLog', requestLogSchema);
