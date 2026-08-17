const mongoose = require("mongoose");

const ISSUE_TYPES = [
  "INCORRECT_NAME",
  "INCORRECT_STUDENT_ID",
  "INCORRECT_CLASS",
  "INCORRECT_SECTION",
  "INCORRECT_SCHOOL",
  "RECORD_NOT_FOUND",
  "OTHER",
];

const STATUSES = ["pending", "under_review", "approved", "rejected", "resolved"];

/**
 * A student reports a problem with their official Student record — including
 * the case where no record could be found at all, in which case `student`
 * is left null and we keep only what the person typed (studentId/schoolCode)
 * so an admin has something to search for. Never editable by the student
 * after submission; only an admin can move it through its status lifecycle.
 */
const correctionRequestSchema = new mongoose.Schema(
  {
    requestCode: { type: String, required: true, unique: true }, // e.g. "CR-1025", shown to the student
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", index: true }, // set if schoolCode matched a real school
    schoolCodeEntered: { type: String, required: true, trim: true, uppercase: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", default: null, index: true },
    studentIdEntered: { type: String, required: true, trim: true },

    issueType: { type: String, enum: ISSUE_TYPES, required: true },
    description: { type: String, required: true, trim: true },

    status: { type: String, enum: STATUSES, default: "pending", index: true },
    adminResponse: { type: String, trim: true },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CorrectionRequest", correctionRequestSchema);
module.exports.ISSUE_TYPES = ISSUE_TYPES;
module.exports.STATUSES = STATUSES;
