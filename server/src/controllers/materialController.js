const Material = require("../models/Material");
const Notification = require("../models/Notification");
const User = require("../models/User");
const path = require("path");

// POST /api/materials  (teacher upload)
async function createMaterial(req, res) {
  try {
    const { title, description, subject, class: cls, section, type, textContent } = req.body;

    if (!req.user.canTeach(subject, cls, section)) {
      return res.status(403).json({ message: "You are not assigned to teach this subject/class/section." });
    }

    const fileExtension = req.file ? path.extname(req.file.originalname).replace(".", "").toLowerCase() : undefined;

    const material = await Material.create({
      school: req.user.school,
      uploadedBy: req.user._id,
      title,
      description,
      subject,
      class: cls,
      section,
      type,
      fileExtension,
      textContent,
      filePath: req.file ? `/uploads/${req.file.filename}` : undefined,
      fileSizeBytes: req.file ? req.file.size : undefined,
    });

    // Notify students in that class — and, when the teacher targeted a
    // specific section, only that section, so Section B doesn't get pinged
    // about material posted for Section A.
    const studentFilter = { school: req.user.school, role: "STUDENT", class: cls };
    if (section) studentFilter.section = section;
    const students = await User.find(studentFilter).select("_id");
    if (students.length) {
      await Notification.insertMany(
        students.map((s) => ({
          school: req.user.school,
          recipient: s._id,
          type: "MATERIAL",
          title: "New study material posted",
          message: title,
          relatedId: material._id,
        }))
      );
    }

    res.status(201).json({ material });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not upload material." });
  }
}

// GET /api/materials?class=&subject=&search=
//
// Students only ever see material for their own class, and — when the
// material was targeted at a specific section — their own section. Material
// posted with no section set is treated as visible to the whole class.
async function listMaterials(req, res) {
  const { class: cls, subject, search } = req.query;
  const filter = { school: req.user.school };

  if (req.user.role === "STUDENT") {
    filter.class = req.user.class;
    filter.$or = [{ section: { $exists: false } }, { section: null }, { section: "" }, { section: req.user.section }];
  } else if (cls) {
    filter.class = cls;
  }

  if (subject) filter.subject = subject;
  if (search) filter.title = { $regex: search, $options: "i" };
  const materials = await Material.find(filter).sort({ createdAt: -1 });
  res.json({ materials });
}

// GET /api/materials/:id
async function getMaterial(req, res) {
  const material = await Material.findOne({ _id: req.params.id, school: req.user.school });
  if (!material) return res.status(404).json({ message: "Material not found." });
  res.json({ material });
}

module.exports = { createMaterial, listMaterials, getMaterial };
