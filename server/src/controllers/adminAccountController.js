const crypto = require("crypto");
const User = require("../models/User");
const School = require("../models/School");
const AuditLog = require("../models/AuditLog");

const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid transcription errors

function randomRecoveryGroup(length) {
  let out = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    out += RECOVERY_CODE_ALPHABET[bytes[i] % RECOVERY_CODE_ALPHABET.length];
  }
  return out;
}

// Cryptographically-random, e.g. "NED-7K4P-92MX" — the school-code prefix
// makes a lost paper copy at least identifiable, without revealing anything
// secret. Never hard-coded; generated fresh every time this is called.
function generateRecoveryCodePlaintext(schoolCode) {
  const prefix = (schoolCode || "SCH").split("-")[0].slice(0, 3).toUpperCase();
  return `${prefix}-${randomRecoveryGroup(4)}-${randomRecoveryGroup(4)}`;
}

// GET /api/admin/account
async function getAccount(req, res) {
  const [admin, school] = await Promise.all([
    User.findById(req.user._id).select("+recoveryCodeHash"),
    School.findById(req.user.school),
  ]);
  res.json({
    adminName: admin.fullName,
    adminId: admin.userId,
    role: admin.role,
    school: school?.name,
    schoolCode: school?.schoolCode,
    passwordStatus: "set", // never more detail than this — no hash, no age, nothing password-derived
    recoveryCode: {
      configured: Boolean(admin.recoveryCodeHash),
      setAt: admin.recoveryCodeSetAt || null,
    },
  });
}

// PUT /api/admin/account/id
// body: { newAdminId, currentPassword }
async function changeAdminId(req, res) {
  try {
    const { newAdminId, currentPassword } = req.body;
    if (!newAdminId || !currentPassword) {
      return res.status(400).json({ message: "New Admin ID and your current password are required." });
    }
    const cleanId = newAdminId.trim();
    if (!/^[A-Za-z0-9_-]{3,32}$/.test(cleanId)) {
      return res.status(400).json({ message: "Admin ID must be 3-32 characters (letters, numbers, - or _)." });
    }

    const admin = await User.findById(req.user._id);
    const valid = await admin.comparePassword(currentPassword);
    if (!valid) return res.status(401).json({ message: "Current password is incorrect." });

    const existing = await User.findOne({ school: admin.school, userId: cleanId, _id: { $ne: admin._id } });
    if (existing) return res.status(409).json({ message: "This Admin ID is already in use." });

    const oldId = admin.userId;
    admin.userId = cleanId;
    await admin.save();

    // The current session's JWT is keyed to the account's database _id, not
    // the userId string, so this session keeps working uninterrupted — only
    // the NEXT login must use the new ID; the old ID stops resolving
    // immediately since no user document matches it anymore.
    await AuditLog.create({
      school: admin.school,
      actor: admin._id,
      action: "ADMIN_ID_CHANGED",
      details: { from: oldId, to: cleanId },
    });

    res.json({ message: "Admin ID updated.", adminId: admin.userId });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "This Admin ID is already in use." });
    console.error(err);
    res.status(500).json({ message: "Could not change Admin ID." });
  }
}

// POST /api/admin/account/recovery-code
// body: { currentPassword }
//
// Requires the current password so an unattended, unlocked session can't be
// used to silently mint a new recovery code. Returns the PLAINTEXT code
// exactly once — only its hash is ever stored, and it is never logged.
async function generateRecoveryCode(req, res) {
  try {
    const { currentPassword } = req.body;
    if (!currentPassword) return res.status(400).json({ message: "Your current password is required." });

    const admin = await User.findById(req.user._id);
    const valid = await admin.comparePassword(currentPassword);
    if (!valid) return res.status(401).json({ message: "Current password is incorrect." });

    const school = await School.findById(admin.school);
    const plaintextCode = generateRecoveryCodePlaintext(school?.schoolCode);
    await admin.setRecoveryCode(plaintextCode); // old code's hash is overwritten — it stops working immediately
    await admin.save();

    await AuditLog.create({ school: admin.school, actor: admin._id, action: "RECOVERY_CODE_GENERATED" });

    res.json({
      message: "Save this recovery code somewhere safe — it will not be shown again.",
      recoveryCode: plaintextCode,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not generate a recovery code." });
  }
}

// PUT /api/admin/account/profile
// body: { fullName }
async function updateProfile(req, res) {
  try {
    const { fullName } = req.body;
    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ message: "Name is required." });
    }
    const admin = await User.findByIdAndUpdate(req.user._id, { fullName: fullName.trim() }, { new: true });
    res.json({ message: "Profile updated.", adminName: admin.fullName });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not update profile." });
  }
}

module.exports = { getAccount, changeAdminId, generateRecoveryCode, updateProfile };
