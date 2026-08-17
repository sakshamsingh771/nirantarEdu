const rateLimit = require("express-rate-limit");

// Applied on top of the general /api/ limiter in server.js. Recovery-code
// and login-adjacent endpoints are the most worth slowing down against
// brute force since they verify a secret against a small guess space.
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Too many attempts. Please wait a few minutes and try again." },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { authRateLimit };
