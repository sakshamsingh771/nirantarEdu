const crypto = require("crypto");
const School = require("../models/School");

// GET /api/school/config
//
// Any authenticated role in the school can read this — it's just the
// classes/sectionsByClass/subjects used to populate dropdowns (Teacher
// material/assignment/quiz forms, Admin's Add Student Record and Teacher
// Assignment forms). It does NOT expose the school's subjects-management UI
// in Admin Settings — that was intentionally removed there; this is the
// read-only reuse path the rest of the app relies on instead.
async function getConfig(req, res) {
  const school = await School.findById(req.user.school).select("name schoolCode classes sectionsByClass subjects");
  if (!school) return res.status(404).json({ message: "School not found." });
  res.json({
    name: school.name,
    schoolCode: school.schoolCode,
    classes: school.classes || [],
    // Map -> plain object so the frontend gets ordinary JSON, e.g.
    // { "10": ["A","B","C","D"], "12": ["A","B"] }.
    sectionsByClass: school.sectionsByClass ? Object.fromEntries(school.sectionsByClass) : {},
    subjects: school.subjects || [],
  });
}

module.exports = { getConfig, regenerateSchoolCode };

// POST /api/school/regenerate-code  (ADMIN only, enforced by requireRole on the route)
//
// Generates a new, unique school code and saves it. This changes ONLY the
// schoolCode field on the existing School document — every student/teacher/
// admin record, material, quiz, etc. still points at the same School _id,
// so nothing about the school's data is touched or deleted. The old code
// simply stops matching once this write commits, because login/registration/
// correction-request lookups all match on schoolCode + isActive against the
// School collection (see authController, studentController,
// correctionRequestController) — there is exactly one active code per
// school for those lookups to match against, and this is it.
function randomSuffix() {
  // 6 unambiguous base32-ish characters (no 0/O/1/I) — short enough for a
  // teacher/admin to read aloud or retype, long enough to make guessing the
  // new code impractical.
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

async function regenerateSchoolCode(req, res) {
  try {
    const school = await School.findById(req.user.school);
    if (!school) return res.status(404).json({ message: "School not found." });

    // Keep a recognizable prefix (the part before the first "-", e.g. "NED")
    // so the new code still reads as belonging to this school, and retry on
    // the rare collision against the unique index instead of trusting
    // randomness blindly.
    const prefix = (school.schoolCode || "SCH").split("-")[0] || "SCH";
    let newCode;
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = `${prefix}-${randomSuffix()}`;
      // eslint-disable-next-line no-await-in-loop
      const clash = await School.findOne({ schoolCode: candidate });
      if (!clash) {
        newCode = candidate;
        break;
      }
    }
    if (!newCode) {
      return res.status(500).json({ message: "Could not generate a unique school code. Please try again." });
    }

    school.schoolCode = newCode;
    await school.save();

    res.json({ schoolCode: school.schoolCode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not regenerate the school code." });
  }
}
