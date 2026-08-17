const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const { getConfig, regenerateSchoolCode } = require("../controllers/schoolController");

router.get("/config", requireAuth, getConfig);
router.post("/regenerate-code", requireAuth, requireRole("ADMIN"), regenerateSchoolCode);

module.exports = router;
