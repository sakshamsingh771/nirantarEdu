const QuizAttempt = require("../models/QuizAttempt");
const Submission = require("../models/Submission");
const Assignment = require("../models/Assignment");
const User = require("../models/User");
const Quiz = require("../models/Quiz");

// GET /api/analytics/student  (own performance)
async function studentAnalytics(req, res) {
  const studentId = req.user._id;
  const attempts = await QuizAttempt.find({ student: studentId, status: "COMPLETED" }).populate("quiz", "title totalMarks subject");
  const submissions = await Submission.find({ student: studentId });
  const totalAssignments = await Assignment.countDocuments({ school: req.user.school, class: req.user.class });

  const avgQuizPercent =
    attempts.length > 0
      ? Math.round(
          (attempts.reduce((sum, a) => sum + (a.totalMarks ? a.score / a.totalMarks : 0), 0) / attempts.length) * 100
        )
      : 0;

  res.json({
    quizAttempts: attempts.length,
    averageQuizScorePercent: avgQuizPercent,
    assignmentsSubmitted: submissions.length,
    assignmentsTotal: totalAssignments,
    quizHistory: attempts.map((a) => ({
      quizTitle: a.quiz?.title,
      subject: a.quiz?.subject,
      score: a.score,
      totalMarks: a.totalMarks,
      completedAt: a.completedAt,
    })),
  });
}

// GET /api/analytics/teacher?class=
async function teacherAnalytics(req, res) {
  const { class: cls } = req.query;
  const filter = { school: req.user.school };
  if (cls) filter.class = cls;

  const quizzes = await Quiz.find(filter).select("_id title");
  const quizIds = quizzes.map((q) => q._id);
  const attempts = await QuizAttempt.find({ quiz: { $in: quizIds }, status: "COMPLETED" });

  const classAveragePercent =
    attempts.length > 0
      ? Math.round(
          (attempts.reduce((sum, a) => sum + (a.totalMarks ? a.score / a.totalMarks : 0), 0) / attempts.length) * 100
        )
      : 0;

  const assignments = await Assignment.find(filter).select("_id");
  const assignmentIds = assignments.map((a) => a._id);
  const submissions = await Submission.find({ assignment: { $in: assignmentIds } });

  res.json({
    classAverageQuizPercent: classAveragePercent,
    totalQuizAttempts: attempts.length,
    totalAssignments: assignments.length,
    totalSubmissions: submissions.length,
  });
}

// GET /api/analytics/admin
async function adminAnalytics(req, res) {
  const school = req.user.school;
  const [activeStudents, activeTeachers, totalQuizAttempts, totalSubmissions] = await Promise.all([
    User.countDocuments({ school, role: "STUDENT", isActive: true }),
    User.countDocuments({ school, role: "TEACHER", isActive: true }),
    QuizAttempt.countDocuments({ school, status: "COMPLETED" }),
    Submission.countDocuments({ school }),
  ]);
  res.json({ activeStudents, activeTeachers, totalQuizAttempts, totalSubmissions });
}

module.exports = { studentAnalytics, teacherAnalytics, adminAnalytics };
