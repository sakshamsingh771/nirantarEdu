const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const upload = require("../middleware/upload");
const ctrl = require("../controllers/materialController");

router.use(requireAuth);
router.get("/", ctrl.listMaterials);
router.get("/:id", ctrl.getMaterial);
router.post(
  "/",
  requireRole("TEACHER", "ADMIN"),
  upload.single("file"),
  upload.enforcePerTypeLimit,
  ctrl.createMaterial
);
router.delete("/:id", requireRole("TEACHER", "ADMIN"), ctrl.deleteMaterial);
module.exports = router;
