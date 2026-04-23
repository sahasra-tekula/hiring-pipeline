import { useEffect, useState } from "react";
import {
  applyToJob,
  exitApplication,
  getApplicationStatus,
} from "../api/hiringPipelineApi";
import Notice from "./Notice";
import SectionCard from "./SectionCard";

function emptyApplyForm(jobId = "") {
  return {
    jobId,
    name: "",
    email: "",
  };
}

function statusTone(status) {
  if (status === "ACTIVE") {
    return "success";
  }

  if (status === "WAITLIST") {
    return "warning";
  }

  if (status === "EXITED") {
    return "danger";
  }

  return "info";
}

function formatDate(value) {
  if (!value) {
    return "Not set";
  }

  return new Date(value).toLocaleString();
}

function ApplicantView({
  createdJobId,
  initialApplicationId,
  onApplicationObserved,
}) {
  const [applyForm, setApplyForm] = useState(emptyApplyForm(createdJobId));
  const [applicationId, setApplicationId] = useState(initialApplicationId || "");
  const [statusData, setStatusData] = useState(null);

  const [applyLoading, setApplyLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [exitLoading, setExitLoading] = useState(false);

  const [applyMessage, setApplyMessage] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [exitMessage, setExitMessage] = useState(null);

  useEffect(() => {
    if (!initialApplicationId) {
      return;
    }

    setApplicationId(initialApplicationId);
  }, [initialApplicationId]);

  useEffect(() => {
    if (!createdJobId) {
      return;
    }

    setApplyForm((currentForm) => ({
      ...currentForm,
      jobId: currentForm.jobId || createdJobId,
    }));
  }, [createdJobId]);

  async function handleApply(event) {
    event.preventDefault();
    setApplyLoading(true);
    setApplyMessage(null);

    try {
      const response = await applyToJob(applyForm.jobId.trim(), {
        name: applyForm.name.trim(),
        email: applyForm.email.trim(),
      });

      setStatusData(response);
      setApplicationId(response.applicationId);
      onApplicationObserved(response);
      setApplyForm((currentForm) => ({
        ...currentForm,
        name: "",
        email: "",
      }));
      setApplyMessage({
        tone: "success",
        text: `Application submitted successfully. Current status: ${response.status}`,
      });
    } catch (error) {
      setApplyMessage({
        tone: "error",
        text: error.message,
      });
    } finally {
      setApplyLoading(false);
    }
  }

  async function handleCheckStatus(event) {
    event.preventDefault();
    setStatusLoading(true);
    setStatusMessage(null);

    try {
      const response = await getApplicationStatus(applicationId.trim());
      setStatusData(response);
      onApplicationObserved(response);
      setStatusMessage({
        tone: "success",
        text: "Application status loaded successfully.",
      });
    } catch (error) {
      setStatusMessage({
        tone: "error",
        text: error.message,
      });
    } finally {
      setStatusLoading(false);
    }
  }

  async function handleExitApplication() {
    setExitLoading(true);
    setExitMessage(null);

    try {
      const response = await exitApplication(applicationId.trim(), "candidate_withdrew");
      setStatusData(response.application);
      onApplicationObserved(response.application);
      setExitMessage({
        tone: "success",
        text: "Application withdrawn successfully.",
      });
    } catch (error) {
      setExitMessage({
        tone: "error",
        text: error.message,
      });
    } finally {
      setExitLoading(false);
    }
  }

  return (
    <div className="stack">
      <SectionCard
        eyebrow="Applicant Portal"
        title="Apply to Job"
        description="Submit a new application using a valid job ID."
      >
        <form className="form-grid" onSubmit={handleApply}>
          <label className="field">
            <span>Job ID</span>
            <input
              type="text"
              placeholder="Paste job ID"
              value={applyForm.jobId}
              onChange={(event) =>
                setApplyForm((currentForm) => ({
                  ...currentForm,
                  jobId: event.target.value,
                }))
              }
              required
            />
          </label>

          <label className="field">
            <span>Name</span>
            <input
              type="text"
              placeholder="Alex Doe"
              value={applyForm.name}
              onChange={(event) =>
                setApplyForm((currentForm) => ({
                  ...currentForm,
                  name: event.target.value,
                }))
              }
              required
            />
          </label>

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              placeholder="alex@example.com"
              value={applyForm.email}
              onChange={(event) =>
                setApplyForm((currentForm) => ({
                  ...currentForm,
                  email: event.target.value,
                }))
              }
              required
            />
          </label>

          <button className="button button-primary" disabled={applyLoading}>
            {applyLoading ? "Submitting..." : "Apply to Job"}
          </button>
        </form>

        <Notice tone={applyMessage?.tone}>{applyMessage?.text}</Notice>

        {statusData?.applicationId ? (
          <div className="result-card">
            <div className="result-row result-row-top">
              <div>
                <span className="result-label">Application ID</span>
                <code>{statusData.applicationId}</code>
              </div>
              <span className={`status-pill status-pill-${statusTone(statusData.status)}`}>
                {statusData.status}
              </span>
            </div>
            <div className="result-row">
              <span className="result-label">Queue position</span>
              <span>{statusData.queuePosition ?? "Not in queue"}</span>
            </div>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        eyebrow="Applicant Portal"
        title="Check Status"
        description="Review the current application state, queue position, and acknowledgement details."
      >
        <form className="form-grid" onSubmit={handleCheckStatus}>
          <label className="field">
            <span>Application ID</span>
            <input
              type="text"
              placeholder="Paste application ID"
              value={applicationId}
              onChange={(event) => setApplicationId(event.target.value)}
              required
            />
          </label>

          <button className="button button-primary" disabled={statusLoading}>
            {statusLoading ? "Checking..." : "Check Status"}
          </button>
        </form>

        <Notice tone={statusMessage?.tone}>{statusMessage?.text}</Notice>

        {statusData ? (
          <div className="result-card">
            <div className="result-row result-row-top">
              <div>
                <span className="result-label">Current status</span>
                <strong>{statusData.status}</strong>
              </div>
              <span className={`status-pill status-pill-${statusTone(statusData.status)}`}>
                {statusData.status}
              </span>
            </div>

            <div className="result-row">
              <span className="result-label">Queue position</span>
              <span>{statusData.queuePosition ?? "Not in queue"}</span>
            </div>

            <div className="result-row">
              <span className="result-label">Acknowledgement state</span>
              <span>{statusData.acknowledgement?.state || "NOT_REQUIRED"}</span>
            </div>

            <div className="result-row">
              <span className="result-label">Acknowledgement deadline</span>
              <span>{formatDate(statusData.acknowledgement?.deadlineAt)}</span>
            </div>

            <div className="result-row">
              <span className="result-label">Job ID</span>
              <code>{statusData.job.id}</code>
            </div>

            <div className="result-row">
              <span className="result-label">Applicant</span>
              <span>{statusData.applicant.name}</span>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <p>No application selected yet.</p>
            <span>Apply to a job or paste an application ID to load the latest status.</span>
          </div>
        )}
      </SectionCard>

      <SectionCard
        eyebrow="Applicant Portal"
        title="Withdraw Application"
        description="Use the current application ID above to withdraw from the pipeline."
      >
        <div className="withdraw-panel">
          <div className="withdraw-copy">
            <span className="result-label">Current application ID</span>
            <code>{applicationId || "No application selected"}</code>
          </div>

          <button
            className="button button-secondary"
            type="button"
            onClick={handleExitApplication}
            disabled={!applicationId || exitLoading || statusData?.status === "EXITED"}
          >
            {exitLoading ? "Withdrawing..." : "Withdraw Application"}
          </button>
        </div>

        <Notice tone={exitMessage?.tone}>{exitMessage?.text}</Notice>
      </SectionCard>
    </div>
  );
}

export default ApplicantView;
