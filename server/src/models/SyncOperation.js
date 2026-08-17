const mongoose = require("mongoose");

const syncOperationSchema = new mongoose.Schema(
  {
    operationId: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    operationType: { type: String, required: true }, // e.g. "SUBMIT_ASSIGNMENT", "QUIZ_ATTEMPT"
    payload: { type: mongoose.Schema.Types.Mixed },
    status: { type: String, enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"], default: "PENDING" },
    retryCount: { type: Number, default: 0 },
    errorMessage: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SyncOperation", syncOperationSchema);
