const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadDir = path.join(__dirname, "..", "..", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// DOC/DOCX/PPT/PPTX intentionally NOT supported — students on the in-app
// viewers (see MaterialViewerModal) cannot open Office formats, only
// PDF/video/audio/image/text. Teachers uploading those get a clear
// "Unsupported file type" error rather than a silently-broken material.
const ALLOWED_MIME = [
  // Documents / notes
  "application/pdf",
  "text/plain",
  // Images
  "image/png",
  "image/jpeg",
  "image/webp",
  // Audio
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  // Video
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

// Per-type size ceilings — a single flat limit either starves video (which
// legitimately needs hundreds of MB for a lesson recording) or lets a
// "PDF" upload of the same huge size clog the school server's local disk.
// Kept generous but bounded given this runs on modest on-prem school
// hardware per NirantarEdu's offline-first architecture.
const MAX_MB_BY_TYPE = {
  "application/pdf": Number(process.env.MAX_UPLOAD_MB_PDF || 100),
  "text/plain": Number(process.env.MAX_UPLOAD_MB_DOC || 50),
  "image/png": Number(process.env.MAX_UPLOAD_MB_IMAGE || 25),
  "image/jpeg": Number(process.env.MAX_UPLOAD_MB_IMAGE || 25),
  "image/webp": Number(process.env.MAX_UPLOAD_MB_IMAGE || 25),
  "audio/mpeg": Number(process.env.MAX_UPLOAD_MB_AUDIO || 100),
  "audio/wav": Number(process.env.MAX_UPLOAD_MB_AUDIO || 100),
  "audio/x-wav": Number(process.env.MAX_UPLOAD_MB_AUDIO || 100),
  "audio/mp4": Number(process.env.MAX_UPLOAD_MB_AUDIO || 100),
  "video/mp4": Number(process.env.MAX_UPLOAD_MB_VIDEO || 500),
  "video/webm": Number(process.env.MAX_UPLOAD_MB_VIDEO || 500),
  "video/quicktime": Number(process.env.MAX_UPLOAD_MB_VIDEO || 500),
};
// Hard ceiling multer needs up front (it can't know the mimetype's limit
// until fileFilter runs); the per-type check in fileFilter/server.js is
// what actually enforces the real, smaller limits above.
const HARD_CEILING_MB = Math.max(...Object.values(MAX_MB_BY_TYPE));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeName = Date.now() + "-" + file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: HARD_CEILING_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      return cb(new Error("Unsupported file type. Allowed: PDF, video, audio, images, and text notes."));
    }
    cb(null, true);
  },
});

// Runs AFTER multer has already streamed the file to disk (multer's own
// `limits.fileSize` can only apply one ceiling for the whole instance), so
// this is the real per-type enforcement — an oversized PDF/image/audio
// file within the video ceiling still gets rejected and cleaned up here.
function enforcePerTypeLimit(req, res, next) {
  if (!req.file) return next();
  const limitMb = MAX_MB_BY_TYPE[req.file.mimetype] || Number(process.env.MAX_UPLOAD_MB || 50);
  if (req.file.size > limitMb * 1024 * 1024) {
    const fs2 = require("fs");
    fs2.unlink(req.file.path, () => {});
    return res.status(413).json({ message: `File is too large. Maximum for this file type: ${limitMb} MB.` });
  }
  next();
}

module.exports = upload;
module.exports.ALLOWED_MIME = ALLOWED_MIME;
module.exports.MAX_MB_BY_TYPE = MAX_MB_BY_TYPE;
module.exports.enforcePerTypeLimit = enforcePerTypeLimit;