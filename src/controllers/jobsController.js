const { asyncHandler } = require("../lib/http");
const hiringPipelineService = require("../services/hiringPipelineService");

function buildActor(req, type) {
  return {
    type,
    id: req.requestId,
    requestId: req.requestId,
  };
}

const createJob = asyncHandler(async (req, res) => {
  const job = await hiringPipelineService.createJob(req.body, buildActor(req, "ADMIN"));
  res.status(201).json(job);
});

const applyToJob = asyncHandler(async (req, res) => {
  const application = await hiringPipelineService.applyToJob(
    req.params.jobId,
    req.body,
    buildActor(req, "APPLICANT"),
  );

  res.status(201).json(application);
});

const getJobAuditLog = asyncHandler(async (req, res) => {
  const events = await hiringPipelineService.getJobAuditLog(
    req.params.jobId,
    req.query.limit,
  );

  res.status(200).json({
    jobId: req.params.jobId,
    events,
  });
});

const reconcileJob = asyncHandler(async (req, res) => {
  const result = await hiringPipelineService.reconcileJob(
    req.params.jobId,
    buildActor(req, "SYSTEM"),
  );

  res.status(200).json(result);
});

module.exports = {
  applyToJob,
  createJob,
  getJobAuditLog,
  reconcileJob,
};
