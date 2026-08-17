const mongoose = require("mongoose");

const ALL_CLASSES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

const schoolSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    schoolCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    address: { type: String, trim: true },
    academicYear: { type: String, default: "2026-27" },
    // Which of the 12 controlled classes this school actually uses.
    classes: [{ type: String, enum: ALL_CLASSES }],
    // Per-class section lists, e.g. { "10": ["A","B","C","D"], "12": ["A","B"] }.
    // Not every class needs every section — this is deliberately NOT a flat
    // A-Z list shared by every class. Stored as a Map so Mongoose keeps
    // arbitrary class-string keys without a rigid subdocument per class.
    sectionsByClass: {
      type: Map,
      of: [{ type: String, match: /^[A-Z]$/ }],
      default: {},
    },
    subjects: [{ type: String }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

schoolSchema.methods.sectionsFor = function (cls) {
  return this.sectionsByClass?.get(String(cls)) || [];
};

module.exports = mongoose.model("School", schoolSchema);
module.exports.ALL_CLASSES = ALL_CLASSES;
