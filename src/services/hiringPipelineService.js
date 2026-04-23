const { randomUUID } = require("node:crypto");

const { query } = require("../db/pool");
const { withTransaction } = require("../db/transaction");
const { AppError } = require("../lib/errors");
const { addSeconds, toIsoOrNull } = require("../lib/time");
const {
  assertInteger,
  assertOptionalString,
  assertString,
  assertUuid,
  normalizeEmail,
  parseLimit,
} = require("../lib/validators");
const applicantRepository = require("../repositories/applicantRepository");
const applicationRepository = require("../repositories/applicationRepository");
const auditRepository = require("../repositories/auditRepository");
const jobRepository = require("../repositories/jobRepository");

function buildActor(actor = {}) {
  return {
    type: actor.type || "SYSTEM",
    id: actor.id || null,
    requestId: actor.requestId || null,
  };
}

function assertJobExists(job) {
  if (!job) {
    throw new AppError(404, "JOB_NOT_FOUND", "Job was not found.");
  }
}

function assertApplicationExists(application) {
  if (!application) {
    throw new AppError(404, "APPLICATION_NOT_FOUND", "Application was not found.");
  }
}

async function recordEvent(client, actor, application, event) {
  return auditRepository.insert(client, {
    application_id: application.id,
    job_id: application.job_id,
    applicant_id: application.applicant_id,
    actor_type: actor.type,
    actor_id: actor.id,
    event_type: event.event_type,
    reason: event.reason,
    from_status: event.from_status,
    to_status: event.to_status,
    from_ack_state: event.from_ack_state,
    to_ack_state: event.to_ack_state,
    from_queue_token: event.from_queue_token,
    to_queue_token: event.to_queue_token,
    metadata: {
      requestId: actor.requestId,
      ...(event.metadata || {}),
    },
  });
}

async function buildStatusSnapshot(client, applicationId) {
  const detailed = await applicationRepository.findDetailedById(client, applicationId);
  assertApplicationExists(detailed);

  let queuePosition = null;

  if (detailed.status === "WAITLIST") {
    queuePosition = (await applicationRepository.countQueueAhead(client, detailed)) + 1;
  }

  return {
    applicationId: detailed.id,
    job: {
      id: detailed.job_id,
      title: detailed.job_title,
      activeCapacity: detailed.active_capacity,
      activeCount: detailed.active_count,
    },
    applicant: {
      id: detailed.applicant_id,
      name: detailed.applicant_name,
      email: detailed.applicant_email,
    },
    status: detailed.status,
    queuePosition,
    queueToken: detailed.queue_token,
    waitlistEligibleAt: toIsoOrNull(detailed.waitlist_eligible_at),
    waitlistPenaltyCount: detailed.waitlist_penalty_count,
    acknowledgement: {
      state: detailed.ack_state,
      required: detailed.ack_state === "PENDING",
      deadlineAt: toIsoOrNull(detailed.ack_deadline_at),
    },
    lastPromotedAt: toIsoOrNull(detailed.last_promoted_at),
    appliedAt: toIsoOrNull(detailed.applied_at),
    exitedAt: toIsoOrNull(detailed.exited_at),
    exitReason: detailed.exit_reason || null,
  };
}

function nextQueueToken(job) {
  job.waitlist_sequence += 1;
  return job.waitlist_sequence;
}

async function moveApplicationToWaitlistWithPenalty(client, job, application, actor, now, reason) {
  if (application.status !== "ACTIVE") {
    throw new AppError(
      500,
      "INVARIANT_VIOLATION",
      "Only active applications can be decayed back to the waitlist.",
    );
  }

  if (job.active_count <= 0) {
    throw new AppError(
      500,
      "INVARIANT_VIOLATION",
      "Job active_count cannot go below zero.",
    );
  }

  const queueToken = nextQueueToken(job);
  const eligibleAt = addSeconds(now, job.decay_cooldown_seconds);

  const updated = await applicationRepository.moveToWaitlist(client, application.id, {
    queue_token: queueToken,
    queueToken,
    waitlist_entered_at: now,
    waitlist_eligible_at: eligibleAt,
    waitlist_penalty_count: application.waitlist_penalty_count + 1,
  });

  job.active_count -= 1;

  await recordEvent(client, actor, updated, {
    event_type: "INACTIVITY_DECAY_APPLIED",
    reason,
    from_status: application.status,
    to_status: updated.status,
    from_ack_state: application.ack_state,
    to_ack_state: updated.ack_state,
    from_queue_token: application.queue_token,
    to_queue_token: updated.queue_token,
    metadata: {
      cooldownEndsAt: eligibleAt.toISOString(),
      penaltyCount: updated.waitlist_penalty_count,
      expiredDeadlineAt: toIsoOrNull(application.ack_deadline_at),
    },
  });

  return updated;
}

async function fillVacancies(client, job, actor, reason = "rebalance") {
  const promotions = [];

  while (job.active_count < job.active_capacity) {
    const nextWaitlisted =
      await applicationRepository.findNextPromotableWaitlistedForUpdate(
        client,
        job.id
      );

    if (!nextWaitlisted) {
      break;
    }

    const currentTime = new Date();
    const deadline = addSeconds(currentTime, job.ack_window_seconds);

    const promoted = await applicationRepository.promoteToActivePendingAck(
      client,
      nextWaitlisted.id,
      {
        last_promoted_at: currentTime,
        ack_deadline_at: deadline,
      }
    );

    job.active_count += 1;

    await recordEvent(client, actor, promoted, {
      event_type: "WAITLIST_PROMOTED",
      reason,
      from_status: nextWaitlisted.status,
      to_status: promoted.status,
      from_ack_state: nextWaitlisted.ack_state,
      to_ack_state: promoted.ack_state,
      from_queue_token: nextWaitlisted.queue_token,
      to_queue_token: promoted.queue_token,
      metadata: {
        ackDeadlineAt: deadline.toISOString(),
        priorQueueToken: nextWaitlisted.queue_token,
      },
    });

    promotions.push(promoted);
  }

  return promotions;
}

async function expirePendingAcknowledgements(client, job, actor, now) {
  const expiredApplications =
    await applicationRepository.findExpiredPendingAcknowledgementsForUpdate(
      client,
      job.id,
      now,
    );

  const moved = [];

  for (const application of expiredApplications) {
    moved.push(
      await moveApplicationToWaitlistWithPenalty(
        client,
        job,
        application,
        actor,
        now,
        "ack_deadline_expired",
      ),
    );
  }

  return moved;
}

async function createJob(payload, actorInput) {
  payload = payload || {};
  const actor = buildActor(actorInput);
  const title = assertString(payload.title, "title", { maxLength: 200 });
  const description = assertOptionalString(payload.description, "description", {
    maxLength: 2000,
  });
  const activeCapacity = assertInteger(payload.activeCapacity, "activeCapacity", {
    min: 1,
    max: 10000,
  });
  const ackWindowSeconds = assertInteger(
    payload.ackWindowSeconds ?? 86400,
    "ackWindowSeconds",
    {
      min: 60,
      max: 604800,
    },
  );
  const decayCooldownSeconds = assertInteger(
    payload.decayCooldownSeconds ?? 3600,
    "decayCooldownSeconds",
    {
      min: 60,
      max: 604800,
    },
  );

  const job = await withTransaction(async (client) =>
    jobRepository.create(client, {
      id: randomUUID(),
      title,
      description,
      active_capacity: activeCapacity,
      ack_window_seconds: ackWindowSeconds,
      decay_cooldown_seconds: decayCooldownSeconds,
    }),
  );

  return {
    id: job.id,
    title: job.title,
    description: job.description,
    activeCapacity: job.active_capacity,
    activeCount: job.active_count,
    ackWindowSeconds: job.ack_window_seconds,
    decayCooldownSeconds: job.decay_cooldown_seconds,
    createdBy: actor.type,
    createdAt: toIsoOrNull(job.created_at),
  };
}

async function applyToJob(jobId, payload, actorInput) {
  assertUuid(jobId, "jobId");
  payload = payload || {};
  const actor = buildActor(actorInput);
  const applicantName = assertString(payload.name, "name", { maxLength: 200 });
  const applicantEmail = normalizeEmail(payload.email);

  return withTransaction(async (client) => {
    const job = await jobRepository.findByIdForUpdate(client, jobId);
    assertJobExists(job);

    const applicant = await applicantRepository.upsert(client, {
      id: randomUUID(),
      name: applicantName,
      email: applicantEmail,
      metadata: payload.metadata || {},
    });

    const existing = await applicationRepository.findByJobAndApplicant(
      client,
      job.id,
      applicant.id,
    );

    if (existing) {
      throw new AppError(
        409,
        "DUPLICATE_APPLICATION",
        "Applicant has already applied to this job.",
        {
          applicationId: existing.id,
          status: existing.status,
        },
      );
    }

    const now = new Date();
    const systemActor = { ...actor, type: "SYSTEM" };
    await expirePendingAcknowledgements(client, job, systemActor, now);
    await fillVacancies(client, job, systemActor, now, "rebalance_before_apply");

    let application;

    if (job.active_count < job.active_capacity) {
      application = await applicationRepository.create(client, {
        id: randomUUID(),
        job_id: job.id,
        applicant_id: applicant.id,
        status: "ACTIVE",
        ack_state: "NOT_REQUIRED",
        queue_token: null,
        waitlist_entered_at: null,
        waitlist_eligible_at: null,
        last_promoted_at: null,
        ack_deadline_at: null,
        waitlist_penalty_count: 0,
        applied_at: now,
        metadata: payload.metadata || {},
      });

      job.active_count += 1;

      await recordEvent(client, actor, application, {
        event_type: "APPLICATION_SUBMITTED",
        reason: "direct_admission",
        from_status: null,
        to_status: application.status,
        from_ack_state: null,
        to_ack_state: application.ack_state,
        from_queue_token: null,
        to_queue_token: null,
        metadata: {
          path: "direct_active",
        },
      });
    } else {
      const queueToken = nextQueueToken(job);
      application = await applicationRepository.create(client, {
        id: randomUUID(),
        job_id: job.id,
        applicant_id: applicant.id,
        status: "WAITLIST",
        ack_state: "NOT_REQUIRED",
        queue_token: queueToken,
        waitlist_entered_at: now,
        waitlist_eligible_at: now,
        last_promoted_at: null,
        ack_deadline_at: null,
        waitlist_penalty_count: 0,
        applied_at: now,
        metadata: payload.metadata || {},
      });

      await recordEvent(client, actor, application, {
        event_type: "APPLICATION_SUBMITTED",
        reason: "capacity_full",
        from_status: null,
        to_status: application.status,
        from_ack_state: null,
        to_ack_state: application.ack_state,
        from_queue_token: null,
        to_queue_token: application.queue_token,
        metadata: {
          path: "waitlist",
          queueToken,
        },
      });
    }

    await jobRepository.updateCounters(client, job);
    return buildStatusSnapshot(client, application.id);
  });
}

const { pool } = require("../db/pool");

async function getApplicationStatus(applicationId) {
  assertUuid(applicationId, "applicationId");

  const snapshot = await buildStatusSnapshot(pool, applicationId);

  return snapshot;
}

async function acknowledgeApplication(applicationId, actorInput) {
  assertUuid(applicationId, "applicationId");
  const actor = buildActor(actorInput);

  return withTransaction(async (client) => {
    const existing = await applicationRepository.findById(client, applicationId);
    assertApplicationExists(existing);

    const job = await jobRepository.findByIdForUpdate(client, existing.job_id);
    assertJobExists(job);

    const application = await applicationRepository.findByIdForUpdate(client, applicationId);
    assertApplicationExists(application);

    if (application.status !== "ACTIVE") {
      throw new AppError(
        409,
        "APPLICATION_NOT_ACTIVE",
        "Only active applications can be acknowledged.",
      );
    }

    if (application.ack_state === "NOT_REQUIRED" || application.ack_state === "ACKNOWLEDGED") {
      return buildStatusSnapshot(client, application.id);
    }

    const now = new Date();

    if (new Date(application.ack_deadline_at) <= now) {
      await moveApplicationToWaitlistWithPenalty(
        client,
        job,
        application,
        { ...actor, type: "SYSTEM" },
        now,
        "late_acknowledgement",
      );

      await fillVacancies(
        client,
        job,
        { ...actor, type: "SYSTEM" },
        now,
        "ack_timeout_rebalance",
      );
      await jobRepository.updateCounters(client, job);

      throw new AppError(
        409,
        "ACK_DEADLINE_EXPIRED",
        "Acknowledgement deadline has expired. The application was moved back to the waitlist.",
        await buildStatusSnapshot(client, application.id),
      );
    }

    const updated = await applicationRepository.acknowledge(client, application.id);

    await recordEvent(client, actor, updated, {
      event_type: "APPLICATION_ACKNOWLEDGED",
      reason: "candidate_acknowledged",
      from_status: application.status,
      to_status: updated.status,
      from_ack_state: application.ack_state,
      to_ack_state: updated.ack_state,
      from_queue_token: application.queue_token,
      to_queue_token: updated.queue_token,
      metadata: {
        acknowledgedAt: now.toISOString(),
      },
    });

    return buildStatusSnapshot(client, updated.id);
  });
}

async function exitApplication(applicationId, payload, actorInput) {
  assertUuid(applicationId, "applicationId");
  payload = payload || {};
  const actor = buildActor(actorInput);
  const exitReason =
    assertOptionalString(payload.reason, "reason", { maxLength: 500 }) || "withdrawn";

  return withTransaction(async (client) => {
    const existing = await applicationRepository.findById(client, applicationId);
    assertApplicationExists(existing);

    const job = await jobRepository.findByIdForUpdate(client, existing.job_id);
    assertJobExists(job);

    const application = await applicationRepository.findByIdForUpdate(client, applicationId);
    assertApplicationExists(application);

    if (application.status === "EXITED") {
      return {
        application: await buildStatusSnapshot(client, application.id),
        promotions: [],
      };
    }

    const now = new Date();
    const updated = await applicationRepository.markExited(client, application.id, {
      exited_at: now,
      exit_reason: exitReason,
    });

    if (application.status === "ACTIVE") {
      if (job.active_count <= 0) {
        throw new AppError(
          500,
          "INVARIANT_VIOLATION",
          "Job active_count cannot go below zero.",
        );
      }

      job.active_count -= 1;
    }

    await recordEvent(client, actor, updated, {
      event_type: "APPLICATION_EXITED",
      reason: exitReason,
      from_status: application.status,
      to_status: updated.status,
      from_ack_state: application.ack_state,
      to_ack_state: updated.ack_state,
      from_queue_token: application.queue_token,
      to_queue_token: updated.queue_token,
      metadata: {
        exitedAt: now.toISOString(),
      },
    });

    const promotions = await fillVacancies(
      client,
      job,
      { ...actor, type: "SYSTEM" },
      "slot_freed"
    );
    await jobRepository.updateCounters(client, job);

    return {
      application: await buildStatusSnapshot(client, updated.id),
      promotions: await Promise.all(
        promotions.map((promotion) => buildStatusSnapshot(client, promotion.id)),
      ),
    };
  });
}

async function reconcileJob(jobId, actorInput) {
  assertUuid(jobId, "jobId");
  const actor = buildActor(actorInput);

  return withTransaction(async (client) => {
    const job = await jobRepository.findByIdForUpdate(client, jobId);
    assertJobExists(job);

    const now = new Date();
    const decayed = await expirePendingAcknowledgements(client, job, actor, now);
    const promotions = await fillVacancies(
      client,
      job,
      actor,
      now,
      "reconciler_rebalance",
    );
    await jobRepository.updateCounters(client, job);

    return {
      jobId: job.id,
      expiredAcknowledgements: decayed.length,
      promotions: promotions.length,
      activeCount: job.active_count,
    };
  });
}

async function reconcileEligibleJobs(limitInput) {
  const limit = parseLimit(limitInput, 50, 500);
  const [underfilledJobs, expiredAckJobs] = await Promise.all([
    jobRepository.listUnderfilledJobs({ query }, limit),
    applicationRepository.listJobsWithExpiredAcknowledgements({ query }, limit),
  ]);

  const jobIds = [...new Set([...expiredAckJobs, ...underfilledJobs])].slice(0, limit);
  const results = [];

  for (const jobId of jobIds) {
    try {
      results.push(
        await reconcileJob(jobId, {
          type: "SYSTEM",
          id: "reconciler",
        }),
      );
    } catch (error) {
      console.error(`Failed to reconcile job ${jobId}`, error);
    }
  }

  return results;
}

async function getJobAuditLog(jobId, limitInput) {
  assertUuid(jobId, "jobId");
  const limit = parseLimit(limitInput, 100, 1000);
  const job = await jobRepository.findById({ query }, jobId);
  assertJobExists(job);
  const events = await auditRepository.listByJob({ query }, jobId, limit);

  return events.map((event) => ({
    id: event.id,
    applicationId: event.application_id,
    applicantId: event.applicant_id,
    eventType: event.event_type,
    actorType: event.actor_type,
    actorId: event.actor_id,
    reason: event.reason,
    fromStatus: event.from_status,
    toStatus: event.to_status,
    fromAckState: event.from_ack_state,
    toAckState: event.to_ack_state,
    fromQueueToken: event.from_queue_token,
    toQueueToken: event.to_queue_token,
    metadata: event.metadata,
    occurredAt: toIsoOrNull(event.occurred_at),
  }));
}

module.exports = {
  acknowledgeApplication,
  applyToJob,
  createJob,
  exitApplication,
  getApplicationStatus,
  getJobAuditLog,
  reconcileEligibleJobs,
  reconcileJob,
};