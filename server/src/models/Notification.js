const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["ASSIGNMENT", "QUIZ", "MATERIAL", "DEADLINE", "FEEDBACK", "RESULT", "ANNOUNCEMENT"],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String },
    relatedId: { type: mongoose.Schema.Types.ObjectId },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", notificationSchema);
