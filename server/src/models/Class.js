const mongoose = require("mongoose");

const classSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
    name: { type: String, required: true }, // e.g. "8"
    sections: [{ type: String }], // e.g. ["A","B"]
    classTeacher: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Class", classSchema);
