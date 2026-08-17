const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const upload = require("../middleware/upload");
const ctrl = require("../controllers/assignmentController");

router.use(requireAuth);
router.get("/drafts", requireRole("TEACHER", "ADMIN"), ctrl.listDraftAssignments);
router.get("/", ctrl.listAssignments);
router.post("/ai-generate", requireRole("TEACHER", "ADMIN"), ctrl.aiGenerateAssignment);
router.post("/", requireRole("TEACHER", "ADMIN"), upload.array("attachments", 5), ctrl.createAssignment);
router.put("/:id", requireRole("TEACHER", "ADMIN"), ctrl.updateAssignment);
router.delete("/:id", requireRole("TEACHER", "ADMIN"), ctrl.deleteAssignment);
router.post("/:id/submit", requireRole("STUDENT"), upload.single("file"), ctrl.submitAssignment);
router.get("/:id/submissions", requireRole("TEACHER", "ADMIN"), ctrl.listSubmissions);
router.put("/submissions/:id/grade", requireRole("TEACHER", "ADMIN"), ctrl.gradeSubmission);

module.exports = router;
