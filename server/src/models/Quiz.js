const mongoose = require("mongoose");
const { Schema } = mongoose;

const embeddedQuestionSchema = new Schema(
  {
    type: { type: String, enum: ["MCQ", "TRUE_FALSE", "FILL_BLANK", "SHORT_ANSWER"], required: true },
    text: { type: String, required: true },
    options: [{ type: String }],
    correctAnswer: { type: String, required: true },
    // Marks (1-100): validated again in the controller on every create/
    // update (both draft and publish) since Mongoose schema min/max are not
    // a substitute for a real 400 response — this is the backend half of
    // the "never save 0/negative/>100" requirement.
    marks: { type: Number, default: 1, min: 1, max: 100 },
    // Only used when the quiz's timingMode is PER_QUESTION. Ignored otherwise.
    timeLimitSeconds: { type: Number, default: 30 },
  },
  { _id: true }
);

const quizSchema = new Schema(
  {
    school: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    subject: { type: String },
    // Not required at the schema level: a DRAFT can be saved before the
    // teacher has picked a class/section. A PUBLISHED quiz still has class
    // enforced in the controller before it's ever created/updated to
    // PUBLISHED, so a real (visible-to-students) quiz always has it — only
    // an unpublished draft can be missing it. Mirrors Assignment's pattern.
    class: { type: String },
    section: { type: String },
    questions: [embeddedQuestionSchema],

    // OVERALL: one countdown for the whole quiz, using `timerMinutes`.
    // PER_QUESTION: each question uses its own `timeLimitSeconds`, and the
    // attempt auto-advances when a question's time is up.
    timingMode: { type: String, enum: ["OVERALL", "PER_QUESTION"], default: "OVERALL" },
    timerMinutes: { type: Number, default: 15 },

    // Optional scheduling window — if set, the quiz can only be started
    // between these times (checked against the SERVER clock, not the
    // student's browser). Leave both unset for "available any time".
    startTime: { type: Date },
    endTime: { type: Date },

    randomizeQuestions: { type: Boolean, default: false },
    totalMarks: { type: Number, default: 0 },
    // DRAFT: saved by the teacher, never notified to students, never
    // returned by the student-facing list. PUBLISHED: live, students
    // notified. Replaces the old `isPublished` boolean so quizzes gain the
    // same draft lifecycle Assignments already have.
    status: { type: String, enum: ["DRAFT", "PUBLISHED"], default: "PUBLISHED" },
  },
  { timestamps: true }
);

quizSchema.pre("save", function (next) {
  this.totalMarks = this.questions.reduce((sum, q) => sum + (q.marks || 0), 0);
  next();
});

module.exports = mongoose.model("Quiz", quizSchema);
