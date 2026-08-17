const mongoose = require("mongoose");

const answerSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    answer: { type: String },
    isCorrect: { type: Boolean },
    marksAwarded: { type: Number, default: 0 },
    // When this answer was actually recorded, per the SERVER clock — used
    // to enforce PER_QUESTION timing without trusting the browser's timer.
    answeredAt: { type: Date },
    timedOut: { type: Boolean, default: false },
  },
  { _id: false }
);

const quizAttemptSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz", required: true, index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    answers: [answerSchema],
    score: { type: Number, default: 0 },
    totalMarks: { type: Number, default: 0 },
    status: { type: String, enum: ["IN_PROGRESS", "COMPLETED"], default: "IN_PROGRESS" },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    // Set when a PER_QUESTION attempt was auto-finalized because the
    // student's browser/tab disappeared mid-quiz (see quizSession.js)
    // rather than being submitted normally — surfaced to teachers in the
    // submissions view so a zero/partial score reads as "abandoned", not
    // "attempted and failed".
    abandoned: { type: Boolean, default: false },

    // Computed once at start from the quiz's own timing config, so timing
    // enforcement never has to re-read (or trust) anything from the client.
    // OVERALL mode: the whole-attempt deadline. PER_QUESTION mode: unused
    // (each question's own deadline is tracked via currentQuestionDeadline).
    expiresAt: { type: Date },

    // PER_QUESTION mode only.
    currentQuestionIndex: { type: Number, default: 0 },
    currentQuestionDeadline: { type: Date },
  },
  { timestamps: true }
);

// An attempt still shown to the student as "active" for AI-blocking and
// resume purposes, even if its clock has technically run out server-side
// but auto-submit hasn't processed it yet (see quizController.isAttemptActive).
quizAttemptSchema.index({ student: 1, status: 1 });

module.exports = mongoose.model("QuizAttempt", quizAttemptSchema);
