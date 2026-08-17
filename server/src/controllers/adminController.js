const User = require("../models/User");
const School = require("../models/School");
const Student = require("../models/Student");
const CorrectionRequest = require("../models/CorrectionRequest");
const Assignment = require("../models/Assignment");
const Quiz = require("../models/Quiz");
const Material = require("../models/Material");

// GET /api/admin/overview
async function overview(req, res) {
  const schoolId = req.user.school;
  const [totalStudents, totalTeachers, totalAssignments, totalQuizzes, totalMaterials, pendingCorrections, school] =
    await Promise.all([
      Student.countDocuments({ school: schoolId }),
      User.countDocuments({ school: schoolId, role: "TEACHER" }),
      Assignment.countDocuments({ school: schoolId }),
      Quiz.countDocuments({ school: schoolId }),
      Material.countDocuments({ school: schoolId }),
      CorrectionRequest.countDocuments({ school: schoolId, status: { $in: ["pending", "under_review"] } }),
      School.findById(schoolId).lean(),
    ]);

  res.json({
    totalStudents,
    totalTeachers,
    classes: school?.classes || [],
    subjects: school?.subjects || [],
    totalAssignments,
    totalQuizzes,
    totalMaterials,
    pendingCorrections,
    serverStatus: "ONLINE_LOCAL",
    databaseStatus: "CONNECTED",
  });
}

// POST /api/admin/users  (create teacher or admin — NOT student)
//
// Students are never created directly as login accounts by an admin. An
// admin creates the official Student record instead (see createStudentRecord
// below); the student then registers their own password against it. This is
// what makes registration verifiable rather than "type in whatever you like".
async function createUser(req, res) {
  try {
    const { role, userId, fullName, password, subjects, assignedClasses } = req.body;
    if (!["ADMIN", "TEACHER"].includes(role)) {
      return res.status(400).json({ message: "Use Student Records to add students. This endpoint is for teacher/admin accounts only." });
    }
    const user = new User({
      school: req.user.school,
      role,
      userId,
      fullName,
      subjects,
      assignedClasses,
    });
    await user.setPassword(password || "changeme123");
    await user.save();
    res.status(201).json({ user: user.toSafeJSON() });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "This ID already exists." });
    console.error(err);
    res.status(500).json({ message: "Could not create user." });
  }
}

// ---- Student records (official pre-registration data) ----

// POST /api/admin/students
async function createStudentRecord(req, res) {
  try {
    const { studentId, fullName, class: cls, section, rollNumber } = req.body;
    if (!studentId || !fullName || !cls) {
      return res.status(400).json({ message: "Student ID, name and class are required." });
    }
    const school = await School.findById(req.user.school);
    if (!school.classes.includes(String(cls))) {
      return res.status(400).json({ message: `Class ${cls} is not configured for this school.` });
    }
    if (section && !school.sectionsFor(cls).includes(section)) {
      return res.status(400).json({ message: `Section ${section} is not configured for Class ${cls}.` });
    }
    const student = await Student.create({
      school: req.user.school,
      studentId: studentId.trim(),
      fullName: fullName.trim(),
      class: cls,
      section,
      rollNumber,
    });
    res.status(201).json({ student });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "A student record with this Student ID already exists." });
    console.error(err);
    res.status(500).json({ message: "Could not create student record." });
  }
}

// GET /api/admin/students?search=&class=&status=registered|pending
async function listStudentRecords(req, res) {
  const { search, class: cls, status } = req.query;
  const filter = { school: req.user.school };
  if (cls) filter.class = cls;
  if (status === "registered") filter.isRegistered = true;
  if (status === "pending") filter.isRegistered = false;
  if (search) {
    filter.$or = [
      { fullName: { $regex: search, $options: "i" } },
      { studentId: { $regex: search, $options: "i" } },
    ];
  }
  const students = await Student.find(filter).sort({ createdAt: -1 });
  res.json({ students });
}

// PUT /api/admin/students/:id  (direct admin edit of the official record)
async function updateStudentRecord(req, res) {
  const update = {};
  for (const field of ["fullName", "class", "section", "rollNumber"]) {
    if (req.body[field] !== undefined) update[field] = req.body[field];
  }
  const student = await Student.findOneAndUpdate({ _id: req.params.id, school: req.user.school }, update, {
    new: true,
  });
  if (!student) return res.status(404).json({ message: "Student record not found." });

  // Keep the linked User's mirrored fields in sync if this student already registered.
  if (student.registeredUser) {
    await User.findByIdAndUpdate(student.registeredUser, {
      fullName: student.fullName,
      class: student.class,
      section: student.section,
      rollNumber: student.rollNumber,
    });
  }
  res.json({ student });
}

// GET /api/admin/users?role=STUDENT&search=&class=
async function listUsers(req, res) {
  const { role, search, class: cls, section } = req.query;
  const filter = { school: req.user.school };
  if (role) filter.role = role;
  if (cls) filter.class = cls;
  if (section) filter.section = section;
  if (search) {
    filter.$or = [
      { fullName: { $regex: search, $options: "i" } },
      { userId: { $regex: search, $options: "i" } },
    ];
  }
  const users = await User.find(filter).select("-passwordHash").sort({ createdAt: -1 });
  res.json({ users });
}

// PUT /api/admin/users/:id
async function updateUser(req, res) {
  const update = { ...req.body };
  delete update.passwordHash;
  delete update.school;
  const user = await User.findOneAndUpdate({ _id: req.params.id, school: req.user.school }, update, {
    new: true,
  }).select("-passwordHash");
  if (!user) return res.status(404).json({ message: "User not found." });
  res.json({ user });
}

// DELETE /api/admin/users/:id  (deactivate, not hard-delete, to preserve academic records)
async function deactivateUser(req, res) {
  const user = await User.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    { isActive: false },
    { new: true }
  ).select("-passwordHash");
  if (!user) return res.status(404).json({ message: "User not found." });
  res.json({ message: "User deactivated.", user });
}

// POST /api/admin/users/:id/activate  (reverses deactivateUser)
async function activateUser(req, res) {
  const user = await User.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    { isActive: true },
    { new: true }
  ).select("-passwordHash");
  if (!user) return res.status(404).json({ message: "User not found." });
  res.json({ message: "User activated.", user });
}

// POST /api/admin/users/:id/reset-password
// Sets a new password using the same hashing flow as normal password
// changes (User.setPassword → bcrypt) — never stores anything in plain
// text. Requires an explicit new password rather than silently falling
// back to a guessable default, since a default password on a re-activated
// or reset account is itself a security hole.
async function resetPassword(req, res) {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ message: "New password must be at least 8 characters." });
  }
  const user = await User.findOne({ _id: req.params.id, school: req.user.school });
  if (!user) return res.status(404).json({ message: "User not found." });
  await user.setPassword(newPassword);
  await user.save();
  res.json({ message: "Password reset successfully." });
}

// DELETE /api/admin/students/:id
//
// If this Student record already has a linked login account, we deactivate
// that account the same way deactivateUser does for teachers — never a hard
// delete, so academic history is preserved. If nobody has registered
// against this record yet, there's no academic history to protect, so the
// unused pre-record itself is simply removed.
async function removeStudentRecord(req, res) {
  const student = await Student.findOne({ _id: req.params.id, school: req.user.school });
  if (!student) return res.status(404).json({ message: "Student record not found." });

  if (student.registeredUser) {
    await User.findByIdAndUpdate(student.registeredUser, { isActive: false });
    return res.json({ message: "Student account deactivated." });
  }

  await Student.deleteOne({ _id: student._id });
  res.json({ message: "Student record removed." });
}
// PUT /api/admin/school — general info only; classes/sections have their
// own validated endpoints below since they need controlled-vocabulary checks.
async function updateSchool(req, res) {
  const update = {};
  for (const field of ["name", "address", "academicYear"]) {
    if (req.body[field] !== undefined) update[field] = req.body[field];
  }
  const school = await School.findByIdAndUpdate(req.user.school, update, { new: true });
  res.json({ school });
}

// PUT /api/admin/school/classes
// body: { classes: ["6","7","8"] }  — must be a subset of School.ALL_CLASSES (1-12)
async function updateSchoolClasses(req, res) {
  const { classes } = req.body;
  if (!Array.isArray(classes) || classes.some((c) => !School.ALL_CLASSES.includes(String(c)))) {
    return res.status(400).json({ message: `Classes must be a subset of ${School.ALL_CLASSES.join(", ")}.` });
  }
  const school = await School.findByIdAndUpdate(req.user.school, { classes }, { new: true });
  res.json({ school });
}

// PUT /api/admin/school/classes/:cls/sections
// body: { sections: ["A","B","C"] }  — each section must be a single A-Z letter;
// not every class needs the same sections, so this is set per class.
async function updateClassSections(req, res) {
  const { cls } = req.params;
  const { sections } = req.body;
  if (!School.ALL_CLASSES.includes(String(cls))) {
    return res.status(400).json({ message: "Unknown class." });
  }
  if (!Array.isArray(sections) || sections.some((s) => !/^[A-Z]$/.test(s))) {
    return res.status(400).json({ message: "Sections must be single letters A-Z." });
  }
  const school = await School.findById(req.user.school);
  if (!school) return res.status(404).json({ message: "School not found." });
  school.sectionsByClass.set(String(cls), [...new Set(sections)]);
  await school.save();
  res.json({ school });
}

// PUT /api/admin/users/:id/assignments  (TEACHER only)
// body: { assignments: [{ subject, class, section }] }
//
// This is the ONLY thing that grants a teacher access to a class/section —
// see User.canTeach(), which every material/assignment/quiz-creation
// endpoint checks server-side. A teacher is never implicitly given every
// school class.
async function updateTeacherAssignments(req, res) {
  const { assignments } = req.body;
  if (!Array.isArray(assignments)) {
    return res.status(400).json({ message: "assignments must be an array." });
  }
  const school = await School.findById(req.user.school);
  for (const a of assignments) {
    if (!a.subject || !a.class) {
      return res.status(400).json({ message: "Each assignment needs at least a subject and a class." });
    }
    if (!school.classes.includes(String(a.class))) {
      return res.status(400).json({ message: `Class ${a.class} is not configured for this school.` });
    }
    if (a.section) {
      const validSections = school.sectionsFor(a.class);
      if (!validSections.includes(a.section)) {
        return res.status(400).json({ message: `Section ${a.section} is not configured for Class ${a.class}.` });
      }
    }
  }

  const teacher = await User.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school, role: "TEACHER" },
    { teacherAssignments: assignments.map((a) => ({ subject: a.subject, class: String(a.class), section: a.section || "" })) },
    { new: true }
  ).select("-passwordHash");
  if (!teacher) return res.status(404).json({ message: "Teacher not found." });
  res.json({ teacher });
}

// ---- Correction requests ----

// GET /api/admin/correction-requests?status=&search=
//
// Scoped to the admin's own school EXCEPT requests where the entered school
// code didn't resolve to any school (school is null) — those are visible to
// every admin only in the narrow sense of "someone typed a code that matched
// nobody"; they carry no other school's data, so this doesn't leak anything
// across schools.
async function listCorrectionRequests(req, res) {
  const { status, search } = req.query;
  const filter = { $or: [{ school: req.user.school }, { school: null }] };
  if (status) filter.status = status;
  if (search) {
    filter.studentIdEntered = { $regex: search, $options: "i" };
  }
  const requests = await CorrectionRequest.find(filter)
    .populate("student")
    .sort({ createdAt: -1 });
  res.json({ requests });
}

// GET /api/admin/correction-requests/:id
async function getCorrectionRequest(req, res) {
  const request = await CorrectionRequest.findOne({
    _id: req.params.id,
    $or: [{ school: req.user.school }, { school: null }],
  }).populate("student");
  if (!request) return res.status(404).json({ message: "Request not found." });
  res.json({ request });
}

// PATCH /api/admin/correction-requests/:id
// body: { status, adminResponse, recordUpdate: { fullName, class, section, rollNumber } }
//
// Approving with a recordUpdate is the ONLY way the official Student record
// changes as a result of a student report — the student never edits it
// directly, and this handler is the sole write path from a correction
// request into the Student collection.
async function resolveCorrectionRequest(req, res) {
  const { status, adminResponse, recordUpdate } = req.body;
  const validStatuses = ["under_review", "approved", "rejected", "resolved"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: "Invalid status." });
  }

  const request = await CorrectionRequest.findOne({
    _id: req.params.id,
    $or: [{ school: req.user.school }, { school: null }],
  });
  if (!request) return res.status(404).json({ message: "Request not found." });

  if (status === "approved" && recordUpdate) {
    if (!request.student) {
      return res.status(400).json({
        message: "This request has no matching student record to update. Create one first if needed.",
      });
    }
    const update = {};
    for (const field of ["fullName", "class", "section", "rollNumber"]) {
      if (recordUpdate[field] !== undefined && recordUpdate[field] !== "") update[field] = recordUpdate[field];
    }
    const student = await Student.findByIdAndUpdate(request.student, update, { new: true });
    if (student?.registeredUser) {
      await User.findByIdAndUpdate(student.registeredUser, update);
    }
  }

  request.status = status;
  if (adminResponse !== undefined) request.adminResponse = adminResponse;
  request.resolvedBy = req.user._id;
  if (["approved", "rejected", "resolved"].includes(status)) request.resolvedAt = new Date();
  await request.save();

  res.json({ request });
}

module.exports = {
  overview,
  createUser,
  listUsers,
  updateUser,
  deactivateUser,
  activateUser,
  resetPassword,
  updateSchool,
  updateSchoolClasses,
  updateClassSections,
  updateTeacherAssignments,
  createStudentRecord,
  listStudentRecords,
  updateStudentRecord,
  removeStudentRecord,
  listCorrectionRequests,
  getCorrectionRequest,
  resolveCorrectionRequest,
};
