require("dotenv").config();
const mongoose = require("mongoose");
const School = require("./src/models/School");
const User = require("./src/models/User");
const Student = require("./src/models/Student");
const CorrectionRequest = require("./src/models/CorrectionRequest");
const Assignment = require("./src/models/Assignment");
const Quiz = require("./src/models/Quiz");
const Material = require("./src/models/Material");
const Notification = require("./src/models/Notification");

// Realistic names spread across classes 6-10, sections A/B, so the demo
// dashboards look like a populated school rather than "Student 1..40".
const STUDENT_NAMES = [
  "Aarav Mehta", "Diya Sharma", "Vihaan Gupta", "Ananya Iyer", "Reyansh Nair",
  "Ishita Rao", "Kabir Malhotra", "Sara Khan", "Arjun Verma", "Myra Joshi",
  "Vivaan Chauhan", "Anika Bose", "Aditya Pillai", "Kiara Menon", "Sai Reddy",
  "Riya Kapoor", "Ayaan Bhatt", "Navya Desai", "Krishna Pandey", "Zoya Ahmed",
  "Rudra Saxena", "Pari Agarwal", "Yash Thakur", "Tara Sinha", "Dhruv Rana",
  "Ira Chatterjee", "Advik Kulkarni", "Meera Nambiar", "Shaurya Dutta", "Anvi Bhatia",
  "Kian Fernandes", "Aadhya Ghosh", "Veer Chowdhury", "Siya Rawat", "Aryan Trivedi",
  "Nitya Balan", "Ishaan Bajaj", "Aaradhya Shetty", "Om Prakash", "Larisa D'Souza",
];

const CLASSES = ["6", "7", "8", "9", "10"];
const SECTIONS = ["A", "B"];

async function seed() {
  await mongoose.connect(process.env.MONGO_URI ||process.env.MONGODB_URI|| "mongodb://localhost:27017/nirantaredu");
  console.log("Connected. Seeding demo data...");

  await Promise.all([
    School.deleteMany({}),
    User.deleteMany({}),
    Student.deleteMany({}),
    CorrectionRequest.deleteMany({}),
    Assignment.deleteMany({}),
    Quiz.deleteMany({}),
    Material.deleteMany({}),
    Notification.deleteMany({}),
  ]);

  // NOTE: `subjects` still lives on School (teacher/material/quiz forms read
  // it via GET /api/school/config) even though the Admin "School Settings"
  // UI no longer exposes a subjects field to edit. `sectionsByClass` is set
  // per class (not every class needs the same sections) via updateSchool's
  // dedicated class/section endpoints in the real app — seeded directly here.
  const school = new School({
    name: "Nirantar Model School",
    schoolCode: "NED-LKO-2026",
    address: "Lucknow, Uttar Pradesh",
    academicYear: "2026-27",
    classes: CLASSES,
    subjects: ["Mathematics", "Science", "English", "Computer Science", "Social Studies", "Hindi"],
  });
  for (const cls of CLASSES) school.sectionsByClass.set(cls, SECTIONS);
  await school.save();

  const admin = new User({
    school: school._id,
    role: "ADMIN",
    userId: "ADMIN001",
    fullName: "Rina Kapoor",
  });
  await admin.setPassword("Admin@123");
  const adminRecoveryCode = "NED-DEMO-CODE"; // fixed for demo reproducibility only — see note below
  await admin.setRecoveryCode(adminRecoveryCode);
  await admin.save();
  // NOTE: real recovery codes are always generated fresh via
  // POST /api/admin/account/recovery-code (cryptographically random, shown
  // once). This fixed demo value exists purely so the seeded README/demo
  // credentials are reproducible for testing the forgot-password flow —
  // an admin should regenerate a real one before actual use.

  // subject -> class -> section access, matching the Admin -> Teacher ->
  // Subject -> Class -> Section assignment model. section:"" means the
  // whole class (both A and B here), not just one section.
  const teacherDefs = [
    {
      userId: "TCH001",
      fullName: "Anil Verma",
      teacherAssignments: [
        { subject: "Mathematics", class: "8", section: "" },
        { subject: "Mathematics", class: "9", section: "" },
        { subject: "Mathematics", class: "10", section: "" },
      ],
    },
    {
      userId: "TCH002",
      fullName: "Sunita Rao",
      teacherAssignments: [
        { subject: "Science", class: "6", section: "" },
        { subject: "Science", class: "7", section: "" },
        { subject: "Science", class: "8", section: "" },
      ],
    },
    {
      userId: "TCH003",
      fullName: "Deepak Singh",
      teacherAssignments: [
        { subject: "English", class: "6", section: "" },
        { subject: "English", class: "7", section: "" },
        { subject: "English", class: "8", section: "" },
        { subject: "English", class: "9", section: "" },
      ],
    },
    {
      userId: "TCH004",
      fullName: "Priya Nambiar",
      teacherAssignments: [
        { subject: "Computer Science", class: "8", section: "" },
        { subject: "Computer Science", class: "9", section: "" },
        { subject: "Computer Science", class: "10", section: "" },
      ],
    },
  ];
  const teachers = [];
  for (const t of teacherDefs) {
    const teacher = new User({ school: school._id, role: "TEACHER", ...t });
    await teacher.setPassword("Teacher@123");
    await teacher.save();
    teachers.push(teacher);
  }
  const [mathTeacher, scienceTeacher, englishTeacher] = teachers;

  // ---- Official student records across every class/section, with real
  // names. Most are pre-registered so the platform looks fully populated
  // for a demo; a handful are deliberately left UNREGISTERED to demonstrate
  // the verification-based registration flow, and STU999 is left absent
  // entirely to demonstrate "record not found" + correction requests.
  const studentRecords = [];
  let nameIndex = 0;
  let counter = 1;
  const UNREGISTERED_COUNT = 4; // last 4 created are left unregistered

  const allSpecs = [];
  for (const cls of CLASSES) {
    for (const section of SECTIONS) {
      for (let roll = 1; roll <= 4; roll++) {
        allSpecs.push({ cls, section, roll });
      }
    }
  }

  for (const spec of allSpecs) {
    const name = STUDENT_NAMES[nameIndex % STUDENT_NAMES.length];
    nameIndex++;
    const studentId = `STU${String(counter).padStart(3, "0")}`;
    counter++;
    const record = await Student.create({
      school: school._id,
      studentId,
      fullName: name,
      class: spec.cls,
      section: spec.section,
      rollNumber: String(spec.roll),
    });
    studentRecords.push(record);
  }
  // Deliberately no record for STU999 — used to demo "record not found" +
  // filing a correction request from the registration screen.

  const toLeaveUnregistered = new Set(studentRecords.slice(-UNREGISTERED_COUNT).map((s) => s.studentId));

  const registeredUsers = [];
  for (const record of studentRecords) {
    if (toLeaveUnregistered.has(record.studentId)) continue;
    const user = new User({
      school: school._id,
      role: "STUDENT",
      userId: record.studentId,
      fullName: record.fullName,
      student: record._id,
      class: record.class,
      section: record.section,
      rollNumber: record.rollNumber,
    });
    await user.setPassword("Student@123");
    await user.save();
    record.isRegistered = true;
    record.registeredUser = user._id;
    record.registeredAt = new Date();
    await record.save();
    registeredUsers.push(user);
  }

  const firstStudent = registeredUsers[0]; // STU001, class 6-A — ready-to-use login
  const secondUnregistered = studentRecords.find((s) => toLeaveUnregistered.has(s.studentId));

  // A demo correction request already sitting in the admin's queue.
  await CorrectionRequest.create({
    requestCode: "CR-1025",
    school: school._id,
    schoolCodeEntered: school.schoolCode,
    student: secondUnregistered._id,
    studentIdEntered: secondUnregistered.studentId,
    issueType: "INCORRECT_CLASS",
    description: `My actual class is 10-A, but the system shows ${secondUnregistered.class}-${secondUnregistered.section}.`,
    status: "pending",
  });

  // ---- Demo learning materials across formats (see demo-files/README.md
  // for how the underlying placeholder files were generated; every
  // filePath below points at a file that genuinely exists in server/uploads). ----
  await Material.create([
    {
      school: school._id,
      uploadedBy: mathTeacher._id,
      title: "Algebra Notes",
      description: "Basics of algebraic expressions",
      subject: "Mathematics",
      class: "8",
      type: "NOTE",
      textContent:
        "Algebra uses letters (variables) to represent unknown numbers. An expression like 3x + 5 means " +
        "three times a number x, plus five. Equations are solved by isolating the variable using inverse operations.",
    },
    {
      school: school._id,
      uploadedBy: mathTeacher._id,
      title: "Algebra Notes (PDF)",
      description: "Printable notes covering the same topic",
      subject: "Mathematics",
      class: "8",
      type: "PDF",
      fileExtension: "pdf",
      filePath: "/uploads/demo-algebra-notes.pdf",
    },
    {
      school: school._id,
      uploadedBy: mathTeacher._id,
      title: "Algebra Presentation",
      description: "Slide deck introducing algebraic expressions",
      subject: "Mathematics",
      class: "8",
      type: "NOTE",
      fileExtension: "pptx",
      filePath: "/uploads/demo-algebra-presentation.pptx",
    },
    {
      school: school._id,
      uploadedBy: mathTeacher._id,
      title: "Geometry Diagram",
      description: "Reference diagram for the geometry unit",
      subject: "Mathematics",
      class: "9",
      type: "IMAGE",
      fileExtension: "png",
      filePath: "/uploads/demo-geometry-diagram.png",
    },
    {
      school: school._id,
      uploadedBy: mathTeacher._id,
      title: "Mathematics Lecture",
      description: "Recorded lecture — add a video file to server/uploads/ to enable playback (see demo-files/README.md)",
      subject: "Mathematics",
      class: "9",
      type: "VIDEO",
      // filePath intentionally omitted — see demo-files/README.md
    },
    {
      school: school._id,
      uploadedBy: scienceTeacher._id,
      title: "Physics Notes",
      description: "Printable notes on force and motion",
      subject: "Science",
      class: "7",
      type: "PDF",
      fileExtension: "pdf",
      filePath: "/uploads/demo-physics-notes.pdf",
    },
    {
      school: school._id,
      uploadedBy: scienceTeacher._id,
      title: "Science Presentation",
      description: "Slide deck for the current science unit",
      subject: "Science",
      class: "7",
      type: "PPT",
      fileExtension: "pptx",
      filePath: "/uploads/demo-science-presentation.pptx",
    },
    {
      school: school._id,
      uploadedBy: scienceTeacher._id,
      title: "Science Diagram",
      description: "Labelled diagram for revision",
      subject: "Science",
      class: "6",
      type: "IMAGE",
      fileExtension: "png",
      filePath: "/uploads/demo-science-diagram.png",
    },
    {
      school: school._id,
      uploadedBy: scienceTeacher._id,
      title: "Recorded Explanation",
      description: "Recorded explanation — add a video file to server/uploads/ to enable playback (see demo-files/README.md)",
      subject: "Science",
      class: "6",
      type: "VIDEO",
      // filePath intentionally omitted — see demo-files/README.md
    },
    {
      school: school._id,
      uploadedBy: englishTeacher._id,
      title: "Grammar Notes",
      description: "Key grammar rules for this term",
      subject: "English",
      class: "6",
      type: "NOTE",
      textContent:
        "A sentence needs a subject and a verb. Common tenses: present simple (I walk), present continuous " +
        "(I am walking), past simple (I walked). Practice by rewriting the example sentences in each tense.",
    },
    {
      school: school._id,
      uploadedBy: englishTeacher._id,
      title: "English Assignment Sheet",
      description: "Printable worksheet accompanying this week's assignment",
      subject: "English",
      class: "8",
      type: "DOC",
      fileExtension: "docx",
      filePath: "/uploads/demo-english-assignment.docx",
    },
    {
      school: school._id,
      uploadedBy: englishTeacher._id,
      title: "Reading Material",
      description: "Short passage for this week's reading practice",
      subject: "English",
      class: "9",
      type: "NOTE",
      textContent:
        "Read the following passage carefully: 'The old lighthouse stood at the edge of the cliff, its light " +
        "sweeping across the dark water every ten seconds...' Answer the comprehension questions that follow in class.",
    },
    {
      school: school._id,
      uploadedBy: englishTeacher._id,
      title: "Pronunciation Practice (Audio)",
      description: "Short audio sample for pronunciation practice",
      subject: "English",
      class: "6",
      type: "AUDIO",
      fileExtension: "wav",
      filePath: "/uploads/demo-audio-sample.wav",
    },
  ]);

  await Assignment.create({
    school: school._id,
    createdBy: mathTeacher._id,
    title: "Algebra Practice Set 1",
    instructions: "Solve questions 1-10 from the textbook and explain your steps.",
    subject: "Mathematics",
    class: "8",
    deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    maxMarks: 20,
  });

  await Quiz.create({
    school: school._id,
    createdBy: mathTeacher._id,
    title: "Algebra Basics Quiz",
    subject: "Mathematics",
    class: "8",
    timerMinutes: 10,
    questions: [
      {
        type: "MCQ",
        text: "What is the value of x in 2x = 10?",
        options: ["2", "5", "10", "20"],
        correctAnswer: "1",
        marks: 2,
      },
      {
        type: "TRUE_FALSE",
        text: "A variable always represents a fixed number.",
        correctAnswer: "false",
        marks: 1,
      },
      {
        type: "FILL_BLANK",
        text: "In the expression 3x + 5, 3 is called the ____ of x.",
        correctAnswer: "coefficient",
        marks: 2,
      },
    ],
  });

  await Notification.create({
    school: school._id,
    recipient: firstStudent._id,
    type: "ANNOUNCEMENT",
    title: "Welcome to NirantarEdu",
    message: "Your local school learning platform is ready to use — no internet required.",
  });

  console.log("\nSeed complete.\n");
  console.log(`School Code: ${school.schoolCode}`);
  console.log("Admin        -> ID: ADMIN001   Password: Admin@123");
  console.log(`                Recovery code (demo only, regenerate a real one before use): ${adminRecoveryCode}`);
  console.log("Teachers     -> TCH001 (Maths), TCH002 (Science), TCH003 (English), TCH004 (Computer Science)");
  console.log("                Password for all: Teacher@123");
  console.log(`Students     -> ${registeredUsers.length} registered (STU001..${registeredUsers[registeredUsers.length - 1].userId.slice(3)}),`);
  console.log(`                all with password Student@123, spread across classes ${CLASSES.join("/")} and sections ${SECTIONS.join("/")}`);
  console.log(`                ${UNREGISTERED_COUNT} student records exist but are NOT registered yet — use these to demo registration.`);
  console.log("STU999 has no record at all -> demos 'record not found' + correction request.");
  console.log(`A demo correction request (CR-1025, pending) is in the admin queue for ${secondUnregistered.studentId}.`);
  console.log("\nDemo material files: see server/demo-files/README.md (video files are intentionally not auto-generated).");

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
