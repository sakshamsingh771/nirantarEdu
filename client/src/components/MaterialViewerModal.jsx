import React, { useEffect, useRef, useState } from "react";

const PREVIEWABLE_TYPES = ["PDF", "IMAGE", "VIDEO", "AUDIO"];

export default function MaterialViewerModal({ material, onClose }) {
  const [txtContent, setTxtContent] = useState(null);
  const [txtError, setTxtError] = useState("");
  const isTxt = material.fileExtension === "txt" || material.type === "NOTE";
  const closingViaHistoryRef = useRef(false);

  // Root-cause fix for "open material → press Back → logged out": opening
  // this modal used to be pure React state with no browser-history entry of
  // its own, so pressing Back skipped straight past the dashboard to
  // whatever page was open before it (often the login screen), which LOOKED
  // like a forced logout. Pushing a history entry here means Back closes
  // the viewer and lands back on Materials, same as Close does — the
  // student's session/token is never touched either way.
  useEffect(() => {
    window.history.pushState({ nirantarMaterialViewer: true }, "");
    const onPopState = () => {
      closingViaHistoryRef.current = true;
      onClose();
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      // If we're unmounting because Close was clicked (not because the user
      // already navigated back), remove the history entry we added so it
      // doesn't linger as a dead "step" the user has to click Back through.
      if (!closingViaHistoryRef.current) {
        window.history.back();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (material.fileExtension === "txt" && material.filePath) {
      fetch(material.filePath)
        .then((res) => {
          if (!res.ok) throw new Error("Could not load this file.");
          return res.text();
        })
        .then(setTxtContent)
        .catch(() => setTxtError("Could not load this file."));
    }
  }, [material]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canDownload = Boolean(material.filePath);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink/40 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="flex items-center justify-between border-b border-brand-100 bg-canvas-card px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-ink">{material.title}</h3>
          <p className="text-xs text-ink-faint">{material.subject}</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {canDownload && (
            <a href={material.filePath} download className="btn-secondary text-sm">
              Download
            </a>
          )}
          <button onClick={onClose} className="btn-primary text-sm" aria-label="Close viewer">
            Close
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-canvas-sunk p-4 sm:p-6">
        <ViewerBody material={material} txtContent={txtContent} txtError={txtError} isTxt={isTxt} />
      </div>
    </div>
  );
}

function ViewerBody({ material, txtContent, txtError, isTxt }) {
  const { type, filePath, textContent } = material;

  // NOTE materials have no file at all — their text IS the content.
  if (type === "NOTE" && !filePath) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg bg-canvas-card p-6">
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink">{textContent}</pre>
      </div>
    );
  }

  if (!filePath) {
    return <p className="text-center text-sm text-ink-faint">File not uploaded yet.</p>;
  }

  if (isTxt) {
    if (txtError) return <p className="text-center text-sm text-red-600">{txtError}</p>;
    return (
      <div className="mx-auto max-w-3xl rounded-lg bg-canvas-card p-6">
        <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-ink">
          {txtContent ?? "Loading…"}
        </pre>
      </div>
    );
  }

  if (type === "PDF") {
    // The browser's native PDF viewer (rendered via iframe against a
    // Content-Disposition: inline response) already provides zoom, search
    // and page navigation — no extra pdf.js dependency needed for that.
    return (
      <iframe
        src={filePath}
        title={material.title}
        className="mx-auto h-[80vh] w-full max-w-5xl rounded-lg border border-brand-100 bg-canvas-card"
      />
    );
  }

  if (type === "IMAGE") {
    return (
      <div className="flex h-full items-center justify-center">
        <img src={filePath} alt={material.title} className="max-h-[80vh] max-w-full rounded-lg object-contain" />
      </div>
    );
  }

  if (type === "VIDEO") {
    return (
      <div className="flex h-full items-center justify-center">
        <video src={filePath} controls className="max-h-[80vh] w-full max-w-4xl rounded-lg bg-black">
          Your browser cannot play this video format.
        </video>
      </div>
    );
  }

  if (type === "AUDIO") {
    return (
      <div className="mx-auto max-w-lg rounded-lg bg-canvas-card p-8">
        <audio src={filePath} controls className="w-full">
          Your browser cannot play this audio format.
        </audio>
      </div>
    );
  }

  // PPT/DOC formats: no offline in-app renderer exists in this project
  // (would require a new heavy dependency like docx-preview/pptx viewer),
  // so this is an honest fallback rather than a fake preview.
  return (
    <div className="mx-auto max-w-md rounded-lg bg-canvas-card p-8 text-center">
      <p className="text-sm text-ink-soft">
        {material.fileExtension?.toUpperCase() || type} files can't be previewed inside NirantarEdu yet.
      </p>
      <a href={filePath} target="_blank" rel="noreferrer" download className="btn-primary mt-4 inline-flex">
        Open / Download {material.fileExtension?.toUpperCase() || type}
      </a>
    </div>
  );
}

export { PREVIEWABLE_TYPES };
