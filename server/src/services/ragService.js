const Material = require("../models/Material");

/**
 * Lightweight local "RAG" retrieval: keyword/relevance scoring over materials'
 * extracted text, entirely in MongoDB — no external embedding API.
 *
 * This is a practical starting point, not a full vector-embedding pipeline.
 * For a stronger implementation, swap this for a local embedding model served
 * via Ollama (e.g. nomic-embed-text) plus a local vector index — the AI
 * controller already isolates this behind chatWithContext() so that swap
 * would not require changing any routes.
 */
async function findRelevantContext(schoolId, query, { classFilter, limit = 3 } = {}) {
  const words = query
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);

  if (words.length === 0) return "";

  const regexes = words.map((w) => new RegExp(w, "i"));
  const filter = {
    school: schoolId,
    textContent: { $exists: true, $ne: "" },
    $or: [{ title: { $in: regexes } }, { textContent: { $in: regexes } }],
  };
  if (classFilter) filter.class = classFilter;

  const materials = await Material.find(filter).limit(limit).lean();
  return materials.map((m) => `[${m.title}]\n${(m.textContent || "").slice(0, 1500)}`).join("\n\n");
}

module.exports = { findRelevantContext };
