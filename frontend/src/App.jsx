import { useState } from "react";
import ApplicantView from "./components/ApplicantView";
import CompanyDashboard from "./components/CompanyDashboard";

function upsertTrackedApplication(currentApplications, nextApplication) {
  if (!nextApplication?.applicationId) {
    return currentApplications;
  }

  const remainingApplications = currentApplications.filter(
    (application) => application.applicationId !== nextApplication.applicationId,
  );

  return [nextApplication, ...remainingApplications];
}

function App() {
  const [activeView, setActiveView] = useState("recruiter");
  const [createdJobId, setCreatedJobId] = useState("");
  const [lastApplicationId, setLastApplicationId] = useState("");
  const [trackedApplications, setTrackedApplications] = useState([]);

  function handleApplicationObserved(application) {
    if (!application?.applicationId) {
      return;
    }

    setLastApplicationId(application.applicationId);
    setTrackedApplications((currentApplications) =>
      upsertTrackedApplication(currentApplications, application),
    );
  }

  const isRecruiterView = activeView === "recruiter";

  return (
    <div className="app-shell">
      <div className="page-glow page-glow-left" />
      <div className="page-glow page-glow-right" />

      <main className="page">
        <header className="hero">
          <p className="hero-eyebrow">Hiring Operations</p>
          <h1>Hiring Pipeline Dashboard</h1>
          <p className="hero-copy">
            Manage job pipelines and track applicant progression.
          </p>
        </header>

        <div className="view-switcher">
          <button
            type="button"
            className={`view-tab ${isRecruiterView ? "view-tab-active" : ""}`}
            onClick={() => setActiveView("recruiter")}
          >
            Recruiter Dashboard
          </button>
          <button
            type="button"
            className={`view-tab ${!isRecruiterView ? "view-tab-active" : ""}`}
            onClick={() => setActiveView("applicant")}
          >
            Applicant Portal
          </button>
        </div>

        <section className="workspace-shell">
          {isRecruiterView ? (
            <CompanyDashboard
              createdJobId={createdJobId}
              trackedApplications={trackedApplications}
              onJobCreated={setCreatedJobId}
            />
          ) : (
            <ApplicantView
              createdJobId={createdJobId}
              initialApplicationId={lastApplicationId}
              onApplicationObserved={handleApplicationObserved}
            />
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
