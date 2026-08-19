import React, { useEffect, useState } from "react";
import DashboardLayout from "../../layouts/DashboardLayout.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import api from "../../services/api.js";
import { useSchoolConfig } from "../../hooks/useSchoolConfig.js";
import ClassSectionSubjectSelect from "../../components/ClassSectionSubjectSelect.jsx";
import MarkdownMessage from "../../components/MarkdownMessage.jsx";
import NirantarAiChat from "../../components/NirantarAiChat.jsx";

const TABS = [
  "Overview",
  "Materials",
  "Assignments",
  "Quizzes",
  "Submissions",
  "Nirantar AI",
];
const MIN_QUESTIONS = 1;
const MAX_QUESTIONS = 30;

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState("Overview");
  const [analytics, setAnalytics] = useState(null);
  const [schoolConfig] = useSchoolConfig();
  const [materialsRefreshKey, setMaterialsRefreshKey] = useState(0);

  useEffect(() => {
    api
      .get("/analytics/teacher")
      .then((res) => setAnalytics(res.data))
      .catch(() => {});
  }, []);

  return (
    <DashboardLayout title={`${user?.fullName}'s Classroom`}>
      <div className="mb-6 flex flex-wrap gap-2 border-b border-brand-100">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t
                ? "border-brand-700 text-brand-800"
                : "border-transparent text-ink-faint hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Every tab panel below stays mounted at all times (just hidden via
          CSS) instead of being conditionally rendered with `tab === "X" &&`.
          The old conditional-mount pattern unmounted whichever tab wasn't
          active, which wiped any in-progress typing — an unsaved upload
          form, a half-built quiz, a draft assignment — the moment the
          teacher switched tabs and came back. Keeping components mounted
          preserves their internal state for free, with no need to lift
          that state up or add persistence plumbing to each one. */}
      <div style={{ display: tab === "Overview" ? "" : "none" }}>
        <Overview analytics={analytics} />
      </div>
      <div style={{ display: tab === "Materials" ? "" : "none" }}>
        <UploadMaterial
          schoolConfig={schoolConfig}
          onUploaded={() => setMaterialsRefreshKey((k) => k + 1)}
        />
        <MyMaterials refreshKey={materialsRefreshKey} />
      </div>
      <div style={{ display: tab === "Assignments" ? "" : "none" }}>
        <ManageAssignments schoolConfig={schoolConfig} />
      </div>
      <div style={{ display: tab === "Quizzes" ? "" : "none" }}>
        <ManageQuizzes schoolConfig={schoolConfig} />
      </div>
      <div style={{ display: tab === "Submissions" ? "" : "none" }}>
        <Submissions />
      </div>
      <div style={{ display: tab === "Nirantar AI" ? "" : "none" }}>
        <TeacherAiTools />
      </div>
    </DashboardLayout>
  );
}

function Overview({ analytics }) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      <div className="card">
        <p className="text-sm text-ink-faint">Class Average (Quizzes)</p>
        <p className="mt-2 text-3xl font-bold text-brand-800">
          {analytics ? `${analytics.classAverageQuizPercent}%` : "—"}
        </p>
      </div>
      <div className="card">
        <p className="text-sm text-ink-faint">Assignments Posted</p>
        <p className="mt-2 text-3xl font-bold text-brand-800">
          {analytics?.totalAssignments ?? "—"}
        </p>
      </div>
      <div className="card">
        <p className="text-sm text-ink-faint">Submissions Received</p>
        <p className="mt-2 text-3xl font-bold text-brand-800">
          {analytics?.totalSubmissions ?? "—"}
        </p>
      </div>
    </div>
  );
}

// Class/Subject/Section dropdowns shared by Materials/Assignments/Quizzes.
// Falls back to a free-text input if the school hasn't configured any
// values yet, so the form never gets stuck with an empty dropdown.
// DOC/DOCX/PPT/PPTX removed — there's no in-app viewer for Office formats,
// so students couldn't open them. PDF/Video/Audio/Image/Notes only.
const FILE_ACCEPT_BY_TYPE = {
  PDF: ".pdf,application/pdf",
  IMAGE: ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp",
  AUDIO: ".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4",
  VIDEO: ".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime",
};

// Mirrors server/src/middleware/upload.js MAX_MB_BY_TYPE — kept in sync
// manually since the frontend can't import server env config; the backend
// is still the real enforcement boundary, this is just for a fast,
// friendly error before spending upload bandwidth.
const MAX_MB_BY_TYPE = { PDF: 50, IMAGE: 25, AUDIO: 100, VIDEO: 500 };

function formatMb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function UploadMaterial({ schoolConfig, onUploaded }) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    subject: "",
    class: "",
    section: "",
    type: "NOTE",
    textContent: "",
  });
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");
  const [fileError, setFileError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const maxMb = MAX_MB_BY_TYPE[form.type];

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    setFileError("");
    if (f && maxMb && f.size > maxMb * 1024 * 1024) {
      setFileError(
        `"${f.name}" is ${formatMb(f.size)} MB — maximum for ${form.type}: ${maxMb} MB.`,
      );
      setFile(null);
      e.target.value = "";
      return;
    }
    setFile(f || null);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (file && maxMb && file.size > maxMb * 1024 * 1024) {
      setFileError(`Maximum for ${form.type}: ${maxMb} MB.`);
      return;
    }
    const formData = new FormData();
    Object.entries(form).forEach(([k, v]) => formData.append(k, v));
    if (file) formData.append("file", file);
    setUploading(true);
    setProgress(0);
    try {
      await api.post("/materials", formData, {
        onUploadProgress: (evt) => {
          if (evt.total)
            setProgress(Math.round((evt.loaded / evt.total) * 100));
        },
      });
      setStatus("Material uploaded — saved to the local server.");
      setForm({
        title: "",
        description: "",
        subject: "",
        class: "",
        section: "",
        type: "NOTE",
        textContent: "",
      });
      setFile(null);
      setFileError("");
      onUploaded?.(); // Notify parent to refresh the materials list
    } catch (err) {
      // The backend returns a clear message for oversized/unsupported
      // files (413/400) instead of a generic failure — surface it as-is.
      setStatus(
        err.response?.data?.message ||
          "Upload failed. Please check the file and try again.",
      );
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <form onSubmit={submit} className="card max-w-xl space-y-4">
      <h3 className="font-semibold text-brand-800">Upload Study Material</h3>
      {status && <p className="text-sm text-sage-700">{status}</p>}
      <input
        className="input-field"
        placeholder="Title"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        required
      />
      <input
        className="input-field"
        placeholder="Description"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
      />
      <ClassSectionSubjectSelect
        schoolConfig={schoolConfig}
        value={form}
        onChange={setForm}
      />
      <div>
        <label className="mb-1 block text-xs font-medium text-ink/70">
          Material type
        </label>
        <select
          className="input-field"
          value={form.type}
          onChange={(e) => {
            setForm({ ...form, type: e.target.value });
            setFile(null);
            setFileError("");
          }}
        >
          {["NOTE", "PDF", "IMAGE", "AUDIO", "VIDEO"].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-ink-faint">
          Supported: PDF, Video, Audio, Images, and Notes/TXT. (Word/PowerPoint
          files aren't supported — students can't open them in-app.)
        </p>
      </div>
      {form.type === "NOTE" ? (
        <textarea
          className="input-field min-h-[100px]"
          placeholder="Note content"
          value={form.textContent}
          onChange={(e) => setForm({ ...form, textContent: e.target.value })}
        />
      ) : (
        <div>
          <input
            type="file"
            accept={FILE_ACCEPT_BY_TYPE[form.type]}
            onChange={handleFileChange}
            className="text-sm"
          />
          <p className="mt-1 text-xs text-ink-faint">
            Maximum file size for {form.type}: {maxMb} MB
          </p>
          {file && !fileError && (
            <p className="mt-1 text-xs text-ink/70">
              Selected: {file.name} ({formatMb(file.size)} MB)
            </p>
          )}
          {fileError && (
            <p className="mt-1 text-xs text-red-600">{fileError}</p>
          )}
        </div>
      )}
      {uploading && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-brand-100">
          <div
            className="h-full bg-brand-600 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      <button
        className="btn-primary"
        disabled={uploading || (form.type !== "NOTE" && !file)}
      >
        {uploading ? `Uploading… ${progress}%` : "Upload"}
      </button>
    </form>
  );
}
function MyMaterials({ refreshKey }) {
  const { user } = useAuth();
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subjectFilter, setSubjectFilter] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    api
      .get("/materials")
      .then((res) => {
        const mine = (res.data.materials || []).filter(
          (m) => String(m.uploadedBy) === String(user?._id),
        );
        setMaterials(mine);
      })
      .catch(() => setError("Could not load your materials."))
      .finally(() => setLoading(false));
  }, [refreshKey, user?._id]);

  const subjects = [...new Set(materials.map((m) => m.subject).filter(Boolean))];
  const visible = subjectFilter ? materials.filter((m) => m.subject === subjectFilter) : materials;

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this material? This cannot be undone.")) return;
    setDeletingId(id);
    setError("");
    try {
      await api.delete(`/materials/${id}`);
      setMaterials((prev) => prev.filter((m) => m._id !== id));
    } catch (err) {
      setError(err.response?.data?.message || "Could not delete material.");
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <p className="mt-6 text-sm text-ink-faint">Loading your materials…</p>;

  return (
    <div className="mt-6 card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-brand-800">Your Uploaded Materials</h3>
        {subjects.length > 1 && (
          <select className="input-field w-auto" value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {visible.length === 0 ? (
        <p className="text-sm text-ink-faint">No material uploaded yet.</p>
      ) : (
        <ul className="divide-y divide-brand-100">
          {visible.map((m) => (
            <li key={m._id} className="flex items-center justify-between gap-3 py-2">
              <div>
                <p className="text-sm font-medium text-ink">{m.title}</p>
                <p className="text-xs text-ink-faint">
                  {m.type} · {m.subject || "—"} · {m.class || "—"}
                  {m.section ? ` (${m.section})` : ""}
                </p>
              </div>
              <button
                onClick={() => handleDelete(m._id)}
                disabled={deletingId === m._id}
                className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
              >
                {deletingId === m._id ? "Deleting…" : "Delete"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
function ManageAssignments({ schoolConfig }) {
  const [mode, setMode] = useState("manual");
  const [form, setForm] = useState({
    title: "",
    instructions: "",
    subject: "",
    class: "",
    section: "",
    deadline: "",
    maxMarks: 100,
  });
  const [aiParams, setAiParams] = useState({
    topic: "",
    subject: "",
    class: "",
    section: "",
    difficulty: "Medium",
    questionCount: 10,
    questionType: "MIXED",
    marks: 20,
  });
  const [draftQuestions, setDraftQuestions] = useState([]); // AI-generated, editable before publish
  const [aiLoading, setAiLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [editingDraftId, setEditingDraftId] = useState(null); // Mongo _id once saved as a draft
  const [savingDraft, setSavingDraft] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [draftsLoaded, setDraftsLoaded] = useState(false);

  const loadDrafts = async () => {
    try {
      const res = await api.get("/assignments/drafts");
      setDrafts(res.data.drafts);
    } catch {
      // leave the previous list showing rather than blanking it on a transient error
    } finally {
      setDraftsLoaded(true);
    }
  };

  useEffect(() => {
    loadDrafts();
  }, []);

  const generateWithAi = async () => {
    if (!aiParams.topic.trim() || !aiParams.class) {
      setStatus("Enter a topic and select a class first.");
      return;
    }
    setStatus("Generating assignment…");
    setAiLoading(true);
    try {
      const res = await api.post("/assignments/ai-generate", aiParams);
      setForm({
        ...form,
        title: res.data.draft.title,
        instructions: res.data.draft.instructions,
        subject: aiParams.subject,
        class: aiParams.class,
        section: aiParams.section,
        maxMarks: aiParams.marks,
      });
      setDraftQuestions(res.data.draft.questions || []);
      setStatus(
        "Draft generated — review, edit, or regenerate before publishing.",
      );
    } catch (err) {
      setStatus(err.response?.data?.message || "AI generation failed.");
    } finally {
      setAiLoading(false);
    }
  };

  const updateDraftQuestion = (idx, patch) => {
    const next = [...draftQuestions];
    next[idx] = { ...next[idx], ...patch };
    setDraftQuestions(next);
  };
  const removeDraftQuestion = (idx) =>
    setDraftQuestions(draftQuestions.filter((_, i) => i !== idx));

  const resetAll = () => {
    setForm({
      title: "",
      instructions: "",
      subject: "",
      class: "",
      section: "",
      deadline: "",
      maxMarks: 100,
    });
    setDraftQuestions([]);
    setAiParams({ ...aiParams, topic: "" });
    setEditingDraftId(null);
  };

  const publish = async (e) => {
    e.preventDefault();
    try {
      if (editingDraftId) {
        await api.put(`/assignments/${editingDraftId}`, {
          ...form,
          questions: draftQuestions,
          status: "PUBLISHED",
        });
      } else {
        await api.post("/assignments", {
          ...form,
          questions: draftQuestions,
          status: "PUBLISHED",
        });
      }
      setStatus("Assignment published and students notified.");
      resetAll();
      loadDrafts();
    } catch (err) {
      setStatus(err.response?.data?.message || "Could not publish assignment.");
    }
  };

  // Actually persists to the database as a DRAFT — visible only to this
  // teacher under "Saved Draft Assignments", never to students — and stays
  // available (editable/publishable/deletable) after navigating away or
  // refreshing, unlike the old placeholder that didn't save anything.
  const saveDraft = async () => {
    if (!form.title.trim()) {
      setStatus("Give the assignment a title before saving as a draft.");
      return;
    }
    setSavingDraft(true);
    try {
      const payload = { ...form, questions: draftQuestions, status: "DRAFT" };
      if (editingDraftId) {
        const res = await api.put(`/assignments/${editingDraftId}`, payload);
        setEditingDraftId(res.data.assignment._id);
      } else {
        const res = await api.post("/assignments", payload);
        setEditingDraftId(res.data.assignment._id);
      }
      setStatus(
        "Saved as a draft. It won't be visible to students until you publish it.",
      );
      loadDrafts();
    } catch (err) {
      setStatus(err.response?.data?.message || "Could not save draft.");
    } finally {
      setSavingDraft(false);
    }
  };

  const openDraft = (d) => {
    setMode("manual");
    setEditingDraftId(d._id);
    setForm({
      title: d.title || "",
      instructions: d.instructions || "",
      subject: d.subject || "",
      class: d.class || "",
      section: d.section || "",
      deadline: d.deadline ? d.deadline.slice(0, 16) : "",
      maxMarks: d.maxMarks ?? 100,
    });
    setDraftQuestions(d.questions || []);
    setStatus(`Editing draft "${d.title}".`);
  };

  const deleteDraft = async (d) => {
    if (!window.confirm(`Delete the draft "${d.title}"? This can't be undone.`))
      return;
    try {
      await api.delete(`/assignments/${d._id}`);
      if (editingDraftId === d._id) resetAll();
      loadDrafts();
      setStatus("Draft deleted.");
    } catch (err) {
      setStatus(err.response?.data?.message || "Could not delete draft.");
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => {
            setMode("manual");
            resetAll();
          }}
          className={mode === "manual" ? "btn-primary" : "btn-secondary"}
        >
          Create Manually
        </button>
        <button
          onClick={() => setMode("ai")}
          className={mode === "ai" ? "btn-primary" : "btn-secondary"}
        >
          Generate with Nirantar AI
        </button>
        <button
          onClick={() => setMode("drafts")}
          className={mode === "drafts" ? "btn-primary" : "btn-secondary"}
        >
          Saved Draft Assignments{" "}
          {draftsLoaded && drafts.length > 0 ? `(${drafts.length})` : ""}
        </button>
      </div>
      {status && <p className="text-sm text-sage-700">{status}</p>}

      {mode === "drafts" && (
        <div className="card space-y-3">
          <h3 className="font-semibold text-brand-800">
            Saved Draft Assignments
          </h3>
          <p className="text-sm text-ink-faint">
            Not visible to students until published.
          </p>
          {!draftsLoaded ? (
            <p className="text-sm text-ink-faint">Loading…</p>
          ) : drafts.length === 0 ? (
            <p className="text-sm text-ink-faint">No saved drafts yet.</p>
          ) : (
            drafts.map((d) => (
              <div
                key={d._id}
                className="flex items-center justify-between rounded-md border border-brand-100 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{d.title}</p>
                  <p className="text-xs text-ink-faint">
                    {d.subject || "No subject"} ·{" "}
                    {d.class ? `Class ${d.class}` : "No class set"} ·{" "}
                    {d.questions?.length || 0} questions
                  </p>
                </div>
                <div className="flex flex-shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => openDraft(d)}
                    className="text-sm font-medium text-brand-700 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteDraft(d)}
                    className="text-sm font-medium text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {mode === "ai" && (
        <div className="card space-y-4">
          <p className="text-sm text-ink-faint">
            Nirantar AI drafts a title, instructions and question list locally
            via Ollama. Nothing is published until you review it below.
          </p>

          <div>
            <label
              htmlFor="assignment-ai-topic"
              className="mb-1.5 block text-sm font-medium text-ink"
            >
              Topic
            </label>
            <input
              id="assignment-ai-topic"
              className="input-field"
              placeholder="e.g. Quadratic Equations"
              value={aiParams.topic}
              onChange={(e) =>
                setAiParams({ ...aiParams, topic: e.target.value })
              }
            />
          </div>

          <ClassSectionSubjectSelect
            schoolConfig={schoolConfig}
            value={aiParams}
            onChange={setAiParams}
            sectionLabel="Whole class"
          />

          <div className="grid grid-cols-4 gap-3">
            {/* 1. Difficulty Level Field */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-ink-faint uppercase tracking-wider">
                Difficulty
              </label>
              <select
                className="input-field"
                value={aiParams.difficulty}
                onChange={(e) =>
                  setAiParams({ ...aiParams, difficulty: e.target.value })
                }
              >
                {["Easy", "Medium", "Hard"].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Number of Questions Field */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-ink-faint uppercase tracking-wider">
                Questions
              </label>
              <input
                type="number"
                min={1}
                max={MAX_QUESTIONS}
                className="input-field"
                placeholder="Questions"
                value={aiParams.questionCount || ""}
                onChange={(e) => {
                  const rawValue = e.target.value;
                  // Allow the user to backspace completely to type a new number
                  if (rawValue === "") {
                    setAiParams({ ...aiParams, questionCount: "" });
                    return;
                  }
                  // Absolute Floor Filter: Blocks negatives, decimals, and zero instantly
                  const parsedNum = Math.max(1, Math.floor(Number(rawValue)));
                  setAiParams({ ...aiParams, questionCount: parsedNum });
                }}
              />
            </div>

            {/* 3. Question Type Selector Field */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-ink-faint uppercase tracking-wider">
                Type
              </label>
              <select
                className="input-field"
                value={aiParams.questionType}
                onChange={(e) =>
                  setAiParams({ ...aiParams, questionType: e.target.value })
                }
              >
                <option value="MIXED">Mixed types</option>
                {["MCQ", "TRUE_FALSE", "FILL_BLANK", "SHORT_ANSWER"].map(
                  (t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ),
                )}
              </select>
            </div>

            {/* 4. Total Marks Input Field */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-ink-faint uppercase tracking-wider">
                Total Marks
              </label>
              <input
                type="number"
                min={1}
                className="input-field"
                placeholder="Marks"
                value={aiParams.marks || ""}
                onChange={(e) => {
                  const rawValue = e.target.value;
                  // Allow the user to backspace completely to type a new number
                  if (rawValue === "") {
                    setAiParams({ ...aiParams, marks: "" });
                    return;
                  }
                  // Absolute Floor Filter: Blocks negatives, decimals, and zero instantly
                  const parsedNum = Math.max(1, Math.floor(Number(rawValue)));
                  setAiParams({ ...aiParams, marks: parsedNum });
                }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={generateWithAi}
            disabled={aiLoading}
            className="btn-primary w-full"
          >
            {aiLoading ? "Generating assignment…" : "Generate with Nirantar AI"}
          </button>
        </div>
      )}

      {(mode === "manual" || mode === "ai") &&
        (form.title || draftQuestions.length > 0 || mode === "manual") && (
          <form onSubmit={publish} className="card space-y-4">
            <h3 className="font-semibold text-brand-800">
              {editingDraftId
                ? "Edit Draft"
                : mode === "ai"
                  ? "Review & Publish"
                  : "Create Assignment"}
            </h3>
            <input
              className="input-field"
              placeholder="Title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
            <textarea
              className="input-field min-h-[100px]"
              placeholder="Instructions"
              value={form.instructions}
              onChange={(e) =>
                setForm({ ...form, instructions: e.target.value })
              }
            />
            <ClassSectionSubjectSelect
              schoolConfig={schoolConfig}
              value={form}
              onChange={setForm}
            />
            <div className="grid grid-cols-2 gap-4">
              <input
                type="datetime-local"
                className="input-field"
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                required
              />
              <div>
                <label className="mb-1 block text-xs font-medium text-ink/70">
                  Marks
                </label>
                <input
                  type="number"
                  min={5}
                  max={100}
                  className="input-field"
                  placeholder="Marks (5–100)"
                  value={form.maxMarks}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      maxMarks:
                        e.target.value === "" ? "" : Number(e.target.value),
                    })
                  }
                />
                {form.maxMarks !== "" &&
                  (Number(form.maxMarks) < 5 ||
                    Number(form.maxMarks) > 100) && (
                    <p className="mt-1 text-xs text-red-600">
                      Marks must be between 5 and 100.
                    </p>
                  )}
              </div>
            </div>

            {draftQuestions.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-ink">
                  Questions ({draftQuestions.length}) — edit freely
                </p>
                {draftQuestions.map((q, idx) => (
                  <div
                    key={idx}
                    className="rounded-md border border-brand-100 p-3"
                  >
                    <div className="flex items-start gap-2">
                      <textarea
                        className="input-field flex-1"
                        value={q.text}
                        onChange={(e) =>
                          updateDraftQuestion(idx, { text: e.target.value })
                        }
                      />
                      <button
                        type="button"
                        onClick={() => removeDraftQuestion(idx)}
                        className="text-sm text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <select
                        className="input-field"
                        value={q.type}
                        onChange={(e) =>
                          updateDraftQuestion(idx, { type: e.target.value })
                        }
                      >
                        {[
                          "MCQ",
                          "TRUE_FALSE",
                          "FILL_BLANK",
                          "SHORT_ANSWER",
                        ].map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        className="input-field"
                        placeholder="Marks"
                        value={q.marks}
                        onChange={(e) =>
                          updateDraftQuestion(idx, {
                            marks: Number(e.target.value),
                          })
                        }
                      />
                      <input
                        className="input-field"
                        placeholder="Expected answer"
                        value={q.expectedAnswer || ""}
                        onChange={(e) =>
                          updateDraftQuestion(idx, {
                            expectedAnswer: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {mode === "ai" && (
                <button
                  type="button"
                  onClick={generateWithAi}
                  disabled={aiLoading}
                  className="btn-secondary"
                >
                  {aiLoading ? "Regenerating…" : "Regenerate"}
                </button>
              )}
              <button
                type="button"
                onClick={saveDraft}
                disabled={savingDraft}
                className="btn-secondary"
              >
                {savingDraft ? "Saving…" : "Save Draft"}
              </button>
              <button className="btn-primary">Publish</button>
            </div>
          </form>
        )}
    </div>
  );
}

function ManageQuizzes({ schoolConfig }) {
  const [mode, setMode] = useState("manual");
  const [manual, setManual] = useState({
    title: "",
    subject: "",
    class: "",
    section: "",
    timingMode: "OVERALL",
    timerMinutes: 15,
    questions: [],
  });
  const [aiForm, setAiForm] = useState({
    topic: "",
    count: 5,
    title: "",
    subject: "",
    class: "",
    section: "",
    timerMinutes: 15,
  });
  const [status, setStatus] = useState("");
  const [manualError, setManualError] = useState("");
  const [aiError, setAiError] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [editingDraftId, setEditingDraftId] = useState(null); // Mongo _id once saved as a draft
  const [savingDraft, setSavingDraft] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [draftsLoaded, setDraftsLoaded] = useState(false);

  const loadDrafts = async () => {
    try {
      const res = await api.get("/quizzes/drafts");
      setDrafts(res.data.drafts);
    } catch {
      // leave the previous list showing rather than blanking it on a transient error
    } finally {
      setDraftsLoaded(true);
    }
  };

  useEffect(() => {
    loadDrafts();
  }, []);

  const resetAll = () => {
    setManual({
      title: "",
      subject: "",
      class: "",
      section: "",
      timingMode: "OVERALL",
      timerMinutes: 15,
      questions: [],
    });
    setAiForm({ ...aiForm, topic: "" });
    setEditingDraftId(null);
    setManualError("");
  };

  const addQuestion = () => {
    if (manual.questions.length >= MAX_QUESTIONS) {
      setManualError(`A quiz can have at most ${MAX_QUESTIONS} questions.`);
      return;
    }
    setManualError("");
    setManual({
      ...manual,
      questions: [
        ...manual.questions,
        {
          type: "MCQ",
          text: "",
          options: ["", "", "", ""],
          correctAnswer: "0",
          marks: 1,
          timeLimitSeconds: 30,
        },
      ],
    });
  };

  const removeQuestion = (idx) => {
    setManual({
      ...manual,
      questions: manual.questions.filter((_, i) => i !== idx),
    });
  };

  // Marks (1-100): clamped as the teacher types, so an invalid value can
  // never even sit in the field — this is the frontend half of the
  // requirement (the backend re-validates independently on save).
  const clampMarks = (value) => {
    if (value === "" || value === null || Number.isNaN(Number(value))) return 1;
    return Math.min(100, Math.max(1, Math.round(Number(value))));
  };

  const updateQuestion = (idx, patch) => {
    const questions = [...manual.questions];
    if (patch.marks !== undefined)
      patch = { ...patch, marks: clampMarks(patch.marks) };
    questions[idx] = { ...questions[idx], ...patch };
    setManual({ ...manual, questions });
  };

  const validateMarks = () => {
    const bad = manual.questions.find((q) => {
      const m = Number(q.marks);
      return !Number.isFinite(m) || m < 1 || m > 100;
    });
    return bad
      ? "Marks (1–100) — please fix any question with an invalid marks value."
      : null;
  };

  const submitManual = async (e) => {
    e.preventDefault();
    if (
      manual.questions.length < MIN_QUESTIONS ||
      manual.questions.length > MAX_QUESTIONS
    ) {
      setManualError(
        `Quiz must contain between ${MIN_QUESTIONS} and ${MAX_QUESTIONS} questions.`,
      );
      return;
    }
    const marksErr = validateMarks();
    if (marksErr) {
      setManualError(marksErr);
      return;
    }
    setManualError("");
    try {
      if (editingDraftId) {
        await api.put(`/quizzes/${editingDraftId}`, {
          ...manual,
          status: "PUBLISHED",
        });
      } else {
        await api.post("/quizzes", { ...manual, status: "PUBLISHED" });
      }
      setStatus("Quiz created and students notified.");
      resetAll();
      loadDrafts();
    } catch (err) {
      setStatus(err.response?.data?.message || "Could not create quiz.");
    }
  };

  // Actually persists to the database as a DRAFT — visible only to this
  // teacher under "Saved Draft Quizzes", never to students — and stays
  // available (editable/publishable/deletable) after navigating away or
  // refreshing.
  const saveDraft = async () => {
    if (!manual.title.trim()) {
      setManualError("Give the quiz a title before saving as a draft.");
      return;
    }
    const marksErr = validateMarks();
    if (marksErr) {
      setManualError(marksErr);
      return;
    }
    setManualError("");
    setSavingDraft(true);
    try {
      const payload = { ...manual, status: "DRAFT" };
      if (editingDraftId) {
        const res = await api.put(`/quizzes/${editingDraftId}`, payload);
        setEditingDraftId(res.data.quiz._id);
      } else {
        const res = await api.post("/quizzes", payload);
        setEditingDraftId(res.data.quiz._id);
      }
      setStatus(
        "Saved as a draft. It won't be visible to students until you publish it.",
      );
      loadDrafts();
    } catch (err) {
      setStatus(err.response?.data?.message || "Could not save draft.");
    } finally {
      setSavingDraft(false);
    }
  };

  const openDraft = (d) => {
    setMode("manual");
    setEditingDraftId(d._id);
    setManual({
      title: d.title || "",
      subject: d.subject || "",
      class: d.class || "",
      section: d.section || "",
      timingMode: d.timingMode || "OVERALL",
      timerMinutes: d.timerMinutes ?? 15,
      questions: d.questions || [],
    });
    setStatus(`Editing draft "${d.title}".`);
  };

  const deleteDraft = async (d) => {
    if (!window.confirm(`Delete the draft "${d.title}"? This can't be undone.`))
      return;
    try {
      await api.delete(`/quizzes/${d._id}`);
      if (editingDraftId === d._id) resetAll();
      loadDrafts();
      setStatus("Draft deleted.");
    } catch (err) {
      setStatus(err.response?.data?.message || "Could not delete draft.");
    }
  };

  // Generates a draft only — nothing is saved or published yet. The
  // generated questions load into the same editable builder used for manual
  // quizzes below, so the teacher must review (and can edit/add/delete) them
  // before Publish actually creates the quiz and notifies students.
  const submitAi = async (e) => {
    e.preventDefault();
    const count = Number(aiForm.count);
    if (!count || count < MIN_QUESTIONS || count > MAX_QUESTIONS) {
      setAiError(
        `Quiz must contain between ${MIN_QUESTIONS} and ${MAX_QUESTIONS} questions.`,
      );
      return;
    }
    setAiError("");
    setStatus("Asking Nirantar AI…");
    setAiLoading(true);
    try {
      const res = await api.post("/quizzes/ai-generate", aiForm);
      setManual({
        title: aiForm.title || res.data.draft.title,
        subject: aiForm.subject,
        class: aiForm.class,
        section: aiForm.section,
        timingMode: "OVERALL",
        timerMinutes: aiForm.timerMinutes || 15,
        questions: res.data.draft.questions,
      });
      setEditingDraftId(null); // this is a fresh AI draft, not yet saved to the DB
      setMode("manual"); // switch to the editable builder so the teacher reviews before publishing
      setStatus(
        "Draft generated — review, edit, Save Draft, or Publish below.",
      );
    } catch (err) {
      setStatus(err.response?.data?.message || "AI quiz generation failed.");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => {
            setMode("manual");
            resetAll();
          }}
          className={mode === "manual" ? "btn-primary" : "btn-secondary"}
        >
          Build Manually
        </button>
        <button
          onClick={() => setMode("ai")}
          className={mode === "ai" ? "btn-primary" : "btn-secondary"}
        >
          Generate with Nirantar AI
        </button>
        <button
          onClick={() => setMode("drafts")}
          className={mode === "drafts" ? "btn-primary" : "btn-secondary"}
        >
          Saved Draft Quizzes{" "}
          {draftsLoaded && drafts.length > 0 ? `(${drafts.length})` : ""}
        </button>
      </div>
      {status && <p className="text-sm text-sage-700">{status}</p>}

      {mode === "drafts" && (
        <div className="card space-y-2">
          <h3 className="font-semibold text-brand-800">Saved Draft Quizzes</h3>
          {!draftsLoaded ? (
            <p className="text-sm text-ink-faint">Loading…</p>
          ) : drafts.length === 0 ? (
            <p className="text-sm text-ink-faint">No saved drafts yet.</p>
          ) : (
            drafts.map((d) => (
              <div
                key={d._id}
                className="flex items-center justify-between rounded-md border border-brand-100 p-3"
              >
                <div>
                  <p className="text-sm font-medium text-ink">{d.title}</p>
                  <p className="text-xs text-ink-faint">
                    {d.questions?.length || 0} question
                    {d.questions?.length === 1 ? "" : "s"}
                    {d.class ? ` · Class ${d.class}` : ""}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => openDraft(d)}
                    className="text-sm font-medium text-brand-700 hover:underline"
                  >
                    Edit / Publish
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteDraft(d)}
                    className="text-sm font-medium text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {mode === "manual" ? (
        <form onSubmit={submitManual} className="card space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">
              Quiz Title
            </label>
            <input
              className="input-field"
              placeholder="Quiz title"
              value={manual.title}
              onChange={(e) => setManual({ ...manual, title: e.target.value })}
              required
            />
          </div>
          <ClassSectionSubjectSelect
            schoolConfig={schoolConfig}
            value={manual}
            onChange={setManual}
          />

          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">Timing</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setManual({ ...manual, timingMode: "OVERALL" })}
                className={
                  manual.timingMode === "OVERALL"
                    ? "btn-primary"
                    : "btn-secondary"
                }
              >
                Overall Timer
              </button>
              <button
                type="button"
                onClick={() =>
                  setManual({ ...manual, timingMode: "PER_QUESTION" })
                }
                className={
                  manual.timingMode === "PER_QUESTION"
                    ? "btn-primary"
                    : "btn-secondary"
                }
              >
                Per-Question Timer
              </button>
            </div>
          </div>
          {manual.timingMode === "OVERALL" ? (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">
                Timer (minutes)
              </label>
              <input
                type="number"
                className="input-field"
                placeholder="Timer (min)"
                value={manual.timerMinutes}
                onChange={(e) =>
                  setManual({ ...manual, timerMinutes: e.target.value })
                }
              />
            </div>
          ) : (
            <p className="text-sm text-ink-faint">
              Set each question's own time limit below — the quiz auto-advances
              when a question's timer runs out.
            </p>
          )}

          <p className="text-sm text-ink-faint">
            {manual.questions.length} / {MAX_QUESTIONS} questions (minimum{" "}
            {MIN_QUESTIONS})
          </p>
          {manualError && <p className="text-sm text-red-600">{manualError}</p>}

          {manual.questions.map((q, idx) => (
            <div key={idx} className="rounded-md border border-brand-100 p-3">
              <div className="flex items-center justify-between">
                <div
                  className={`grid flex-1 gap-2 ${manual.timingMode === "PER_QUESTION" ? "grid-cols-3" : "grid-cols-2"}`}
                >
                  <div>
                    <label className="mb-0.5 block text-[11px] font-medium text-ink-faint">
                      Question Type
                    </label>
                    <select
                      className="input-field"
                      value={q.type}
                      onChange={(e) =>
                        updateQuestion(idx, { type: e.target.value })
                      }
                    >
                      {["MCQ", "TRUE_FALSE", "FILL_BLANK", "SHORT_ANSWER"].map(
                        (t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[11px] font-medium text-ink-faint">
                      Marks (1–100)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      className="input-field"
                      placeholder="Marks (1–100)"
                      value={q.marks}
                      onChange={(e) =>
                        updateQuestion(idx, { marks: e.target.value })
                      }
                      onBlur={(e) =>
                        updateQuestion(idx, {
                          marks: clampMarks(e.target.value),
                        })
                      }
                    />
                  </div>
                  {manual.timingMode === "PER_QUESTION" && (
                    <div>
                      <label className="mb-0.5 block text-[11px] font-medium text-ink-faint">
                        Time (seconds)
                      </label>
                      <input
                        type="number"
                        className="input-field"
                        placeholder="Seconds"
                        value={q.timeLimitSeconds || 30}
                        onChange={(e) =>
                          updateQuestion(idx, {
                            timeLimitSeconds: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeQuestion(idx)}
                  className="ml-2 text-sm text-red-600 hover:underline"
                >
                  Remove
                </button>
              </div>
              <div className="mt-2">
                <label className="mb-0.5 block text-[11px] font-medium text-ink-faint">
                  Question Text
                </label>
                <input
                  className="input-field"
                  placeholder="Question text"
                  value={q.text}
                  onChange={(e) => updateQuestion(idx, { text: e.target.value })}
                />
              </div>
              {q.type === "MCQ" && (
                <div className="mt-2">
                  <label className="mb-0.5 block text-[11px] font-medium text-ink-faint">
                    Answer Options
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {q.options.map((opt, oi) => (
                      <input
                        key={oi}
                        className="input-field"
                        placeholder={`Option ${oi + 1}`}
                        value={opt}
                        onChange={(e) => {
                          const options = [...q.options];
                          options[oi] = e.target.value;
                          updateQuestion(idx, { options });
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-2">
                <label className="mb-0.5 block text-[11px] font-medium text-ink-faint">
                  Correct Answer
                </label>
                <input
                  className="input-field"
                  placeholder="Correct answer (option index for MCQ, true/false, or text)"
                  value={q.correctAnswer}
                  onChange={(e) =>
                    updateQuestion(idx, { correctAnswer: e.target.value })
                  }
                />
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addQuestion}
              disabled={manual.questions.length >= MAX_QUESTIONS}
              className="btn-secondary"
            >
              + Add Question
            </button>
            {aiForm.topic && (
              <button
                type="button"
                onClick={submitAi}
                disabled={aiLoading}
                className="btn-secondary"
              >
                {aiLoading ? "Regenerating…" : "Regenerate with Nirantar AI"}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={saveDraft}
              disabled={savingDraft}
              className="btn-secondary"
            >
              {savingDraft ? "Saving…" : "Save Draft"}
            </button>
            <button
              disabled={manual.questions.length < MIN_QUESTIONS}
              className="btn-primary flex-1"
            >
              {editingDraftId
                ? "Publish Quiz"
                : aiForm.topic
                  ? "Publish Quiz"
                  : "Create Quiz"}
            </button>
          </div>
        </form>
      ) : mode === "ai" ? (
        <form onSubmit={submitAi} className="card space-y-4">
          <p className="text-sm text-ink-faint">
            Nirantar AI drafts the questions locally via Ollama — no internet
            needed.
          </p>
          <div>
            <label
              htmlFor="ai-topic"
              className="mb-1.5 block text-sm font-medium text-ink"
            >
              Topic
            </label>
            <input
              id="ai-topic"
              className="input-field"
              placeholder="e.g. Photosynthesis"
              value={aiForm.topic}
              onChange={(e) => setAiForm({ ...aiForm, topic: e.target.value })}
              required
            />
          </div>
          <div>
            <label
              htmlFor="ai-count"
              className="mb-1.5 block text-sm font-medium text-ink"
            >
              Number of questions ({MIN_QUESTIONS}-{MAX_QUESTIONS})
            </label>
            <input
              id="ai-count"
              type="number"
              min={MIN_QUESTIONS}
              max={MAX_QUESTIONS}
              className="input-field"
              value={aiForm.count}
              onChange={(e) =>
                setAiForm({ ...aiForm, count: Number(e.target.value) })
              }
            />
            {aiError && <p className="mt-1 text-sm text-red-600">{aiError}</p>}
          </div>
          <div>
            <label
              htmlFor="ai-quiz-title"
              className="mb-1.5 block text-sm font-medium text-ink"
            >
              Quiz title <span className="text-ink-faint">(optional)</span>
            </label>
            <input
              id="ai-quiz-title"
              className="input-field"
              placeholder="Leave blank to use the AI-generated title"
              value={aiForm.title}
              onChange={(e) => setAiForm({ ...aiForm, title: e.target.value })}
            />
          </div>
          <ClassSectionSubjectSelect
            schoolConfig={schoolConfig}
            value={aiForm}
            onChange={setAiForm}
          />
          <div>
            <label
              htmlFor="ai-timer"
              className="mb-1.5 block text-sm font-medium text-ink"
            >
              Timer (minutes)
            </label>
            <input
              id="ai-timer"
              type="number"
              min={1}
              className="input-field"
              placeholder="e.g. 15"
              value={aiForm.timerMinutes}
              onChange={(e) =>
                setAiForm({ ...aiForm, timerMinutes: e.target.value })
              }
            />
          </div>
          <button className="btn-primary w-full" disabled={aiLoading}>
            {aiLoading ? "Generating…" : "Generate Quiz"}
          </button>
        </form>
      ) : null}
    </div>
  );
}

function TeacherAiTools() {
  const [subTab, setSubTab] = useState("chat");

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setSubTab("chat")}
          className={subTab === "chat" ? "btn-primary" : "btn-secondary"}
        >
          Chat
        </button>
        <button
          onClick={() => setSubTab("summarize")}
          className={subTab === "summarize" ? "btn-primary" : "btn-secondary"}
        >
          Summarize Material
        </button>
      </div>
      {subTab === "chat" ? (
        <NirantarAiChat
          storageNamespace="teacher"
          greeting="Hi, I'm Nirantar AI — running locally on your school's server. Ask me for lesson-planning help, explanations, or a hand drafting practice questions."
        />
      ) : (
        <TeacherSummarizeTool />
      )}
    </div>
  );
}

function TeacherSummarizeTool() {
  const [text, setText] = useState("");
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);

  const summarize = async () => {
    setLoading(true);
    try {
      const res = await api.post("/ai/summarize", { text });
      setSummary(res.data.summary);
    } catch (err) {
      setSummary(err.response?.data?.message || "Nirantar AI is unavailable.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card space-y-4">
      <h3 className="font-semibold text-brand-800">Summarize Material</h3>
      <textarea
        className="input-field min-h-[120px]"
        placeholder="Paste lesson text to summarize into study notes…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        onClick={summarize}
        disabled={loading || !text}
        className="btn-primary"
      >
        {loading ? "Summarizing…" : "Summarize"}
      </button>
      {summary && (
        <div className="rounded-md bg-canvas-sunk p-4 text-sm text-ink">
          <MarkdownMessage text={summary} />
        </div>
      )}
    </div>
  );
}

// Teacher view of assignment/quiz submissions & quiz results — requirement
// #3: assignment submissions need student name/ID/class/section/status/
// timestamp/late-flag, and quiz results need name/ID/status/score/total/
// percentage/submitted-time plus a question-by-question breakdown per
// student. Both list every targeted student, not just the ones who acted,
// so pending/missing students are visible too.
function Submissions() {
  const [kind, setKind] = useState("assignments"); // "assignments" | "quizzes"
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [openAttempt, setOpenAttempt] = useState(null); // { quizId, attemptId } for the detail modal
  const [openSubmission, setOpenSubmission] = useState(null); // a single assignment submission row

  useEffect(() => {
    setSelectedId("");
    setRows(null);
    api
      .get(kind === "assignments" ? "/assignments" : "/quizzes")
      .then((res) =>
        setItems(
          kind === "assignments" ? res.data.assignments : res.data.quizzes,
        ),
      )
      .catch(() => setItems([]));
  }, [kind]);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    const url =
      kind === "assignments"
        ? `/assignments/${selectedId}/submissions`
        : `/quizzes/${selectedId}/results`;
    api
      .get(url)
      .then((res) => {
        setRows(
          kind === "assignments" ? res.data.submissions : res.data.results,
        );
        setMeta(kind === "assignments" ? res.data.assignment : res.data.quiz);
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [selectedId, kind]);

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <h3 className="font-semibold text-brand-800">Submissions</h3>
        <div className="flex gap-2">
          {["assignments", "quizzes"].map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                kind === k
                  ? "bg-brand-700 text-white"
                  : "bg-brand-50 text-brand-800"
              }`}
            >
              {k === "assignments" ? "Assignments" : "Quizzes"}
            </button>
          ))}
        </div>
        <select
          className="input-field"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          <option value="">
            Select a {kind === "assignments" ? "assignment" : "quiz"}…
          </option>
          {items.map((it) => (
            <option key={it._id} value={it._id}>
              {it.title} — Class {it.class}
              {it.section ? ` ${it.section}` : ""}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="text-sm text-ink-faint">Loading…</p>}

      {rows && !loading && kind === "assignments" && (
        <AssignmentSubmissionsTable
          meta={meta}
          rows={rows}
          onOpen={setOpenSubmission}
        />
      )}
      {rows && !loading && kind === "quizzes" && (
        <QuizResultsTable
          meta={meta}
          rows={rows}
          onOpen={(attemptId) =>
            setOpenAttempt({ quizId: selectedId, attemptId })
          }
        />
      )}

      {openSubmission && (
        <SubmissionDetailModal
          row={openSubmission}
          onClose={() => setOpenSubmission(null)}
        />
      )}
      {openAttempt && (
        <AttemptDetailModal
          quizId={openAttempt.quizId}
          attemptId={openAttempt.attemptId}
          onClose={() => setOpenAttempt(null)}
        />
      )}
    </div>
  );
}

function AssignmentSubmissionsTable({ meta, rows, onOpen }) {
  if (!rows.length)
    return (
      <p className="text-sm text-ink-faint">
        No students assigned to this class/section.
      </p>
    );
  const statusBadge = (status) => {
    const map = {
      PENDING: "bg-brand-50 text-brand-700",
      MISSED: "bg-red-50 text-red-700",
      LATE: "bg-amber-50 text-amber-700",
      SUBMITTED: "bg-sage-50 text-sage-700",
      GRADED: "bg-sage-100 text-sage-800",
    };
    return (
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status] || "bg-brand-50 text-brand-700"}`}
      >
        {status}
      </span>
    );
  };
  return (
    <div className="card overflow-x-auto">
      {meta?.deadline && (
        <p className="mb-3 text-xs text-ink-faint">
          Deadline: {new Date(meta.deadline).toLocaleString()}
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-brand-100 text-left text-ink-faint">
            <th className="py-2 pr-3">Student</th>
            <th className="py-2 pr-3">Roll / ID</th>
            <th className="py-2 pr-3">Class</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2 pr-3">Submitted</th>
            <th className="py-2 pr-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.student._id} className="border-b border-brand-50">
              <td className="py-2 pr-3 font-medium text-ink">
                {r.student.fullName}
              </td>
              <td className="py-2 pr-3">
                {r.student.rollNumber || r.student.userId}
              </td>
              <td className="py-2 pr-3">
                {r.student.class}
                {r.student.section ? ` ${r.student.section}` : ""}
              </td>
              <td className="py-2 pr-3">{statusBadge(r.status)}</td>
              <td className="py-2 pr-3">
                {r.submittedAt ? new Date(r.submittedAt).toLocaleString() : "—"}
              </td>
              <td className="py-2 pr-3">
                {r.submission && (
                  <button
                    type="button"
                    onClick={() => onOpen(r)}
                    className="text-sm text-brand-700 hover:underline"
                  >
                    Open
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuizResultsTable({ meta, rows, onOpen }) {
  if (!rows.length)
    return (
      <p className="text-sm text-ink-faint">
        No students assigned to this class/section.
      </p>
    );
  const statusBadge = (status) => {
    const map = {
      PENDING: "bg-brand-50 text-brand-700",
      IN_PROGRESS: "bg-amber-50 text-amber-700",
      COMPLETED: "bg-sage-50 text-sage-700",
      ABANDONED: "bg-red-50 text-red-700",
    };
    return (
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status] || "bg-brand-50 text-brand-700"}`}
      >
        {status}
      </span>
    );
  };
  return (
    <div className="card overflow-x-auto">
      {meta?.totalMarks !== undefined && (
        <p className="mb-3 text-xs text-ink-faint">
          Total marks: {meta.totalMarks}
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-brand-100 text-left text-ink-faint">
            <th className="py-2 pr-3">Student</th>
            <th className="py-2 pr-3">Roll / ID</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2 pr-3">Score</th>
            <th className="py-2 pr-3">%</th>
            <th className="py-2 pr-3">Submitted</th>
            <th className="py-2 pr-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.student._id} className="border-b border-brand-50">
              <td className="py-2 pr-3 font-medium text-ink">
                {r.student.fullName}
              </td>
              <td className="py-2 pr-3">
                {r.student.rollNumber || r.student.userId}
              </td>
              <td className="py-2 pr-3">{statusBadge(r.status)}</td>
              <td className="py-2 pr-3">
                {r.score ?? "—"} / {r.totalMarks}
              </td>
              <td className="py-2 pr-3">
                {r.percentage !== null ? `${r.percentage}%` : "—"}
              </td>
              <td className="py-2 pr-3">
                {r.submittedAt ? new Date(r.submittedAt).toLocaleString() : "—"}
              </td>
              <td className="py-2 pr-3">
                {r.attemptId && (
                  <button
                    type="button"
                    onClick={() => onOpen(r.attemptId)}
                    className="text-sm text-brand-700 hover:underline"
                  >
                    Open
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SubmissionDetailModal({ row, onClose }) {
  const s = row.submission;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-lg bg-canvas-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-ink">
            {row.student.fullName}'s Submission
          </h3>
          <button onClick={onClose} className="btn-secondary text-sm">
            Close
          </button>
        </div>
        <p className="mb-2 text-xs text-ink-faint">
          Submitted{" "}
          {s?.submittedAt ? new Date(s.submittedAt).toLocaleString() : "—"} ·{" "}
          {row.status}
        </p>
        {s?.answerText && (
          <div className="mb-3 rounded-md border border-brand-100 p-3">
            <MarkdownMessage text={s.answerText} />
          </div>
        )}
        {s?.filePath && (
          <a
            href={s.filePath}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary inline-flex text-sm"
          >
            Open attached file
          </a>
        )}
        {!s?.answerText && !s?.filePath && (
          <p className="text-sm text-ink-faint">No content submitted.</p>
        )}
      </div>
    </div>
  );
}

function AttemptDetailModal({ quizId, attemptId, onClose }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get(`/quizzes/${quizId}/results/${attemptId}`)
      .then((res) => setDetail(res.data))
      .catch(() => setError("Could not load this result."));
  }, [quizId, attemptId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-canvas-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-ink">
            {detail?.student?.fullName || "Quiz Result"}
          </h3>
          <button onClick={onClose} className="btn-secondary text-sm">
            Close
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!detail && !error && (
          <p className="text-sm text-ink-faint">Loading…</p>
        )}
        {detail && (
          <>
            <p className="mb-4 text-sm text-ink-soft">
              Score: {detail.score} / {detail.quiz.totalMarks}{" "}
              {detail.abandoned && (
                <span className="text-red-600">
                  (abandoned — quiz was left incomplete)
                </span>
              )}
            </p>
            <div className="space-y-3">
              {detail.breakdown.map((b, idx) => (
                <div
                  key={idx}
                  className={`rounded-md border p-3 ${b.isCorrect ? "border-sage-200 bg-sage-50/40" : "border-red-100 bg-red-50/30"}`}
                >
                  <p className="text-sm font-medium text-ink">
                    {idx + 1}. {b.questionText}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">
                    Student answer:{" "}
                    {b.studentAnswer ??
                      (b.timedOut ? "(timed out — no answer)" : "(no answer)")}
                  </p>
                  <p className="text-xs text-ink-faint">
                    Correct answer: {b.correctAnswer}
                  </p>
                  <p className="mt-1 text-xs font-medium text-ink-faint">
                    {b.marksAwarded} / {b.marks} marks
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
