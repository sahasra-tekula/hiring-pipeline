const DEFAULT_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:3000";

function buildUrl(path) {
  if (!DEFAULT_BASE_URL) {
    return path;
  }

  return `${DEFAULT_BASE_URL}${path}`;
}

async function request(path, options = {}) {
  const response = await fetch(buildUrl(path), {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const hasJson = response.headers
    .get("content-type")
    ?.includes("application/json");
  const payload = hasJson ? await response.json() : null;

  if (!response.ok) {
    const message =
      payload?.error?.message || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

export function createJob(data) {
  return request("/jobs", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function applyToJob(jobId, data) {
  return request(`/jobs/${jobId}/applications`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function getApplicationStatus(applicationId) {
  return request(`/applications/${applicationId}/status`);
}

export function exitApplication(applicationId, reason) {
  return request(`/applications/${applicationId}/exit`, {
    method: "POST",
    body: JSON.stringify(reason ? { reason } : {}),
  });
}