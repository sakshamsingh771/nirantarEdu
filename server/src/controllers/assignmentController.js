const Assignment = require("../models/Assignment");
const Submission = require("../models/Submission");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { generateAssignmentContent } = require("../services/aiService");

// POST /api/assignments/ai-generate  (teacher, uses local Ollama)
//
// Returns a DRAFT only — title + instructions the teacher can edit in the
// UI. Nothing is written to the database here; the teacher still calls
// POST /api/assignments (createAssignment below) to actually publish it,
// same as the manual-entry path.
// POST /api/assignments/ai-generate  (teacher, uses local Ollama)
//
// Returns a structured DRAFT only — title, instructions, and a real question
// list with type/marks/expected answer — the teacher can regenerate or edit
// in the UI. Nothing is written to the database here; the teacher still
// calls POST /api/assignments (createAssignment below) to actually publish
// it, same as the manual-entry path.
async function aiGenerateAssignment(req, res) {
  try {
    const { topic, subject, class: cls, section, difficulty, questionCount, questionType, marks } = req.body;
    if (!topic) return res.status(400).json({ message: "Please provide a topic for Nirantar AI to work from." });
    if (!req.user.canTeach(subject, cls, section)) {
      return res.status(403).json({ message: "You are not assigned to teach this subject/class/section." });
    }
    const count = Number(questionCount) || 5;
    if (count < 1 || count > 30) {
      return res.status(400).json({ message: "Number of questions must be between 1 and 30." });
    }
    const draft = await generateAssignmentContent(topic, {
      subject,
      class: cls,
      difficulty,
      questionCount: count,
      questionType,
      marks,
    });
    res.json({ draft });
  } catch (err) {
    console.error(err);
    res.status(503).json({
      message: "Nirantar AI is unavailable. Make sure the local Ollama service is running on the school server.",
    });
  }
}

// POST /api/assignments  (teacher)
//
// Handles BOTH "Save Draft" and "Publish", distinguished by `status` in the
// body. A DRAFT is saved with minimal validation (title only) and never
// notifies students or requires a class/deadline yet — it can be filled in
// over multiple edits via updateAssignment below. Publishing (status
// PUBLISHED, or omitted — the historical default for this endpoint) keeps
// the full validation and notification behavior this endpoint always had.
async function createAssignment(req, res) {
  try {
    const { title, instructions, subject, class: cls, section, deadline, maxMarks, questions, status } = req.body;
    const isDraft = status === "DRAFT";

    if (!title || !title.trim()) {
      return res.status(400).json({ message: "Please give the assignment a title before saving." });
    }

    if (!isDraft) {
      if (!req.user.canTeach(subject, cls, section)) {
        return res.status(403).json({ message: "You are not assigned to teach this subject/class/section." });
      }
      if (!cls || !deadline) {
        return res.status(400).json({ message: "Class and deadline are required to publish an assignment." });
      }
    }

    if (maxMarks !== undefined && maxMarks !== null && maxMarks !== "") {
      const marksNum = Number(maxMarks);
      if (Number.isNaN(marksNum) || marksNum < 5 || marksNum > 100) {
        return res.status(400).json({ message: "Marks must be a number between 5 and 100." });
      }
    } else if (!isDraft) {
      return res.status(400).json({ message: "Marks are required (between 5 and 100) to publish an assignment." });
    }

    // This endpoint accepts multipart/form-data (for attachments), so a
    // structured `questions` array — if the teacher published an
    // AI-generated or manually-built question list — arrives as a JSON
    // string rather than a real array; multipart forms can't nest arrays.
    let parsedQuestions = [];
    if (Array.isArray(questions)) {
      parsedQuestions = questions;
    } else if (typeof questions === "string" && questions.trim()) {
      try {
        parsedQuestions = JSON.parse(questions);
      } catch {
        return res.status(400).json({ message: "Questions were not formatted correctly." });
      }
    }

    const assignment = await Assignment.create({
      school: req.user.school,
      createdBy: req.user._id,
      title,
      instructions,
      subject,
      class: cls,
      section,
      deadline: deadline || undefined,
      maxMarks,
      questions: parsedQuestions,
      attachments: req.files ? req.files.map((f) => `/uploads/${f.filename}`) : [],
      status: isDraft ? "DRAFT" : "PUBLISHED",
    });

    if (!isDraft) {
      const studentFilter = { school: req.user.school, role: "STUDENT", class: cls };
      if (section) studentFilter.section = section;
      const students = await User.find(studentFilter).select("_id");
      if (students.length) {
        await Notification.insertMany(
          students.map((s) => ({
            school: req.user.school,
            recipient: s._id,
            type: "ASSIGNMENT",
            title: "New assignment posted",
            message: title,
            relatedId: assignment._id,
          }))
        );
      }
    }

    res.status(201).json({ assignment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not create assignment." });
  }
}

// PUT /api/assignments/:id  (teacher — must own the assignment)
//
// Edits an existing DRAFT (title/instructions/class/section/deadline/
// maxMarks/questions), and can also PUBLISH it by sending status:
// "PUBLISHED" — at which point the usual class/deadline validation and
// student notification happen, exactly once (only on the DRAFT→PUBLISHED
// transition, not on every subsequent edit of an already-published
// assignment).
async function updateAssignment(req, res) {
  try {
    const existing = await Assignment.findOne({ _id: req.params.id, school: req.user.school });
    if (!existing) return res.status(404).json({ message: "Assignment not found." });
    if (String(existing.createdBy) !== String(req.user._id) && req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "You can only edit assignments you created." });
    }

    const { title, instructions, subject, class: cls, section, deadline, maxMarks, questions, status } = req.body;
    const wasPublished = existing.status === "PUBLISHED";
    const publishingNow = status === "PUBLISHED" && !wasPublished;

    if (status === "PUBLISHED") {
      if (!req.user.canTeach(subject ?? existing.subject, cls ?? existing.class, section ?? existing.section)) {
        return res.status(403).json({ message: "You are not assigned to teach this subject/class/section." });
      }
      if (!(cls ?? existing.class) || !(deadline ?? existing.deadline)) {
        return res.status(400).json({ message: "Class and deadline are required to publish an assignment." });
      }
      const marksNum = Number(maxMarks ?? existing.maxMarks);
      if (Number.isNaN(marksNum) || marksNum < 5 || marksNum > 100) {
        return res.status(400).json({ message: "Marks must be a number between 5 and 100." });
      }
    }
    if (maxMarks !== undefined && maxMarks !== null && maxMarks !== "") {
      const marksNum = Number(maxMarks);
      if (Number.isNaN(marksNum) || marksNum < 5 || marksNum > 100) {
        return res.status(400).json({ message: "Marks must be a number between 5 and 100." });
      }
    }

    if (title !== undefined) existing.title = title;
    if (instructions !== undefined) existing.instructions = instructions;
    if (subject !== undefined) existing.subject = subject;
    if (cls !== undefined) existing.class = cls;
    if (section !== undefined) existing.section = section;
    if (deadline !== undefined) existing.deadline = deadline;
    if (maxMarks !== undefined) existing.maxMarks = maxMarks;
    if (questions !== undefined) {
      existing.questions = Array.isArray(questions)
        ? questions
        : (() => {
            try {
              return JSON.parse(questions);
            } catch {
              return existing.questions;
            }
          })();
    }
    if (status !== undefined) existing.status = status;

    await existing.save();

    if (publishingNow) {
      const studentFilter = { school: req.user.school, role: "STUDENT", class: existing.class };
      if (existing.section) studentFilter.section = existing.section;
      const students = await User.find(studentFilter).select("_id");
      if (students.length) {
        await Notification.insertMany(
          students.map((s) => ({
            school: req.user.school,
            recipient: s._id,
            type: "ASSIGNMENT",
            title: "New assignment posted",
            message: existing.title,
            relatedId: existing._id,
          }))
        );
      }
    }

    res.json({ assignment: existing });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not update assignment." });
  }
}

// DELETE /api/assignments/:id  (teacher — must own the assignment)
//
// Scoped to DRAFTS only. A published assignment may already have student
// submissions attached to it, so deleting it is a different, riskier
// operation than discarding an unpublished draft — out of scope here.
async function deleteAssignment(req, res) {
  const assignment = await Assignment.findOne({ _id: req.params.id, school: req.user.school });
  if (!assignment) return res.status(404).json({ message: "Assignment not found." });
  if (String(assignment.createdBy) !== String(req.user._id) && req.user.role !== "ADMIN") {
    return res.status(403).json({ message: "You can only delete assignments you created." });
  }
  if (assignment.status !== "DRAFT") {
    return res.status(400).json({ message: "Only draft assignments can be deleted." });
  }
  await assignment.deleteOne();
  res.json({ message: "Draft deleted." });
}

// GET /api/assignments/drafts  (teacher/admin) — this teacher's own saved
// drafts, never visible to students.
async function listDraftAssignments(req, res) {
  const filter = { school: req.user.school, status: "DRAFT" };
  if (req.user.role !== "ADMIN") filter.createdBy = req.user._id;
  const drafts = await Assignment.find(filter).sort({ updatedAt: -1 });
  res.json({ drafts });
}

// GET /api/assignments?class=
//
// A student only sees assignments for their class, and — when an assignment
// targeted a specific section — only their own section. An assignment with
// no section set is treated as visible to the whole class.
async function listAssignments(req, res) {
  const filter = { school: req.user.school, status: "PUBLISHED" };
  if (req.user.role === "STUDENT") {
    filter.class = req.user.class;
    filter.$or = [{ section: { $exists: false } }, { section: null }, { section: "" }, { section: req.user.section }];
  } else if (req.query.class) {
    filter.class = req.query.class;
  }
  const assignments = await Assignment.find(filter).sort({ deadline: 1 });
  res.json({ assignments });
}

// POST /api/assignments/:id/submit  (student) — idempotent via clientOperationId
async function submitAssignment(req, res) {
  try {
    const assignment = await Assignment.findOne({ _id: req.params.id, school: req.user.school });
    if (!assignment) return res.status(404).json({ message: "Assignment not found." });

    const { answerText, clientOperationId } = req.body;
    const status = new Date() > new Date(assignment.deadline) ? "LATE" : "SUBMITTED";

    // Upsert on clientOperationId prevents duplicate submissions from a retried
    // offline-queue operation once the device reconnects to the school server.
    const submission = await Submission.findOneAndUpdate(
      { assignment: assignment._id, student: req.user._id, clientOperationId: clientOperationId || undefined },
      {
        school: req.user.school,
        assignment: assignment._id,
        student: req.user._id,
        answerText,
        filePath: req.file ? `/uploads/${req.file.filename}` : undefined,
        submittedAt: new Date(),
        status,
        clientOperationId,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({ message: "Saved locally and submitted.", submission });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not submit assignment." });
  }
}

// GET /api/assignments/:id/submissions  (teacher)
//
// Shows every student the assignment was targeted at, not just the ones who
// submitted — a teacher needs to see who's pending, not just who's done.
async function listSubmissions(req, res) {
  const assignment = await Assignment.findOne({ _id: req.params.id, school: req.user.school });
  if (!assignment) return res.status(404).json({ message: "Assignment not found." });

  const studentFilter = { school: req.user.school, role: "STUDENT", class: assignment.class };
  if (assignment.section) studentFilter.section = assignment.section;
  const [students, submissions] = await Promise.all([
    User.find(studentFilter).select("fullName userId class section rollNumber"),
    Submission.find({ assignment: req.params.id, school: req.user.school }).populate(
      "student",
      "fullName userId class section rollNumber"
    ),
  ]);

  const byStudentId = new Map(submissions.map((s) => [String(s.student?._id), s]));
  const now = new Date();
  const rows = students.map((student) => {
    const submission = byStudentId.get(String(student._id));
    if (!submission) {
      return {
        student,
        status: now > new Date(assignment.deadline) ? "MISSED" : "PENDING",
        submittedAt: null,
        isLate: false,
      };
    }
    return {
      submission,
      student,
      status: submission.status, // SUBMITTED | LATE | GRADED
      submittedAt: submission.submittedAt,
      isLate: submission.status === "LATE",
    };
  });

  res.json({ assignment: { title: assignment.title, deadline: assignment.deadline }, submissions: rows });
}

// PUT /api/submissions/:id/grade  (teacher)
async function gradeSubmission(req, res) {
  const { grade, feedback } = req.body;
  const submission = await Submission.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    { grade, feedback, status: "GRADED" },
    { new: true }
  );
  if (!submission) return res.status(404).json({ message: "Submission not found." });

  await Notification.create({
    school: req.user.school,
    recipient: submission.student,
    type: "FEEDBACK",
    title: "Assignment graded",
    message: feedback || `You received ${grade} marks.`,
    relatedId: submission._id,
  });

  res.json({ submission });
}

module.exports = {
  createAssignment,
  updateAssignment,
  deleteAssignment,
  listDraftAssignments,
  aiGenerateAssignment,
  listAssignments,
  submitAssignment,
  listSubmissions,
  gradeSubmission,
};
