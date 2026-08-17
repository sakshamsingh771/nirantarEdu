import { openDB } from "idb";

// Client-side offline data store. NEVER store plain-text passwords or the
// auth token here — the token stays in localStorage only, this DB is for
// cached content and the pending-operations queue.
const DB_NAME = "nirantaredu-offline";
const DB_VERSION = 1;

export const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains("materials")) db.createObjectStore("materials", { keyPath: "_id" });
    if (!db.objectStoreNames.contains("assignments")) db.createObjectStore("assignments", { keyPath: "_id" });
    if (!db.objectStoreNames.contains("quizzes")) db.createObjectStore("quizzes", { keyPath: "_id" });
    if (!db.objectStoreNames.contains("notifications")) db.createObjectStore("notifications", { keyPath: "_id" });
    if (!db.objectStoreNames.contains("draftAnswers")) db.createObjectStore("draftAnswers", { keyPath: "id" });
    if (!db.objectStoreNames.contains("pendingOperations")) {
      db.createObjectStore("pendingOperations", { keyPath: "operationId" });
    }
  },
});

export async function cacheItems(storeName, items) {
  const db = await dbPromise;
  const tx = db.transaction(storeName, "readwrite");
  await Promise.all(items.map((item) => tx.store.put(item)));
  await tx.done;
}

export async function getCachedItems(storeName) {
  const db = await dbPromise;
  return db.getAll(storeName);
}

export async function queueOperation(operation) {
  const db = await dbPromise;
  await db.put("pendingOperations", {
    ...operation,
    operationId: operation.operationId || crypto.randomUUID(),
    status: "PENDING",
    retryCount: 0,
    createdAt: new Date().toISOString(),
  });
}

export async function getPendingOperations() {
  const db = await dbPromise;
  return db.getAll("pendingOperations");
}

export async function clearCompletedOperation(operationId) {
  const db = await dbPromise;
  await db.delete("pendingOperations", operationId);
}

export async function saveDraftAnswer(id, data) {
  const db = await dbPromise;
  await db.put("draftAnswers", { id, ...data, savedAt: new Date().toISOString() });
}

export async function getDraftAnswer(id) {
  const db = await dbPromise;
  return db.get("draftAnswers", id);
}
