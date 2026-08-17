const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
    role: { type: String, enum: ["ADMIN", "TEACHER", "STUDENT"], required: true, index: true },
    userId: { type: String, required: true, trim: true }, // Student ID / Teacher ID / Admin ID (unique per school)
    fullName: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },

    // Student-only fields — mirrored from the official Student record at
    // registration time for convenience; Student stays the source of truth.
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
    class: { type: String },
    section: { type: String },
    rollNumber: { type: String },

    // Teacher-only: exactly which subject+class+section combinations this
    // teacher may access — a teacher does NOT automatically get every school
    // class. `section: ""` means "every section of that class". Enforced
    // server-side in materialController/assignmentController/quizController
    // via User.canTeach(), never trusted from the frontend alone.
    teacherAssignments: [
      {
        _id: false,
        subject: { type: String, required: true },
        class: { type: String, required: true },
        section: { type: String, default: "" },
      },
    ],

    // Admin-only recovery: a hashed recovery code (never the plaintext) used
    // by the offline "forgot password" flow. Never returned by any profile
    // API — see adminAccountController.js.
    recoveryCodeHash: { type: String, select: false },
    recoveryCodeSetAt: { type: Date },

    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.index({ school: 1, userId: 1 }, { unique: true });

userSchema.methods.setPassword = async function (plainPassword) {
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(plainPassword, salt);
};

userSchema.methods.comparePassword = function (plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash);
};

// Server-side authorization gate for teacher-created content. Never trust
// class/subject/section values sent from the frontend alone — every
// controller that lets a teacher create material/assignments/quizzes calls
// this before writing anything.
userSchema.methods.canTeach = function (subject, cls, section) {
  if (this.role === "ADMIN") return true; // admins aren't limited to specific classes
  if (this.role !== "TEACHER") return false;
  return (this.teacherAssignments || []).some((a) => {
    if (a.subject !== subject || a.class !== String(cls)) return false;
    if (!a.section) return true; // "" on the assignment = whole class, any section
    return !section || a.section === section;
  });
};

userSchema.methods.setRecoveryCode = async function (plainCode) {
  const salt = await bcrypt.genSalt(10);
  this.recoveryCodeHash = await bcrypt.hash(plainCode, salt);
  this.recoveryCodeSetAt = new Date();
};

userSchema.methods.compareRecoveryCode = function (plainCode) {
  if (!this.recoveryCodeHash) return Promise.resolve(false);
  return bcrypt.compare(plainCode, this.recoveryCodeHash);
};

userSchema.methods.toSafeJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.recoveryCodeHash;
  return obj;
};

module.exports = mongoose.model("User", userSchema);
