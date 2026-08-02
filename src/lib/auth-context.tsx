"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { USERS } from "./mock-data";
import type { User } from "./types";

const STORAGE_KEY = "clashhub-auth-user-id";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => { ok: true } | { ok: false; message: string };
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedId = window.localStorage.getItem(STORAGE_KEY);
    if (savedId) {
      const found = USERS.find((u) => u.id === savedId) ?? null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage, client-only
      setUser(found);
    }
    setIsLoading(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      login: (email, password) => {
        if (!password || password.length < 4) {
          return { ok: false, message: "Password minimal 4 karakter." };
        }
        const found = USERS.find(
          (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.isActive
        );
        if (!found) {
          return { ok: false, message: "Email tidak ditemukan atau akun nonaktif." };
        }
        setUser(found);
        window.localStorage.setItem(STORAGE_KEY, found.id);
        return { ok: true };
      },
      logout: () => {
        setUser(null);
        window.localStorage.removeItem(STORAGE_KEY);
      },
    }),
    [user, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
