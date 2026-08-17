const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema({
  type: { type: String, enum: ["MCQ", "TRUE_FALSE", "FILL_BLANK", "SHORT_ANSWER"], required: true },
  text: { type: String, required: true },
  options: [{ type: String }], // for MCQ
  correctAnswer: { type: String, required: true }, // index string for MCQ, "true"/"false", exact/keyword text otherwise
  marks: { type: Number, default: 1 },
});

module.exports = mongoose.model("Question", questionSchema);
