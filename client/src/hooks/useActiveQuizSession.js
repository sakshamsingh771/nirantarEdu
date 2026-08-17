import { useEffect, useState, useCallback } from "react";
import api from "../services/api.js";

// Polls whether the student currently has an active quiz attempt, so the UI
// can hide/disable Nirantar AI navigation and re-attach to an in-progress
// quiz after a refresh (quizId is returned by the server whenever an
// attempt is active — see quizController.activeSession). This is a UX
// convenience only — the real boundary is server-side
// (blockAiDuringActiveQuiz on /api/ai/*), which rejects requests even if
// this hook were somehow bypassed.
//
// Polls every 3s (not 10s) so cross-tab/refresh re-attachment and the
// dashboard-tab lock both engage quickly rather than leaving a multi-second
// window where a student could still navigate away from an active quiz.
export function useActiveQuizSession() {
  const [active, setActive] = useState(false);
  const [quizId, setQuizId] = useState(null);

  const check = useCallback(async () => {
    try {
      const res = await api.get("/quizzes/active-session");
      setActive(res.data.active);
      setQuizId(res.data.active ? res.data.quizId : null);
    } catch {
      // fail open on the UI side — the AI routes still enforce the block
      // server-side even if this status check itself fails
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!cancelled) await check();
    };
    run();
    const interval = setInterval(run, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [check]);

  return { active, quizId, refresh: check };
}
