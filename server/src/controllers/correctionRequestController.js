const crypto = require("crypto");
const CorrectionRequest = require("../models/CorrectionRequest");
const Student = require("../models/Student");
const School = require("../models/School");

async function nextRequestCode() {
  // Short, human-readable, and collision-checked rather than a raw counter
  // table — fine at school scale and needs no extra collection.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `CR-${crypto.randomInt(1000, 9999)}`;
    const exists = await CorrectionRequest.findOne({ requestCode: code });
    if (!exists) return code;
  }
  return `CR-${Date.now()}`;
}

// POST /api/correction-requests  (public — filed before or after the account exists)
async function create(req, res) {
  try {
    const { studentId, schoolCode, issueType, description } = req.body;
    if (!studentId || !schoolCode || !issueType || !description) {
      return res.status(400).json({ message: "Please fill in every field before submitting." });
    }

    const school = await School.findOne({ schoolCode: schoolCode.trim().toUpperCase() });
    const student = school
      ? await Student.findOne({ school: school._id, studentId: studentId.trim() })
      : null;

    const requestCode = await nextRequestCode();
    const request = await CorrectionRequest.create({
      requestCode,
      school: school ? school._id : undefined,
      schoolCodeEntered: schoolCode.trim().toUpperCase(),
      student: student ? student._id : null,
      studentIdEntered: studentId.trim(),
      issueType,
      description: description.trim(),
    });

    res.status(201).json({
      message: "Correction request submitted successfully.",
      requestCode: request.requestCode,
      status: request.status,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not submit correction request." });
  }
}

// GET /api/correction-requests/track?requestCode=&studentId=
//
// Anonymous status lookup for a student who doesn't have an account yet.
// Requires BOTH the request code and the Student ID they filed it under,
// so a request can't be looked up by code alone.
async function track(req, res) {
  const { requestCode, studentId } = req.query;
  if (!requestCode || !studentId) {
    return res.status(400).json({ message: "Request ID and Student ID are required." });
  }
  const request = await CorrectionRequest.findOne({
    requestCode: requestCode.trim().toUpperCase(),
    studentIdEntered: studentId.trim(),
  });
  if (!request) return res.status(404).json({ message: "No matching request found." });

  res.json({
    requestCode: request.requestCode,
    issueType: request.issueType,
    status: request.status,
    adminResponse: request.adminResponse,
    createdAt: request.createdAt,
    resolvedAt: request.resolvedAt,
  });
}

// GET /api/correction-requests/my  (authenticated student — their own history)
async function my(req, res) {
  const requests = await CorrectionRequest.find({
    school: req.user.school,
    studentIdEntered: req.user.userId,
  }).sort({ createdAt: -1 });
  res.json({ requests });
}

module.exports = { create, track, my };
