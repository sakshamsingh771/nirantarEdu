const mongoose = require("mongoose");

/**
 * Student is the OFFICIAL record created by the school/admin before a
 * student ever registers. It never holds a password. Registration only
 * succeeds once a matching, not-yet-registered Student record is found —
 * see authController.register and studentController.verify.
 *
 * The auth account (login credentials) lives on User, created at the
 * moment of registration and linked back here via `registeredUser`. This
 * keeps a single place (User) responsible for authentication across all
 * three roles, while Student stays the source of truth for official
 * identity fields an admin controls.
 */
const studentSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
    studentId: { type: String, required: true, trim: true },
    fullName: { type: String, required: true, trim: true },
    class: { type: String, required: true },
    section: { type: String },
    rollNumber: { type: String },

    isRegistered: { type: Boolean, default: false },
    registeredUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    registeredAt: { type: Date },
  },
  { timestamps: true }
);

// A given school can never have two official records with the same Student ID.
studentSchema.index({ school: 1, studentId: 1 }, { unique: true });

studentSchema.methods.toPublicJSON = function () {
  return {
    studentId: this.studentId,
    fullName: this.fullName,
    class: this.class,
    section: this.section,
  };
};

module.exports = mongoose.model("Student", studentSchema);
