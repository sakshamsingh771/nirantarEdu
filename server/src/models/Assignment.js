const mongoose = require("mongoose");

// Optional structured question list — populated when the teacher generates
// (and then reviews/edits) an assignment with Nirantar AI, or adds
// questions manually. Assignments are not auto-graded like quizzes, so
// `expectedAnswer` is reference material for the teacher, not enforced by
// the server.
const assignmentQuestionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    type: { type: String, enum: ["MCQ", "TRUE_FALSE", "FILL_BLANK", "SHORT_ANSWER"], default: "SHORT_ANSWER" },
    marks: { type: Number, default: 1 },
    expectedAnswer: { type: String },
  },
  { _id: true }
);

const assignmentSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    instructions: { type: String },
    subject: { type: String },
    // Not required at the schema level: a DRAFT can be saved before the
    // teacher has picked a class/deadline. PUBLISHED assignments still have
    // these enforced in the controller before they're ever created/updated
    // to PUBLISHED, so a real (visible-to-students) assignment always has
    // them — only an unpublished draft can be missing them.
    class: { type: String },
    section: { type: String },
    questions: [assignmentQuestionSchema],
    attachments: [{ type: String }], // file paths
    deadline: { type: Date },
    maxMarks: { type: Number, default: 100, min: 5, max: 100 },
    // DRAFT: saved by the teacher, never notified to students, never
    // returned by the student-facing list. PUBLISHED: live, students notified.
    status: { type: String, enum: ["DRAFT", "PUBLISHED"], default: "PUBLISHED" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Assignment", assignmentSchema);
