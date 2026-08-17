import React from "react";

// Shared by Teacher (Materials/Assignments/Quizzes) and Admin (Add Student,
// Teacher Assignment) forms. Classes come from the school's controlled 1-12
// list; sections are scoped to whichever class is currently selected, since
// a school can configure different sections per class (e.g. Class 10 has
// A-D, Class 12 only has A-B) — this never shows a section the admin hasn't
// actually configured for that class.
export default function ClassSectionSubjectSelect({
  schoolConfig,
  value,
  onChange,
  showSubject = true,
  sectionLabel = "All Sections",
}) {
  const { classes, sectionsByClass, subjects } = schoolConfig;
  const availableSections = value.class ? sectionsByClass?.[value.class] || [] : [];

  const handleClassChange = (newClass) => {
    // Changing class invalidates whatever section was selected for the old class.
    onChange({ ...value, class: newClass, section: "" });
  };

  return (
    <div className={`grid gap-4 ${showSubject ? "grid-cols-3" : "grid-cols-2"}`}>
      {showSubject &&
        (subjects.length > 0 ? (
          <select className="input-field" value={value.subject || ""} onChange={(e) => onChange({ ...value, subject: e.target.value })}>
            <option value="">Subject</option>
            {subjects.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        ) : (
          <input className="input-field" placeholder="Subject" value={value.subject || ""} onChange={(e) => onChange({ ...value, subject: e.target.value })} />
        ))}

      {classes.length > 0 ? (
        <select className="input-field" value={value.class || ""} onChange={(e) => handleClassChange(e.target.value)} required>
          <option value="">Class</option>
          {classes.map((c) => (
            <option key={c} value={c}>Class {c}</option>
          ))}
        </select>
      ) : (
        <input className="input-field" placeholder="Class" value={value.class || ""} onChange={(e) => handleClassChange(e.target.value)} required />
      )}

      {availableSections.length > 0 ? (
        <select className="input-field" value={value.section || ""} onChange={(e) => onChange({ ...value, section: e.target.value })}>
          <option value="">{sectionLabel}</option>
          {availableSections.map((s) => (
            <option key={s} value={s}>Section {s}</option>
          ))}
        </select>
      ) : (
        <input
          className="input-field"
          placeholder={value.class ? "No sections configured" : "Select a class first"}
          value={value.section || ""}
          onChange={(e) => onChange({ ...value, section: e.target.value })}
          disabled={!value.class}
        />
      )}
    </div>
  );
}
