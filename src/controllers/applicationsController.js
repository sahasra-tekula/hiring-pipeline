const { asyncHandler } = require("../lib/http");
const hiringPipelineService = require("../services/hiringPipelineService");

function buildActor(req, type) {
  return {
    type,
    id: req.requestId,
    requestId: req.requestId,
  };
}

const getStatus = asyncHandler(async (req, res) => {
  const application = await hiringPipelineService.getApplicationStatus(
    req.params.applicationId,
  );

  res.status(200).json(application);
});

const acknowledge = asyncHandler(async (req, res) => {
  const application = await hiringPipelineService.acknowledgeApplication(
    req.params.applicationId,
    buildActor(req, "APPLICANT"),
  );

  res.status(200).json(application);
});

const exit = asyncHandler(async (req, res) => {
  const result = await hiringPipelineService.exitApplication(
    req.params.applicationId,
    req.body || {},
    buildActor(req, "APPLICANT"),
  );

  res.status(200).json(result);
});

module.exports = {
  acknowledge,
  exit,
  getStatus,
};
