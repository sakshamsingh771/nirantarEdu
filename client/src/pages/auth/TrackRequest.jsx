import React, { useState } from "react";
import { Link } from "react-router-dom";
import api from "../../services/api.js";

const STATUS_LABELS = {
  pending: "Pending",
  under_review: "Under Review",
  approved: "Approved",
  rejected: "Rejected",
  resolved: "Resolved",
};

const STATUS_COLORS = {
  pending: "bg-accent-400/20 text-accent-600",
  under_review: "bg-brand-100 text-brand-700",
  approved: "bg-sage-100 text-sage-700",
  rejected: "bg-red-50 text-red-700",
  resolved: "bg-sage-100 text-sage-700",
};

export default function TrackRequest() {
  const [form, setForm] = useState({ requestCode: "", studentId: "" });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setResult(null);
    if (!form.requestCode || !form.studentId) {
      setError("Please enter both your Request ID and Student ID.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.get("/correction-requests/track", { params: form });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "No matching request found.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-600 text-sm font-bold text-white">
              NE
            </span>
            <span className="text-xl font-semibold text-brand-800">NirantarEdu</span>
          </Link>
          <p className="mt-2 text-sm text-ink-soft">Check the status of a correction request you filed.</p>
        </div>

        <form onSubmit={submit} className="card space-y-5" noValidate>
          {error && <div role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <div>
            <label htmlFor="requestCode" className="mb-1.5 block text-sm font-medium text-ink">
              Request ID
            </label>
            <input
              id="requestCode"
              className="input-field"
              placeholder="e.g. CR-1025"
              value={form.requestCode}
              onChange={(e) => setForm({ ...form, requestCode: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="studentId" className="mb-1.5 block text-sm font-medium text-ink">
              Student ID
            </label>
            <input
              id="studentId"
              className="input-field"
              placeholder="The Student ID you filed it under"
              value={form.studentId}
              onChange={(e) => setForm({ ...form, studentId: e.target.value })}
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Checking…" : "Check Status"}
          </button>
        </form>

        {result && (
          <div className="card mt-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-ink">{result.requestCode}</h3>
              <span className={`badge ${STATUS_COLORS[result.status]}`}>{STATUS_LABELS[result.status]}</span>
            </div>
            <p className="mt-2 text-sm text-ink-soft">Filed {new Date(result.createdAt).toLocaleDateString()}</p>
            {result.adminResponse && (
              <div className="mt-3 rounded-md bg-canvas-sunk p-3 text-sm text-ink">
                <span className="font-medium">Admin response: </span>
                {result.adminResponse}
              </div>
            )}
          </div>
        )}

        <p className="mt-6 text-center text-sm text-ink-soft">
          <Link to="/register" className="font-medium text-brand-700 hover:underline">
            Back to registration
          </Link>
        </p>
      </div>
    </div>
  );
}
