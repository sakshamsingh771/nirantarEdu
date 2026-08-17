const {
  chatWithNirantarAI,
  chatStreamWithNirantarAI,
  persistAssistantReply,
  summarizeText,
  isOllamaReachable,
  activeMode,
} = require("../services/aiService");
const { findRelevantContext } = require("../services/ragService");

function userInfoFrom(req) {
  return { role: req.user.role, cls: req.user.class, subject: req.query.subject || req.body.subject };
}

// The namespace ("student"/"teacher") only labels the conversation for
// backend bookkeeping — access is still controlled by the authenticated
// user, not by this string.
function namespaceFrom(req) {
  return req.user.role === "STUDENT" ? "student" : "teacher";
}

// POST /api/ai/chat  (non-streaming — kept for simplicity/compatibility)
async function chat(req, res) {
  try {
    const { message, conversationId } = req.body;
    if (!message) return res.status(400).json({ message: "Message is required." });

    const context = await findRelevantContext(req.user.school, message, {
      classFilter: req.user.role === "STUDENT" ? req.user.class : undefined,
    });
    const { reply, provider, model, conversationId: newConversationId } = await chatWithNirantarAI(
      message,
      context,
      userInfoFrom(req),
      { conversationId, user: req.user, namespace: namespaceFrom(req) }
    );
    res.json({
      reply,
      usedLocalContext: Boolean(context),
      conversationId: newConversationId,
      provider, // "cloud" | "ollama" — for the optional UI status indicator only
    });
  } catch (err) {
    console.error(err);
    res.status(503).json({ message: err.message || "Nirantar AI is unavailable right now." });
  }
}

// POST /api/ai/chat/stream
//
// Streams Nirantar AI's response as plain chunked text so the UI can render
// tokens as they arrive instead of waiting for the full reply. Which
// provider actually served the request (cloud or the local Ollama
// fallback) is reported via the X-AI-Provider response header, set BEFORE
// any body bytes are written — the frontend can read it once the response
// starts. If the client disconnects or cancels (AbortController on the
// frontend), the upstream provider stream is destroyed immediately rather
// than left running.
async function chatStream(req, res) {
  const { message, conversationId } = req.body;
  if (!message) return res.status(400).json({ message: "Message is required." });

  let upstream, provider, model, resolvedConversationId;
  try {
    const context = await findRelevantContext(req.user.school, message, {
      classFilter: req.user.role === "STUDENT" ? req.user.class : undefined,
    });
    ({ stream: upstream, provider, model, conversationId: resolvedConversationId } = await chatStreamWithNirantarAI(
      message,
      context,
      userInfoFrom(req),
      { conversationId, user: req.user, namespace: namespaceFrom(req) }
    ));
  } catch (err) {
    console.error(err);
    return res.status(503).json({ message: err.message || "Nirantar AI is unavailable right now." });
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no"); // don't let a reverse proxy buffer the stream
  res.setHeader("X-AI-Provider", provider);
  if (resolvedConversationId) res.setHeader("X-Conversation-Id", resolvedConversationId);
  // Browsers restrict which response headers frontend JS can read from a
  // cross-origin-style fetch unless explicitly exposed, even same-site
  // through the dev proxy in some setups — harmless to always set this.
  res.setHeader("Access-Control-Expose-Headers", "X-AI-Provider, X-Conversation-Id");

  let fullText = "";
  upstream.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    fullText += text;
    res.write(text);
  });

  upstream.on("end", () => {
    res.end();
    // Persisted only once the full reply is known — after it has actually
    // reached the client — so a mid-stream failure never records a partial
    // reply as if it were the complete answer.
    persistAssistantReply(resolvedConversationId, req.user, namespaceFrom(req), fullText, provider, model).catch(
      (err) => console.error("[AI] Failed to persist assistant reply:", err.message)
    );
  });
  upstream.on("error", (err) => {
    console.error("AI stream error:", err.message);
    res.end();
  });

  // Client navigated away, closed the tab, or clicked "stop" — cut the
  // upstream generation short instead of letting the provider keep working
  // on a response nobody will read.
  req.on("close", () => {
    if (!res.writableEnded) upstream.destroyUpstream ? upstream.destroyUpstream() : upstream.destroy();
  });
}

// POST /api/ai/summarize
async function summarize(req, res) {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: "Text is required." });
    const summary = await summarizeText(text);
    res.json({ summary });
  } catch (err) {
    console.error(err);
    res.status(503).json({ message: err.message || "Nirantar AI is unavailable." });
  }
}

// GET /api/ai/status
//
// Reports which provider mode is configured and whether Ollama specifically
// is reachable right now, for the small non-intrusive "Nirantar AI •
// Online/Offline/Local AI" indicator in the chat UI. This does NOT report
// cloud reachability by pinging it separately — per the requirement not to
// guess availability, the real signal for "is cloud actually usable" is
// whether the last real chat request succeeded via the cloud provider,
// which the frontend already learns from the X-AI-Provider header on every
// response. This endpoint only covers the local fallback's standing status
// and which mode is configured.
async function status(req, res) {
  const reachable = await isOllamaReachable();
  const mode = activeMode();
  res.json({
    localAI: reachable ? "AVAILABLE" : "UNAVAILABLE",
    cloudConfigured: mode.cloudConfigured,
    providerMode: mode.mode,
  });
}

module.exports = { chat, chatStream, summarize, status };
