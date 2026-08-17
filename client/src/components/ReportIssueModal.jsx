import React, { useState } from "react";
import api from "../services/api.js";

const ISSUE_TYPES = [
  { value: "INCORRECT_NAME", label: "Incorrect name" },
  { value: "INCORRECT_STUDENT_ID", label: "Incorrect Student ID" },
  { value: "INCORRECT_CLASS", label: "Incorrect class/grade" },
  { value: "INCORRECT_SECTION", label: "Incorrect section" },
  { value: "INCORRECT_SCHOOL", label: "Incorrect school information" },
  { value: "RECORD_NOT_FOUND", label: "Student record not found" },
  { value: "OTHER", label: "Other" },
];

export default function ReportIssueModal({ studentId, schoolCode, defaultIssueType, onClose }) {
  const [issueType, setIssueType] = useState(defaultIssueType || "RECORD_NOT_FOUND");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!description.trim()) {
      setError("Please describe the issue so the admin knows what to check.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post("/correction-requests", { studentId, schoolCode, issueType, description });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Could not submit your request. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-issue-title"
    >
      <div className="card w-full max-w-md">
        {result ? (
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sage-100 text-sage-700">
              ✓
            </div>
            <h3 className="mt-4 text-lg font-semibold text-ink">Correction request submitted</h3>
            <p className="mt-2 text-sm text-ink-soft">{result.message}</p>
            <p className="mt-3 rounded-md bg-canvas-sunk px-4 py-2 text-sm font-medium text-brand-700">
              Request ID: {result.requestCode}
            </p>
            <p className="mt-2 text-sm text-ink-faint">
              Our school administrator will review your request. Current status: <strong>{result.status}</strong>.
              Keep your Request ID and Student ID — you can check the status any time from the "Track a Request" page.
            </p>
            <button onClick={onClose} className="btn-primary mt-5 w-full">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h3 id="report-issue-title" className="text-lg font-semibold text-ink">
              Report an Issue
            </h3>
            <p className="mt-1 text-sm text-ink-soft">
              Tell us what looks wrong. A school administrator will review your report.
            </p>

            {error && <div role="alert" className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

            <div className="mt-4">
              <label htmlFor="issueType" className="mb-1.5 block text-sm font-medium text-ink">
                Issue Type
              </label>
              <select id="issueType" className="input-field" value={issueType} onChange={(e) => setIssueType(e.target.value)}>
                {ISSUE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4">
              <label htmlFor="description" className="mb-1.5 block text-sm font-medium text-ink">
                Description
              </label>
              <textarea
                id="description"
                className="input-field min-h-[100px]"
                placeholder="e.g. My actual class is 10-A, but the system shows 9-B."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="mt-5 flex gap-3">
              <button type="submit" disabled={loading} className="btn-primary flex-1">
                {loading ? "Submitting…" : "Submit Correction Request"}
              </button>
              <button type="button" onClick={onClose} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
