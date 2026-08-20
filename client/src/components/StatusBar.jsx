import React from "react";
import { useLocalServerStatus } from "../hooks/useLocalServerStatus.js";

export default function StatusBar() {
  const { schoolServerConnected, browserOnline } = useLocalServerStatus();

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-brand-100 bg-canvas-sunk px-4 py-1.5 text-xs text-ink-soft sm:px-6 lg:px-8">
      <span className="inline-flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${schoolServerConnected ? "bg-emerald-500" : "bg-amber-500"}`} />
        School Network: {schoolServerConnected ? "Connected to School Server" : "Reconnecting to School Server…"}
      </span>
      <span className="text-ink-faint">|</span>
      <span className="inline-flex items-center gap-1.5">
  <span className={`h-2 w-2 rounded-full ${browserOnline ? "bg-emerald-500" : "bg-gray-400"}`} />
  Internet: <span className="font-medium">{browserOnline ? "Connected" : "Not Connected"}</span>
  <span className="text-ink-faint">(Not Required)</span>
</span>
      {!schoolServerConnected && (
        <span className="ml-auto font-medium text-brand-700">
          Offline Mode — All learning features remain available.
        </span>
      )}
    </div>
  );
}