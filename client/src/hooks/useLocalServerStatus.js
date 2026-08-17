import { useEffect, useState } from "react";
import api from "../services/api.js";

// Tracks reachability of the SCHOOL LOCAL SERVER (LAN), which is what
// actually matters for this app — not the browser's navigator.onLine,
// which reflects internet connectivity and is intentionally not the
// headline signal anywhere in the UI.
export function useLocalServerStatus() {
  const [schoolServerConnected, setSchoolServerConnected] = useState(true);
  const [browserOnline, setBrowserOnline] = useState(navigator.onLine);

  useEffect(() => {
    const check = async () => {
      try {
        await api.get("/health", { timeout: 4000 });
        setSchoolServerConnected(true);
      } catch {
        setSchoolServerConnected(false);
      }
    };
    check();
    const interval = setInterval(check, 15000);

    const goOnline = () => setBrowserOnline(true);
    const goOffline = () => setBrowserOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return { schoolServerConnected, browserOnline };
}
