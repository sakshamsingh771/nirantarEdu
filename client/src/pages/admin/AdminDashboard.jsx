import React, { useEffect, useState } from "react";
import DashboardLayout from "../../layouts/DashboardLayout.jsx";
import api from "../../services/api.js";
import { useSchoolConfig } from "../../hooks/useSchoolConfig.js";
import ClassSectionSubjectSelect from "../../components/ClassSectionSubjectSelect.jsx";

const TABS = ["Overview", "Student Records", "Teachers", "Correction Requests", "School Settings", "Account"];

export default function AdminDashboard() {
  const [tab, setTab] = useState("Overview");
  const [overview, setOverview] = useState(null);
  const [schoolConfig, refetchSchoolConfig] = useSchoolConfig();

  const loadOverview = () => api.get("/admin/overview").then((res) => setOverview(res.data));
  useEffect(() => {
    loadOverview();
  }, []);

  return (
    <DashboardLayout title="School Administration">
      <div className="mb-6 flex flex-wrap gap-2 border-b border-brand-100">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t ? "border-brand-700 text-brand-800" : "border-transparent text-ink-faint hover:text-ink"
            }`}
          >
            {t}
            {t === "Correction Requests" && overview?.pendingCorrections > 0 && (
              <span className="badge ml-1.5 bg-accent-400/20 text-accent-600">{overview.pendingCorrections}</span>
            )}
          </button>
        ))}
      </div>

      {/* Kept mounted (hidden via CSS) rather than conditionally rendered,
          so switching tabs never wipes an in-progress add/edit form — same
          fix as the Teacher dashboard's tab panels. */}
      <div style={{ display: tab === "Overview" ? "" : "none" }}>
        <Overview overview={overview} />
      </div>
      <div style={{ display: tab === "Student Records" ? "" : "none" }}>
        <StudentRecordsManager schoolConfig={schoolConfig} onChanged={loadOverview} />
      </div>
      <div style={{ display: tab === "Teachers" ? "" : "none" }}>
        <UserManager role="TEACHER" schoolConfig={schoolConfig} onChanged={loadOverview} />
      </div>
      <div style={{ display: tab === "Correction Requests" ? "" : "none" }}>
        <CorrectionRequestsManager onChanged={loadOverview} />
      </div>
      <div style={{ display: tab === "School Settings" ? "" : "none" }}>
        <SchoolSettings schoolConfig={schoolConfig} onChanged={refetchSchoolConfig} />
      </div>
      <div style={{ display: tab === "Account" ? "" : "none" }}>
        <AdminAccountSettings />
      </div>
    </DashboardLayout>
  );
}

function Overview({ overview }) {
  if (!overview) return <p className="text-sm text-ink-faint">Loading…</p>;
  const cards = [
    ["Student Records", overview.totalStudents],
    ["Total Teachers", overview.totalTeachers],
    ["Pending Correction Requests", overview.pendingCorrections],
    ["Assignments", overview.totalAssignments],
    ["Quizzes", overview.totalQuizzes],
    ["Materials", overview.totalMaterials],
  ];
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map(([label, value]) => (
        <div key={label} className="card">
          <p className="text-sm text-ink-faint">{label}</p>
          <p className="mt-2 text-2xl font-bold text-brand-800">{value}</p>
        </div>
      ))}
    </div>
  );
}

// ---- Student Records: the official pre-registration data admins manage,
// organized class-wise (then section-wise) rather than one giant table. ----
function StudentRecordsManager({ schoolConfig, onChanged }) {
  const [allStudents, setAllStudents] = useState([]); // used for per-class counts
  const [selectedClass, setSelectedClass] = useState(null);
  const [selectedSection, setSelectedSection] = useState("");
  const [classStudents, setClassStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [form, setForm] = useState({ studentId: "", fullName: "", class: "", section: "", rollNumber: "" });
  const [status, setStatus] = useState("");

  const loadAll = () => api.get("/admin/students").then((res) => setAllStudents(res.data.students));
  useEffect(() => {
    loadAll();
  }, []);

  // Server-side class/section filtering, reused via the existing
  // GET /admin/students?class=&section= support, rather than a new API.
  useEffect(() => {
    if (!selectedClass) return;
    api
      .get("/admin/students", { params: { class: selectedClass, section: selectedSection || undefined } })
      .then((res) => setClassStudents(res.data.students));
  }, [selectedClass, selectedSection]);

  useEffect(() => {
    if (!search.trim()) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(() => {
      api.get("/admin/students", { params: { search } }).then((res) => setSearchResults(res.data.students));
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const refreshCurrentView = () => {
    loadAll();
    if (selectedClass) {
      api
        .get("/admin/students", { params: { class: selectedClass, section: selectedSection || undefined } })
        .then((res) => setClassStudents(res.data.students));
    }
    if (search.trim()) {
      api.get("/admin/students", { params: { search } }).then((res) => setSearchResults(res.data.students));
    }
  };

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post("/admin/students", form);
      setStatus(`Record created for ${form.studentId}. They can now register.`);
      setForm({ studentId: "", fullName: "", class: "", section: "", rollNumber: "" });
      refreshCurrentView();
      onChanged();
    } catch (err) {
      setStatus(err.response?.data?.message || "Could not create student record.");
    }
  };

  const removeStudent = async (student) => {
    try {
      const res = await api.delete(`/admin/students/${student._id}`);
      setStatus(res.data.message);
      refreshCurrentView();
      onChanged();
    } catch (err) {
      setStatus(err.response?.data?.message || "Could not remove this student.");
    }
  };

  const classCounts = {};
  for (const s of allStudents) classCounts[s.class] = (classCounts[s.class] || 0) + 1;

  const classesToShow = schoolConfig.classes.length > 0 ? schoolConfig.classes : Object.keys(classCounts).sort();

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="font-semibold text-ink">Add a Student Record</h3>
        <p className="mt-1 text-sm text-ink-soft">
          Create the official record before a student registers — no password needed here. The student sets their
          own password when they verify against this record.
        </p>
        <form onSubmit={create} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input className="input-field" placeholder="Student ID" value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} required />
          <input className="input-field" placeholder="Full Name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
          <div className="sm:col-span-2 lg:col-span-2">
            <ClassSectionSubjectSelect schoolConfig={schoolConfig} value={form} onChange={setForm} showSubject={false} sectionLabel="Section" />
          </div>
          <input className="input-field" placeholder="Roll No." value={form.rollNumber} onChange={(e) => setForm({ ...form, rollNumber: e.target.value })} />
          <button className="btn-primary sm:col-span-2 lg:col-span-5">Add Student Record</button>
        </form>
        {status && <p className="mt-3 text-sm text-sage-700">{status}</p>}
      </div>

      <input
        className="input-field max-w-md"
        placeholder="Search by student name or student ID…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {search.trim() ? (
        <StudentTable students={searchResults} onRemove={removeStudent} emptyText="No students match that search." />
      ) : selectedClass ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => { setSelectedClass(null); setSelectedSection(""); }} className="btn-secondary">
              ← All Classes
            </button>
            <h3 className="font-semibold text-ink">Class {selectedClass}</h3>
            <select className="input-field max-w-[180px]" value={selectedSection} onChange={(e) => setSelectedSection(e.target.value)}>
              <option value="">All Sections</option>
              {(schoolConfig.sectionsByClass?.[selectedClass] || []).map((s) => (
                <option key={s} value={s}>Section {s}</option>
              ))}
            </select>
          </div>

          {selectedSection ? (
            <StudentTable students={classStudents} onRemove={removeStudent} emptyText={`No students in Class ${selectedClass} Section ${selectedSection}.`} />
          ) : (
            groupBySection(classStudents).map(([section, students]) => (
              <div key={section}>
                <h4 className="mb-2 text-sm font-semibold text-ink-soft">{section === "—" ? "No Section" : `Section ${section}`}</h4>
                <StudentTable students={students} onRemove={removeStudent} emptyText="No students." />
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classesToShow.map((cls) => (
            <button key={cls} onClick={() => setSelectedClass(cls)} className="card text-left transition hover:border-brand-300">
              <h3 className="font-semibold text-ink">Class {cls}</h3>
              <p className="mt-1 text-sm text-ink-faint">{classCounts[cls] || 0} student record{classCounts[cls] === 1 ? "" : "s"}</p>
              <span className="mt-3 inline-block text-sm font-medium text-brand-700">View Students →</span>
            </button>
          ))}
          {classesToShow.length === 0 && <p className="text-sm text-ink-faint">No classes configured yet.</p>}
        </div>
      )}
    </div>
  );
}



function groupBySection(students) {
  const groups = {};
  for (const s of students) {
    const key = s.section || "—";
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
}

function StudentTable({ students, onRemove, emptyText }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-brand-100 bg-canvas-card">
      <table className="min-w-full divide-y divide-brand-100 text-sm">
        <thead className="bg-canvas-sunk">
          <tr>
            <th className="px-4 py-2 text-left font-medium text-ink-faint">Student ID</th>
            <th className="px-4 py-2 text-left font-medium text-ink-faint">Name</th>
            <th className="px-4 py-2 text-left font-medium text-ink-faint">Roll No.</th>
            <th className="px-4 py-2 text-left font-medium text-ink-faint">Registration</th>
            <th className="px-4 py-2 text-left font-medium text-ink-faint">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-50">
          {students.map((s) => (
            <tr key={s._id}>
              <td className="px-4 py-2">{s.studentId}</td>
              <td className="px-4 py-2">{s.fullName}</td>
              <td className="px-4 py-2">{s.rollNumber || "—"}</td>
              <td className="px-4 py-2">
                {s.isRegistered ? (
                  <span className="badge bg-sage-100 text-sage-700">Registered</span>
                ) : (
                  <span className="badge bg-canvas-sunk text-ink-faint">Not registered</span>
                )}
              </td>
              <td className="px-4 py-2">
                <button onClick={() => onRemove(s)} className="text-red-600 hover:underline">
                  Remove Student
                </button>
              </td>
            </tr>
          ))}
          {students.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-ink-faint">
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---- Teachers/Admins: unchanged direct account creation ----
function UserManager({ role, schoolConfig, onChanged }) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ userId: "", fullName: "", password: "" });
  const [status, setStatus] = useState("");
  const [managingTeacher, setManagingTeacher] = useState(null);

  const load = () => api.get(`/admin/users`, { params: { role, search } }).then((res) => setUsers(res.data.users));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, search]);

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post("/admin/users", { ...form, role });
      setStatus("Teacher added.");
      setForm({ userId: "", fullName: "", password: "" });
      load();
      onChanged();
    } catch (err) {
      setStatus(err.response?.data?.message || "Could not add user.");
    }
  };

  const deactivate = async (id) => {
    await api.delete(`/admin/users/${id}`);
    load();
    onChanged();
  };

  const activate = async (id) => {
    await api.post(`/admin/users/${id}/activate`);
    load();
    onChanged();
  };

  const resetPassword = async (id) => {
    const newPassword = window.prompt("Enter a new password for this teacher (minimum 8 characters):");
    if (!newPassword) return;
    try {
      await api.post(`/admin/users/${id}/reset-password`, { newPassword });
      setStatus("Password reset successfully.");
    } catch (err) {
      setStatus(err.response?.data?.message || "Could not reset password.");
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input className="input-field" placeholder="ID" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} required />
        <input className="input-field" placeholder="Full Name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
        <input className="input-field" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <button className="btn-primary">Add Teacher</button>
      </form>
      {status && <p className="text-sm text-sage-700">{status}</p>}

      <input className="input-field max-w-sm" placeholder="Search by name or ID…" value={search} onChange={(e) => setSearch(e.target.value)} />

      <div className="overflow-x-auto rounded-lg border border-brand-100 bg-canvas-card">
        <table className="min-w-full divide-y divide-brand-100 text-sm">
          <thead className="bg-canvas-sunk">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-ink-faint">ID</th>
              <th className="px-4 py-2 text-left font-medium text-ink-faint">Name</th>
              <th className="px-4 py-2 text-left font-medium text-ink-faint">Assigned Classes</th>
              <th className="px-4 py-2 text-left font-medium text-ink-faint">Status</th>
              <th className="px-4 py-2 text-left font-medium text-ink-faint">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {users.map((u) => (
              <tr key={u._id}>
                <td className="px-4 py-2">{u.userId}</td>
                <td className="px-4 py-2">{u.fullName}</td>
                <td className="px-4 py-2 text-ink-faint">
                  {(u.teacherAssignments || []).length === 0
                    ? "None yet"
                    : u.teacherAssignments.map((a) => `${a.subject} ${a.class}${a.section ? `-${a.section}` : ""}`).join(", ")}
                </td>
                <td className="px-4 py-2">{u.isActive ? "Active" : "Deactivated"}</td>
                <td className="px-4 py-2 space-x-3">
                  <button onClick={() => setManagingTeacher(u)} className="text-brand-700 hover:underline">Assign Classes</button>
                  <button onClick={() => resetPassword(u._id)} className="text-brand-700 hover:underline">Reset Password</button>
                  {u.isActive ? (
                    <button onClick={() => deactivate(u._id)} className="text-red-600 hover:underline">Deactivate</button>
                  ) : (
                    <button onClick={() => activate(u._id)} className="text-sage-700 hover:underline">Activate</button>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-ink-faint">No teachers found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {managingTeacher && (
        <TeacherAssignmentModal
          teacher={managingTeacher}
          schoolConfig={schoolConfig}
          onClose={() => setManagingTeacher(null)}
          onSaved={() => {
            setManagingTeacher(null);
            load();
          }}
        />
      )}
    </div>
  );
}

// Admin -> Teacher -> Subject -> Class -> Section assignment. A teacher gets
// NO classes by default — only what's explicitly added here, enforced
// server-side via User.canTeach() on every material/assignment/quiz create.
function TeacherAssignmentModal({ teacher, schoolConfig, onClose, onSaved }) {
  const [assignments, setAssignments] = useState(teacher.teacherAssignments || []);
  const [draft, setDraft] = useState({ subject: "", class: "", section: "" });
  const [status, setStatus] = useState("");

  const addAssignment = () => {
    if (!draft.subject || !draft.class) {
      setStatus("Select a subject and class first.");
      return;
    }
    setAssignments([...assignments, draft]);
    setDraft({ subject: "", class: "", section: "" });
  };

  const removeAssignment = (idx) => setAssignments(assignments.filter((_, i) => i !== idx));

  const save = async () => {
    try {
      await api.put(`/admin/users/${teacher._id}/assignments`, { assignments });
      onSaved();
    } catch (err) {
      setStatus(err.response?.data?.message || "Could not save assignments.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="card w-full max-w-lg">
        <h3 className="text-lg font-semibold text-ink">Assign Classes — {teacher.fullName}</h3>
        <p className="mt-1 text-sm text-ink-soft">
          This teacher only gets access to what's listed below. Leave section empty for the whole class.
        </p>
        {status && <p className="mt-2 text-sm text-red-600">{status}</p>}

        <div className="mt-4 space-y-2">
          {assignments.map((a, idx) => (
            <div key={idx} className="flex items-center justify-between rounded-md bg-canvas-sunk px-3 py-2 text-sm">
              <span>{a.subject} — Class {a.class}{a.section ? ` Section ${a.section}` : " (whole class)"}</span>
              <button onClick={() => removeAssignment(idx)} className="text-red-600 hover:underline">Remove</button>
            </div>
          ))}
          {assignments.length === 0 && <p className="text-sm text-ink-faint">No classes assigned yet.</p>}
        </div>

        <div className="mt-4 border-t border-brand-50 pt-4">
          <ClassSectionSubjectSelect schoolConfig={schoolConfig} value={draft} onChange={setDraft} sectionLabel="Whole class" />
          <button type="button" onClick={addAssignment} className="btn-secondary mt-3">
            + Add
          </button>
        </div>

        <div className="mt-5 flex gap-2">
          <button onClick={save} className="btn-primary">Save Assignments</button>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  );
}

const STATUS_OPTIONS = ["pending", "under_review", "approved", "rejected", "resolved"];
const ISSUE_LABELS = {
  INCORRECT_NAME: "Incorrect name",
  INCORRECT_STUDENT_ID: "Incorrect Student ID",
  INCORRECT_CLASS: "Incorrect class/grade",
  INCORRECT_SECTION: "Incorrect section",
  INCORRECT_SCHOOL: "Incorrect school information",
  RECORD_NOT_FOUND: "Student record not found",
  OTHER: "Other",
};

function CorrectionRequestsManager({ onChanged }) {
  const [requests, setRequests] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState(null);

  const load = () =>
    api.get("/admin/correction-requests", { params: { status: statusFilter, search } }).then((res) => setRequests(res.data.requests));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, search]);

  const open = requests.find((r) => r._id === openId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <select className="input-field max-w-[200px]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s.replace("_", " ")}</option>
          ))}
        </select>
        <input className="input-field max-w-sm" placeholder="Search by Student ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {requests.map((r) => (
          <button key={r._id} onClick={() => setOpenId(r._id)} className="card text-left transition hover:border-brand-300">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-ink">{r.requestCode}</span>
              <span className={`badge ${r.status === "pending" ? "bg-accent-400/20 text-accent-600" : r.status === "rejected" ? "bg-red-50 text-red-700" : "bg-sage-100 text-sage-700"}`}>
                {r.status.replace("_", " ")}
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-soft">
              {ISSUE_LABELS[r.issueType]} · Student ID {r.studentIdEntered}
            </p>
            <p className="mt-2 line-clamp-2 text-sm text-ink-faint">{r.description}</p>
          </button>
        ))}
        {requests.length === 0 && <p className="text-sm text-ink-faint">No correction requests match this filter.</p>}
      </div>

      {open && (
        <CorrectionRequestDetail
          request={open}
          onClose={() => setOpenId(null)}
          onResolved={() => {
            setOpenId(null);
            load();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function CorrectionRequestDetail({ request, onClose, onResolved }) {
  const [adminResponse, setAdminResponse] = useState(request.adminResponse || "");
  const [recordUpdate, setRecordUpdate] = useState({
    fullName: request.student?.fullName || "",
    class: request.student?.class || "",
    section: request.student?.section || "",
    rollNumber: request.student?.rollNumber || "",
  });
  const [status, setStatus] = useState("");

  const resolve = async (newStatus, applyUpdate) => {
    try {
      await api.patch(`/admin/correction-requests/${request._id}`, {
        status: newStatus,
        adminResponse,
        recordUpdate: applyUpdate ? recordUpdate : undefined,
      });
      onResolved();
    } catch (err) {
      setStatus(err.response?.data?.message || "Could not update this request.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="card w-full max-w-lg">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-ink">Correction Request {request.requestCode}</h3>
          <button onClick={onClose} className="text-ink-faint hover:text-ink" aria-label="Close">✕</button>
        </div>

        <p className="mt-1 text-sm text-ink-soft">
          Student ID {request.studentIdEntered}
          {request.student ? ` — ${request.student.fullName}` : " — no matching record found"}
        </p>

        {request.student && (
          <dl className="mt-3 rounded-lg bg-canvas-sunk p-3 text-sm">
            <div className="flex justify-between py-1">
              <dt className="text-ink-soft">Current Class</dt>
              <dd className="font-medium text-ink">{request.student.class}-{request.student.section || "—"}</dd>
            </div>
          </dl>
        )}

        <div className="mt-3 rounded-lg bg-canvas-sunk p-3 text-sm">
          <p className="font-medium text-ink">{ISSUE_LABELS[request.issueType]}</p>
          <p className="mt-1 text-ink-soft">"{request.description}"</p>
        </div>

        {status && <p className="mt-3 text-sm text-red-600">{status}</p>}

        {request.student && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <input className="input-field" placeholder="Name" value={recordUpdate.fullName} onChange={(e) => setRecordUpdate({ ...recordUpdate, fullName: e.target.value })} />
            <input className="input-field" placeholder="Class" value={recordUpdate.class} onChange={(e) => setRecordUpdate({ ...recordUpdate, class: e.target.value })} />
            <input className="input-field" placeholder="Section" value={recordUpdate.section} onChange={(e) => setRecordUpdate({ ...recordUpdate, section: e.target.value })} />
            <input className="input-field" placeholder="Roll No." value={recordUpdate.rollNumber} onChange={(e) => setRecordUpdate({ ...recordUpdate, rollNumber: e.target.value })} />
          </div>
        )}

        <textarea
          className="input-field mt-4 min-h-[80px]"
          placeholder="Response to the student (optional)"
          value={adminResponse}
          onChange={(e) => setAdminResponse(e.target.value)}
        />

        <div className="mt-5 flex flex-wrap gap-2">
          {request.student && (
            <button onClick={() => resolve("approved", true)} className="btn-primary">
              Approve &amp; Update Record
            </button>
          )}
          <button onClick={() => resolve("rejected", false)} className="btn-danger">
            Reject Request
          </button>
          <button onClick={() => resolve("under_review", false)} className="btn-secondary">
            Mark Under Review
          </button>
        </div>
      </div>
    </div>
  );
}

const ALL_CLASSES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const ALL_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function SchoolSettings({ schoolConfig, onChanged }) {
  const [form, setForm] = useState({ name: "", address: "" });
  const [status, setStatus] = useState("");
  const [classStatus, setClassStatus] = useState("");
  const [expandedClass, setExpandedClass] = useState(null);
  const [sectionDraft, setSectionDraft] = useState([]);
  const [codeStatus, setCodeStatus] = useState("");
  const [regenerating, setRegenerating] = useState(false);

  const regenerateCode = async () => {
    if (
      !window.confirm(
        "Regenerate the school code? The old code will stop working immediately — everyone will need the new one to log in or register. Student, teacher, and school data will NOT be affected."
      )
    ) {
      return;
    }
    setRegenerating(true);
    setCodeStatus("");
    try {
      const res = await api.post("/school/regenerate-code");
      setCodeStatus(`New school code: ${res.data.schoolCode}`);
      onChanged();
    } catch (err) {
      setCodeStatus(err.response?.data?.message || "Could not regenerate the school code.");
    } finally {
      setRegenerating(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.put("/admin/school", { name: form.name, address: form.address });
      setStatus("School information updated.");
    } catch (err) {
      setStatus(err.response?.data?.message || "Could not update settings.");
    }
  };

  const toggleClass = async (cls) => {
    const nextClasses = schoolConfig.classes.includes(cls)
      ? schoolConfig.classes.filter((c) => c !== cls)
      : [...schoolConfig.classes, cls];
    try {
      await api.put("/admin/school/classes", { classes: nextClasses });
      setClassStatus(`Class ${cls} ${nextClasses.includes(cls) ? "enabled" : "removed"}.`);
      onChanged();
    } catch (err) {
      setClassStatus(err.response?.data?.message || "Could not update classes.");
    }
  };

  const openSections = (cls) => {
    setExpandedClass(cls);
    setSectionDraft(schoolConfig.sectionsByClass?.[cls] || []);
  };

  const toggleSectionLetter = (letter) => {
    setSectionDraft((prev) => (prev.includes(letter) ? prev.filter((l) => l !== letter) : [...prev, letter].sort()));
  };

  const saveSections = async () => {
    try {
      await api.put(`/admin/school/classes/${expandedClass}/sections`, { sections: sectionDraft });
      setClassStatus(`Sections for Class ${expandedClass} updated.`);
      setExpandedClass(null);
      onChanged();
    } catch (err) {
      setClassStatus(err.response?.data?.message || "Could not update sections.");
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="card space-y-3">
        <h3 className="font-semibold text-brand-800">School Code</h3>
        <p className="text-sm text-ink-soft">
          Current code: <span className="font-mono font-medium text-ink">{schoolConfig.schoolCode}</span>
        </p>
        <p className="text-sm text-ink-faint">
          Regenerating replaces the code everyone uses to log in and register. It does not delete or change any
          student, teacher, or school record — only the code itself.
        </p>
        {codeStatus && <p className="text-sm text-sage-700">{codeStatus}</p>}
        <button type="button" onClick={regenerateCode} disabled={regenerating} className="btn-secondary">
          {regenerating ? "Regenerating…" : "Regenerate School Code"}
        </button>
      </div>

      <form onSubmit={save} className="card space-y-4">
        <h3 className="font-semibold text-brand-800">School Information</h3>
        {status && <p className="text-sm text-sage-700">{status}</p>}
        <input className="input-field" placeholder="School name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="input-field" placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        <button className="btn-primary">Save Changes</button>
      </form>

      <div className="card">
        <h3 className="font-semibold text-brand-800">Classes &amp; Sections</h3>
        <p className="mt-1 text-sm text-ink-soft">
          Choose which of Class 1–12 this school uses, then configure which sections exist for each — not every
          class needs the same sections.
        </p>
        {classStatus && <p className="mt-2 text-sm text-sage-700">{classStatus}</p>}

        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {ALL_CLASSES.map((cls) => {
            const enabled = schoolConfig.classes.includes(cls);
            return (
              <button
                key={cls}
                type="button"
                onClick={() => toggleClass(cls)}
                className={`rounded-md border px-3 py-2 text-sm font-medium ${
                  enabled ? "border-brand-600 bg-brand-50 text-brand-700" : "border-brand-100 text-ink-faint hover:bg-canvas-sunk"
                }`}
              >
                Class {cls}
              </button>
            );
          })}
        </div>

        {schoolConfig.classes.length > 0 && (
          <div className="mt-5 space-y-2">
            <p className="text-sm font-medium text-ink">Sections per class</p>
            {schoolConfig.classes.map((cls) => (
              <div key={cls} className="rounded-md border border-brand-100 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ink">
                    Class {cls}: {(schoolConfig.sectionsByClass?.[cls] || []).join(", ") || "no sections configured"}
                  </span>
                  <button type="button" onClick={() => openSections(cls)} className="text-sm font-medium text-brand-700 hover:underline">
                    Configure →
                  </button>
                </div>
                {expandedClass === cls && (
                  <div className="mt-3 border-t border-brand-50 pt-3">
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_LETTERS.map((letter) => (
                        <button
                          key={letter}
                          type="button"
                          onClick={() => toggleSectionLetter(letter)}
                          className={`h-8 w-8 rounded-md border text-xs font-medium ${
                            sectionDraft.includes(letter)
                              ? "border-brand-600 bg-brand-600 text-white"
                              : "border-brand-100 text-ink-faint hover:bg-canvas-sunk"
                          }`}
                        >
                          {letter}
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={saveSections} className="btn-primary">
                        Save Sections
                      </button>
                      <button type="button" onClick={() => setExpandedClass(null)} className="btn-secondary">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Admin Dashboard -> Settings -> Account. Never displays the actual
// password; "Password status" is deliberately just "set", nothing hash- or
// age-derived leaks here.
function AdminAccountSettings() {
  const [account, setAccount] = useState(null);
  const [nameForm, setNameForm] = useState({ fullName: "" });
  const [nameStatus, setNameStatus] = useState("");
  const [idForm, setIdForm] = useState({ newAdminId: "", currentPassword: "" });
  const [idStatus, setIdStatus] = useState("");
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmNewPassword: "" });
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false });
  const [pwStatus, setPwStatus] = useState("");
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryResult, setRecoveryResult] = useState(null);
  const [recoveryStatus, setRecoveryStatus] = useState("");

  const load = () => api.get("/admin/account").then((res) => {
    setAccount(res.data);
    setNameForm({ fullName: res.data.adminName || "" });
  });
  useEffect(() => {
    load();
  }, []);

  const changeName = async (e) => {
    e.preventDefault();
    setNameStatus("");
    try {
      await api.put("/admin/account/profile", nameForm);
      setNameStatus("Profile updated.");
      load();
    } catch (err) {
      setNameStatus(err.response?.data?.message || "Could not update profile.");
    }
  };

  const changeId = async (e) => {
    e.preventDefault();
    setIdStatus("");
    try {
      await api.put("/admin/account/id", idForm);
      setIdStatus("Admin ID updated. Use the new ID for your next login — this session keeps working.");
      setIdForm({ newAdminId: "", currentPassword: "" });
      load();
    } catch (err) {
      setIdStatus(err.response?.data?.message || "Could not change Admin ID.");
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwStatus("");
    if (pwForm.newPassword !== pwForm.confirmNewPassword) {
      setPwStatus("New password and confirmation do not match.");
      return;
    }
    try {
      await api.post("/auth/change-password", pwForm);
      setPwStatus("Password changed successfully.");
      setPwForm({ currentPassword: "", newPassword: "", confirmNewPassword: "" });
    } catch (err) {
      setPwStatus(err.response?.data?.message || "Could not change password.");
    }
  };

  const generateRecoveryCode = async (e) => {
    e.preventDefault();
    setRecoveryStatus("");
    setRecoveryResult(null);
    try {
      const res = await api.post("/admin/account/recovery-code", { currentPassword: recoveryPassword });
      setRecoveryResult(res.data.recoveryCode);
      setRecoveryPassword("");
      load();
    } catch (err) {
      setRecoveryStatus(err.response?.data?.message || "Could not generate a recovery code.");
    }
  };

  if (!account) return <p className="text-sm text-ink-faint">Loading…</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="card">
        <h3 className="font-semibold text-brand-800">Account</h3>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-ink-soft">Admin Name</dt><dd className="text-ink">{account.adminName}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">Admin ID</dt><dd className="text-ink">{account.adminId}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">Role</dt><dd className="text-ink">{account.role}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">School</dt><dd className="text-ink">{account.school}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">School Code</dt><dd className="text-ink">{account.schoolCode}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">Password</dt><dd className="text-ink">Set</dd></div>
          <div className="flex justify-between">
            <dt className="text-ink-soft">Recovery Code</dt>
            <dd className="text-ink">{account.recoveryCode.configured ? "Configured" : "Not configured"}</dd>
          </div>
        </dl>
      </div>

      <form onSubmit={changeName} className="card space-y-4">
        <h3 className="font-semibold text-brand-800">Edit Profile</h3>
        {nameStatus && <p className="text-sm text-sage-700">{nameStatus}</p>}
        <input
          className="input-field"
          placeholder="Full name"
          value={nameForm.fullName}
          onChange={(e) => setNameForm({ fullName: e.target.value })}
          required
        />
        <button className="btn-primary">Save Name</button>
      </form>

      <form onSubmit={changeId} className="card space-y-4">
        <h3 className="font-semibold text-brand-800">Change Admin ID</h3>
        <p className="text-sm text-ink-soft">Current Admin ID: <strong>{account.adminId}</strong></p>
        {idStatus && <p className="text-sm text-sage-700">{idStatus}</p>}
        <input className="input-field" placeholder="New Admin ID" value={idForm.newAdminId} onChange={(e) => setIdForm({ ...idForm, newAdminId: e.target.value })} required />
        <input type="password" className="input-field" placeholder="Current password" value={idForm.currentPassword} onChange={(e) => setIdForm({ ...idForm, currentPassword: e.target.value })} required />
        <button className="btn-primary">Change Admin ID</button>
      </form>

      <form onSubmit={changePassword} className="card space-y-4">
        <h3 className="font-semibold text-brand-800">Change Password</h3>
        {pwStatus && <p className="text-sm text-sage-700">{pwStatus}</p>}
        {["currentPassword", "newPassword", "confirmNewPassword"].map((field, i) => {
          const key = ["current", "next", "confirm"][i];
          const label = { currentPassword: "Current Password", newPassword: "New Password", confirmNewPassword: "Confirm New Password" }[field];
          return (
            <div key={field} className="relative">
              <input
                type={showPw[key] ? "text" : "password"}
                className="input-field pr-11"
                placeholder={label}
                value={pwForm[field]}
                onChange={(e) => setPwForm({ ...pwForm, [field]: e.target.value })}
                required
              />
              <button
                type="button"
                onClick={() => setShowPw({ ...showPw, [key]: !showPw[key] })}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-faint hover:text-ink-soft"
                aria-label={showPw[key] ? "Hide password" : "Show password"}
              >
                {showPw[key] ? "🙈" : "👁"}
              </button>
            </div>
          );
        })}
        <button className="btn-primary">Change Password</button>
      </form>

      <form onSubmit={generateRecoveryCode} className="card space-y-4">
        <h3 className="font-semibold text-brand-800">Recovery Code</h3>
        <p className="text-sm text-ink-soft">
          Used to reset your password if you ever forget it, without needing internet or email. Generating a new
          code immediately invalidates the old one.
        </p>
        {recoveryStatus && <p className="text-sm text-red-600">{recoveryStatus}</p>}
        {recoveryResult && (
          <div className="rounded-md bg-canvas-sunk p-4">
            <p className="text-sm font-medium text-ink">Save this now — it will not be shown again:</p>
            <p className="mt-2 font-mono text-lg text-brand-700">{recoveryResult}</p>
          </div>
        )}
        <input type="password" className="input-field" placeholder="Current password" value={recoveryPassword} onChange={(e) => setRecoveryPassword(e.target.value)} required />
        <button className="btn-primary">Generate New Recovery Code</button>
      </form>
    </div>
  );
}
