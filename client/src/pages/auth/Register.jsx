import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import api from "../../services/api.js";
import ReportIssueModal from "../../components/ReportIssueModal.jsx";

function passwordStrength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

const strengthLabels = ["Very weak", "Weak", "Fair", "Good", "Strong"];
const strengthColors = ["bg-red-400", "bg-red-400", "bg-accent-400", "bg-sage-500", "bg-sage-600"];

const STEPS = ["Verify", "Confirm", "Password", "Done"];

function ProgressIndicator({ step }) {
  return (
    <ol className="mb-8 flex items-center justify-between" aria-label="Registration progress">
      {STEPS.map((label, i) => {
        const stepNum = i + 1;
        const state = stepNum < step ? "done" : stepNum === step ? "current" : "upcoming";
        return (
          <li key={label} className="flex flex-1 flex-col items-center text-center">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                state === "done"
                  ? "bg-sage-500 text-white"
                  : state === "current"
                  ? "bg-brand-600 text-white"
                  : "bg-canvas-sunk text-ink-faint"
              }`}
              aria-current={state === "current" ? "step" : undefined}
            >
              {state === "done" ? "✓" : stepNum}
            </span>
            <span className={`mt-1.5 text-xs ${state === "upcoming" ? "text-ink-faint" : "text-ink-soft"}`}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function Register() {
  const { login: loginToSession, register } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [verifyForm, setVerifyForm] = useState({ studentId: "", schoolCode: "" });
  const [record, setRecord] = useState(null); // { student: {studentId, fullName, class, section}, schoolName }
  const [passwordForm, setPasswordForm] = useState({ password: "", confirmPassword: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportDefaultType, setReportDefaultType] = useState("RECORD_NOT_FOUND");

  const strength = useMemo(() => passwordStrength(passwordForm.password), [passwordForm.password]);

  // ---- Step 1: verify ----
  const handleVerify = async (e) => {
    e.preventDefault();
    setError("");
    setAlreadyRegistered(false);
    if (!verifyForm.studentId || !verifyForm.schoolCode) {
      setError("Please enter both your Student ID and School Code.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.get("/students/verify", { params: verifyForm });
      setRecord(res.data);
      setStep(2);
    } catch (err) {
      const data = err.response?.data;
      setError(data?.message || "Could not verify your details. Please try again.");
      if (data?.alreadyRegistered) setAlreadyRegistered(true);
    } finally {
      setLoading(false);
    }
  };

  // ---- Step 2: confirm ----
  const confirmCorrect = () => setStep(3);
  const reportWrongInfo = (issueType) => {
    setReportDefaultType(issueType);
    setShowReportModal(true);
  };

  // ---- Step 3: create password ----
  const handleCreateAccount = async (e) => {
    e.preventDefault();
    setError("");
    if (passwordForm.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (passwordForm.password !== passwordForm.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await register({
        schoolCode: verifyForm.schoolCode,
        studentId: verifyForm.studentId,
        password: passwordForm.password,
      });
      setStep(4);
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed. Please check your details.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-600 text-sm font-bold text-white">
              NE
            </span>
            <span className="text-xl font-semibold text-brand-800">NirantarEdu</span>
          </Link>
          <p className="mt-2 text-sm text-ink-soft">Create your student account — verified against your school's records.</p>
        </div>

        <div className="card">
          <ProgressIndicator step={step} />

          {error && (
            <div role="alert" className="mb-5 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
              {alreadyRegistered && (
                <Link to="/login" className="ml-1 font-medium underline">
                  Go to login
                </Link>
              )}
            </div>
          )}

          {step === 1 && (
            <form onSubmit={handleVerify} className="space-y-5" noValidate>
              <h2 className="text-lg font-semibold text-ink">Verify Student</h2>
              <p className="text-sm text-ink-soft">
                Enter the Student ID and School Code your school gave you. We'll check it against the official record.
              </p>
              <div>
                <label htmlFor="studentId" className="mb-1.5 block text-sm font-medium text-ink">
                  Student ID
                </label>
                <input
                  id="studentId"
                  className="input-field"
                  value={verifyForm.studentId}
                  onChange={(e) => setVerifyForm({ ...verifyForm, studentId: e.target.value })}
                  placeholder="e.g. STU002"
                  autoComplete="username"
                />
              </div>
              <div>
                <label htmlFor="schoolCode" className="mb-1.5 block text-sm font-medium text-ink">
                  School Code
                </label>
                <input
                  id="schoolCode"
                  className="input-field"
                  value={verifyForm.schoolCode}
                  onChange={(e) => setVerifyForm({ ...verifyForm, schoolCode: e.target.value })}
                  placeholder="e.g. NED-LKO-2026"
                  autoComplete="organization"
                />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? "Verifying…" : "Verify Student"}
              </button>
              <button
                type="button"
                onClick={() => reportWrongInfo("RECORD_NOT_FOUND")}
                className="w-full text-center text-sm font-medium text-brand-700 hover:underline"
              >
                My details aren't matching — Report an Issue
              </button>
            </form>
          )}

          {step === 2 && record && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-ink">Confirm Your Information</h2>
              <p className="text-sm text-ink-soft">
                We found a record at <strong>{record.schoolName}</strong>. Please check it's really you before continuing.
              </p>
              <dl className="rounded-lg bg-canvas-sunk p-4 text-sm">
                <div className="flex justify-between py-1.5">
                  <dt className="text-ink-soft">Name</dt>
                  <dd className="font-medium text-ink">{record.student.fullName}</dd>
                </div>
                <div className="flex justify-between py-1.5">
                  <dt className="text-ink-soft">Student ID</dt>
                  <dd className="font-medium text-ink">{record.student.studentId}</dd>
                </div>
                <div className="flex justify-between py-1.5">
                  <dt className="text-ink-soft">Class</dt>
                  <dd className="font-medium text-ink">{record.student.class}</dd>
                </div>
                {record.student.section && (
                  <div className="flex justify-between py-1.5">
                    <dt className="text-ink-soft">Section</dt>
                    <dd className="font-medium text-ink">{record.student.section}</dd>
                  </div>
                )}
              </dl>
              <p className="text-sm font-medium text-ink">Is this information correct?</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button onClick={confirmCorrect} className="btn-primary flex-1">
                  Yes, Continue
                </button>
                <button onClick={() => reportWrongInfo("INCORRECT_NAME")} className="btn-secondary flex-1">
                  No, Report an Issue
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <form onSubmit={handleCreateAccount} className="space-y-5" noValidate>
              <h2 className="text-lg font-semibold text-ink">Create Your Password</h2>
              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    className="input-field pr-11"
                    value={passwordForm.password}
                    onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })}
                    autoComplete="new-password"
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
                {passwordForm.password && (
                  <div className="mt-2">
                    <div className="flex h-1.5 gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <span key={i} className={`flex-1 rounded-full ${i < strength ? strengthColors[strength] : "bg-canvas-sunk"}`} />
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-ink-faint">{strengthLabels[strength]} — use 8+ characters with a number and a symbol.</p>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium text-ink">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    type={showConfirm ? "text" : "password"}
                    className="input-field pr-11"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((s) => !s)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-faint hover:text-ink-soft"
                    aria-label={showConfirm ? "Hide password" : "Show password"}
                  >
                    {showConfirm ? "🙈" : "👁"}
                  </button>
                </div>
                {passwordForm.confirmPassword && passwordForm.confirmPassword !== passwordForm.password && (
                  <p className="mt-1 text-xs text-red-600">Passwords do not match.</p>
                )}
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? "Creating account…" : "Create Account"}
              </button>
            </form>
          )}

          {step === 4 && (
            <div className="space-y-5 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sage-100 text-2xl text-sage-700">
                ✓
              </div>
              <h2 className="text-lg font-semibold text-ink">Account Created</h2>
              <p className="text-sm text-ink-soft">
                Welcome to NirantarEdu, {record?.student.fullName}. Your account is ready to use.
              </p>
              <button onClick={() => navigate("/student")} className="btn-primary w-full">
                Go to My Dashboard
              </button>
            </div>
          )}
        </div>

        {step === 1 && (
          <p className="mt-6 text-center text-sm text-ink-soft">
            Already registered?{" "}
            <Link to="/login" className="font-medium text-brand-700 hover:underline">
              Sign in
            </Link>
            {" · "}
            <Link to="/track-request" className="font-medium text-brand-700 hover:underline">
              Track a request
            </Link>
          </p>
        )}
      </div>

      {showReportModal && (
        <ReportIssueModal
          studentId={verifyForm.studentId}
          schoolCode={verifyForm.schoolCode}
          defaultIssueType={reportDefaultType}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </div>
  );
}
