import React, { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

export default function Login() {
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ schoolCode: "", userId: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // If the browser's Back button (or a stale bookmark) lands here while the
  // user is still authenticated, send them straight back to their dashboard
  // instead of showing the login form — that's what made pressing Back from
  // a material viewer LOOK like a forced logout even though the session was
  // still valid the whole time.
  if (!loading && user) {
    return <Navigate to={`/${user.role.toLowerCase()}`} replace />;
  }

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.schoolCode || !form.userId || !form.password) {
      setError("Please fill in every field.");
      return;
    }
    setSubmitting(true);
    try {
      const loggedInUser = await login(form);
      // replace: true so the login page itself doesn't sit in browser
      // history in front of the dashboard — otherwise pressing Back once
      // from the dashboard would land back on the login form.
      navigate(`/${loggedInUser.role.toLowerCase()}`, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Could not sign in. Check your details and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas-sunk px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-700 text-sm font-bold text-white">
              NE
            </span>
            <span className="text-xl font-semibold text-brand-800">NirantarEdu</span>
          </Link>
          <p className="mt-2 text-sm text-ink-faint">Sign in to your school's local learning network.</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5" noValidate>
          {error && (
            <div role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="schoolCode" className="mb-1.5 block text-sm font-medium text-ink">
              School Code
            </label>
            <input
              id="schoolCode"
              name="schoolCode"
              value={form.schoolCode}
              onChange={handleChange}
              placeholder="e.g. NED-LKO-2026"
              className="input-field"
              autoComplete="organization"
            />
          </div>

          <div>
            <label htmlFor="userId" className="mb-1.5 block text-sm font-medium text-ink">
              Student ID / Teacher ID / Admin ID
            </label>
            <input
              id="userId"
              name="userId"
              value={form.userId}
              onChange={handleChange}
              placeholder="e.g. STU001"
              className="input-field"
              autoComplete="username"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={handleChange}
                className="input-field pr-11"
                autoComplete="current-password"
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

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? "Signing in…" : "Sign In"}
          </button>

          <p className="text-center text-sm text-ink-faint">
            New student?{" "}
            <Link to="/register" className="font-medium text-brand-700 hover:underline">
              Register here
            </Link>
          </p>
          <p className="text-center text-sm text-ink-faint">
            Admin forgot your password?{" "}
            <Link to="/admin/forgot-password" className="font-medium text-brand-700 hover:underline">
              Reset with recovery code
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
