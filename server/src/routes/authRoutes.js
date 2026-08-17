const express = require("express");
const router = express.Router();
const { register, login, logout, changePassword, me, adminForgotPassword } = require("../controllers/authController");
const { requireAuth } = require("../middleware/auth");
const { authRateLimit } = require("../middleware/rateLimit");

router.post("/register", register);
router.post("/login", login);
router.post("/logout", requireAuth, logout);
router.post("/change-password", requireAuth, changePassword);
router.get("/me", requireAuth, me);

// Rate-limited more tightly than the general API limiter — this is an
// unauthenticated endpoint that verifies a secret code, so it's the one
// place in the app most worth slowing down against brute force.
router.post("/admin/forgot-password", authRateLimit, adminForgotPassword);

module.exports = router;
