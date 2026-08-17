const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { search } = require("../controllers/searchController");

router.get("/", requireAuth, search);

module.exports = router;
