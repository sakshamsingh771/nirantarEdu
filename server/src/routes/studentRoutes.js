const express = require("express");
const router = express.Router();
const { verify } = require("../controllers/studentController");

// Public — this is step 1 of registration, before any account exists.
router.get("/verify", verify);

module.exports = router;
