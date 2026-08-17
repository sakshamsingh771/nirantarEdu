require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");
const rateLimit = require("express-rate-limit");

const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const studentRoutes = require("./routes/studentRoutes");
const correctionRequestRoutes = require("./routes/correctionRequestRoutes");
const adminRoutes = require("./routes/adminRoutes");
const adminAccountRoutes = require("./routes/adminAccountRoutes");
const schoolRoutes = require("./routes/schoolRoutes");
const materialRoutes = require("./routes/materialRoutes");
const assignmentRoutes = require("./routes/assignmentRoutes");
const quizRoutes = require("./routes/quizRoutes");
const aiRoutes = require("./routes/aiRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const searchRoutes = require("./routes/searchRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const syncRoutes = require("./routes/syncRoutes");

const app = express();

// Everything below runs entirely on the local school server — no calls out
// to the internet are made anywhere in this file or its route modules.
connectDB();

app.use(helmet());

// CORS: locked down by default. Set FRONTEND_URL to a comma-separated list
// of allowed origins (e.g. "https://app.myschool.org,https://myschool.org")
// for any deployment reachable outside a trusted local network — a cloud
// deployment must NOT fall back to "*" once real user tokens are involved.
// Only when neither FRONTEND_URL nor NODE_ENV=production is set (i.e. a
// developer running things locally without configuring anything) do we
// fall back to allowing any origin, since that's the offline/LAN dev case
// this project is built around.
const allowedOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors(
    allowedOrigins.length > 0
      ? {
          origin: (origin, cb) => {
            // Same-origin/non-browser requests (curl, server-to-server) send no Origin header.
            if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
            cb(new Error("Not allowed by CORS"));
          },
          credentials: true,
        }
      : process.env.NODE_ENV === "production"
      ? { origin: false } // production with no FRONTEND_URL configured: fail closed, not open
      : undefined // local dev default: permissive
  )
);
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
app.use("/api/", limiter);

const INLINE_PREVIEW_EXTS = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp", ".mp4", ".webm", ".mp3", ".wav", ".txt"]);
app.use(
  "/uploads",
  (req, res, next) => {
    const ext = path.extname(req.path).toLowerCase();
    if (INLINE_PREVIEW_EXTS.has(ext)) {
      res.setHeader("Content-Disposition", "inline");
    }
    next();
  },
  express.static(path.join(__dirname, "..", "uploads"))
);

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", mode: "LOCAL_OFFLINE_FIRST", internetRequired: false });
});

app.use("/api/auth", authRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/correction-requests", correctionRequestRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/account", adminAccountRoutes);
app.use("/api/school", schoolRoutes);
app.use("/api/materials", materialRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/quizzes", quizRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/sync", syncRoutes);

// Central error handler — never leaks internals, never blocks on "no internet"
const multer = require("multer");
const { MAX_MB_BY_TYPE } = require("./middleware/upload");
app.use((err, req, res, next) => {
  console.error(err);
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      const largest = Math.max(...Object.values(MAX_MB_BY_TYPE));
      return res
        .status(413)
        .json({ message: `File is too large. Maximum file size is ${largest} MB (limit depends on file type).` });
    }
    return res.status(400).json({ message: "File upload failed. Please try again." });
  }
  if (err.message && err.message.startsWith("Unsupported file type")) {
    return res.status(400).json({ message: err.message });
  }
  res.status(500).json({ message: "Something went wrong on the local server." });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`[NirantarEdu] Local server running on port ${PORT} — internet not required.`);
});

// AI generation (assignment/quiz generation, Nirantar AI chat) can take
// well over Node's default socket/header timeouts when running on Ollama —
// without raising these, the HTTP server itself severs the connection
// before the AI provider's own (120-180s) timeout ever gets a chance to
// fire, so the client sees a generic connection-reset instead of a proper
// timeout error state. Give the server enough headroom to match.
server.timeout = 185000; // socket inactivity timeout
server.headersTimeout = 186000; // must exceed server.timeout
server.requestTimeout = 0; // disable Node's overall request timeout; AI routes manage their own
