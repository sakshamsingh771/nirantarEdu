const mongoose = require("mongoose");

const materialSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    subject: { type: String },
    class: { type: String },
    section: { type: String },
    // DOC/DOCX/PPT/PPTX intentionally not supported — no in-app viewer for
    // Office formats, so students couldn't open them (see upload.js).
    type: { type: String, enum: ["PDF", "IMAGE", "AUDIO", "VIDEO", "NOTE"], required: true },
    // Kept for display/UI purposes so the frontend can show "PPTX" vs "PPT",
    // "DOCX" vs "DOC" etc. without expanding the core `type` enum used for
    // filtering/logic. Derived from the uploaded file's extension.
    fileExtension: { type: String },
    filePath: { type: String }, // local server path, served via /uploads
    fileSizeBytes: { type: Number },
    textContent: { type: String }, // for NOTE type / extracted text for RAG
  },
  { timestamps: true }
);

module.exports = mongoose.model("Material", materialSchema);
