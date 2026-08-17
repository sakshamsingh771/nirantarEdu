const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const ctrl = require("../controllers/analyticsController");

router.get("/student", requireAuth, requireRole("STUDENT"), ctrl.studentAnalytics);
router.get("/teacher", requireAuth, requireRole("TEACHER", "ADMIN"), ctrl.teacherAnalytics);
router.get("/admin", requireAuth, requireRole("ADMIN"), ctrl.adminAnalytics);

module.exports = router;
