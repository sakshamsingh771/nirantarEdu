const axios = require("axios");
const http = require("http");
const { PassThrough } = require("stream");

// OLLAMA_BASE_URL is the supported name going forward — Ollama now runs as a
// local install on the host machine, not as a Docker container, so this
// needs to point out of the backend container to the host (typically
// http://host.docker.internal:11434 on Docker Desktop / Docker with the
// host-gateway mapping; http://localhost:11434 when running the backend
// outside Docker). OLLAMA_HOST is still read as a fallback so an existing
// .env from before this change keeps working without edits.
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || process.env.OLLAMA_HOST || "http://localhost:11434";

// NIRANTAR_AI_MODEL is the primary name going forward (matches the product
// name); OLLAMA_MODEL is kept as a fallback for existing .env files.
const OLLAMA_MODEL = process.env.NIRANTAR_AI_MODEL || process.env.OLLAMA_MODEL || "llama3.2";

const NUM_CTX = Number(process.env.NIRANTAR_AI_NUM_CTX) || 4096;
const NUM_PREDICT_CHAT = Number(process.env.NIRANTAR_AI_NUM_PREDICT) || 1024;

const keepAliveAgent = new http.Agent({ keepAlive: true, maxSockets: 20 });
const ollamaClient = axios.create({ baseURL: OLLAMA_BASE_URL, httpAgent: keepAliveAgent });

async function generate(prompt, { system, temperature = 0.4, model, numPredict } = {}) {
  const res = await ollamaClient.post(
    "/api/generate",
    {
      model: model || OLLAMA_MODEL,
      prompt,
      system,
      stream: false,
      options: { temperature, num_ctx: NUM_CTX, num_predict: numPredict || NUM_PREDICT_CHAT },
    },
    { timeout: 180000 }
  );
  return res.data.response;
}

/**
 * Streaming variant — normalized to emit plain TEXT CHUNKS (not Ollama's raw
 * newline-delimited JSON), so the caller can treat this identically to the
 * cloud provider's stream. Ollama itself is given generous timeout/no
 * per-request deadline pressure here since, unlike the cloud provider, it's
 * not part of a "try quickly, then fall back" path when it's the primary
 * (offline) choice — it only needs a tight timeout when it's NOT the
 * primary provider, which the fallback layer handles by racing, not by
 * shortening this timeout.
 */
async function generateStream(prompt, { system, temperature = 0.4, model, numPredict } = {}) {
  const res = await ollamaClient.post(
    "/api/generate",
    {
      model: model || OLLAMA_MODEL,
      prompt,
      system,
      stream: true,
      options: { temperature, num_ctx: NUM_CTX, num_predict: numPredict || NUM_PREDICT_CHAT },
    },
    { responseType: "stream", timeout: 180000 }
  );

  const out = new PassThrough();
  let buffer = "";
  res.data.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line);
        if (json.response) out.write(json.response);
      } catch {
        // incomplete/malformed chunk boundary — skip rather than crash the stream
      }
    }
  });
  res.data.on("end", () => out.end());
  res.data.on("error", (err) => out.destroy(err));
  // Allow the caller to cut the upstream Ollama request short (client
  // disconnect / Stop button) by destroying the *upstream* response stream,
  // not just our normalized PassThrough.
  out.destroyUpstream = () => res.data.destroy();

  return out;
}

async function isReachable() {
  try {
    await ollamaClient.get("/api/tags", { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  generate,
  generateStream,
  isReachable,
  PROVIDER_NAME: "ollama",
  MODEL_NAME: OLLAMA_MODEL,
  NUM_PREDICT_STRUCTURED: Number(process.env.NIRANTAR_AI_NUM_PREDICT_STRUCTURED) || 2048,
};
