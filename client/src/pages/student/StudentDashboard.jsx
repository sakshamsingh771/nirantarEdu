import React, { useEffect, useState } from "react";
import DashboardLayout from "../../layouts/DashboardLayout.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import api from "../../services/api.js";
import { cacheItems, getCachedItems, queueOperation } from "../../offline/db.js";
import { useActiveQuizSession } from "../../hooks/useActiveQuizSession.js";
import MarkdownMessage from "../../components/MarkdownMessage.jsx";
import MaterialViewerModal from "../../components/MaterialViewerModal.jsx";
import NirantarAiChat from "../../components/NirantarAiChat.jsx";

const TABS = ["Overview", "Materials", "Assignments", "Quizzes", "Nirantar AI", "Notifications", "My Requests"];

export default function StudentDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState("Overview");
  const [materials, setMaterials] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [aiGeneratedQuizData, setAiGeneratedQuizData] = useState(null);
  const { active: quizActive, quizId: activeQuizId } = useActiveQuizSession();

  // The quiz being taken lives HERE, at the top of the dashboard — not
  // inside QuizzesList — so it is never destroyed by a `tab === "Quizzes" &&`
  // conditional unmounting/remounting QuizzesList when the student clicks
  // another tab. Previously `active` was local state inside QuizzesList,
  // so a stray tab click during the ~10s poll window (before the lock
  // kicked in) unmounted QuizzesList and threw away the in-progress
  // QuizRunner (including any unsubmitted answers) — that was the "quiz
  // section becomes blank" bug. Now the runner is rendered unconditionally
  // below whenever activeQuiz is set, regardless of which tab is selected.
  const [activeQuiz, setActiveQuiz] = useState(null);
  // Tracks whether the current activeQuiz has already been submitted (result
  // is showing). ROOT CAUSE FIX: tabs used to stay locked until the student
  // clicked "Back to Quizzes" on the result screen, because quizLocked was
  // derived from `!!activeQuiz` alone — activeQuiz stays set (on purpose,
  // see note below) so the result screen keeps rendering. Locking must
  // track "is a quiz actually in progress", not "is the quiz UI on screen".
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const quizLocked = quizActive || (!!activeQuiz && !quizSubmitted);

  const startQuiz = (q) => {
    setQuizSubmitted(false);
    setActiveQuiz(q);
  };


   useEffect(() => {
    const handleGlobalQuizEnd = (event) => {
      if (event.key === "quiz_status_changed" && event.newValue?.startsWith("completed_")) {
        console.log("[NirantarSync] Quiz submission detected on another tab. Dropping locks.");
        
        // 1. Instantly trip the submitted state variable parameters to true
        setQuizSubmitted(true);
        
        // 2. Clear active cached item frames so quizLocked forces down to false
        setActiveQuiz(null);
        
        // Keep the current tab. The quiz is finished, so navigation is unlocked
        // immediately without forcing the student back to Overview.
      }
    };

    window.addEventListener("storage", handleGlobalQuizEnd);
    return () => window.removeEventListener("storage", handleGlobalQuizEnd);
  }, []);

   useEffect(() => {
    async function loadAndCache(url, storeName, setter) {
      try {
        const res = await api.get(url);
        const key = Object.keys(res.data)[0];
        setter(res.data[key]);
        await cacheItems(storeName, res.data[key]);
      } catch {
        const cached = await getCachedItems(storeName);
        setter(cached);
      }
    }
    
    // Automatically query database sets to refresh view blocks when locks release
    loadAndCache("/materials", "materials", setMaterials);
    loadAndCache("/assignments", "assignments", setAssignments);
    loadAndCache("/quizzes", "quizzes", setQuizzes);
    loadAndCache("/notifications", "notifications", setNotifications);
    
    api
      .get("/analytics/student")
      .then((res) => setAnalytics(res.data))
      .catch(() => {});
  }, [quizLocked]); // 🧠 Re-runs automatically the exact instant quizLocked turns false!

  // A student mid-quiz must stay on the Quizzes tab
  useEffect(() => {
    if (quizLocked && tab !== "Quizzes") setTab("Quizzes");
  }, [quizLocked, tab]);

  // Re-attach to an in-progress attempt after a refresh/new tab:
  useEffect(() => {
    if (activeQuizId && !activeQuiz) {
      const match = quizzes.find((q) => q._id === activeQuizId);
      if (match) setActiveQuiz(match);
    }
  }, [activeQuizId, activeQuiz, quizzes]);

  // Re-attach to an in-progress attempt after a refresh/new tab: the poll
  // reports a server-side active attempt (quizId) but local activeQuiz
  // state starts out null on a fresh page load, so resolve it once the
  // quizzes list is available.
  useEffect(() => {
    if (activeQuizId && !activeQuiz) {
      const match = quizzes.find((q) => q._id === activeQuizId);
      if (match) setActiveQuiz(match);
    }
  }, [activeQuizId, activeQuiz, quizzes]);

  useEffect(() => {
    // Try the local server first; if the LAN link is briefly down, fall back
    // to whatever was cached in IndexedDB from the last successful load.
    async function loadAndCache(url, storeName, setter) {
      try {
        const res = await api.get(url);
        const key = Object.keys(res.data)[0];
        setter(res.data[key]);
        await cacheItems(storeName, res.data[key]);
      } catch {
        const cached = await getCachedItems(storeName);
        setter(cached);
      }
    }
    loadAndCache("/materials", "materials", setMaterials);
    loadAndCache("/assignments", "assignments", setAssignments);
    loadAndCache("/quizzes", "quizzes", setQuizzes);
    loadAndCache("/notifications", "notifications", setNotifications);
    api
      .get("/analytics/student")
      .then((res) => setAnalytics(res.data))
      .catch(() => {});
  }, []);

  return (
    <DashboardLayout title={`Welcome back, ${user?.fullName?.split(" ")[0] || "Student"}`}>
      <div className="mb-6 flex flex-wrap gap-2 border-b border-brand-100">
        {TABS.map((t) => {
          const blocked = quizLocked && t !== "Quizzes";
          return (
            <button
              key={t}
              onClick={() => !blocked && setTab(t)}
              disabled={blocked}
              title={blocked ? "Please submit the quiz before leaving Quiz Mode." : undefined}
              className={`border-b-2 px-3 py-2 text-sm font-medium ${
                blocked
                  ? "cursor-not-allowed border-transparent text-ink-faint/50"
                  : tab === t
                  ? "border-brand-700 text-brand-800"
                  : "border-transparent text-ink-faint hover:text-ink"
              }`}
            >
              {t}
            </button>
          );
        })}
      </div>

      {quizLocked && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
          🔒 Quiz Mode active — other tabs are locked until you submit.
        </div>
      )}

      {/* Rendered independently of `tab` so it can NEVER be unmounted by a
          tab switch — this is what keeps the active quiz visible instead of
          going blank if the student clicks another tab. */}
      {activeQuiz ? (
        <QuizRunner
          quiz={activeQuiz}
          onSubmitted={() => setQuizSubmitted(true)}
          onExit={() => setActiveQuiz(null)}
        />
      ) : (
        <>
          {tab === "Overview" && <Overview analytics={analytics} assignments={assignments} quizzes={quizzes} />}
          {tab === "Materials" && <MaterialsList materials={materials} />}
          {tab === "Assignments" && <AssignmentsList assignments={assignments} />}
          {tab === "Quizzes" && <QuizzesList quizzes={quizzes} onStart={startQuiz} />}
          {tab === "Nirantar AI" && (
            <NirantarAiChat
              storageNamespace="student"
              greeting="Hi, I'm Nirantar AI — running locally on your school's server. Ask me to explain a topic, summarize your notes, or give you practice questions."
               generatedQuiz={aiGeneratedQuizData}
               onQuizGenerated={setAiGeneratedQuizData}
           
           
              />
          )}
          {tab === "Notifications" && <NotificationsList notifications={notifications} />}
          {tab === "My Requests" && <MyRequests />}
        </>
      )}
    </DashboardLayout>
  );
}

function Overview({ analytics, assignments, quizzes }) {
  const upcoming = assignments
    .filter((a) => new Date(a.deadline) > new Date())
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    .slice(0, 3);

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <div className="card">
        <p className="text-sm text-ink-faint">Average Quiz Score</p>
        <p className="mt-2 text-3xl font-bold text-brand-800">{analytics ? `${analytics.averageQuizScorePercent}%` : "—"}</p>
      </div>
      <div className="card">
        <p className="text-sm text-ink-faint">Assignments Submitted</p>
        <p className="mt-2 text-3xl font-bold text-brand-800">
          {analytics ? `${analytics.assignmentsSubmitted}/${analytics.assignmentsTotal}` : "—"}
        </p>
      </div>
      <div className="card">
        <p className="text-sm text-ink-faint">Quizzes Available</p>
        <p className="mt-2 text-3xl font-bold text-brand-800">{quizzes.length}</p>
      </div>
      <div className="card md:col-span-3">
        <h3 className="font-semibold text-brand-800">Upcoming Deadlines</h3>
        {upcoming.length === 0 ? (
          <p className="mt-2 text-sm text-ink-faint">Nothing due soon — you're all caught up.</p>
        ) : (
          <ul className="mt-3 divide-y divide-brand-50">
            {upcoming.map((a) => (
              <li key={a._id} className="flex justify-between py-2 text-sm">
                <span>{a.title}</span>
                <span className="text-ink-faint">{new Date(a.deadline).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const TYPE_LABELS = {
  PDF: "PDF",
  DOC: "DOCUMENT",
  PPT: "PRESENTATION",
  IMAGE: "IMAGE",
  AUDIO: "AUDIO",
  VIDEO: "VIDEO",
  NOTE: "NOTES",
};

function materialBadge(m) {
  // Prefer the precise extension (PPTX vs PPT, DOCX vs DOC) when we have
  // one; fall back to the broader type label otherwise.
  if (m.fileExtension) return m.fileExtension.toUpperCase();
  return TYPE_LABELS[m.type] || m.type;
}

function MaterialsList({ materials }) {
  const [viewing, setViewing] = useState(null);

  if (materials.length === 0) return <EmptyState text="No study material has been posted for your class yet." />;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {materials.map((m) => (
        <div key={m._id} className="card">
          <span className="badge bg-brand-100 text-brand-700">{materialBadge(m)}</span>
          <h3 className="mt-2 font-semibold text-ink">{m.title}</h3>
          <p className="mt-1 text-sm text-ink-faint">{m.subject}</p>

          {/* NOTE material has no file — the text itself is the content */}
          {m.type === "NOTE" && m.textContent && (
            <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-ink-soft">{m.textContent}</p>
          )}

          {/* Small inline image thumbnail; full view still opens in-app */}
          {m.type === "IMAGE" && m.filePath && (
            <img src={m.filePath} alt={m.title} className="mt-3 max-h-32 w-full rounded-md object-cover" />
          )}

          <div className="mt-3 flex flex-wrap gap-3">
            {(m.filePath || (m.type === "NOTE" && m.textContent)) && (
              <button onClick={() => setViewing(m)} className="text-sm font-medium text-brand-700 hover:underline">
                Open →
              </button>
            )}
            {m.filePath && (
              <a href={m.filePath} download className="text-sm font-medium text-ink-faint hover:text-ink hover:underline">
                Download
              </a>
            )}
          </div>

          {/* A material can exist with no file yet (e.g. a video the teacher
              hasn't uploaded locally) — say so plainly rather than showing
              nothing or a broken link. */}
          {!m.filePath && m.type !== "NOTE" && (
            <p className="mt-3 text-sm text-ink-faint">File not uploaded yet.</p>
          )}
        </div>
      ))}

      {viewing && <MaterialViewerModal material={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function AssignmentsList({ assignments }) {
  const [openId, setOpenId] = useState(null);
  const [answerText, setAnswerText] = useState("");
  const [status, setStatus] = useState("");

  const submit = async (assignment) => {
    const clientOperationId = crypto.randomUUID();
    try {
      const formData = new FormData();
      formData.append("answerText", answerText);
      formData.append("clientOperationId", clientOperationId);
      await api.post(`/assignments/${assignment._id}/submit`, formData);
      setStatus("Saved locally and submitted.");
    } catch {
      // Local server unreachable right now — queue it, it'll flush once
      // the device is back on the school Wi-Fi.
      await queueOperation({
        operationType: "SUBMIT_ASSIGNMENT",
        payload: { assignmentId: assignment._id, answerText },
        operationId: clientOperationId,
      });
      setStatus("Saved locally. Will sync with the school server once reconnected.");
    }
  };

  if (assignments.length === 0) return <EmptyState text="No assignments for your class yet." />;

  return (
    <div className="space-y-4">
      {assignments.map((a) => (
        <div key={a._id} className="card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-ink">{a.title}</h3>
            <span className="text-xs text-ink-faint">Due {new Date(a.deadline).toLocaleDateString()}</span>
          </div>
          <div className="mt-1 text-sm text-ink-soft">
            <MarkdownMessage text={a.instructions} />
          </div>
          {Array.isArray(a.questions) && a.questions.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-medium text-ink">Questions</p>
              <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-soft">
                {a.questions.map((q, i) => (
                  <li key={i}>
                    {q.text}
                    {q.type === "MCQ" && Array.isArray(q.options) && q.options.length > 0 && (
                      <ul className="mt-1 list-disc pl-5 text-ink-faint">
                        {q.options.map((opt, oi) => (
                          <li key={oi}>{opt}</li>
                        ))}
                      </ul>
                    )}
                    {q.marks ? <span className="ml-1 text-xs text-ink-faint">({q.marks} marks)</span> : null}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {openId === a._id ? (
            <div className="mt-3 space-y-2">
              <textarea
                className="input-field min-h-[100px]"
                placeholder="Write your answer here…"
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
              />
              <div className="flex gap-2">
                <button onClick={() => submit(a)} className="btn-primary">
                  Submit
                </button>
                <button onClick={() => setOpenId(null)} className="btn-secondary">
                  Cancel
                </button>
              </div>
              {status && <p className="text-sm text-emerald-600">{status}</p>}
            </div>
          ) : (
            <button onClick={() => { setOpenId(a._id); setStatus(""); }} className="mt-3 text-sm font-medium text-brand-700 hover:underline">
              Open assignment →
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function QuizzesList({ quizzes, onStart }) {
  if (quizzes.length === 0) return <EmptyState text="No quizzes available for your class yet." />;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {quizzes.map((q) => (
        <div key={q._id} className="card">
          <h3 className="font-semibold text-ink">{q.title}</h3>
          <p className="mt-1 text-sm text-ink-faint">
            {q.subject} · {q.timerMinutes} min
          </p>
          <button onClick={() => onStart(q)} className="btn-primary mt-3 w-full">
            Start Quiz
          </button>
        </div>
      ))}
    </div>
  );
}

function QuizRunner({ quiz, onExit, onSubmitted }) {
  const [full, setFull] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [attemptId, setAttemptId] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // OVERALL mode
  const [expiresAt, setExpiresAt] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(null);

  // PER_QUESTION mode
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentDeadline, setCurrentDeadline] = useState(null);
  const [questionSecondsLeft, setQuestionSecondsLeft] = useState(null);
  const [currentAnswer, setCurrentAnswer] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Fetch quiz content and create/resume the attempt concurrently.
        // They are independent requests, so there is no reason to make the
        // student wait for one request before the other starts.
        const [detail, start] = await Promise.all([
          api.get(`/quizzes/${quiz._id}`),
          api.post(`/quizzes/${quiz._id}/attempt/start`),
        ]);

        if (cancelled) return;

        setFull(detail.data.quiz);
        setAttemptId(start.data.attemptId);

        if (start.data.timingMode === "PER_QUESTION") {
          setCurrentIndex(start.data.currentQuestionIndex || 0);
          setCurrentDeadline(new Date(start.data.currentQuestionDeadline));
        } else {
          setExpiresAt(new Date(start.data.expiresAt));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.message || "Could not start this quiz.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [quiz._id]);

  // OVERALL: countdown derived from the server's expiresAt timestamp, not a
  // locally-trusted duration — a browser refresh recomputes the same true
  // remaining time instead of resetting the clock.
  useEffect(() => {
    if (!expiresAt || result) return;
    const tick = () => {
      const remaining = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) handleSubmit();
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt, result]);

  // PER_QUESTION: countdown for the single active question; when it hits
  // zero the answer is sent as-is (or empty) — the server independently
  // checks its own deadline regardless of what this timer does.
  useEffect(() => {
    if (!currentDeadline || result) return;
    const tick = () => {
      const remaining = Math.max(0, Math.round((currentDeadline.getTime() - Date.now()) / 1000));
      setQuestionSecondsLeft(remaining);
      if (remaining <= 0) submitCurrentQuestion();
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDeadline, result]);

  const submitCurrentQuestion = async () => {
    if (!attemptId || submitting || result) return;
    setSubmitting(true);
    try {
      const res = await api.post(`/quizzes/${quiz._id}/attempt/answer`, {
        attemptId,
        questionIndex: currentIndex,
        answer: currentAnswer,
      });
      setCurrentAnswer("");
      if (res.data.completed) {
        setResult({ score: res.data.score, totalMarks: res.data.totalMarks });
        onSubmitted?.(); // saved server-side — unlock other tabs immediately
      } else {
        setCurrentIndex(res.data.nextQuestionIndex);
        setCurrentDeadline(new Date(res.data.currentQuestionDeadline));
      }
    } catch (err) {
      setError(err.response?.data?.message || "Could not record your answer.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!attemptId || submitting || result) return;
    setSubmitting(true);
    try {
      const payload = {
        attemptId,
        answers: Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer })),
      };
      const res = await api.post(`/quizzes/${quiz._id}/attempt/submit`, payload);
      setResult(res.data);
      onSubmitted?.(); // saved server-side — unlock other tabs immediately
    } catch (err) {
      setError(err.response?.data?.message || "Could not submit the quiz.");
    } finally {
      setSubmitting(false);
    }
  };

  if (error) {
    return (
      <div className="card max-w-md">
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={onExit} className="btn-secondary mt-4">Back to Quizzes</button>
      </div>
    );
  }

  if (!full) return <p className="text-sm text-ink-faint">Loading quiz…</p>;

  if (result) {
    return (
      <div className="card max-w-md">
        <h3 className="text-lg font-semibold text-brand-800">Result</h3>
        <p className="mt-2 text-3xl font-bold text-brand-800">
          {result.score} / {result.totalMarks}
        </p>
        {result.timedOut && <p className="mt-2 text-sm text-accent-600">This submission arrived after time was up.</p>}
        <button onClick={onExit} className="btn-secondary mt-4">
          Back to Quizzes
        </button>
      </div>
    );
  }

  if (full.timingMode === "PER_QUESTION") {
    const q = full.questions[currentIndex];
    if (!q) return <p className="text-sm text-ink-faint">Loading question…</p>;
    return (
      <div className="max-w-2xl space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-brand-800">{full.title}</h3>
            <p className="text-sm text-ink-faint">
              Question {currentIndex + 1} of {full.questions.length}
            </p>
          </div>
          <span className="rounded bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
            {questionSecondsLeft ?? "—"}s
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas-sunk">
          <div
            className="h-full bg-brand-600 transition-all"
            style={{ width: `${((currentIndex + 1) / full.questions.length) * 100}%` }}
          />
        </div>

        <div className="card">
          <p className="font-medium text-ink">{q.text}</p>
          <QuestionInput question={q} value={currentAnswer} onChange={setCurrentAnswer} />
        </div>

        <button
          onClick={submitCurrentQuestion}
          disabled={submitting}
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting
            ? "Saving…"
            : currentIndex + 1 === full.questions.length
            ? "Submit Final Answer"
            : "Next Question"}
        </button>
        <p className="text-xs text-ink-faint">
          You can't return to a previous question once you've moved on or time runs out.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-brand-800">{full.title}</h3>
        <span className="rounded bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
          {secondsLeft !== null ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}` : "—"}
        </span>
      </div>
      {full.questions.map((q, i) => (
        <div key={q._id} className="card">
          <p className="font-medium text-ink">
            {i + 1}. {q.text}
          </p>
          <QuestionInput
            question={q}
            value={answers[q._id] || ""}
            onChange={(val) => setAnswers({ ...answers, [q._id]: val })}
          />
        </div>
      ))}
      <button onClick={handleSubmit} disabled={submitting} className="btn-primary disabled:cursor-not-allowed disabled:opacity-60">
        {submitting ? "Submitting…" : "Submit Quiz"}
      </button>
    </div>
  );
}

function QuestionInput({ question: q, value, onChange }) {
  if (q.type === "MCQ") {
    return (
      <div className="mt-3 space-y-2">
        {q.options.map((opt, idx) => (
          <label key={idx} className="flex items-center gap-2 text-sm">
            <input type="radio" name={q._id} checked={value === String(idx)} onChange={() => onChange(String(idx))} />
            {opt}
          </label>
        ))}
      </div>
    );
  }
  if (q.type === "TRUE_FALSE") {
    return (
      <div className="mt-3 flex gap-4 text-sm">
        {["true", "false"].map((v) => (
          <label key={v} className="flex items-center gap-2">
            <input type="radio" name={q._id} checked={value === v} onChange={() => onChange(v)} />
            {v === "true" ? "True" : "False"}
          </label>
        ))}
      </div>
    );
  }
  return <input className="input-field mt-3" value={value} onChange={(e) => onChange(e.target.value)} />;
}

function NotificationsList({ notifications }) {
  if (notifications.length === 0) return <EmptyState text="No notifications yet." />;
  return (
    <ul className="divide-y divide-brand-50 card">
      {notifications.map((n) => (
        <li key={n._id} className="py-3">
          <p className="text-sm font-medium text-ink">{n.title}</p>
          <p className="text-sm text-ink-faint">{n.message}</p>
        </li>
      ))}
    </ul>
  );
}

const REQUEST_STATUS_STYLES = {
  pending: "bg-accent-400/20 text-accent-600",
  under_review: "bg-brand-100 text-brand-700",
  approved: "bg-sage-100 text-sage-700",
  rejected: "bg-red-50 text-red-700",
  resolved: "bg-sage-100 text-sage-700",
};

const ISSUE_LABELS = {
  INCORRECT_NAME: "Incorrect name",
  INCORRECT_STUDENT_ID: "Incorrect Student ID",
  INCORRECT_CLASS: "Incorrect class/grade",
  INCORRECT_SECTION: "Incorrect section",
  INCORRECT_SCHOOL: "Incorrect school information",
  RECORD_NOT_FOUND: "Student record not found",
  OTHER: "Other",
};

function MyRequests() {
  const [requests, setRequests] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .get("/correction-requests/my")
      .then((res) => setRequests(res.data.requests))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return <p className="text-sm text-ink-faint">Loading…</p>;
  if (requests.length === 0) {
    return <EmptyState text="You haven't reported any issues with your student record." />;
  }

  return (
    <div className="space-y-3">
      {requests.map((r) => (
        <div key={r._id} className="card">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-ink">{r.requestCode}</span>
            <span className={`badge ${REQUEST_STATUS_STYLES[r.status]}`}>{r.status.replace("_", " ")}</span>
          </div>
          <p className="mt-1 text-sm text-ink-soft">{ISSUE_LABELS[r.issueType]}</p>
          {r.adminResponse && (
            <p className="mt-2 rounded-md bg-canvas-sunk p-3 text-sm text-ink">{r.adminResponse}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function EmptyState({ text }) {
  return <div className="card text-center text-sm text-ink-faint">{text}</div>;
}