import api from "../services/api.js";
import { getPendingOperations, clearCompletedOperation } from "./db.js";

// Flushes the local offline-operation queue against the school's local
// server. This talks to the LAN server, not the internet — it runs whenever
// the app detects the local server is reachable again, regardless of
// whether the device has internet access.
export async function flushPendingOperations() {
  const pending = await getPendingOperations();
  if (pending.length === 0) return { flushed: 0 };

  const res = await api.post("/sync", {
    operations: pending.map((p) => ({
      operationId: p.operationId,
      operationType: p.operationType,
      payload: p.payload,
    })),
  });

  for (const result of res.data.results) {
    if (result.status === "COMPLETED") {
      await clearCompletedOperation(result.operationId);
    }
  }
  return { flushed: res.data.results.length };
}
