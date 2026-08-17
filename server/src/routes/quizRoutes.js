const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const ctrl = require("../controllers/quizController");

router.use(requireAuth);
router.get("/", ctrl.listQuizzes);
router.get("/drafts", requireRole("TEACHER", "ADMIN"), ctrl.listDraftQuizzes);
router.get("/active-session", requireRole("STUDENT"), ctrl.activeSession);
router.get("/:id", ctrl.getQuiz);
router.post("/", requireRole("TEACHER", "ADMIN"), ctrl.createQuiz);
router.put("/:id", requireRole("TEACHER", "ADMIN"), ctrl.updateQuiz);
router.delete("/:id", requireRole("TEACHER", "ADMIN"), ctrl.deleteQuiz);
router.post("/ai-generate", requireRole("TEACHER", "ADMIN"), ctrl.aiGenerateQuiz);
router.post("/:id/attempt/start", requireRole("STUDENT"), ctrl.startAttempt);
router.post("/:id/attempt/answer", requireRole("STUDENT"), ctrl.answerQuestion);
router.post("/:id/attempt/submit", requireRole("STUDENT"), ctrl.submitAttempt);
router.get("/:id/results", requireRole("TEACHER", "ADMIN"), ctrl.listQuizResults);
router.get("/:id/results/:attemptId", requireRole("TEACHER", "ADMIN"), ctrl.getAttemptDetail);

module.exports = router;
