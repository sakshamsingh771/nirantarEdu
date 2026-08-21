import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";

// Pure client-side PPTX preview — no server round-trip, no internet
// dependency (unlike an Office/Google embed viewer, which would break the
// offline-first requirement). A .pptx is just a zip of XML parts, so we
// unzip it in the browser with JSZip and pull the text + images straight
// out of each slideN.xml. This is intentionally low-fidelity: no exact
// layout, fonts, animations, or transitions — just each slide's text and
// pictures, in order, so a student/teacher can read the content without
// needing MS Office / LibreOffice installed anywhere.
const MIME_BY_EXT = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  emf: null, // vector formats browsers can't render directly — skipped
  wmf: null,
};

export default function PptxViewer({ filePath, title }) {
  const [slides, setSlides] = useState(null); // [{ texts: string[], images: string[] (object URLs) }]
  const [slideIndex, setSlideIndex] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const objectUrlsRef = useRef([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setSlideIndex(0);

    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];

    (async () => {
      try {
        const res = await fetch(filePath);
        if (!res.ok) throw new Error("Could not load this file.");
        const buf = await res.arrayBuffer();
        const zip = await JSZip.loadAsync(buf);
        const parsed = await parsePptx(zip);
        if (!cancelled) {
          objectUrlsRef.current = parsed.flatMap((s) => s.images);
          setSlides(parsed);
        }
      } catch (err) {
        console.error("PPTX parse error:", err);
        if (!cancelled) setError("Could not preview this presentation.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
    };
  }, [filePath]);

  if (loading) return <p className="text-center text-sm text-ink-faint">Loading {title}…</p>;
  if (error) return <p className="text-center text-sm text-red-600">{error}</p>;
  if (!slides || slides.length === 0) {
    return <p className="text-center text-sm text-ink-faint">No readable slides found in this file.</p>;
  }

  const slide = slides[slideIndex];

  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-3 rounded-md bg-canvas-card px-3 py-2 shadow-sm">
        <button
          type="button"
          onClick={() => setSlideIndex((i) => Math.max(0, i - 1))}
          disabled={slideIndex <= 0}
          className="btn-secondary text-sm disabled:opacity-40"
        >
          Prev
        </button>
        <span className="text-sm text-ink-soft">
          Slide {slideIndex + 1} of {slides.length}
        </span>
        <button
          type="button"
          onClick={() => setSlideIndex((i) => Math.min(slides.length - 1, i + 1))}
          disabled={slideIndex >= slides.length - 1}
          className="btn-secondary text-sm disabled:opacity-40"
        >
          Next
        </button>
      </div>

      <p className="text-center text-xs text-ink-faint">
        Text-and-image preview — exact slide layout, fonts, and animations aren't reproduced. Download the file to
        open it in PowerPoint for the full design.
      </p>

      <div className="aspect-[16/9] w-full overflow-auto rounded-lg border border-brand-100 bg-white p-8 shadow-sm">
        {slide.texts.length === 0 && slide.images.length === 0 ? (
          <p className="text-sm text-ink-faint">This slide has no extractable text or images.</p>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            {slide.texts.map((t, i) => (
              <p key={i} className={i === 0 ? "text-xl font-semibold text-ink" : "text-sm text-ink-soft"}>
                {t}
              </p>
            ))}
            {slide.images.map((url, i) => (
              <img key={i} src={url} alt={`Slide ${slideIndex + 1} image ${i + 1}`} className="max-h-64 rounded-md object-contain" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Reads every ppt/slides/slideN.xml (sorted by slide number, which matches
// presentation order for the vast majority of real-world decks), pulls out
// every <a:t> text run per slide, and resolves each slide's image
// relationships (via slideN.xml.rels -> ppt/media/...) into blob object
// URLs so <img> tags can render them without a network request.
async function parsePptx(zip) {
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml$/)[1]);
      const nb = Number(b.match(/slide(\d+)\.xml$/)[1]);
      return na - nb;
    });

  const slides = [];
  for (const slidePath of slideFiles) {
    const xml = await zip.file(slidePath).async("text");
    const texts = extractTextRuns(xml);

    const slideNum = slidePath.match(/slide(\d+)\.xml$/)[1];
    const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
    const images = zip.file(relsPath) ? await extractImages(zip, await zip.file(relsPath).async("text")) : [];

    slides.push({ texts, images });
  }
  return slides;
}

function extractTextRuns(xml) {
  const matches = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)];
  return matches
    .map((m) => decodeXmlEntities(m[1]).trim())
    .filter(Boolean);
}

async function extractImages(zip, relsXml) {
  const targets = [...relsXml.matchAll(/Type="[^"]*\/image"[^>]*Target="([^"]+)"/g)].map((m) => m[1]);
  const urls = [];
  for (const target of targets) {
    const normalized = normalizePath(`ppt/slides/${target}`);
    const ext = normalized.split(".").pop().toLowerCase();
    const mime = MIME_BY_EXT[ext];
    if (!mime) continue;
    const file = zip.file(normalized);
    if (!file) continue;
    const blob = await file.async("blob");
    urls.push(URL.createObjectURL(new Blob([blob], { type: mime })));
  }
  return urls;
}

function normalizePath(path) {
  const parts = [];
  for (const segment of path.split("/")) {
    if (segment === "..") parts.pop();
    else if (segment !== ".") parts.push(segment);
  }
  return parts.join("/");
}

function decodeXmlEntities(str) {
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}