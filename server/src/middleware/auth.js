const jwt = require("jsonwebtoken");
const User = require("../models/User");

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Authentication required." });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Invalid or expired session." });
    }
    req.user = user; // full mongoose doc, has .school, .role
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired session." });
  }
}

// Restrict route to specific roles, e.g. requireRole("ADMIN","TEACHER")
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have permission to perform this action." });
    }
    next();
  };
}

// Ensures any :schoolId-scoped resource matches the authenticated user's school.
// Real per-record checks still happen in controllers, but this catches cross-school
// query-param / body tampering early.
function enforceSchoolScope(req, res, next) {
  const bodySchool = req.body && req.body.school;
  const querySchool = req.query && req.query.school;
  const claimed = bodySchool || querySchool;
  if (claimed && String(claimed) !== String(req.user.school)) {
    return res.status(403).json({ message: "Cross-school access is not permitted." });
  }
  next();
}

module.exports = { requireAuth, requireRole, enforceSchoolScope };
