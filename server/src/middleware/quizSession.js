const QuizAttempt = require("../models/QuizAttempt");
const Quiz = require("../models/Quiz");

/**
 * Mandatory requirement: a student must not be able to use Nirantar AI while
 * a quiz is in progress, even by calling /api/ai/* directly from devtools.
 * This is enforced here, server-side, on every AI route — hiding the UI tab
 * is a nice-to-have, this is the actual boundary.
 *
 * "Active" is derived from server state (QuizAttempt.status === IN_PROGRESS
 * AND the server-computed deadline hasn't passed), never from anything the
 * client claims. Only applies to students — teachers/admins are never
 * blocked, since they aren't the ones taking the quiz.
 */
async function blockAiDuringActiveQuiz(req, res, next) {
  if (req.user.role !== "STUDENT") return next();

  const attempt = await QuizAttempt.findOne({ student: req.user._id, status: "IN_PROGRESS" }).sort({
    startedAt: -1,
  });
  if (!attempt) return next();

  const active = await isAttemptStillActive(attempt);
  if (!active) return next(); // clock ran out server-side; treat as no longer blocking

  return res.status(403).json({
    message: "AI assistance is unavailable during an active quiz.",
    activeQuiz: true,
  });
}

// Grace window after a PER_QUESTION deadline passes with no further answer
// submitted. Covers normal in-flight latency (the student's answer is still
// travelling to the server); anything older than this means the browser/tab
// was actually abandoned (closed, crashed, lost connection) mid-question.
const ABANDONED_GRACE_MS = 2 * 60 * 1000;

// Shared with quizController so both places agree on what "still active" means.
async function isAttemptStillActive(attempt) {
  const now = new Date();
  if (attempt.expiresAt) return now < attempt.expiresAt; // OVERALL mode
  if (attempt.currentQuestionDeadline) {
    // PER_QUESTION mode: the attempt is "active" even between questions —
    // per-question timeout just advances the question, it doesn't end the
    // quiz session (see quizController.answerQuestion).
    //
    // BUT if the deadline for the current question passed well beyond a
    // normal network round-trip and nothing has advanced the attempt since,
    // the student's browser/tab is gone (closed, crashed, disconnected) —
    // not merely "between questions". Without this check the attempt sits
    // in IN_PROGRESS forever, which permanently blocks that student from
    // Nirantar AI (blockAiDuringActiveQuiz always finds this as their most
    // recent IN_PROGRESS attempt) and leaves stale/expired deadlines being
    // handed back if they try to resume. Auto-finalize it as abandoned so
    // the student is unblocked and any un-answered questions are recorded
    // as timed-out rather than leaving the record IN_PROGRESS indefinitely.
    if (now.getTime() - attempt.currentQuestionDeadline.getTime() > ABANDONED_GRACE_MS) {
      await finalizeAbandonedAttempt(attempt);
      return false;
    }

    const quiz = await Quiz.findById(attempt.quiz).select("questions timingMode");
    if (!quiz) return false;
    return attempt.currentQuestionIndex < quiz.questions.length;
  }
  return true; // no deadline computed (shouldn't normally happen) — fail safe to "active"
}

// Marks an abandoned PER_QUESTION attempt COMPLETED (remaining questions
// recorded as unanswered/timed-out) so it stops being treated as an active
// session anywhere — AI blocking, resume, and teacher submission views all
// key off `status`, so this one write fixes all three.
async function finalizeAbandonedAttempt(attempt) {
  const fresh = await QuizAttempt.findOne({ _id: attempt._id, status: "IN_PROGRESS" });
  if (!fresh) return; // already finalized by a concurrent request
  fresh.status = "COMPLETED";
  fresh.completedAt = new Date();
  fresh.currentQuestionDeadline = undefined;
  fresh.abandoned = true;
  await fresh.save();
}

module.exports = { blockAiDuringActiveQuiz, isAttemptStillActive };
