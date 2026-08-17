const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { blockAiDuringActiveQuiz } = require("../middleware/quizSession");
const ctrl = require("../controllers/aiController");

router.use(requireAuth);
router.use(blockAiDuringActiveQuiz);
router.post("/chat", ctrl.chat);
router.post("/chat/stream", ctrl.chatStream);
router.post("/summarize", ctrl.summarize);
router.get("/status", ctrl.status);

module.exports = router;
