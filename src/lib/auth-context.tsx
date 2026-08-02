"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useData } from "./data-context";
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
  const { users, isLoading: dataLoading } = useData();
  const [userId, setUserId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const savedId = window.localStorage.getItem(STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage, client-only
    setUserId(savedId);
    setHydrated(true);
  }, []);

  // Deriving `user` from the live `users` array (rather than storing the
  // whole object) means a name/role change or deactivation from the Admin
  // pages is reflected immediately — including logging the session out if an
  // admin deactivates the account currently signed in.
  const user = useMemo(() => {
    if (!userId) return null;
    const found = users.find((u) => u.id === userId);
    return found && found.isActive ? found : null;
  }, [userId, users]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading: dataLoading || !hydrated,
      login: (email, password) => {
        if (!password || password.length < 4) {
          return { ok: false, message: "Password minimal 4 karakter." };
        }
        const found = users.find(
          (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.isActive
        );
        if (!found) {
          return { ok: false, message: "Email tidak ditemukan atau akun nonaktif." };
        }
        setUserId(found.id);
        window.localStorage.setItem(STORAGE_KEY, found.id);
        return { ok: true };
      },
      logout: () => {
        setUserId(null);
        window.localStorage.removeItem(STORAGE_KEY);
      },
    }),
    [user, users, dataLoading, hydrated]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
