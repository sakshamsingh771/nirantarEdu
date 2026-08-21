#!/usr/bin/env node
/**
 * LOCAL SERVER RECOVERY TOOL — run directly on the school server machine.
 *
 *     node server/recover-admin.js
 *
 * This is intentionally NOT an HTTP endpoint. It exists for the one
 * scenario the in-app recovery flow can't cover: the Admin has lost BOTH
 * their password and their recovery code. Per the design requirement, there
 * is no master password, no universal reset password, and no public/
 * unauthenticated reset API anywhere in this codebase — this script is the
 * only path, and it requires direct access to the server machine (and
 * therefore the MongoDB connection string in .env) to run at all. Treat
 * running this script itself as a privileged, physically-gated action —
 * anyone who can run it already has that level of access to the server.
 *
 * What it does:
 *   1. Asks for the School Code (must already exist).
 *   2. Lets you pick an existing Admin account to reset, or create a new one.
 *   3. Sets a new password (never displays or logs the OLD password — this
 *      overwrites the hash, it does not and cannot recover it).
 *   4. Generates a brand-new recovery code and prints it ONCE.
 *   5. Records an audit log entry for the reset.
 *
 * Never reachable from the frontend, never wired into any Express route.
 */
require("dotenv").config();
const readline = require("readline");
const mongoose = require("mongoose");
const crypto = require("crypto");

const School = require("./src/models/School");
const User = require("./src/models/User");
const AuditLog = require("./src/models/AuditLog");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

// Node's readline doesn't support masked input without extra dependencies;
// this tool runs on a trusted local terminal (not over a network), so
// plain prompts are an acceptable tradeoff rather than pulling in a new
// package just for asterisk-masking.
const askPassword = (q) => ask(q);

const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomGroup(len) {
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += RECOVERY_CODE_ALPHABET[bytes[i] % RECOVERY_CODE_ALPHABET.length];
  return out;
}
function generateRecoveryCode(schoolCode) {
  const prefix = (schoolCode || "SCH").split("-")[0].slice(0, 3).toUpperCase();
  return `${prefix}-${randomGroup(4)}-${randomGroup(4)}`;
}

async function main() {
  console.log("\n=== NirantarEdu Local Server Recovery Tool ===");
  console.log("This tool is for the authorized school server administrator only.\n");

  await mongoose.connect(process.env.MONGO_URI ||process.env.MONGODB_URI|| "mongodb://localhost:27017/nirantaredu");

  const schoolCode = (await ask("School Code: ")).trim().toUpperCase();
  const school = await School.findOne({ schoolCode });
  if (!school) {
    console.error(`\nNo school found with code "${schoolCode}". Aborting — nothing was changed.`);
    process.exit(1);
  }
  console.log(`Found school: ${school.name}`);

  const admins = await User.find({ school: school._id, role: "ADMIN" });
  let admin;

  if (admins.length > 0) {
    console.log("\nExisting Admin accounts at this school:");
    admins.forEach((a, i) => console.log(`  ${i + 1}. ${a.userId} (${a.fullName})`));
    console.log(`  ${admins.length + 1}. Create a NEW Admin account instead`);
    const choice = parseInt(await ask("\nSelect an option: "), 10);

    if (choice >= 1 && choice <= admins.length) {
      admin = admins[choice - 1];
    } else if (choice === admins.length + 1) {
      admin = await createNewAdmin(school);
    } else {
      console.error("Invalid selection. Aborting — nothing was changed.");
      process.exit(1);
    }
  } else {
    console.log("\nNo Admin account exists yet for this school.");
    admin = await createNewAdmin(school);
  }

  const newPassword = await askPassword("\nNew password (min 8 characters): ");
  if (!newPassword || newPassword.length < 8) {
    console.error("Password must be at least 8 characters. Aborting — nothing was changed.");
    process.exit(1);
  }
  const confirm = await askPassword("Confirm new password: ");
  if (confirm !== newPassword) {
    console.error("Passwords did not match. Aborting — nothing was changed.");
    process.exit(1);
  }

  // This OVERWRITES the password hash. The old password is never read,
  // logged, or displayed anywhere in this process — it cannot be, since we
  // never had it in the first place, only its (now-discarded) hash.
  await admin.setPassword(newPassword);

  const newRecoveryCode = generateRecoveryCode(school.schoolCode);
  await admin.setRecoveryCode(newRecoveryCode); // old recovery code's hash is overwritten — it stops working
  await admin.save();

  await AuditLog.create({
    school: school._id,
    actor: admin._id,
    action: "LOCAL_SERVER_RECOVERY",
    details: { adminId: admin.userId, performedVia: "recover-admin.js CLI" },
  });

  console.log("\n=== Recovery complete ===");
  console.log(`Admin ID: ${admin.userId}`);
  console.log(`New recovery code (SAVE THIS NOW — it will not be shown again): ${newRecoveryCode}`);
  console.log("\nThe old password and old recovery code no longer work.");

  await mongoose.disconnect();
  rl.close();
}

async function createNewAdmin(school) {
  const adminId = (await ask("New Admin ID: ")).trim();
  const fullName = (await ask("Admin full name: ")).trim();
  if (!/^[A-Za-z0-9_-]{3,32}$/.test(adminId) || !fullName) {
    console.error("Invalid Admin ID or name. Aborting — nothing was changed.");
    process.exit(1);
  }
  const existing = await User.findOne({ school: school._id, userId: adminId });
  if (existing) {
    console.error("An account with this ID already exists at this school. Aborting.");
    process.exit(1);
  }
  const admin = new User({ school: school._id, role: "ADMIN", userId: adminId, fullName });
  return admin; // password is set by the caller before .save()
}

main().catch((err) => {
  console.error("\nRecovery tool failed:", err.message);
  process.exit(1);
});
