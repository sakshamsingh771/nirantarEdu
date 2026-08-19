import React, { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";

// Set worker source using a stable CDN/bundle-safe URL matching the pdfjs-dist version
pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const PREVIEWABLE_TYPES = ["PDF", "IMAGE", "VIDEO", "AUDIO"];

export default function MaterialViewerModal({ material, onClose }) {
  const [txtContent, setTxtContent] = useState(null);
  const [txtError, setTxtError] = useState("");
  const isTxt = material.fileExtension === "txt" || material.type === "NOTE";
  const closingViaHistoryRef = useRef(false);

  useEffect(() => {
    window.history.pushState({ nirantarMaterialViewer: true }, "");
    const onPopState = () => {
      closingViaHistoryRef.current = true;
      onClose();
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
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
    return <PdfViewer filePath={filePath} title={material.title} />;
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

function PdfViewer({ filePath, title }) {
  const canvasRef = useRef(null);
  const pdfDocRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Load document
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setPageNum(1);

    const loadingTask = pdfjsLib.getDocument({
      url: filePath,
      cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
      cMapPacked: true,
    });

    loadingTask.promise
      .then((doc) => {
        if (cancelled) return;
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("PDF Load Error:", err);
          setError("Could not load this PDF.");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      pdfDocRef.current?.destroy();
      pdfDocRef.current = null;
    };
  }, [filePath]);

  // Render active page
  useEffect(() => {
    if (!pdfDocRef.current) return;
    let cancelled = false;

    pdfDocRef.current.getPage(pageNum).then((page) => {
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext("2d");
      
      // Support high DPI / Mobile screens
      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = Math.floor(viewport.width) + "px";
      canvas.style.height = Math.floor(viewport.height) + "px";

      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

      renderTaskRef.current?.cancel();
      const task = page.render({ 
        canvasContext: context, 
        viewport,
        transform 
      });
      renderTaskRef.current = task;
      task.promise.catch(() => {
        /* ignore cancelled rendering */
      });
    });

    return () => {
      cancelled = true;
    };
  }, [pageNum, scale, numPages]);

  if (error) return <p className="text-center text-sm text-red-600">{error}</p>;

  return (
    <div className="mx-auto flex max-w-5xl flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-3 rounded-md bg-canvas-card px-3 py-2 shadow-sm">
        <button
          type="button"
          onClick={() => setPageNum((p) => Math.max(1, p - 1))}
          disabled={pageNum <= 1}
          className="btn-secondary text-sm disabled:opacity-40"
        >
          Prev
        </button>
        <span className="text-sm text-ink-soft">
          Page {pageNum} of {numPages || "…"}
        </span>
        <button
          type="button"
          onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
          disabled={pageNum >= numPages}
          className="btn-secondary text-sm disabled:opacity-40"
        >
          Next
        </button>
        <span className="mx-1 h-4 w-px bg-brand-100" />
        <button
          type="button"
          onClick={() => setScale((s) => Math.max(0.6, +(s - 0.2).toFixed(1)))}
          className="btn-secondary text-sm"
          aria-label="Zoom out"
        >
          −
        </button>
        <span className="text-sm text-ink-soft">{Math.round(scale * 100)}%</span>
        <button
          type="button"
          onClick={() => setScale((s) => Math.min(3, +(s + 0.2).toFixed(1)))}
          className="btn-secondary text-sm"
          aria-label="Zoom in"
        >
          +
        </button>
      </div>

      <div className="w-full overflow-auto rounded-lg border border-brand-100 bg-canvas-sunk p-4">
        {loading && <p className="text-center text-sm text-ink-faint">Loading {title}…</p>}
        <canvas ref={canvasRef} className="mx-auto block shadow" />
      </div>
    </div>
  );
}

export { PREVIEWABLE_TYPES };