import { useEffect, useRef, useState } from "react";
import MarkdownMessage from "./MarkdownMessage.jsx";
import api from "../services/api.js";

// How often to re-check GET /api/ai/status while the panel is open, so the
// badge reflects reality (e.g. internet coming back, local Ollama going
// down) without requiring the student/teacher to send a message first.
const STATUS_POLL_MS = 15000;

// Shared Nirantar AI chat panel used by both the Student and Teacher
// dashboards. `storageKey` keeps each user's conversation separate (and
// separate from the other role) and persists it in sessionStorage so it
// survives switching tabs/navigating the dashboard, without becoming
// permanent, unbounded storage — it's cleared when the browser tab closes,
// same as any other sessionStorage data.
const MAX_STORED_MESSAGES = 40;


function storageKeyFor(namespace) {
  return `nirantaredu_ai_conversation_${namespace}`;
}
// A stable conversationId is what lets a conversation survive an
// automatic cloud->Ollama fallback: the backend replays prior turns for
// this exact ID regardless of which provider answers this specific
// message, so switching providers never looks like starting a new chat.
// It's generated once per conversation on the frontend and kept alongside
// the messages in sessionStorage — cleared together on "Clear conversation"
// and on tab close, same lifetime as the messages themselves.
function conversationIdKeyFor(namespace) {
  return `nirantaredu_ai_conversation_id_${namespace}`;
}

function loadConversation(namespace, greeting) {
  try {
    const raw = sessionStorage.getItem(storageKeyFor(namespace));
    if (!raw) return [{ role: "assistant", text: greeting }];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {
    // corrupted/old-format entry — fall through to a fresh conversation
  }
  return [{ role: "assistant", text: greeting }];
}

function loadConversationId(namespace) {
  try {
    return sessionStorage.getItem(conversationIdKeyFor(namespace)) || null;
  } catch {
    return null;
  }
}

const PROVIDER_LABEL = {
  cloud: "Nirantar AI • Online",
  ollama: "Nirantar AI • Local AI",
};

// Same labels, used before any message has actually been answered — derived
// from GET /api/ai/status (what WILL answer) rather than X-AI-Provider
// (what DID answer). Kept visually distinct (outline vs filled) so it never
// looks like a claim about a message that hasn't happened yet.
const EXPECTED_LABEL = {
  cloud: "Nirantar AI • Online",
  ollama: "Nirantar AI • Local AI ready",
  checking: "Nirantar AI • Checking…",
  unavailable: "Nirantar AI • Unavailable",
};

export default function NirantarAiChat({
  storageNamespace,
  greeting,
  generatedQuiz = null,
  onQuizGenerated = () => {},
}) {
  const [messages, setMessages] = useState(() =>
    loadConversation(storageNamespace, greeting),
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [lastProvider, setLastProvider] = useState(null); // "cloud" | "ollama" | null — set only once a real reply has come back
  const [expectedProvider, setExpectedProvider] = useState("checking"); // "cloud" | "ollama" | "unavailable" | "checking" — from /api/ai/status, shown before the first reply
  const recognitionRef = useRef(null);
  const abortRef = useRef(null);
  const lastUserMessageRef = useRef("");
  const conversationIdRef = useRef(loadConversationId(storageNamespace));

  // Persist on every change so a tab switch or dashboard navigation
  // (which unmounts this component) doesn't lose the conversation.
  useEffect(() => {
    try {
      sessionStorage.setItem(
        storageKeyFor(storageNamespace),
        JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)),
      );
    } catch {
      // sessionStorage full/unavailable (e.g. private browsing) — conversation
      // still works for this session, it just won't survive a remount.
    }
  }, [messages, storageNamespace]);

  useEffect(() => {
    const latestMessage = messages[messages.length - 1];
    if (latestMessage && latestMessage.quizQuestions) {
      onQuizGenerated(latestMessage.quizQuestions);
    }
  }, [messages, onQuizGenerated]);

  // Proactively show whether Nirantar AI is reachable — and via which
  // provider — as soon as the panel mounts, instead of waiting for the
  // student/teacher to send a message. Polls periodically so reconnecting
  // (or losing) internet/local Ollama updates the badge live.
  useEffect(() => {
    let cancelled = false;

    const checkStatus = async () => {
      try {
        const res = await api.get("/ai/status");
        if (cancelled) return;
        const { localAI, cloudConfigured, providerMode } = res.data;
        if (providerMode === "ollama") {
          setExpectedProvider(localAI === "AVAILABLE" ? "ollama" : "unavailable");
        } else if (cloudConfigured) {
          // Cloud is configured and will be tried first; if it's down the
          // request falls back to Ollama automatically, so only call it
          // fully unavailable when neither is usable.
          setExpectedProvider(localAI === "AVAILABLE" ? "cloud" : "unavailable");
        } else {
          setExpectedProvider(localAI === "AVAILABLE" ? "ollama" : "unavailable");
        }
      } catch {
        if (!cancelled) setExpectedProvider("unavailable");
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const speechSupported =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  const toggleListening = () => {
    if (!speechSupported) return;

    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  // Cancel any in-flight stream when the component unmounts (e.g. the user
  // navigates away mid-response) so Ollama isn't left generating for a tab
  // that's no longer open.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const streamReply = async (messageText) => {
    setMessages((m) => [...m, { role: "assistant", text: "" }]);
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const token = localStorage.getItem("nirantaredu_token");
      const res = await fetch("/api/ai/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({
          message: messageText,
          conversationId: conversationIdRef.current,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.message || "Nirantar AI is unavailable right now.",
        );
      }

      // Which provider actually answered (cloud, or the automatic Ollama
      // fallback) and the conversation's stable ID — set as response headers
      // by the backend before the body starts streaming. Persisted back to
      // sessionStorage so the next message in this conversation keeps using
      // the same ID, regardless of which provider serves it.
      const provider = res.headers.get("X-AI-Provider");
      if (provider) setLastProvider(provider);
      const conversationId = res.headers.get("X-Conversation-Id");
      if (conversationId) {
        conversationIdRef.current = conversationId;
        try {
          sessionStorage.setItem(
            conversationIdKeyFor(storageNamespace),
            conversationId,
          );
        } catch {
          // non-fatal — the ref still has it for the rest of this session
        }
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((m) => {
          const next = [...m];
          next[next.length - 1] = {
            role: "assistant",
            text: next[next.length - 1].text + chunk,
          };
          return next;
        });
      }
    } catch (err) {
      if (err.name === "AbortError") {
        setMessages((m) => {
          const next = [...m];
          next[next.length - 1] = {
            ...next[next.length - 1],
            text: next[next.length - 1].text + " (stopped)",
          };
          return next;
        });
      } else {
        setMessages((m) => {
          const next = [...m];
          next[next.length - 1] = {
            role: "assistant",
            text: err.message || "Nirantar AI is unavailable right now.",
          };
          return next;
        });
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    const text = input;
    lastUserMessageRef.current = text;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    await streamReply(text);
  };

  const stop = () => abortRef.current?.abort();

  const regenerate = async () => {
    if (!lastUserMessageRef.current || loading) return;
    setMessages((m) =>
      m[m.length - 1]?.role === "assistant" ? m.slice(0, -1) : m,
    );
    await streamReply(lastUserMessageRef.current);
  };

  const clearConversation = () => {
    if (loading) return;
    if (!window.confirm("Clear this conversation? This can't be undone."))
      return;
    const fresh = [
      {
        role: "assistant",
        text: "Conversation cleared. What would you like to ask?",
      },
    ];
    setMessages(fresh);
    lastUserMessageRef.current = "";
    conversationIdRef.current = null;
    setLastProvider(null);
    try {
      sessionStorage.removeItem(storageKeyFor(storageNamespace));
      sessionStorage.removeItem(conversationIdKeyFor(storageNamespace));
    } catch {
      // ignore — the fresh state above still applies for this session
    }
  };

  return (
    <div
      className="card mx-auto flex max-w-2xl flex-col"
      style={{ height: "65vh" }}
    >
      <div className="flex items-center justify-between border-b border-brand-50 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-ink">Nirantar AI</span>
          {lastProvider ? (
            // A real message has been answered — this is ground truth, so it
            // always wins over the status-check guess.
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                lastProvider === "cloud"
                  ? "bg-sage-100 text-sage-700"
                  : "bg-brand-50 text-brand-700"
              }`}
              title={
                lastProvider === "cloud"
                  ? "Answered by the cloud AI provider"
                  : "Answered by the local Ollama fallback"
              }
            >
              {PROVIDER_LABEL[lastProvider]}
            </span>
          ) : (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                expectedProvider === "cloud"
                  ? "bg-sage-100 text-sage-700"
                  : expectedProvider === "ollama"
                  ? "bg-brand-50 text-brand-700"
                  : expectedProvider === "unavailable"
                  ? "bg-red-50 text-red-700"
                  : "bg-canvas-sunk text-ink-faint"
              }`}
              title="Based on the last status check — the actual reply may still fall back to a different provider"
            >
              {EXPECTED_LABEL[expectedProvider]}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={clearConversation}
          className="text-xs font-medium text-ink-faint hover:text-ink"
        >
          🧹 Clear conversation
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto py-3 pr-1">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm ${
              m.role === "user"
                ? "ml-auto bg-brand-700 text-white"
                : "bg-canvas-sunk text-ink"
            }`}
          >
            {m.role === "assistant" ? (
              m.text ? (
                // ======= ADD THESE CSS UTILITIES TO FIX SPACING =======
                <div className="prose prose-sm max-w-none space-y-3.5 leading-relaxed text-ink [&&_h1]:mt-4 [&&_h2]:mt-3 [&&_h3]:mt-3 [&&_ul]:list-disc [&&_ol]:list-decimal [&&_ul]:pl-5 [&&_ol]:pl-5">
                  <MarkdownMessage text={m.text} />
                </div>
              ) : (
                <span className="text-ink-faint animate-pulse">▍</span>
              )
            ) : (
              m.text
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-brand-50 pt-2">
        <div className="flex gap-3 text-xs font-medium text-ink-faint">
          {loading && (
            <button
              type="button"
              onClick={stop}
              className="text-red-600 hover:underline"
            >
              Stop generating
            </button>
          )}
          {!loading && lastUserMessageRef.current && (
            <button
              type="button"
              onClick={regenerate}
              className="hover:text-ink hover:underline"
            >
              Regenerate
            </button>
          )}
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        {speechSupported && (
          <button
            type="button"
            onClick={toggleListening}
            aria-label={isListening ? "Stop recording" : "Speak your question"}
            aria-pressed={isListening}
            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border text-lg ${
              isListening
                ? "border-red-300 bg-red-50 text-red-600"
                : "border-brand-200 bg-canvas-card text-brand-700 hover:bg-brand-50"
            }`}
          >
            {isListening ? "●" : "🎤"}
          </button>
        )}
        <input
          className="input-field"
          placeholder={
            isListening ? "Listening…" : "Ask a question, or use the mic…"
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          disabled={loading}
        />
        <button onClick={send} disabled={loading} className="btn-primary">
          Send
        </button>
      </div>
    </div>
  );
}