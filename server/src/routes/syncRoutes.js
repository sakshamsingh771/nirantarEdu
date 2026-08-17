const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const ctrl = require("../controllers/syncController");

router.use(requireAuth);
router.get("/status", ctrl.status);
router.post("/", ctrl.sync);

module.exports = router;
