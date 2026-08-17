const Student = require("../models/Student");
const School = require("../models/School");

// GET /api/students/verify?studentId=&schoolCode=
//
// Public (no auth) — this is the first step of registration. It deliberately
// returns generic messages on failure so the endpoint can't be used to probe
// which Student IDs exist across schools.
async function verify(req, res) {
  try {
    const { studentId, schoolCode } = req.query;
    if (!studentId || !schoolCode) {
      return res.status(400).json({ message: "Student ID and School Code are required." });
    }

    const school = await School.findOne({ schoolCode: schoolCode.trim().toUpperCase(), isActive: true });
    if (!school) {
      return res.status(404).json({
        message: "Student record not found. Please verify your Student ID and School Code.",
        canReport: true,
      });
    }

    const student = await Student.findOne({ school: school._id, studentId: studentId.trim() });
    if (!student) {
      return res.status(404).json({
        message: "Student record not found. Please verify your Student ID and School Code.",
        canReport: true,
      });
    }

    if (student.isRegistered) {
      return res.status(409).json({
        message: "This student account is already registered. Please login instead.",
        alreadyRegistered: true,
      });
    }

    return res.json({
      student: student.toPublicJSON(),
      schoolName: school.name,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not verify student record." });
  }
}

module.exports = { verify };
