const axios = require("axios");

// Cloud provider is entirely config-driven — no provider name is hard-coded
// into the rest of the app. AI_MODEL picks the model; AI_API_KEY
// authenticates. Gemini is the concrete implementation here (the project
// had no existing cloud integration to preserve), reached over its REST API
// so no extra SDK dependency is needed. Swapping to a different cloud
// vendor later means changing this one file, not the provider abstraction,
// the conversation manager, or any controller.
const AI_API_KEY = process.env.AI_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || "gemini-2.0-flash";
const AI_BASE_URL = process.env.AI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";

// A short connect/response timeout is the whole point here — this provider
// is only ever tried when Ollama is standing by as a fallback, so it's
// better to give up quickly and hand off than to make a student wait a long
// time before falling back to the local model.
const CLOUD_TIMEOUT_MS = Number(process.env.AI_CLOUD_TIMEOUT_MS) || 12000;

function isConfigured() {
  return Boolean(AI_API_KEY);
}

function toGeminiContents(system, prompt) {
  // Gemini has no separate "system" role in the basic generateContent call
  // used here, so the system prompt is folded into the first user turn —
  // functionally equivalent for a single-turn prompt (the caller already
  // flattens conversation history into `prompt` itself, same as the Ollama
  // provider, so both providers receive an identical instruction set).
  const text = system ? `${system}\n\n${prompt}` : prompt;
  return [{ role: "user", parts: [{ text }] }];
}

function extractGeminiError(err) {
  const status = err.response?.status;
  const apiMessage = err.response?.data?.error?.message;
  const e = new Error(apiMessage || err.message || "Cloud AI request failed.");
  e.status = status;
  e.isTimeout = err.code === "ECONNABORTED" || err.message?.includes("timeout");
  e.isRateLimited = status === 429;
  e.isServerError = status >= 500;
  return e;
}

/**
 * Non-streaming generation. Throws on any failure (timeout, network, 4xx,
 * 5xx) — the caller (aiProviders/index.js) is responsible for deciding
 * whether that should trigger an Ollama fallback.
 */
async function generate(prompt, { system, temperature = 0.4 } = {}) {
  if (!isConfigured()) throw new Error("Cloud AI is not configured (AI_API_KEY missing).");
  try {
    const res = await axios.post(
      `${AI_BASE_URL}/models/${AI_MODEL}:generateContent?key=${AI_API_KEY}`,
      { contents: toGeminiContents(system, prompt), generationConfig: { temperature } },
      { timeout: CLOUD_TIMEOUT_MS }
    );
    const text = res.data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
    if (!text) throw new Error("Cloud AI returned an empty response.");
    return text;
  } catch (err) {
    if (err.response || err.code) throw extractGeminiError(err);
    throw err;
  }
}

/**
 * Streaming generation over Gemini's SSE endpoint. Returns a plain Node
 * Readable stream of decoded TEXT CHUNKS ONLY (not raw SSE/JSON) — matching
 * what the Ollama provider's normalized stream also produces — so
 * aiProviders/index.js and aiController don't need provider-specific
 * parsing. Throws before returning if the connection itself can't be
 * established (bad key, DNS failure, immediate 4xx/5xx), which is exactly
 * the case the fallback logic needs to catch.
 */
async function generateStream(prompt, { system, temperature = 0.4 } = {}) {
  if (!isConfigured()) throw new Error("Cloud AI is not configured (AI_API_KEY missing).");
  let res;
  try {
    res = await axios.post(
      `${AI_BASE_URL}/models/${AI_MODEL}:streamGenerateContent?alt=sse&key=${AI_API_KEY}`,
      { contents: toGeminiContents(system, prompt), generationConfig: { temperature } },
      { responseType: "stream", timeout: CLOUD_TIMEOUT_MS }
    );
  } catch (err) {
    if (err.response || err.code) throw extractGeminiError(err);
    throw err;
  }

  const { PassThrough } = require("stream");
  const out = new PassThrough();
  let buffer = "";

  res.data.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload);
        const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
        if (text) out.write(text);
      } catch {
        // partial/malformed SSE frame boundary — skip rather than crash the stream
      }
    }
  });
  res.data.on("end", () => out.end());
  res.data.on("error", (err) => out.destroy(err));
  out.destroyUpstream = () => res.data.destroy();

  return out;
}

module.exports = { generate, generateStream, isConfigured, PROVIDER_NAME: "cloud", MODEL_NAME: AI_MODEL };
