const Material = require("../models/Material");
const Assignment = require("../models/Assignment");
const Quiz = require("../models/Quiz");
const User = require("../models/User");

// GET /api/search?q=
// Local, MongoDB-only search across the resource types relevant to the caller's role.
async function search(req, res) {
  const q = (req.query.q || "").trim();
  if (!q) return res.json({ materials: [], assignments: [], quizzes: [], users: [] });

  const school = req.user.school;
  const rx = { $regex: q, $options: "i" };

  const [materials, assignments, quizzes] = await Promise.all([
    Material.find({ school, title: rx }).limit(10),
    Assignment.find({ school, title: rx }).limit(10),
    Quiz.find({ school, title: rx }).select("-questions.correctAnswer").limit(10),
  ]);

  let users = [];
  if (req.user.role !== "STUDENT") {
    users = await User.find({ school, $or: [{ fullName: rx }, { userId: rx }] })
      .select("-passwordHash")
      .limit(10);
  }

  res.json({ materials, assignments, quizzes, users });
}

module.exports = { search };
