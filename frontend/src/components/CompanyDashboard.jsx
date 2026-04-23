import { useEffect, useMemo, useState } from "react";
import { createJob } from "../api/hiringPipelineApi";
import Notice from "./Notice";
import SectionCard from "./SectionCard";

function emptyCreateForm() {
  return {
    title: "",
    activeCapacity: 1,
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

function compareWaitlistOrder(left, right) {
  if (left.queuePosition === null && right.queuePosition === null) {
    return 0;
  }

  if (left.queuePosition === null) {
    return 1;
  }

  if (right.queuePosition === null) {
    return -1;
  }

  return left.queuePosition - right.queuePosition;
}

function PipelineList({ title, applications, emptyText }) {
  return (
    <div className="pipeline-column">
      <div className="pipeline-column-header">
        <h3>{title}</h3>
        <span className="pipeline-count">{applications.length}</span>
      </div>

      {applications.length === 0 ? (
        <div className="pipeline-empty">{emptyText}</div>
      ) : (
        <div className="pipeline-list">
          {applications.map((application) => (
            <div className="pipeline-item" key={application.applicationId}>
              <div className="pipeline-item-main">
                <strong>{application.applicant?.name || "Applicant"}</strong>
                <span>{application.applicant?.email || "No email provided"}</span>
              </div>

              <div className="pipeline-item-side">
                <span className={`status-pill status-pill-${statusTone(application.status)}`}>
                  {application.status}
                </span>
                <span className="pipeline-meta">
                  {application.status === "WAITLIST"
                    ? `Queue #${application.queuePosition ?? "-"}`
                    : application.status === "EXITED"
                      ? "Withdrawn"
                      : "In active pool"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CompanyDashboard({ createdJobId, trackedApplications, onJobCreated }) {
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [createLoading, setCreateLoading] = useState(false);
  const [createMessage, setCreateMessage] = useState(null);
  const [lastCreatedJob, setLastCreatedJob] = useState(null);

  const [pipelineJobIdInput, setPipelineJobIdInput] = useState("");
  const [selectedPipelineJobId, setSelectedPipelineJobId] = useState("");
  const [pipelineMessage, setPipelineMessage] = useState(null);

  useEffect(() => {
    if (!createdJobId) {
      return;
    }

    setPipelineJobIdInput((currentValue) => currentValue || createdJobId);
    setSelectedPipelineJobId((currentValue) => currentValue || createdJobId);
  }, [createdJobId]);

  const pipelineApplications = useMemo(() => {
    if (!selectedPipelineJobId) {
      return [];
    }

    return trackedApplications.filter(
      (application) => application.job?.id === selectedPipelineJobId,
    );
  }, [selectedPipelineJobId, trackedApplications]);

  const activeApplications = useMemo(
    () =>
      pipelineApplications.filter((application) => application.status === "ACTIVE"),
    [pipelineApplications],
  );

  const waitlistApplications = useMemo(
    () =>
      pipelineApplications
        .filter((application) => application.status === "WAITLIST")
        .sort(compareWaitlistOrder),
    [pipelineApplications],
  );

  async function handleCreateJob(event) {
    event.preventDefault();
    setCreateLoading(true);
    setCreateMessage(null);

    try {
      const response = await createJob({
        title: createForm.title.trim(),
        activeCapacity: Number(createForm.activeCapacity),
      });

      setLastCreatedJob(response);
      onJobCreated(response.id);
      setCreateForm(emptyCreateForm());
      setCreateMessage({
        tone: "success",
        text: `Job created successfully. Job ID: ${response.id}`,
      });
    } catch (error) {
      setCreateMessage({
        tone: "error",
        text: error.message,
      });
    } finally {
      setCreateLoading(false);
    }
  }

  function handleLoadPipeline(event) {
    event.preventDefault();

    const nextJobId = pipelineJobIdInput.trim();
    setSelectedPipelineJobId(nextJobId);

    if (!nextJobId) {
      setPipelineMessage({
        tone: "error",
        text: "Enter a job ID to load a pipeline view.",
      });
      return;
    }

    setPipelineMessage({
      tone: "info",
      text: "Showing tracked applications captured in this browser session for the selected job.",
    });
  }

  return (
    <div className="stack">
      <SectionCard
        eyebrow="Recruiter Dashboard"
        title="Create Job"
        description="Create a role and define how many applicants remain active before new applicants move into the waitlist."
      >
        <form className="form-grid" onSubmit={handleCreateJob}>
          <label className="field">
            <span>Job title</span>
            <input
              type="text"
              placeholder="Backend Engineer"
              value={createForm.title}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              required
            />
          </label>

          <label className="field">
            <span>Active capacity</span>
            <input
              type="number"
              min="1"
              value={createForm.activeCapacity}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  activeCapacity: event.target.value,
                }))
              }
              required
            />
          </label>

          <button className="button button-primary" disabled={createLoading}>
            {createLoading ? "Creating job..." : "Create Job"}
          </button>
        </form>

        <Notice tone={createMessage?.tone}>{createMessage?.text}</Notice>

        {lastCreatedJob ? (
          <div className="result-card">
            <div className="result-row">
              <span className="result-label">Created job ID</span>
              <code>{lastCreatedJob.id}</code>
            </div>
            <div className="result-row">
              <span className="result-label">Title</span>
              <span>{lastCreatedJob.title}</span>
            </div>
            <div className="result-row">
              <span className="result-label">Capacity</span>
              <span>{lastCreatedJob.activeCapacity}</span>
            </div>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        eyebrow="Recruiter Dashboard"
        title="Pipeline Overview"
        description="Load a job to review active applicants and the current waitlist. This view uses application data captured in the current session."
      >
        <form className="pipeline-toolbar" onSubmit={handleLoadPipeline}>
          <label className="field field-grow">
            <span>Job ID</span>
            <input
              type="text"
              placeholder="Paste job ID"
              value={pipelineJobIdInput}
              onChange={(event) => setPipelineJobIdInput(event.target.value)}
              required
            />
          </label>

          <button className="button button-primary button-inline" type="submit">
            Load Pipeline
          </button>
        </form>

        <Notice tone={pipelineMessage?.tone}>{pipelineMessage?.text}</Notice>

        {selectedPipelineJobId ? (
          <>
            <div className="summary-grid">
              <div className="summary-card">
                <span className="summary-label">Loaded Job</span>
                <code>{selectedPipelineJobId}</code>
              </div>
              <div className="summary-card">
                <span className="summary-label">Active Applicants</span>
                <strong>{activeApplications.length}</strong>
              </div>
              <div className="summary-card">
                <span className="summary-label">Waitlist</span>
                <strong>{waitlistApplications.length}</strong>
              </div>
            </div>

            <div className="pipeline-grid">
              <PipelineList
                title="Active Applicants"
                applications={activeApplications}
                emptyText="No active applicants tracked for this job yet."
              />
              <PipelineList
                title="Waitlist"
                applications={waitlistApplications}
                emptyText="No waitlisted applicants tracked for this job yet."
              />
            </div>
          </>
        ) : (
          <div className="empty-state">
            <p>No pipeline loaded yet.</p>
            <span>Enter a job ID above to load a pipeline view.</span>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

export default CompanyDashboard;
