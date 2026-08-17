import React, { createContext, useContext, useEffect, useState } from "react";
import api from "../services/api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("nirantaredu_user");
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("nirantaredu_token");
    if (!token) {
      setLoading(false);
      return;
    }
    // Verify the session against the local server. If the LAN link to the
    // school server is briefly down, keep the cached user so the UI doesn't
    // bounce the person to login for a transient network blip.
    api
      .get("/auth/me")
      .then((res) => {
        setUser(res.data.user);
        localStorage.setItem("nirantaredu_user", JSON.stringify(res.data.user));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = async (credentials) => {
    const res = await api.post("/auth/login", credentials);
    localStorage.setItem("nirantaredu_token", res.data.token);
    localStorage.setItem("nirantaredu_user", JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res.data.user;
  };

  const register = async (payload) => {
    const res = await api.post("/auth/register", payload);
    localStorage.setItem("nirantaredu_token", res.data.token);
    localStorage.setItem("nirantaredu_user", JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res.data.user;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // still clear locally even if the request fails
    }
    localStorage.removeItem("nirantaredu_token");
    localStorage.removeItem("nirantaredu_user");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
