const mongoose = require("mongoose");

const submissionSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: "Assignment", required: true, index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    answerText: { type: String },
    filePath: { type: String },
    submittedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ["SUBMITTED", "LATE", "GRADED"], default: "SUBMITTED" },
    grade: { type: Number },
    feedback: { type: String },
    // client-generated id lets us dedupe retried offline submissions
    clientOperationId: { type: String },
  },
  { timestamps: true }
);

submissionSchema.index({ assignment: 1, student: 1, clientOperationId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Submission", submissionSchema);
