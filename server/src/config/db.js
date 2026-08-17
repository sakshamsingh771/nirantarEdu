const mongoose = require("mongoose");

async function connectDB() {
  // Accept either name: MONGO_URI (local/offline default) or MONGODB_URI
  // (the name used in .env.production.example / MongoDB Atlas's own
  // connection-string field, so pasting Atlas's value in directly works).
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/nirantaredu";
  try {
    await mongoose.connect(uri);
    console.log("[DB] Connected to local MongoDB:", uri.replace(/\/\/.*@/, "//***@"));
  } catch (err) {
    console.error("[DB] Connection failed:", err.message);
    setTimeout(connectDB, 5000);
  }
}

module.exports = connectDB;
