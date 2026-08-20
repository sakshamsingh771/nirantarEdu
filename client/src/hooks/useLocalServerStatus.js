import { useEffect, useState } from "react";
import api from "../services/api.js";

// navigator.onLine sirf network ADAPTER ka status batata hai — LAN cable/WiFi
// jud a hai ya nahi. Ye TRUE reh sakta hai chahe ISP/internet uplink down ho.
// Isliye actual internet check karne ke liye ek chhoti, cache-proof request
// bhejte hai kisi reliable external URL pe — agar wo fail ho jaaye (timeout,
// network error), to internet genuinely nahi hai, chahe navigator.onLine
// kuch bhi bole.
async function checkRealInternetAccess() {
  if (!navigator.onLine) return false; // adapter khud hi down hai — fast exit

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    // no-cors + cache-busting query param taaki cached/stale response na mile
    await fetch(`https://www.gstatic.com/generate_204?_=${Date.now()}`, {
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return true;
  } catch {
    return false;
  }
}

export function useLocalServerStatus() {
  const [schoolServerConnected, setSchoolServerConnected] = useState(true);
  const [browserOnline, setBrowserOnline] = useState(navigator.onLine);

  useEffect(() => {
    const checkSchoolServer = async () => {
      try {
        await api.get("/health", { timeout: 4000 });
        setSchoolServerConnected(true);
      } catch {
        setSchoolServerConnected(false);
      }
    };

    const checkInternet = async () => {
      const reallyOnline = await checkRealInternetAccess();
      setBrowserOnline(reallyOnline);
    };

    checkSchoolServer();
    checkInternet();

    const serverInterval = setInterval(checkSchoolServer, 15000);
    const internetInterval = setInterval(checkInternet, 15000);

    // "offline" event turant trust karo — reliable hai (adapter genuinely
    // gaya). "online" event ka matlab sirf "adapter wapas aaya" hai, isliye
    // usse turant confirm karne ke liye actual reachability check chalao.
    const goOffline = () => setBrowserOnline(false);
    const goOnline = () => checkInternet();
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      clearInterval(serverInterval);
      clearInterval(internetInterval);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return { schoolServerConnected, browserOnline };
}