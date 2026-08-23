import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import api, { setToken, clearToken } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = anon, obj = user
  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      setUser(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (username, password) => {
    const { data } = await api.post("/auth/login", { username, password });
    if (data.token) setToken(data.token);
    setUser(data);
    return data;
  };
  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    if (data.token) setToken(data.token);
    setUser(data);
    return data;
  };
  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    clearToken();
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
