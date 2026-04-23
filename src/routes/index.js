const express = require("express");

const applicationsController = require("../controllers/applicationsController");
const jobsController = require("../controllers/jobsController");

const router = express.Router();

router.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
  });
});

router.post("/jobs", jobsController.createJob);
router.post("/jobs/:jobId/applications", jobsController.applyToJob);
router.get("/jobs/:jobId/audit-logs", jobsController.getJobAuditLog);
router.post("/jobs/:jobId/reconcile", jobsController.reconcileJob);

router.get("/applications/:applicationId/status", applicationsController.getStatus);
router.post(
  "/applications/:applicationId/acknowledge",
  applicationsController.acknowledge,
);
router.post("/applications/:applicationId/exit", applicationsController.exit);

module.exports = router;