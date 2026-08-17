import React, { useState } from "react";
import { Link } from "react-router-dom";
import api from "../../services/api.js";

export default function AdminForgotPassword() {
  const [form, setForm] = useState({ schoolCode: "", adminId: "", recoveryCode: "", newPassword: "", confirmNewPassword: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.newPassword !== form.confirmNewPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (form.newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/admin/forgot-password", form);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.message || "Could not reset password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-600 text-sm font-bold text-white">NE</span>
            <span className="text-xl font-semibold text-brand-800">NirantarEdu</span>
          </Link>
          <p className="mt-2 text-sm text-ink-soft">Admin password recovery using your school's recovery code.</p>
        </div>

        {success ? (
          <div className="card text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sage-100 text-sage-700">✓</div>
            <h3 className="mt-4 text-lg font-semibold text-ink">Password reset</h3>
            <p className="mt-2 text-sm text-ink-soft">You can now log in with your new password.</p>
            <Link to="/login" className="btn-primary mt-5 inline-flex">Go to Login</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="card space-y-4" noValidate>
            {error && <div role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">School Code</label>
              <input className="input-field" value={form.schoolCode} onChange={(e) => setForm({ ...form, schoolCode: e.target.value })} required />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Admin ID</label>
              <input className="input-field" value={form.adminId} onChange={(e) => setForm({ ...form, adminId: e.target.value })} required />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Recovery Code</label>
              <input className="input-field" placeholder="e.g. NED-7K4P-92MX" value={form.recoveryCode} onChange={(e) => setForm({ ...form, recoveryCode: e.target.value })} required />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">New Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  className="input-field pr-11"
                  value={form.newPassword}
                  onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-faint hover:text-ink-soft"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "🙈" : "👁"}
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Confirm New Password</label>
              <input
                type={showPassword ? "text" : "password"}
                className="input-field"
                value={form.confirmNewPassword}
                onChange={(e) => setForm({ ...form, confirmNewPassword: e.target.value })}
                required
              />
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Resetting…" : "Reset Password"}
            </button>

            <p className="text-center text-sm text-ink-soft">
              Lost your recovery code too? Contact your school's authorized server administrator — they can run the
              local recovery tool directly on the school server.
            </p>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-ink-soft">
          <Link to="/login" className="font-medium text-brand-700 hover:underline">Back to login</Link>
        </p>
      </div>
    </div>
  );
}
