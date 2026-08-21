const cloudProvider = require("./cloudProvider");
const ollamaProvider = require("./ollamaProvider");

// AI_PROVIDER controls provider selection, NOT a Wi-Fi/online check — actual
// reachability is only ever determined by whether a real request to the
// cloud provider succeeds or fails (see generateWithFallback below).
//   auto   (default) — try cloud if configured, fall back to Ollama on any failure
//   cloud  — same as auto; kept as an explicit alias for clarity in .env
//   ollama — force local-only, never attempt the cloud provider at all
//            (e.g. a school that's intentionally offline-only)
const AI_PROVIDER_MODE = (process.env.AI_PROVIDER || "auto").toLowerCase();

function shouldTryCloud() {
  if (AI_PROVIDER_MODE === "ollama") return false;
  return cloudProvider.isConfigured();
}

// Timeouts are the one failure mode that's genuinely worth retrying once —
// a single slow round-trip on otherwise-fine school internet shouldn't
// permanently demote that request to Ollama. Anything else (bad key, 4xx,
// DNS failure) will just fail the same way again, so only timeouts get a
// second attempt before we give up on cloud for this request.
async function withOneRetryOnTimeout(attempt) {
  try {
    return await attempt();
  } catch (err) {
    if (!err.isTimeout) throw err;
    console.warn("[AI] Cloud request timed out once, retrying before falling back to Ollama");
    return await attempt();
  }
}

function isFallbackWorthy(err) {
  if (err.isTimeout || err.isRateLimited || err.isServerError) return true;
  if (!err.status) return true; // network-level failure (DNS, connection refused, etc.) — no HTTP status at all
  return true; // any cloud failure at all falls back — see comment above
}

/**
 * Non-streaming generation with automatic fallback. Returns
 * { text, provider, model } — `provider`/`model` are for logging and the
 * optional UI status indicator only, never fed back into the conversation.
 */
async function generateWithFallback(prompt, opts = {}) {
    if (shouldTryCloud()) {
    try {
      const text = await withOneRetryOnTimeout(() => cloudProvider.generate(prompt, opts));
      return { text, provider: "cloud", model: cloudProvider.MODEL_NAME };
    } catch (err) {
      console.warn("[AI] Cloud provider failed, falling back to Ollama:", err.message);
      if (!isFallbackWorthy(err)) throw err;
    }
  }

  try {
    const text = await ollamaProvider.generate(prompt, opts);
    return { text, provider: "ollama", model: ollamaProvider.MODEL_NAME };
  } catch (err) {
    const e = new Error(
      shouldTryCloud()
        ? "Nirantar AI is unavailable right now — both the cloud AI and the local Ollama service failed to respond."
        : "Nirantar AI is unavailable. Make sure the local Ollama service is running on the school server."
    );
    e.cause = err;
    throw e;
  }
}

/**
 * Streaming generation with fallback. The fallback can only happen BEFORE
 * any text has reached the client — once a provider's stream has actually
 * started emitting content, we commit to it. Switching providers mid-stream
 * would mean either corrupting the response with a restarted answer or
 * silently truncating one, both worse than finishing (or cleanly ending)
 * with whichever provider got started. This matches the requirement to
 * never send the frontend two competing responses for one request.
 *
 * Returns { stream, provider, model } where `stream` emits plain text
 * chunks and a "started" flag is tracked internally so a stream-establish
 * failure (bad key, connection refused, immediate error) still falls back
 * cleanly, while a failure after real content has flowed just ends the
 * response — the student sees a partial answer rather than a duplicated or
 * corrupted one.
 */
async function generateStreamWithFallback(prompt, opts = {}) {
     if (shouldTryCloud()) {
    try {
      const stream = await withOneRetryOnTimeout(() => cloudProvider.generateStream(prompt, opts));
      return wrapWithFallbackOnEarlyFailure(stream, prompt, opts, "cloud", cloudProvider.MODEL_NAME);
    } catch (err) {
      // Failed before we even got a stream handle — the cleanest possible
      // case for falling back, since nothing was ever sent to the client.
      console.warn("[AI] Cloud stream failed to start, falling back to Ollama:", err.message);
    }
  }

  try {
    const stream = await ollamaProvider.generateStream(prompt, opts);
    return { stream, provider: "ollama", model: ollamaProvider.MODEL_NAME };
  } catch (err) {
    const e = new Error(
      shouldTryCloud()
        ? "Nirantar AI is unavailable right now — both the cloud AI and the local Ollama service failed to respond."
        : "Nirantar AI is unavailable. Make sure the local Ollama service is running on the school server."
    );
    e.cause = err;
    throw e;
  }
}

// Wraps a just-opened cloud stream so that if it errors out before emitting
// its first chunk, we transparently swap to an Ollama stream instead — the
// caller never sees the failed attempt, only ends up with one working
// stream either way.
function wrapWithFallbackOnEarlyFailure(cloudStream, prompt, opts, provider, model) {
  const { PassThrough } = require("stream");
  const out = new PassThrough();
  let startedEmitting = false;
  let settled = false;
  let resolveResult;
  const resultPromise = new Promise((resolve) => {
    resolveResult = resolve;
  });

  cloudStream.on("data", (chunk) => {
    startedEmitting = true;
    if (!settled) {
      settled = true;
      resolveResult({ stream: out, provider, model });
    }
    out.write(chunk);
  });
  cloudStream.on("end", () => {
    if (!settled) {
      settled = true;
      resolveResult({ stream: out, provider, model });
    }
    out.end();
  });
  cloudStream.on("error", async (err) => {
    if (startedEmitting) {
      // Already sent real content to the student — end gracefully rather
      // than risk a duplicated/corrupted response by switching providers now.
      console.warn("[AI] Cloud stream failed mid-response, ending stream (no fallback mid-stream):", err.message);
      out.end();
      return;
    }
    console.warn("[AI] Cloud stream failed before any content, falling back to Ollama:", err.message);
    try {
      const ollamaStream = await ollamaProvider.generateStream(prompt, opts);
      ollamaStream.on("data", (chunk) => out.write(chunk));
      ollamaStream.on("end", () => out.end());
      ollamaStream.on("error", (e2) => out.destroy(e2));
      if (!settled) {
        settled = true;
        resolveResult({ stream: out, provider: "ollama", model: ollamaProvider.MODEL_NAME });
      }
    } catch (e2) {
      out.destroy(e2);
      if (!settled) {
        settled = true;
        resolveResult(Promise.reject(e2));
      }
    }
  });

  out.destroyUpstream = () => {
    cloudStream.destroyUpstream?.();
  };

  return resultPromise;
}

function activeMode() {
  return { mode: AI_PROVIDER_MODE, cloudConfigured: cloudProvider.isConfigured() };
}

module.exports = {
  generateWithFallback,
  generateStreamWithFallback,
  isOllamaReachable: ollamaProvider.isReachable,
  NUM_PREDICT_STRUCTURED: ollamaProvider.NUM_PREDICT_STRUCTURED,
  activeMode,
};
