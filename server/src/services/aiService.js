const crypto = require("crypto");
const { generateWithFallback, generateStreamWithFallback, isOllamaReachable, NUM_PREDICT_STRUCTURED, activeMode } = require("./aiProviders");
const conversationManager = require("./conversationManager");

// Upper bound so a very large question count still can't trigger an
// unbounded/slow generation request against Ollama running on modest
// school-server hardware.
const STRUCTURED_HARD_CEILING = 6000;

// Builds a role- and class-appropriate system prompt. A Class 8 Science
// question and a Class 12 Physics question should not get the same depth of
// explanation, and a teacher's assistant has different capabilities (lesson
// planning, coding help, assignment drafting) than a student's (guided
// explanations rather than just handing over homework answers). This same
// prompt is handed to whichever provider (cloud or Ollama) ends up serving
// the request — see aiProviders/index.js — so Nirantar AI's personality and
// instructions don't shift when the provider does.
function buildSystemPrompt({ role, cls, subject } = {}) {
  const contextLine = [subject ? `Subject: ${subject}` : null, cls ? `Class: ${cls}` : null]
    .filter(Boolean)
    .join(", ");

  if (role === "TEACHER" || role === "ADMIN") {
    return (
      "You are Nirantar AI, a teaching-assistant for school staff. You can help draft lesson plans, explain " +
      "concepts, write and explain code, suggest practice/assignment questions, and summarize material. " +
      "Be direct and practical — the person using you is a teacher, not a student." +
      (contextLine ? ` Current context — ${contextLine}.` : "")
    );
  }

  const level = classDepthHint(cls);
  return (
    "You are Nirantar AI, a helpful study assistant for a school student in India. Explain concepts clearly " +
    `with simple examples${level ? `, at a level appropriate for ${level}` : ""}. Guide the student's ` +
    "understanding rather than just handing over finished homework answers — encourage them to reason " +
    "through problems. Keep explanations educationally appropriate and avoid unnecessary complexity." +
    (contextLine ? ` Current context — ${contextLine}.` : "")
  );
}

function classDepthHint(cls) {
  const n = Number(cls);
  if (!n) return "";
  if (n <= 5) return "a young primary-school student — use very simple language and everyday examples";
  if (n <= 8) return "a middle-school student";
  if (n <= 10) return "a secondary-school student preparing for board-level exams";
  return "a senior-secondary student — more advanced, exam-oriented depth is appropriate";
}

// Builds the final prompt: system-level instructions stay in `system` (sent
// separately to whichever provider), while conversation history + any RAG
// material context + the new question are woven into one prompt body. This
// is what makes conversation continuity provider-independent — history is
// plain text handed to whichever provider answers, not a provider-native
// "thread"/"session" concept that would break on fallback.
function buildPrompt(userMessage, materialContext, historyText) {
  const parts = [];
  if (historyText) parts.push(`Previous conversation:\n${historyText}`);
  if (materialContext) parts.push(`Relevant study material:\n${materialContext}`);
  parts.push(`${historyText ? "Current question" : "Question"}: ${userMessage}`);
  return parts.join("\n\n");
}

/**
 * Non-streaming chat. `convo` (optional) is { conversationId, user,
 * namespace } — when provided, prior turns are fetched and replayed as
 * context, and both the student's message and the reply are persisted so
 * the conversation survives a provider switch on the next turn.
 */
async function chatWithNirantarAI(userMessage, context = "", userInfo = {}, convo = null) {
  const system = buildSystemPrompt(userInfo);
  let conversationId = convo?.conversationId;
  let historyText = "";

  if (convo?.user) {
    conversationId = conversationId || crypto.randomUUID();
    const ctx = await conversationManager.getConversationContext(conversationId, convo.user);
    historyText = ctx.historyText;
    await conversationManager.appendMessage(conversationId, convo.user, convo.namespace, {
      role: "user",
      content: userMessage,
    });
  }

  const prompt = buildPrompt(userMessage, context, historyText);
  const { text, provider, model } = await generateWithFallback(prompt, { system });

  if (convo?.user) {
    await conversationManager.appendMessage(conversationId, convo.user, convo.namespace, {
      role: "assistant",
      content: text,
      provider,
      model,
    });
  }

  return { reply: text, provider, model, conversationId };
}

/**
 * Streaming chat. Returns { stream, provider, model, conversationId }
 * immediately (provider/model reflect whichever one actually started
 * producing content, after any early fallback — see aiProviders/index.js).
 * The CALLER (aiController) is responsible for accumulating the streamed
 * text and calling `persistAssistantReply` once the stream ends, since only
 * the controller knows the full text has actually reached the client.
 */
async function chatStreamWithNirantarAI(userMessage, context = "", userInfo = {}, convo = null) {
  const system = buildSystemPrompt(userInfo);
  let conversationId = convo?.conversationId;
  let historyText = "";

  if (convo?.user) {
    conversationId = conversationId || crypto.randomUUID();
    const ctx = await conversationManager.getConversationContext(conversationId, convo.user);
    historyText = ctx.historyText;
    await conversationManager.appendMessage(conversationId, convo.user, convo.namespace, {
      role: "user",
      content: userMessage,
    });
  }

  const prompt = buildPrompt(userMessage, context, historyText);
  const { stream, provider, model } = await generateStreamWithFallback(prompt, { system });
  return { stream, provider, model, conversationId };
}

async function persistAssistantReply(conversationId, user, namespace, text, provider, model) {
  if (!conversationId || !user || !text) return;
  await conversationManager.appendMessage(conversationId, user, namespace, {
    role: "assistant",
    content: text,
    provider,
    model,
  });
}

async function summarizeText(text) {
  const system = "You summarize study material for students into clear, concise study notes.";
  const { text: summary } = await generateWithFallback(`Summarize the following material into key study points:\n\n${text}`, { system });
  return summary;
}

async function generateQuizQuestions(topic, count = 5) {
  // Hard prompt enforcement to ensure compliance across small/local LLMs
  const system =
    "You are a strict JSON data generator. Generate quiz questions for school students. " +
    "You must respond ONLY with a raw JSON array. Do not wrap the JSON in markdown code blocks like ```json. " +
    "Do not include any greeting text, intro, or outro text. Output nothing but valid JSON. " +
    'Format: [{"type":"MCQ","text":"...","options":["A","B","C","D"],"correctAnswer":"0","marks":1},' +
    '{"type":"...","text":"...","options":[...],"correctAnswer":"...","marks":1}]. ' +
    'Use type values: MCQ, TRUE_FALSE, FILL_BLANK, or SHORT_ANSWER. ' +
    "Every object in the array MUST be separated by a comma — never place two `{...}` objects back to back " +
    "without a comma between them, and never add extra fields beyond type, text, options, correctAnswer, marks.";

  const prompt = `Generate exactly ${count} quiz questions about the following topic: ${topic}. Verify that the JSON array is completely closed at the end.`;

  // Token budget scaled to the actual question count instead of a flat
  // 8000-token floor for every request — that floor made even a 5-question
  // quiz (which only needs ~1500-2000 tokens) allocate 4-5x more runway
  // than necessary, and Ollama running on modest school-server hardware
  // spends real wall-clock time per allocated token even when it stops
  // early. A tighter, count-proportional budget is the main lever for
  // cutting generation time without truncating legitimate output.
  const tokenRunway = Math.max(1200, count * 320);
  const numPredict = Math.min(STRUCTURED_HARD_CEILING, tokenRunway);

  console.log(`[NirantarAi] Generating ${count} questions. Allocating ${numPredict} tokens...`);

  const { text: raw } = await generateWithFallback(prompt, { 
    system, 
    temperature: 0.3, // Lower temperature means less random hallucination and stricter format adherence
    numPredict 
  });
  
  return parseJsonResponse(raw, "AI returned an unparseable response. Try again.");
}


async function generateAssignmentContent(
  topic,
  { subject, class: cls, difficulty = "Medium", questionCount = 5, questionType = "MIXED", marks } = {}
) {
  const system =
    "You draft school assignments for teachers to review and edit before publishing. " +
    "Respond ONLY with valid JSON, no preamble, no markdown fences, no explanation outside the JSON. " +
    'Format: {"title":"...","instructions":"...","questions":[{"text":"...","type":"MCQ|TRUE_FALSE|FILL_BLANK|SHORT_ANSWER","marks":2,"expectedAnswer":"..."},{"text":"...","type":"...","marks":2,"expectedAnswer":"..."}]}. ' +
    "Every object inside the `questions` array MUST be separated by a comma — never place two `{...}` objects " +
    "back to back without a comma between them. Do not add any fields beyond text, type, marks, expectedAnswer " +
    "(no `num`, no `id`, no extras). Use plain straight double-quote characters only — never typographic/curly " +
    "quotes (\u201c \u201d) anywhere in the JSON, including inside string values. " +
    "The `instructions` field must read like a clean, teacher-written assignment sheet, not raw AI output. " +
    "Follow this exact structure inside the `instructions` string (use \\n\\n for blank lines between " +
    "sections — do not run everything into one paragraph): " +
    "(1) one Markdown heading line starting with '# ' naming the assignment, " +
    "(2) a blank line, then a 1-2 sentence overview paragraph describing what the assignment covers, " +
    "(3) a blank line, then a numbered list (1. 2. 3. each on its own line, with a blank line between " +
    "numbered items) of clear instructions/steps for the student — e.g. how many questions to attempt, " +
    "how to show working, submission expectations, " +
    "(4) only if genuinely useful, a short bullet list of materials needed, each bullet on its own line. " +
    "Keep the whole thing short and well spaced — 6-10 lines total, never one dense paragraph. " +
    "Question text itself stays in the `questions` array, not folded into `instructions`.";
  const typeLine = questionType === "MIXED" ? "a mix of question types" : `all questions of type ${questionType}`;
  const context = [subject ? `Subject: ${subject}` : null, cls ? `Class: ${cls}` : null].filter(Boolean).join(", ");
  const prompt =
    `Draft a ${difficulty}-difficulty assignment about: ${topic}${context ? ` (${context})` : ""}. ` +
    `Include exactly ${questionCount} questions, ${typeLine}` +
    (marks ? `, totaling approximately ${marks} marks.` : ".");

  const numPredict = Math.min(STRUCTURED_HARD_CEILING, Math.max(NUM_PREDICT_STRUCTURED, questionCount * 180));
  const { text: raw } = await generateWithFallback(prompt, { system, temperature: 0.6, numPredict });
  try {
    const parsed = parseAssignmentJson(raw);
    return {
      title: parsed.title || `Assignment: ${topic}`,
      instructions: parsed.instructions || "",
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
    };
  } catch (err) {
    console.error("Assignment JSON parse failed:", err.message);
    console.error("Faulty text trace:", raw);
    // Fall back to using the raw text as instructions rather than failing
    // outright — the teacher reviews and edits either way before publishing.
    return { title: `Assignment: ${topic}`, instructions: raw.trim(), questions: [] };
  }
}

// Shared cleanup: strips ```json fences (some providers/models wrap
// structured output in them despite being told not to), isolates the
// outermost {...} or [...] block if there's leading/trailing prose, fixes
// accidental double-brace slips, and — importantly — repairs the most common
// small-LLM mistake: emitting consecutive JSON objects inside an array
// without a separating comma, e.g. `{...}\n{...}` instead of `{...},{...}`.
// That comma-less pattern is invalid JSON and previously caused JSON.parse
// to throw on otherwise-recoverable output.
function extractJsonText(rawText) {
  if (!rawText) {
    throw new Error("Empty response received from AI model.");
  }

  let cleanText = rawText.trim();

  // 1. Strip markdown fences if present
  if (cleanText.startsWith("```")) {
    cleanText = cleanText.replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
  }

  // 2. Isolate JSON bounds
  const firstBrace = cleanText.indexOf("{");
  const firstBracket = cleanText.indexOf("[");

  let startIndex = -1;
  let endIndex = -1;
  let expectedClose = "";

  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    startIndex = firstBracket;
    endIndex = cleanText.lastIndexOf("]");
    expectedClose = "]";
  } else if (firstBrace !== -1) {
    startIndex = firstBrace;
    endIndex = cleanText.lastIndexOf("}");
    expectedClose = "}";
  }

  if (startIndex !== -1) {
    if (endIndex !== -1 && endIndex > startIndex) {
      cleanText = cleanText.substring(startIndex, endIndex + 1);
    } else {
      cleanText = cleanText.substring(startIndex);
      cleanText = cleanText.replace(/,?\s*\{\s*[^}]*$/, "");
      cleanText += expectedClose;
    }
  }

  // Fixes the double-brace mistake the AI sometimes makes on question items
  cleanText = cleanText.replace(/\}\s*\}/g, "}"); // accidental }} -> }
  cleanText = cleanText.replace(/\{\s*\{/g, "{"); // accidental {{ -> {

  // Insert a missing comma between two objects that are adjacent with only
  // whitespace/newlines between them: `}\n{` -> `},{`. Valid JSON never has
  // `}{` back-to-back without a comma, so this is always a safe repair.
  cleanText = cleanText.replace(/\}\s*\{/g, "},{");
  // Same for adjacent array-closing/opening slips: `]\n[` -> `],[`.
  cleanText = cleanText.replace(/\]\s*\[/g, "],[");

  return cleanText;
}

// Regex-based fallback for quiz questions, mirroring extractQuestionsByFields
// for assignments below: scans for the fixed type -> text -> options ->
// correctAnswer -> marks key sequence directly, independent of whether the
// surrounding array/object braces are balanced. Used only when a strict
// JSON.parse of the whole array fails.
function extractQuizQuestionsByFields(rawText) {
  const re =
    /"type"\s*:\s*"([A-Za-z_]+)"\s*,\s*"text"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"options"\s*:\s*(\[(?:\\.|[^\]])*\])\s*,\s*"correctAnswer"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"marks"\s*:\s*([0-9.]+)/gs;
  const questions = [];
  let match;
  while ((match = re.exec(rawText)) !== null) {
    const correctedType = ["MCQ", "TRUE_FALSE", "FILL_BLANK", "SHORT_ANSWER"].includes(match[1].toUpperCase())
      ? match[1].toUpperCase()
      : "MCQ";

    let rawOptions;
    try {
      rawOptions = JSON.parse(match[3]);
      if (!Array.isArray(rawOptions)) throw new Error("not an array");
    } catch {
      rawOptions = ["True", "False", "None", "All"];
    }

    let correctedAns = decodeJsonStringLiteral(match[4]).trim() || "0";
    const matchingIndex = rawOptions.findIndex(
      (opt) => String(opt).toLowerCase() === correctedAns.toLowerCase()
    );
    if (matchingIndex !== -1) correctedAns = String(matchingIndex);

    questions.push({
      type: correctedType,
      text: decodeJsonStringLiteral(match[2]) || `Practice Question ${questions.length + 1}`,
      options: rawOptions,
      correctAnswer: correctedAns,
      marks: Number(match[5]) || 1,
    });
  }
  return questions;
}

// Robust JSON extraction for quiz questions. Tries a strict full JSON.parse
// first (fast path — cheap and fully correct whenever the model's
// braces/commas come out valid), and if that throws, falls back to
// extractQuizQuestionsByFields above, which recovers each question
// individually without needing the overall array to be well-formed JSON.
// This mirrors parseAssignmentJson's two-tier strategy so a single stray
// missing comma or brace slip from a small local model never has to
// interrupt the teacher's workflow with a hard failure.
function parseJsonResponse(rawText, fallbackErrorMessage) {
  try {
    const cleanText = extractJsonText(rawText);

    // 3. Initial JSON Parse
    const parsedData = JSON.parse(cleanText);
    
    // ======= SCHEMA REPAIR & VALIDATION LAYER =======
    const targetArray = Array.isArray(parsedData) ? parsedData : [parsedData];
    
    const correctedQuizQuestions = targetArray.map((q, idx) => {
      const correctedType = ["MCQ", "TRUE_FALSE", "FILL_BLANK", "SHORT_ANSWER"].includes(q.type?.toUpperCase())
        ? q.type.toUpperCase()
        : "MCQ";

      const rawOptions = Array.isArray(q.options) ? q.options : ["True", "False", "None", "All"];
      
      // Smart recovery layer: if AI supplies an option text string like "speed" instead of an index
      let correctedAns = q.correctAnswer !== undefined ? String(q.correctAnswer).trim() : "0";
      const matchingIndex = rawOptions.findIndex(opt => opt.toLowerCase() === correctedAns.toLowerCase());
      if (matchingIndex !== -1) {
        correctedAns = String(matchingIndex);
      }

      return {
        type: correctedType,
        text: q.text || q.question || `Practice Question ${idx + 1}`,
        options: rawOptions,
        correctAnswer: correctedAns,
        marks: Number(q.marks) || 1
      };
    });

    return correctedQuizQuestions;
    
  } catch (err) {
    console.warn("Strict quiz JSON parse failed, falling back to field extraction:", err.message);
    const recovered = extractQuizQuestionsByFields(rawText);
    if (recovered.length > 0) return recovered;

    console.error("Quiz Validation Exception Catch:", err.message);
    console.error("Faulty text trace:", rawText);
    throw new Error(fallbackErrorMessage || "AI returned an unparseable response. Try again.");
  }
}

// Decodes a captured JSON string-literal body (the part between the outer
// quotes) back into a real JS string, turning escapes like \n, \", \u201c
// into their actual characters. The regexes below always capture content
// that was already inside a `"..."` pair, so wrapping it back in quotes and
// running it through JSON.parse is a safe, correct way to unescape it.
function decodeJsonStringLiteral(captured) {
  try {
    return JSON.parse(`"${captured}"`);
  } catch {
    return captured;
  }
}

// Regex-based field extraction — pulls "title", "instructions", or any
// other top-level string field straight out of the raw text by key name,
// completely independent of whether the surrounding braces/brackets are
// balanced. Small local models reliably get individual key:"value" pairs
// right even when they mangle the nesting around them (extra `{{`, a
// missing `}`, a dropped comma, etc.), so anchoring on the field itself
// sidesteps the whole brace-matching problem.
function extractStringField(rawText, fieldName) {
  const re = new RegExp(`"${fieldName}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "s");
  const match = rawText.match(re);
  return match ? decodeJsonStringLiteral(match[1]) : "";
}

// Pulls every question out of the raw text by scanning for the fixed
// text -> type -> marks -> expectedAnswer key sequence our prompt asks the
// model to follow, one question at a time, in order. This never touches
// `{`/`}` at all, so it survives any amount of brace corruption around each
// question object — the only thing that has to stay intact is the four
// key:value pairs themselves, which is by far the part small models get
// right most consistently.
function extractQuestionsByFields(rawText) {
  const re =
    /"(?:text|question)"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"type"\s*:\s*"([A-Za-z_]+)"\s*,\s*"marks"\s*:\s*([0-9.]+)\s*,\s*"expectedAnswer"\s*:\s*"((?:\\.|[^"\\])*)"/gs;
  const questions = [];
  let match;
  while ((match = re.exec(rawText)) !== null) {
    const type = ["MCQ", "TRUE_FALSE", "FILL_BLANK", "SHORT_ANSWER"].includes(match[2].toUpperCase())
      ? match[2].toUpperCase()
      : "SHORT_ANSWER";
    questions.push({
      text: decodeJsonStringLiteral(match[1]) || `Question ${questions.length + 1}`,
      type,
      marks: Number(match[3]) || 1,
      expectedAnswer: decodeJsonStringLiteral(match[4]),
    });
  }
  return questions;
}

// Extraction for assignments — preserves the {title, instructions,
// questions} shape instead of flattening everything into the quiz-question
// schema. Tries a strict full JSON.parse first (cheap and fully correct
// whenever the model's braces/commas are actually valid). If that throws —
// which local models do fairly often on nested nested nested question
// arrays — it falls back to regex field-extraction (extractStringField /
// extractQuestionsByFields above), which recovers the title, instructions,
// and every question individually without ever needing the overall JSON to
// be well-formed. Only if NEITHER approach finds anything usable do we give
// up and let the caller fall back to dumping raw text.
function parseAssignmentJson(rawText) {
  try {
    const cleanText = extractJsonText(rawText);
    const parsedData = JSON.parse(cleanText);
    if (Array.isArray(parsedData) || typeof parsedData !== "object" || parsedData === null) {
      throw new Error("Expected a JSON object with title/instructions/questions, got something else.");
    }
    const questions = Array.isArray(parsedData.questions)
      ? parsedData.questions.map((q, idx) => ({
          text: q.text || q.question || `Question ${idx + 1}`,
          type: ["MCQ", "TRUE_FALSE", "FILL_BLANK", "SHORT_ANSWER"].includes(q.type?.toUpperCase())
            ? q.type.toUpperCase()
            : "SHORT_ANSWER",
          marks: Number(q.marks) || 1,
          expectedAnswer: q.expectedAnswer !== undefined ? String(q.expectedAnswer) : "",
        }))
      : [];
    return {
      title: typeof parsedData.title === "string" ? parsedData.title.trim() : "",
      instructions: typeof parsedData.instructions === "string" ? parsedData.instructions.trim() : "",
      questions,
    };
  } catch (err) {
    console.warn("Strict assignment JSON parse failed, falling back to field extraction:", err.message);
  }

  const title = extractStringField(rawText, "title");
  const instructions = extractStringField(rawText, "instructions");
  const questions = extractQuestionsByFields(rawText);

  if (!title && !instructions && questions.length === 0) {
    throw new Error("Could not extract any assignment content from the AI response.");
  }

  return { title, instructions, questions };
}

module.exports = {
  isOllamaReachable,
  activeMode,
  chatWithNirantarAI,
  chatStreamWithNirantarAI,
  persistAssistantReply,
  summarizeText,
  generateQuizQuestions,
  generateAssignmentContent,
  buildSystemPrompt,
  parseJsonResponse,
  parseAssignmentJson
};