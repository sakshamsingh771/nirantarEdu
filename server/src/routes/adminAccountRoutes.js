const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const { authRateLimit } = require("../middleware/rateLimit");
const ctrl = require("../controllers/adminAccountController");

router.use(requireAuth, requireRole("ADMIN"));

router.get("/", ctrl.getAccount);
router.put("/profile", ctrl.updateProfile);
router.put("/id", authRateLimit, ctrl.changeAdminId);
router.post("/recovery-code", authRateLimit, ctrl.generateRecoveryCode);

module.exports = router;
