const axios = require("axios");
const { PassThrough } = require("stream");

// Gemini (Google) cloud AI provider. Single self-contained file.
const AI_API_KEY = process.env.AI_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || "gemini-2.5-flash";
const AI_BASE_URL = process.env.AI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";

const CLOUD_TIMEOUT_MS = Number(process.env.AI_CLOUD_TIMEOUT_MS) || 22000;

function isConfigured() {
  return Boolean(AI_API_KEY);
}

function buildRequestBody(system, prompt, temperature) {
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature }
  };
  
  // Use Gemini's native systemInstruction field if present
  if (system) {
    body.systemInstruction = {
      parts: [{ text: system }]
    };
  }

  return body;
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

function readStreamToString(stream) {
  return new Promise((resolve) => {
    let data = "";
    stream.on("data", (c) => (data += c.toString("utf8")));
    stream.on("end", () => resolve(data));
    stream.on("error", () => resolve(data));
  });
}

async function extractGeminiStreamError(err) {
  const status = err.response?.status;
  let apiMessage;
  if (err.response?.data && typeof err.response.data.on === "function") {
    try {
      const raw = await readStreamToString(err.response.data);
      apiMessage = JSON.parse(raw)?.error?.message;
    } catch {
      // Fall through to default message
    }
  } else {
    apiMessage = err.response?.data?.error?.message;
  }
  const e = new Error(apiMessage || err.message || "Cloud AI request failed.");
  e.status = status;
  e.isTimeout = err.code === "ECONNABORTED" || err.message?.includes("timeout");
  e.isRateLimited = status === 429;
  e.isServerError = status >= 500;
  return e;
}

/**
 * Non-streaming generation.
 */
async function generate(prompt, { system, temperature = 0.4 } = {}) {
  if (!isConfigured()) throw new Error("Cloud AI is not configured (AI_API_KEY missing).");
  try {
    const res = await axios.post(
      `${AI_BASE_URL}/models/${AI_MODEL}:generateContent?key=${AI_API_KEY}`,
      buildRequestBody(system, prompt, temperature),
      { timeout: CLOUD_TIMEOUT_MS }
    );

    const candidate = res.data?.candidates?.[0];
    const text = candidate?.content?.parts?.map((p) => p.text).join("") || "";

    if (!text) {
      const finishReason = candidate?.finishReason;
      if (finishReason && finishReason !== "STOP") {
        throw new Error(`Cloud AI generated no output. Finish reason: ${finishReason}`);
      }
      throw new Error("Cloud AI returned an empty response.");
    }
    return text;
  } catch (err) {
    if (err.response || err.code) throw extractGeminiError(err);
    throw err;
  }
}

/**
 * Streaming generation over Gemini's SSE endpoint.
 */
async function generateStream(prompt, { system, temperature = 0.4 } = {}) {
  if (!isConfigured()) throw new Error("Cloud AI is not configured (AI_API_KEY missing).");
  let res;
  try {
    res = await axios.post(
      `${AI_BASE_URL}/models/${AI_MODEL}:streamGenerateContent?alt=sse&key=${AI_API_KEY}`,
      buildRequestBody(system, prompt, temperature),
      { responseType: "stream", timeout: CLOUD_TIMEOUT_MS }
    );
  } catch (err) {
    if (err.response || err.code) throw await extractGeminiStreamError(err);
    throw err;
  }

  const out = new PassThrough();
  let buffer = "";

  // Destroy upstream HTTP response stream if client closes destination stream
  out.on("close", () => {
    if (!res.data.destroyed) {
      res.data.destroy();
    }
  });

  res.data.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split("\n");
    buffer = lines.pop(); // save incomplete line for next chunk

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
        // Skip incomplete or unparseable frame chunk boundaries
      }
    }
  });

  res.data.on("end", () => out.end());
  res.data.on("error", (err) => out.destroy(err));
  out.destroyUpstream = () => res.data.destroy();

  return out;
}

module.exports = {
  generate,
  generateStream,
  isConfigured,
  PROVIDER_NAME: "cloud",
  MODEL_NAME: AI_MODEL
};