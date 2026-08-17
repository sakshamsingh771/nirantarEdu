const Notification = require("../models/Notification");

// GET /api/notifications
async function listNotifications(req, res) {
  const notifications = await Notification.find({ school: req.user.school, recipient: req.user._id })
    .sort({ createdAt: -1 })
    .limit(100);
  res.json({ notifications });
}

// PUT /api/notifications/:id/read
async function markRead(req, res) {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipient: req.user._id },
    { isRead: true },
    { new: true }
  );
  if (!notification) return res.status(404).json({ message: "Notification not found." });
  res.json({ notification });
}

module.exports = { listNotifications, markRead };
