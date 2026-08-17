const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const ctrl = require("../controllers/notificationController");

router.use(requireAuth);
router.get("/", ctrl.listNotifications);
router.put("/:id/read", ctrl.markRead);

module.exports = router;
