import { createContext, useContext, useState, useEffect } from "react";
import { api } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleExpiredSession = () => setUser(null);
    window.addEventListener("auth:expired", handleExpiredSession);

    const token = localStorage.getItem("token");
    if (token) {
      api.auth
        .profile()
        .then(setUser)
        .catch(() => localStorage.removeItem("token"))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }

    return () =>
      window.removeEventListener("auth:expired", handleExpiredSession);
  }, []);

  const login = async (email, password) => {
    const { user: userData, token } = await api.auth.login({ email, password });
    localStorage.setItem("token", token);
    setUser(userData);
    return userData;
  };

  const register = async (formData) => {
    return api.auth.register(formData);
  };

  const logout = async () => {
    try {
      await api.auth.logout();
    } catch {
      // Local authentication is cleared even if the server is unavailable.
    } finally {
      localStorage.removeItem("token");
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
