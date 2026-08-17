const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const ctrl = require("../controllers/correctionRequestController");

// Public — a student without an account yet must be able to report a
// wrong/missing record, and check on it afterwards with just the code
// they were given plus the Student ID they filed it under.
router.post("/", ctrl.create);
router.get("/track", ctrl.track);

// Authenticated — a registered student's own request history.
router.get("/my", requireAuth, ctrl.my);

module.exports = router;
