# NirantarEdu — 100% Offline-First School Learning Platform

> Internet can disappear. Learning doesn't have to.

NirantarEdu is a digital classroom that runs entirely on one computer inside the school
building. Students, teachers and admins connect over the school's local Wi-Fi/LAN — the
platform never needs an internet connection for registration, login, study material,
assignments, quizzes, notifications, search, analytics, or the local AI assistant
(Nirantar AI, via a locally-installed Ollama).

---

## Verified student registration

Students can't register with arbitrary details. The school/admin pre-creates an official
**Student record** (ID, name, class, section — no password). Registration is a 4-step flow
that verifies against that record before a password is ever set:

```
Enter Student ID + School Code
        ↓
GET /api/students/verify   (backend looks it up — not just a frontend check)
        ↓
Record found & not yet registered → show the student their official info
        ↓
"Is this correct?"  → Yes: set a password, account created
                    → No / not found: file a Correction Request instead
```

If the record doesn't match, or the student thinks it's wrong, they can file a
**Correction Request** (issue type + description) right from the registration screen or
from `/track-request`, without needing an account. An admin reviews it under the
**Correction Requests** tab, and only an admin approving a request can change the official
Student record — students never edit it directly.

---

## What's included in this build

**Fully wired up:**
- Verified registration + Correction Request workflow (see above)
- Auth (register/login/logout/change password) against local MongoDB, JWT + bcrypt, roles
  enforced on the backend; every admin/teacher/student query is scoped to the caller's own
  school server-side, never trusting a client-supplied school code
- **Admin account management**: view account (name, ID, role, school, password/recovery
  status — never the password itself), change Admin ID (requires current password;
  old ID stops resolving immediately, the current session keeps working since the JWT is
  keyed to the account's database ID, not the ID string), change password
- **Admin recovery, fully offline**: a cryptographically-random recovery code (e.g.
  `NED-7K4P-92MX`), shown once and stored only as a bcrypt hash; a public "forgot password"
  flow (School Code + Admin ID + recovery code, generic error messages, rate-limited,
  single-use code); and — for the "both password and recovery code lost" case — a local-only
  CLI tool (`server/recover-admin.js`) that never touches the network and must be run
  directly on the school server by whoever has physical/authorized access to it
- **Class 1–12 and Section A–Z management**: the admin enables which classes the school
  uses and configures per-class sections (Class 10 can have A–D while Class 12 only has A–B —
  sections are never a single flat list shared by every class). A teacher gets **no classes
  by default** — the admin explicitly assigns each teacher's subject+class+section
  combinations, enforced server-side (`User.canTeach()`) on every material/assignment/quiz
  creation call, not just hidden in the UI
- Class- and section-aware visibility: materials, assignments and quizzes posted for a
  specific section are only visible to students in that section (material with no section
  set stays visible to the whole class)
- Materials upload supporting PDF, DOC/DOCX, PPT/PPTX, images, audio and video, all stored
  under `server/uploads/` — never uploaded to any external storage. Students get a viewer
  suited to the format: PDF opens in the browser, images/video/audio play inline, PPT/DOC
  formats get a clear Open/Download action against the real local file (never a broken link)
- **Assignments**: manual creation, or "Generate with Nirantar AI" — teacher picks class,
  section, subject, topic, difficulty, question count/type and target marks; the AI returns a
  structured draft (title + instructions + a real question list with type/marks/expected
  answer) the teacher can edit, regenerate, or save as a draft before publishing. Nothing is
  auto-published from AI output
- **Quizzes**: manual or AI-generated, both enforcing **1–50 questions** server-side and
  client-side. Two timing modes, chosen per quiz: an **overall timer**, or a **per-question
  timer** where the quiz auto-advances when each question's own time runs out. All timing is
  computed and checked against the **server clock** (`QuizAttempt.expiresAt` /
  `currentQuestionDeadline`), not trusted from the browser — a student can't extend time by
  changing their system clock, and a page refresh resumes the same true deadline instead of
  resetting it
- **Nirantar AI is blocked during an active quiz** — enforced at both layers: the frontend
  hides/disables the AI tab the moment a quiz is in progress, and every `/api/ai/*` route
  independently rejects the request server-side based on a real `QuizAttempt` lookup, so it
  can't be bypassed by calling the API directly from devtools
- Nirantar AI chat is **streamed** token-by-token (not one long wait-then-render), supports
  **stop generation** and **regenerate**, and renders replies through a lightweight built-in
  Markdown/code-block renderer (headings, lists, bold/italic, inline code, fenced code blocks
  with a language label and copy button) — plus browser-native Speech-to-Text (Web Speech
  API): click the mic, speak, edit the transcript, send. No cloud speech or AI API is called
  anywhere in this code. The model is configurable via `NIRANTAR_AI_MODEL` (swap in a smaller
  model on limited hardware), and the backend reuses a keep-alive HTTP connection to Ollama
  instead of opening a fresh one per request
- A simple local "RAG" layer (`ragService.js`) that pulls relevant material text into the
  AI prompt using MongoDB text matching
- Notifications, search, and role-specific analytics endpoints
- PWA app shell caching + an IndexedDB-backed offline queue for assignment submissions, with
  de-duplication via `clientOperationId`
- Docker Compose for MongoDB, backend and frontend containers, talking to Ollama running
  natively on the host machine (see Ollama section below)
- A calm, eye-friendly, responsive UI (soft warm-neutral background, muted blue/green
  palette — no pure white/black, no neon) — homepage, auth flows, and all dashboards
- A realistic seed dataset: one school, an admin (with a demo recovery code), 4 subject
  teachers (each with real class/section assignments), 40 students with real names spread
  across classes 6–10 × sections A/B, a diverse set of demo materials (PDF, PPTX, PNG, DOCX,
  WAV, plain notes), a sample assignment and quiz, and a pending correction request — see
  **Demo credentials** below

**Scaffolded / intentionally left for you to extend:**
- The `/api/sync` replay currently does idempotent bookkeeping; wiring each `operationType`
  to actually re-run its target write (beyond assignment submission, which is already
  idempotent end-to-end) is marked with a comment in `syncController.js`
- File-type-specific text extraction for PDFs/DOCX into `Material.textContent` — only
  NOTE-type materials populate `textContent` for the AI/search to use today
- Chart-based analytics visuals (the analytics endpoints return the numbers; swap in a
  charting library like `recharts` on the dashboard pages)
- Bulk import of Student records (e.g. from a CSV) — currently one at a time via the form
- Persistent AI conversation history across sessions is not implemented; chat is in-memory
  per page load (Clear Conversation resets it manually)
- The Markdown renderer is intentionally minimal (no dependency added) — headings, lists,
  bold/italic, inline code and fenced code blocks with a copy button, but not full CommonMark
  or per-language syntax coloring. Swapping in `react-markdown` + a syntax highlighter behind
  the same `MarkdownMessage` component is a low-risk upgrade if richer formatting is wanted
- No demo video files are auto-generated (see `server/demo-files/README.md` for why, and how
  to add your own)
- Student registration's class/section come from the admin-created Student record and are
  shown, not chosen — there's intentionally no free-editable class/section field on the
  registration form, since that's what the verification system exists to prevent
- AI performance work here is structural (connection reuse, streaming, configurable model)
  rather than measured — this environment has no way to actually run Ollama and profile
  first-token/tokens-per-second, so treat "faster" as "the obvious bottlenecks are removed,"
  not as a benchmarked result

---

## Ollama (local AI)

Ollama is **not** run as a Docker container — it's expected to already be installed and
running on the host machine (https://ollama.com). The backend reaches it through the
`OLLAMA_BASE_URL` environment variable:

- Backend running in Docker Compose → `OLLAMA_BASE_URL=http://host.docker.internal:11434`
  (the compose file adds the `host.docker.internal` mapping for Linux Docker Engine too —
  Docker Desktop on Mac/Windows already provides it)
- Backend running directly with `npm run dev` (no Docker) → `OLLAMA_BASE_URL=http://localhost:11434`

Nothing in the code hard-codes a machine-specific address.

---

## Hybrid AI: cloud + local Ollama fallback

Nirantar AI can run two ways, and the backend picks between them automatically —
students and teachers never manually choose a provider:

```
Frontend
   ↓
NirantarEdu Backend
   ↓
AI Provider Abstraction (server/src/services/aiProviders/)
   ↓
Cloud AI (Gemini, or any provider swapped in behind cloudProvider.js)  ⟷  Ollama (local, offline)
```

**Selection logic** (`AI_PROVIDER` env var):

- `AI_PROVIDER=ollama` — local-only, cloud is never attempted (the default for `.env.local.example`).
- `AI_PROVIDER=auto` (or `cloud`) — cloud is tried first when `AI_API_KEY` is set; on **any**
  cloud failure (timeout, 429, 5xx, connection failure) the backend automatically falls back
  to Ollama. This is a real request/response check, not a Wi-Fi/network-interface check —
  see `aiProviders/index.js`.

**Conversation continuity across a fallback.** Every chat has a `conversationId` generated
once by the frontend and stored client-side (`NirantarAiChat.jsx`) alongside the visible
message list. The backend persists each turn in a provider-independent `Conversation`
document (`server/src/models/Conversation.js`) keyed by that same ID. On every new message,
prior turns are fetched from that document and woven into the prompt as plain text — so if
message #1 was answered by the cloud provider and the network then drops, message #2 is
answered by Ollama **with the same prior context**, not a fresh conversation. Provider/model
are stored per-message for backend logging only; they are never included in what's sent back
to the AI as conversational context.

**Streaming fallback.** If the cloud provider fails to establish a stream at all (bad key,
connection refused, timeout before any token arrives), the backend transparently retries with
Ollama and the frontend never sees the failed attempt. If a cloud stream fails *after* it has
already started sending real content, the response ends there rather than restarting with
Ollama — switching providers mid-stream would either duplicate or corrupt the reply, which is
worse than a clean partial answer.

**Status indicator.** After each reply, the chat panel shows a small "Nirantar AI • Online"
(cloud) or "Nirantar AI • Local AI" (Ollama) badge, read from the `X-AI-Provider` response
header — no polling, no separate "check if cloud is up" ping.

**Configuration** (see `.env.local.example` / `.env.production.example`):

| Variable | Purpose |
|---|---|
| `AI_PROVIDER` | `ollama` / `auto` / `cloud` — see above |
| `AI_API_KEY` | Cloud provider API key (never commit a real value) |
| `AI_MODEL` | Cloud model name, e.g. `gemini-2.0-flash` |
| `AI_BASE_URL` | Override only if swapping to a different cloud provider's REST endpoint |
| `AI_CLOUD_TIMEOUT_MS` | How long to wait on the cloud provider before falling back (default 12s) |
| `OLLAMA_BASE_URL`, `NIRANTAR_AI_MODEL` | Unchanged from before — local Ollama connection |

**Swapping the cloud provider.** Everything provider-specific lives in
`server/src/services/aiProviders/cloudProvider.js` (currently a Gemini REST integration).
Replacing Gemini with another vendor means rewriting that one file's `generate`/`generateStream`
functions to the same return shape — nothing in `aiService.js`, the conversation manager, or
any controller needs to change.

**What this does *not* do:** the frontend never talks to Ollama or the cloud provider
directly — only the backend does, so API keys stay server-side. Quiz/assignment generation
goes through the same fallback path and the same robust JSON-fence-stripping parser
regardless of which provider answered.

---

## Running it

### 1. With Docker (recommended)

```bash
# install Ollama on the host first: https://ollama.com
ollama pull llama3.2
ollama serve   # if it isn't already running as a background service

cp .env.example .env
# edit .env and set a real JWT_SECRET

docker compose up -d --build

# seed demo data (student/teacher/admin accounts, materials, etc.)
docker exec -it nirantaredu-backend node seed.js
```

Frontend: `http://localhost` (or `http://<school-server-LAN-ip>` from another device on
the same Wi-Fi). Backend API: `http://localhost:5000/api`.

### 2. Locally without Docker (for development)

```bash
# Terminal 1 — MongoDB must be running locally, e.g. via `mongod`
cd server
npm install
cp ../.env.example .env   # adjust MONGO_URI and set OLLAMA_BASE_URL=http://localhost:11434
npm run seed
npm run dev

# Terminal 2
cd client
npm install
npm run dev
```

Ollama must be installed separately and running with a model pulled (`ollama pull llama3.2`)
for the AI features to respond.

The demo material placeholder files (`server/uploads/demo-*.*`) are already generated and
committed. To regenerate them (e.g. after deleting `uploads/`), run:

```bash
cd server
npm run generate:demo-files
```

---

## Demo credentials & data (after seeding)

School Code for everything below: **`NED-LKO-2026`**

| Role     | ID           | Password      | Notes                                                            |
|----------|--------------|---------------|-------------------------------------------------------------------|
| Admin    | `ADMIN001`   | `Admin@123`   |                                                                     |
| Teacher  | `TCH001`     | `Teacher@123` | Mathematics                                                        |
| Teacher  | `TCH002`     | `Teacher@123` | Science                                                            |
| Teacher  | `TCH003`     | `Teacher@123` | English                                                            |
| Teacher  | `TCH004`     | `Teacher@123` | Computer Science                                                   |
| Student  | `STU001`–`STU036` | `Student@123` | Registered and ready to log in — real names, classes 6–10, sections A/B |
| Student  | `STU037`–`STU040` | —        | Official records exist but are **not yet registered** — use these to demo the registration/verification flow |
| Student  | `STU999`     | —             | No record at all — demos "record not found" + filing a correction request |

A demo correction request (`CR-1025`, status `pending`, filed against `STU037`, claiming
class 10-A instead of the seeded 10-B) is already in the admin's queue — open
**Admin → Correction Requests** to review/approve it, or check its status at
`/track-request` with Request ID `CR-1025` and Student ID `STU037`.

Demo materials are spread across Mathematics (class 8–9), Science (class 6–7) and English
(class 6, 8–9) in PDF, PPTX, PNG, DOCX, WAV and plain-note formats — log in as `STU001`
(class 6) or browse as a teacher to see them across classes. Two "video" materials
(Mathematics Lecture, Recorded Explanation) are seeded without a file on purpose — see
`server/demo-files/README.md` for why, and how to add a real one.

---

## Proving it's actually offline

1. Start everything as above, on your school server, with Ollama running on the host.
2. From a laptop/phone on the same Wi-Fi, open `http://<server-LAN-ip>`.
3. Register a student (e.g. `STU037`), log in, open material, start a quiz.
4. File a correction request, then log in as admin and approve it.
5. **Disconnect the school server's internet/WAN uplink completely** (leave the local
   Wi-Fi/LAN and the host's Ollama running).
6. Continue the quiz, submit an assignment, ask Nirantar AI a question (try the mic), verify/
   register another student, file/review another correction request — all of it should keep
   working, because none of it ever left the local network.

---

## Project structure

```
nirantaredu/
├── client/        React + Vite + Tailwind PWA frontend
├── server/        Express + Mongoose REST API + Ollama-backed AI service
│   ├── uploads/           local file storage (incl. committed demo placeholder files)
│   ├── demo-files/        README explaining the demo material files
│   └── generate-demo-files.js   regenerates the demo placeholder files
├── docker-compose.yml
└── .env.example
```

See `client/src` and `server/src` for the full breakdown (models, controllers, routes,
services, offline layer, pages).
