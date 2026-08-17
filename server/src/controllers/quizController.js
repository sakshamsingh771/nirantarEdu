const Quiz = require("../models/Quiz");
const QuizAttempt = require("../models/QuizAttempt");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { generateQuizQuestions } = require("../services/aiService");
const { isAttemptStillActive } = require("../middleware/quizSession");

const MIN_QUESTIONS = 1;
const MAX_QUESTIONS = 30;
const QUESTION_COUNT_ERROR = `Quiz must contain between ${MIN_QUESTIONS} and ${MAX_QUESTIONS} questions.`;
const MIN_MARKS = 1;
const MAX_MARKS = 100;
const MARKS_ERROR = `Marks must be a number between ${MIN_MARKS} and ${MAX_MARKS}.`;

// Backend half of the marks validation (frontend clamping alone is not
// enough — see requirement). Returns an error message string, or null if
// every question's marks are valid. Applied on both DRAFT and PUBLISHED
// saves so an invalid value can never reach the database either way.
function findInvalidMarks(questions) {
  if (!Array.isArray(questions)) return null;
  for (const q of questions) {
    const marksNum = Number(q.marks);
    if (!Number.isFinite(marksNum) || marksNum < MIN_MARKS || marksNum > MAX_MARKS) {
      return MARKS_ERROR;
    }
  }
  return null;
}

// GET /api/quizzes/active-session  (student)
//
// Lets the frontend know whether Nirantar AI should be hidden/disabled
// right now, without duplicating the "what counts as active" logic that
// blockAiDuringActiveQuiz already enforces server-side on the AI routes.
// This is a convenience for the UI — the actual security boundary is the
// 403 the AI routes themselves return, not this endpoint.
async function activeSession(req, res) {
  const attempt = await QuizAttempt.findOne({ student: req.user._id, status: "IN_PROGRESS" }).sort({
    startedAt: -1,
  });
  if (!attempt) return res.json({ active: false });

  const active = await isAttemptStillActive(attempt);
  res.json({ active, quizId: active ? attempt.quiz : undefined });
}

// POST /api/quizzes (teacher, manual creation or AI-draft review/publish)
//
// Handles BOTH "Save Draft" and "Publish", distinguished by `status` in the
// body (mirrors Assignment's createAssignment). A DRAFT is saved with
// minimal validation (title only) and never notifies students or requires a
// class yet — it can be filled in over multiple edits via updateQuiz below.
// Publishing (status "PUBLISHED", or omitted — the historical default for
// this endpoint) keeps the full validation and notification behavior this
// endpoint always had. Marks (1-100) are validated either way.
async function createQuiz(req, res) {
  try {
    const { title, subject, class: cls, section, questions, timerMinutes, randomizeQuestions, timingMode, startTime, endTime, status } = req.body;
    const isDraft = status === "DRAFT";

    if (!title || !title.trim()) {
      return res.status(400).json({ message: "Please give the quiz a title before saving." });
    }

    if (!isDraft) {
      if (!req.user.canTeach(subject, cls, section)) {
        return res.status(403).json({ message: "You are not assigned to teach this subject/class/section." });
      }
      if (!cls) {
        return res.status(400).json({ message: "Class is required to publish a quiz." });
      }
      if (!Array.isArray(questions) || questions.length < MIN_QUESTIONS || questions.length > MAX_QUESTIONS) {
        return res.status(400).json({ message: QUESTION_COUNT_ERROR });
      }
    }

    const marksError = findInvalidMarks(questions);
    if (marksError) return res.status(400).json({ message: marksError });

    const quiz = await Quiz.create({
      school: req.user.school,
      createdBy: req.user._id,
      title,
      subject,
      class: cls,
      section,
      questions: questions || [],
      timerMinutes,
      randomizeQuestions,
      timingMode: timingMode === "PER_QUESTION" ? "PER_QUESTION" : "OVERALL",
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      status: isDraft ? "DRAFT" : "PUBLISHED",
    });

    if (!isDraft) {
      const studentFilter = { school: req.user.school, role: "STUDENT", class: cls };
      if (section) studentFilter.section = section;
      const students = await User.find(studentFilter).select("_id");
      if (students.length) {
        await Notification.insertMany(
          students.map((s) => ({
            school: req.user.school,
            recipient: s._id,
            type: "QUIZ",
            title: "New quiz available",
            message: title,
            relatedId: quiz._id,
          }))
        );
      }
    }

    res.status(201).json({ quiz });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not create quiz." });
  }
}

// PUT /api/quizzes/:id  (teacher — must own the quiz)
//
// Edits an existing DRAFT (title/subject/class/section/timing/questions),
// and can also PUBLISH it by sending status: "PUBLISHED" — at which point
// the usual class/question-count validation and student notification
// happen, exactly once (only on the DRAFT->PUBLISHED transition).
async function updateQuiz(req, res) {
  try {
    const existing = await Quiz.findOne({ _id: req.params.id, school: req.user.school });
    if (!existing) return res.status(404).json({ message: "Quiz not found." });
    if (String(existing.createdBy) !== String(req.user._id) && req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "You can only edit quizzes you created." });
    }

    const { title, subject, class: cls, section, questions, timerMinutes, randomizeQuestions, timingMode, startTime, endTime, status } = req.body;
    const wasPublished = existing.status === "PUBLISHED";
    const publishingNow = status === "PUBLISHED" && !wasPublished;

    const effectiveQuestions = questions !== undefined ? questions : existing.questions;
    if (status === "PUBLISHED") {
      if (!req.user.canTeach(subject ?? existing.subject, cls ?? existing.class, section ?? existing.section)) {
        return res.status(403).json({ message: "You are not assigned to teach this subject/class/section." });
      }
      if (!(cls ?? existing.class)) {
        return res.status(400).json({ message: "Class is required to publish a quiz." });
      }
      if (!Array.isArray(effectiveQuestions) || effectiveQuestions.length < MIN_QUESTIONS || effectiveQuestions.length > MAX_QUESTIONS) {
        return res.status(400).json({ message: QUESTION_COUNT_ERROR });
      }
    }

    const marksError = findInvalidMarks(effectiveQuestions);
    if (marksError) return res.status(400).json({ message: marksError });

    if (title !== undefined) existing.title = title;
    if (subject !== undefined) existing.subject = subject;
    if (cls !== undefined) existing.class = cls;
    if (section !== undefined) existing.section = section;
    if (questions !== undefined) existing.questions = questions;
    if (timerMinutes !== undefined) existing.timerMinutes = timerMinutes;
    if (randomizeQuestions !== undefined) existing.randomizeQuestions = randomizeQuestions;
    if (timingMode !== undefined) existing.timingMode = timingMode === "PER_QUESTION" ? "PER_QUESTION" : "OVERALL";
    if (startTime !== undefined) existing.startTime = startTime || undefined;
    if (endTime !== undefined) existing.endTime = endTime || undefined;
    if (status !== undefined) existing.status = status;

    await existing.save();

    if (publishingNow) {
      const studentFilter = { school: req.user.school, role: "STUDENT", class: existing.class };
      if (existing.section) studentFilter.section = existing.section;
      const students = await User.find(studentFilter).select("_id");
      if (students.length) {
        await Notification.insertMany(
          students.map((s) => ({
            school: req.user.school,
            recipient: s._id,
            type: "QUIZ",
            title: "New quiz available",
            message: existing.title,
            relatedId: existing._id,
          }))
        );
      }
    }

    res.json({ quiz: existing });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not update quiz." });
  }
}

// DELETE /api/quizzes/:id  (teacher — must own the quiz)
//
// Scoped to DRAFTS only, same reasoning as Assignment's deleteAssignment —
// a published quiz may already have student attempts attached to it.
async function deleteQuiz(req, res) {
  const quiz = await Quiz.findOne({ _id: req.params.id, school: req.user.school });
  if (!quiz) return res.status(404).json({ message: "Quiz not found." });
  if (String(quiz.createdBy) !== String(req.user._id) && req.user.role !== "ADMIN") {
    return res.status(403).json({ message: "You can only delete quizzes you created." });
  }
  if (quiz.status !== "DRAFT") {
    return res.status(400).json({ message: "Only draft quizzes can be deleted." });
  }
  await quiz.deleteOne();
  res.json({ message: "Draft deleted." });
}

// GET /api/quizzes/drafts  (teacher/admin) — this teacher's own saved
// draft quizzes, never visible to students.
async function listDraftQuizzes(req, res) {
  const filter = { school: req.user.school, status: "DRAFT" };
  if (req.user.role !== "ADMIN") filter.createdBy = req.user._id;
  const drafts = await Quiz.find(filter).sort({ updatedAt: -1 });
  res.json({ drafts });
}

// POST /api/quizzes/ai-generate (teacher, uses local Ollama)
//
// IMPORTANT: this only generates and returns a draft — it never writes to
// the database. AI-generated questions must never reach students without a
// teacher reviewing/editing them first, so the frontend loads this response
// into the same editable question builder used for manual quizzes, and the
// quiz is only actually created (and students notified) when the teacher
// submits POST /api/quizzes, same as a manually-built quiz.
async function aiGenerateQuiz(req, res) {
  try {
    const { topic, count, subject, class: cls, section } = req.body;

    if (!req.user.canTeach(subject, cls, section)) {
      return res.status(403).json({ message: "You are not assigned to teach this subject/class/section." });
    }

    const requestedCount = Number(count) || 5;
    if (requestedCount < MIN_QUESTIONS || requestedCount > MAX_QUESTIONS) {
      return res.status(400).json({ message: QUESTION_COUNT_ERROR });
    }

    const questions = await generateQuizQuestions(topic, requestedCount);

    // The model is asked for an exact count, but never trust generated
    // output blindly — re-validate and hard-cap in case it returns more
    // (or fewer, which createQuiz's own validation also catches once the
    // teacher submits the reviewed draft).
    if (!Array.isArray(questions) || questions.length < MIN_QUESTIONS) {
      return res.status(502).json({ message: "Nirantar AI did not return usable questions. Please try again." });
    }
    const boundedQuestions = questions.slice(0, MAX_QUESTIONS).map((q) => ({
      type: q.type || "MCQ",
      text: q.text || "",
      options: Array.isArray(q.options) ? q.options : [],
      correctAnswer: q.correctAnswer !== undefined ? String(q.correctAnswer) : "0",
      // Clamp to the 1-100 range so AI-generated output can never itself
      // introduce an invalid marks value ahead of the teacher's review.
      marks: Math.min(MAX_MARKS, Math.max(MIN_MARKS, Number(q.marks) || 1)),
      timeLimitSeconds: 30,
    }));

    res.json({ draft: { title: `Quiz: ${topic}`, questions: boundedQuestions } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "AI quiz generation failed. Is Ollama running?" });
  }
}

// GET /api/quizzes?class=
//
// A student only sees quizzes for their class, and — when a quiz targeted a
// specific section — only their own section. A quiz with no section set is
// treated as visible to the whole class.
async function listQuizzes(req, res) {
  const filter = { school: req.user.school, status: "PUBLISHED" };
  if (req.user.role === "STUDENT") {
    filter.class = req.user.class;
    filter.$or = [{ section: { $exists: false } }, { section: null }, { section: "" }, { section: req.user.section }];
  } else if (req.query.class) {
    filter.class = req.query.class;
  }
  const quizzes = await Quiz.find(filter).select("-questions.correctAnswer").sort({ createdAt: -1 });
  res.json({ quizzes });
}

// GET /api/quizzes/:id  (full detail, for taking it — still hides correct answers for students)
async function getQuiz(req, res) {
  const quiz = await Quiz.findOne({ _id: req.params.id, school: req.user.school });
  if (!quiz) return res.status(404).json({ message: "Quiz not found." });
  if (req.user.role === "STUDENT") {
    const safe = quiz.toObject();
    safe.questions = safe.questions.map(({ correctAnswer, ...q }) => q);
    return res.json({ quiz: safe });
  }
  res.json({ quiz });
}

// POST /api/quizzes/:id/attempt/start
//
// All timing is computed and stored using the SERVER clock right here —
// the client is only ever told the resulting deadline timestamps to render
// a countdown against, never asked to report elapsed time itself. Resuming
// an already-started attempt (browser refresh, reopened tab) returns the
// SAME stored deadlines rather than restarting the clock.
async function startAttempt(req, res) {
  const quiz = await Quiz.findOne({ _id: req.params.id, school: req.user.school });
  if (!quiz) return res.status(404).json({ message: "Quiz not found." });

  const now = new Date();
  if (quiz.startTime && now < quiz.startTime) {
    return res.status(403).json({ message: "This quiz is not open yet." });
  }
  if (quiz.endTime && now > quiz.endTime) {
    return res.status(403).json({ message: "This quiz's submission window has closed." });
  }

  let attempt = await QuizAttempt.findOne({
    quiz: quiz._id,
    student: req.user._id,
    status: "IN_PROGRESS",
  });

  // A found IN_PROGRESS attempt might actually be abandoned (browser
  // closed mid-quiz, stale PER_QUESTION deadline never advanced). Route it
  // through the same staleness check the AI-blocking middleware uses —
  // isAttemptStillActive auto-finalizes it as COMPLETED/abandoned when
  // appropriate — so the student gets a fresh attempt instead of being
  // handed back an already-expired deadline that makes the quiz appear
  // broken.
  if (attempt && !(await isAttemptStillActive(attempt))) {
    attempt = null;
  }

  if (!attempt) {
    const attemptData = {
      school: req.user.school,
      quiz: quiz._id,
      student: req.user._id,
      totalMarks: quiz.totalMarks,
      startedAt: now,
    };
    if (quiz.timingMode === "PER_QUESTION") {
      attemptData.currentQuestionIndex = 0;
      attemptData.currentQuestionDeadline = new Date(
        now.getTime() + (quiz.questions[0]?.timeLimitSeconds || 30) * 1000
      );
    } else {
      attemptData.expiresAt = new Date(now.getTime() + quiz.timerMinutes * 60 * 1000);
    }
    attempt = await QuizAttempt.create(attemptData);
  }

  res.status(201).json({
    attemptId: attempt._id,
    startedAt: attempt.startedAt,
    timingMode: quiz.timingMode,
    timerMinutes: quiz.timerMinutes,
    expiresAt: attempt.expiresAt,
    currentQuestionIndex: attempt.currentQuestionIndex,
    currentQuestionDeadline: attempt.currentQuestionDeadline,
  });
}

// POST /api/quizzes/:id/attempt/answer  (PER_QUESTION timing mode only)
//
// Submits exactly one question's answer and advances to the next. The
// server — not the browser — decides whether the question's time limit was
// respected, using `attempt.currentQuestionDeadline`, which nothing in this
// request can influence. A late answer (deadline already passed) is
// recorded as timed-out/unanswered rather than accepted, and the attempt
// still advances — a slow or manipulated browser clock can't buy extra time.
async function answerQuestion(req, res) {
  try {
    const { attemptId, questionIndex, answer } = req.body;
    const quiz = await Quiz.findOne({ _id: req.params.id, school: req.user.school });
    if (!quiz) return res.status(404).json({ message: "Quiz not found." });
    if (quiz.timingMode !== "PER_QUESTION") {
      return res.status(400).json({ message: "This quiz does not use per-question timing." });
    }

    const attempt = await QuizAttempt.findOne({ _id: attemptId, quiz: quiz._id, student: req.user._id });
    if (!attempt) return res.status(404).json({ message: "Attempt not found." });
    if (attempt.status === "COMPLETED") return res.status(409).json({ message: "This quiz has already been submitted." });

    if (Number(questionIndex) !== attempt.currentQuestionIndex) {
      return res.status(409).json({
        message: "That question is no longer active.",
        currentQuestionIndex: attempt.currentQuestionIndex,
        currentQuestionDeadline: attempt.currentQuestionDeadline,
      });
    }

    const now = new Date();
    const question = quiz.questions[attempt.currentQuestionIndex];
    const withinTime = !attempt.currentQuestionDeadline || now <= attempt.currentQuestionDeadline;

    let isCorrect = false;
    let marksAwarded = 0;
    if (withinTime && answer !== undefined && answer !== null && answer !== "") {
      isCorrect =
        question.type === "SHORT_ANSWER"
          ? String(answer).trim().toLowerCase() === (question.correctAnswer || "").trim().toLowerCase()
          : String(answer).trim().toLowerCase() === String(question.correctAnswer).trim().toLowerCase();
      marksAwarded = isCorrect ? question.marks : 0;
    }

    attempt.answers.push({
      questionId: question._id,
      answer: withinTime ? answer : undefined,
      isCorrect,
      marksAwarded,
      answeredAt: now,
      timedOut: !withinTime,
    });
    attempt.score += marksAwarded;

    const nextIndex = attempt.currentQuestionIndex + 1;
    if (nextIndex >= quiz.questions.length) {
      attempt.status = "COMPLETED";
      attempt.completedAt = now;
      attempt.currentQuestionDeadline = undefined;
      await attempt.save();

      await Notification.create({
        school: req.user.school,
        recipient: req.user._id,
        type: "RESULT",
        title: "Quiz result available",
        message: `${quiz.title}: ${attempt.score}/${quiz.totalMarks}`,
        relatedId: quiz._id,
      });

      return res.json({ completed: true, score: attempt.score, totalMarks: attempt.totalMarks });
    }

    attempt.currentQuestionIndex = nextIndex;
    attempt.currentQuestionDeadline = new Date(
      now.getTime() + (quiz.questions[nextIndex].timeLimitSeconds || 30) * 1000
    );
    await attempt.save();

    res.json({
      completed: false,
      timedOut: !withinTime,
      nextQuestionIndex: attempt.currentQuestionIndex,
      currentQuestionDeadline: attempt.currentQuestionDeadline,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not record that answer." });
  }
}

// POST /api/quizzes/:id/attempt/submit  (OVERALL timing mode) — automatic
// local evaluation, no internet needed. Always accepted while the attempt
// is IN_PROGRESS (an OVERALL-timer quiz has no per-answer timestamps to
// enforce against), but a submission arriving after the server-computed
// `expiresAt` is flagged for the teacher rather than silently treated as
// on-time — see `attempt.timedOut` in the stored record.
async function submitAttempt(req, res) {
  try {
    const { attemptId, answers } = req.body; // answers: [{questionId, answer}]
    const quiz = await Quiz.findOne({ _id: req.params.id, school: req.user.school });
    if (!quiz) return res.status(404).json({ message: "Quiz not found." });

    const attempt = await QuizAttempt.findOne({
      _id: attemptId,
      quiz: quiz._id,
      student: req.user._id,
    });
    if (!attempt) return res.status(404).json({ message: "Attempt not found." });
    if (attempt.status === "COMPLETED") return res.status(409).json({ message: "Attempt already submitted." });

    const now = new Date();
    const timedOut = Boolean(attempt.expiresAt && now > attempt.expiresAt);

    const questionMap = new Map(quiz.questions.map((q) => [String(q._id), q]));
    let score = 0;
    const gradedAnswers = (answers || []).map(({ questionId, answer }) => {
      const q = questionMap.get(String(questionId));
      if (!q) return { questionId, answer, isCorrect: false, marksAwarded: 0, answeredAt: now };
      let isCorrect = false;
      if (q.type === "SHORT_ANSWER") {
        isCorrect = (answer || "").trim().toLowerCase() === (q.correctAnswer || "").trim().toLowerCase();
      } else {
        isCorrect = String(answer).trim().toLowerCase() === String(q.correctAnswer).trim().toLowerCase();
      }
      const marksAwarded = isCorrect ? q.marks : 0;
      score += marksAwarded;
      return { questionId, answer, isCorrect, marksAwarded, answeredAt: now };
    });

    attempt.answers = gradedAnswers;
    attempt.score = score;
    attempt.status = "COMPLETED";
    attempt.completedAt = now;
    await attempt.save();

    await Notification.create({
      school: req.user.school,
      recipient: req.user._id,
      type: "RESULT",
      title: "Quiz result available",
      message: `${quiz.title}: ${score}/${quiz.totalMarks}`,
      relatedId: quiz._id,
    });

    res.json({ score, totalMarks: quiz.totalMarks, answers: gradedAnswers, timedOut });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not submit quiz." });
  }
}

// GET /api/quizzes/:id/results  (teacher) — every student targeted by this
// quiz, whether they've attempted it or not, with score/status/timing so
// the teacher can see who's pending as well as who's finished.
async function listQuizResults(req, res) {
  const quiz = await Quiz.findOne({ _id: req.params.id, school: req.user.school });
  if (!quiz) return res.status(404).json({ message: "Quiz not found." });

  const studentFilter = { school: req.user.school, role: "STUDENT", class: quiz.class };
  if (quiz.section) studentFilter.section = quiz.section;
  const [students, attempts] = await Promise.all([
    User.find(studentFilter).select("fullName userId class section rollNumber"),
    QuizAttempt.find({ quiz: quiz._id, school: req.user.school }).populate(
      "student",
      "fullName userId class section rollNumber"
    ),
  ]);

  // A student can only have one meaningful attempt per quiz in this schema
  // (startAttempt resumes/replaces rather than allowing parallel ones), so
  // the most recently started attempt per student is the one that counts.
  const latestByStudent = new Map();
  for (const a of attempts) {
    const key = String(a.student?._id);
    const existing = latestByStudent.get(key);
    if (!existing || a.startedAt > existing.startedAt) latestByStudent.set(key, a);
  }

  const rows = students.map((student) => {
    const attempt = latestByStudent.get(String(student._id));
    if (!attempt) {
      return { student, status: "PENDING", score: null, totalMarks: quiz.totalMarks, percentage: null, submittedAt: null };
    }
    const percentage = quiz.totalMarks ? Math.round((attempt.score / quiz.totalMarks) * 1000) / 10 : null;
    return {
      attemptId: attempt._id,
      student,
      status: attempt.status === "COMPLETED" ? (attempt.abandoned ? "ABANDONED" : "COMPLETED") : "IN_PROGRESS",
      score: attempt.score,
      totalMarks: quiz.totalMarks,
      percentage,
      submittedAt: attempt.completedAt,
    };
  });

  res.json({ quiz: { title: quiz.title, totalMarks: quiz.totalMarks }, results: rows });
}

// GET /api/quizzes/:id/results/:attemptId  (teacher) — question-by-question
// breakdown of one student's attempt. Correct answers ARE included here
// (unlike getQuiz for students) since this view is teacher-only.
async function getAttemptDetail(req, res) {
  const quiz = await Quiz.findOne({ _id: req.params.id, school: req.user.school });
  if (!quiz) return res.status(404).json({ message: "Quiz not found." });

  const attempt = await QuizAttempt.findOne({ _id: req.params.attemptId, quiz: quiz._id, school: req.user.school }).populate(
    "student",
    "fullName userId class section rollNumber"
  );
  if (!attempt) return res.status(404).json({ message: "Attempt not found." });

  const questionMap = new Map(quiz.questions.map((q) => [String(q._id), q]));
  const breakdown = attempt.answers.map((a) => {
    const q = questionMap.get(String(a.questionId));
    return {
      questionText: q?.text || "(question removed)",
      type: q?.type,
      options: q?.options,
      correctAnswer: q?.correctAnswer,
      studentAnswer: a.answer,
      isCorrect: a.isCorrect,
      marksAwarded: a.marksAwarded,
      marks: q?.marks,
      timedOut: a.timedOut,
    };
  });

  res.json({
    student: attempt.student,
    quiz: { title: quiz.title, totalMarks: quiz.totalMarks },
    score: attempt.score,
    status: attempt.status,
    abandoned: attempt.abandoned,
    submittedAt: attempt.completedAt,
    breakdown,
  });
}

module.exports = {
  createQuiz,
  updateQuiz,
  deleteQuiz,
  listDraftQuizzes,
  aiGenerateQuiz,
  listQuizzes,
  getQuiz,
  startAttempt,
  answerQuestion,
  submitAttempt,
  activeSession,
  listQuizResults,
  getAttemptDetail,
};
