const Conversation = require("../models/Conversation");

// How many past turns (user+assistant pairs) get fed back into the prompt
// as context. Capped so a long-running chat doesn't blow the model's
// context window — see NUM_CTX in aiService.js.
const MAX_CONTEXT_MESSAGES = 12;
// Hard cap on stored messages per conversation, independent of the above —
// this is about not growing one Mongo document without bound, not about
// how much gets replayed to the model.
const MAX_STORED_MESSAGES = 60;

// Fetches (or lazily creates) the conversation and returns the last few
// turns formatted as plain text, ready to prepend to a prompt. Provider-
// agnostic on purpose: the same history is handed to Ollama or the cloud
// provider, so switching between them mid-conversation is invisible to the
// student.
async function getConversationContext(conversationId, user) {
  if (!conversationId) return { conversation: null, historyText: "" };

  const conversation = await Conversation.findOne({ conversationId, user: user._id });
  if (!conversation || conversation.messages.length === 0) {
    return { conversation, historyText: "" };
  }

  const recent = conversation.messages.slice(-MAX_CONTEXT_MESSAGES);
  const historyText = recent
    .map((m) => `${m.role === "user" ? "Student" : "Nirantar AI"}: ${m.content}`)
    .join("\n");

  return { conversation, historyText };
}

// Creates the conversation on first message, or appends to it. Called once
// per side of the exchange (user message immediately, assistant reply once
// it's fully known — after a stream completes, or immediately for a
// non-streaming reply).
async function appendMessage(conversationId, user, namespace, message) {
  if (!conversationId) return null;

  let conversation = await Conversation.findOneAndUpdates({ conversationId, user: user._id },
    {
      $setOnInsert:{conversationId,school:user.school,user:user._id,namespace},
      $push:{message:message},
    },
    {upsert:true,new:true}
  );
  if (conversation.messages.length > MAX_STORED_MESSAGES) {
    conversation.messages = conversation.messages.slice(-MAX_STORED_MESSAGES);
    await conversation.save();
  }
  return conversation;
}

module.exports = { getConversationContext, appendMessage };
