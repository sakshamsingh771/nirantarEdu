const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Student = require("../models/Student");
const School = require("../models/School");
const AuditLog = require("../models/AuditLog");

function signToken(user) {
  return jwt.sign({ userId: user._id, role: user.role, school: user.school }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

// POST /api/auth/register  (students only)
//
// Registration is no longer "pick any school/class/section and create an
// account" — it succeeds only against a pre-existing, not-yet-registered
// Student record that the school's admin created. The frontend calls
// GET /api/students/verify first to show the student their record, but this
// endpoint re-verifies everything itself: the frontend check is a UX step,
// never the actual authorization boundary.
async function register(req, res) {
  try {
    const { schoolCode, studentId, password } = req.body;

    if (!schoolCode || !studentId || !password) {
      return res.status(400).json({ message: "Student ID, School Code and password are required." });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters." });
    }

    const school = await School.findOne({ schoolCode: schoolCode.trim().toUpperCase(), isActive: true });
    if (!school) {
      return res.status(404).json({ message: "Student record not found. Please verify your Student ID and School Code." });
    }

    const student = await Student.findOne({ school: school._id, studentId: studentId.trim() });
    if (!student) {
      return res.status(404).json({ message: "Student record not found. Please verify your Student ID and School Code." });
    }
    if (student.isRegistered) {
      return res.status(409).json({ message: "This student account is already registered. Please login instead." });
    }

    // Defensive: a User could in principle exist without the Student flag
    // being set (e.g. a retried request); treat that as already-registered
    // too rather than creating a duplicate account.
    const existingUser = await User.findOne({ school: school._id, userId: student.studentId });
    if (existingUser) {
      student.isRegistered = true;
      student.registeredUser = existingUser._id;
      await student.save();
      return res.status(409).json({ message: "This student account is already registered. Please login instead." });
    }

    const user = new User({
      school: school._id,
      role: "STUDENT",
      userId: student.studentId,
      fullName: student.fullName,
      student: student._id,
      class: student.class,
      section: student.section,
      rollNumber: student.rollNumber,
    });
    await user.setPassword(password);
    await user.save();

    student.isRegistered = true;
    student.registeredUser = user._id;
    student.registeredAt = new Date();
    await student.save();

    await AuditLog.create({ school: school._id, actor: user._id, action: "REGISTER" });

    const token = signToken(user);
    res.status(201).json({ token, user: user.toSafeJSON() });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "This student account is already registered. Please login instead." });
    }
    console.error(err);
    res.status(500).json({ message: "Registration failed." });
  }
}

// POST /api/auth/login
async function login(req, res) {
  try {
    const { schoolCode, userId, password } = req.body;
    if (!schoolCode || !userId || !password) {
      return res.status(400).json({ message: "School code, ID and password are required." });
    }

    const school = await School.findOne({ schoolCode: schoolCode.trim().toUpperCase(), isActive: true });
    if (!school) return res.status(400).json({ message: "Invalid school code." });

    const user = await User.findOne({ school: school._id, userId: userId.trim(), isActive: true });
    if (!user) return res.status(401).json({ message: "Invalid credentials." });

    const valid = await user.comparePassword(password);
    if (!valid) return res.status(401).json({ message: "Invalid credentials." });

    user.lastLoginAt = new Date();
    await user.save();

    await AuditLog.create({ school: school._id, actor: user._id, action: "LOGIN" });

    const token = signToken(user);
    res.json({ token, user: user.toSafeJSON() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Login failed." });
  }
}

// POST /api/auth/logout  (stateless JWT — client discards token; logged for audit)
async function logout(req, res) {
  if (req.user) {
    await AuditLog.create({ school: req.user.school, actor: req.user._id, action: "LOGOUT" });
  }
  res.json({ message: "Logged out." });
}

// POST /api/auth/change-password
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new password are required." });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: "New password must be at least 8 characters." });
    }
    const user = await User.findById(req.user._id);
    const valid = await user.comparePassword(currentPassword);
    if (!valid) return res.status(401).json({ message: "Current password is incorrect." });

    await user.setPassword(newPassword);
    await user.save();
    res.json({ message: "Password changed successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not change password." });
  }
}

// GET /api/auth/me
async function me(req, res) {
  res.json({ user: req.user.toSafeJSON() });
}

// POST /api/auth/admin/forgot-password  (public — no session required)
// body: { schoolCode, adminId, recoveryCode, newPassword, confirmNewPassword }
//
// The only unauthenticated way to reset an Admin's password. It never
// retrieves or reveals the old password — this overwrites the hash, same as
// changePassword does, just gated by the recovery code instead of the old
// password (which is exactly the scenario this flow exists for: the old
// password is the thing that's lost). Messages stay generic on failure so
// this can't be used to enumerate which Admin IDs or recovery codes exist.
async function adminForgotPassword(req, res) {
  try {
    const { schoolCode, adminId, recoveryCode, newPassword, confirmNewPassword } = req.body;
    if (!schoolCode || !adminId || !recoveryCode || !newPassword || !confirmNewPassword) {
      return res.status(400).json({ message: "All fields are required." });
    }
    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({ message: "New password and confirmation do not match." });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters." });
    }

    const school = await School.findOne({ schoolCode: schoolCode.trim().toUpperCase(), isActive: true });
    const genericError = { message: "Recovery details could not be verified." };
    if (!school) return res.status(400).json(genericError);

    const admin = await User.findOne({ school: school._id, userId: adminId.trim(), role: "ADMIN" }).select(
      "+recoveryCodeHash"
    );
    if (!admin || !admin.recoveryCodeHash) return res.status(400).json(genericError);

    const validCode = await admin.compareRecoveryCode(recoveryCode.trim());
    if (!validCode) return res.status(400).json(genericError);

    await admin.setPassword(newPassword);
    // Single-use by design: a recovery code that resets a password stays
    // valid for future resets is a standing risk if it was ever written
    // down somewhere insecure. The admin generates a fresh one from their
    // (now-working) account afterwards.
    admin.recoveryCodeHash = undefined;
    admin.recoveryCodeSetAt = undefined;
    await admin.save();

    await AuditLog.create({ school: school._id, actor: admin._id, action: "PASSWORD_RESET_VIA_RECOVERY_CODE" });

    res.json({ message: "Password reset successfully. You can now log in with your new password." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not reset password." });
  }
}

module.exports = { register, login, logout, changePassword, me, adminForgotPassword };
