const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const ctrl = require("../controllers/adminController");

router.use(requireAuth, requireRole("ADMIN"));

router.get("/overview", ctrl.overview);
router.get("/users", ctrl.listUsers);
router.post("/users", ctrl.createUser);
router.put("/users/:id", ctrl.updateUser);
router.delete("/users/:id", ctrl.deactivateUser);
router.post("/users/:id/activate", ctrl.activateUser);
router.post("/users/:id/reset-password", ctrl.resetPassword);
router.put("/users/:id/assignments", ctrl.updateTeacherAssignments);
router.put("/school", ctrl.updateSchool);
router.put("/school/classes", ctrl.updateSchoolClasses);
router.put("/school/classes/:cls/sections", ctrl.updateClassSections);

// Official student records (pre-registration)
router.get("/students", ctrl.listStudentRecords);
router.post("/students", ctrl.createStudentRecord);
router.put("/students/:id", ctrl.updateStudentRecord);
router.delete("/students/:id", ctrl.removeStudentRecord);

// Correction requests
router.get("/correction-requests", ctrl.listCorrectionRequests);
router.get("/correction-requests/:id", ctrl.getCorrectionRequest);
router.patch("/correction-requests/:id", ctrl.resolveCorrectionRequest);

module.exports = router;
