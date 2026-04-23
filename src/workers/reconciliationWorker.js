const config = require("../config");
const hiringPipelineService = require("../services/hiringPipelineService");

let timer = null;
let inFlight = false;

async function runOnce() {
  if (inFlight) {
    return [];
  }

  inFlight = true;

  try {
    const results = await hiringPipelineService.reconcileEligibleJobs(
      config.reconciler.batchSize,
    );

    if (results.length > 0) {
      console.log(
        `Reconciler processed ${results.length} job(s) at ${new Date().toISOString()}`,
      );
    }

    return results;
  } finally {
    inFlight = false;
  }
}

function startWorker() {
  if (!config.reconciler.enabled) {
    return () => {};
  }

  runOnce().catch((error) => {
    console.error("Initial reconciliation tick failed", error);
  });

  timer = setInterval(() => {
    runOnce().catch((error) => {
      console.error("Scheduled reconciliation tick failed", error);
    });
  }, config.reconciler.intervalMs);

  return () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

module.exports = {
  runOnce,
  startWorker,
};