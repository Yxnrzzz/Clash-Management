"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useData } from "./data-context";
import { login as apiLogin, logout as apiLogout, restoreSession } from "./api/client";
import type { User } from "./types";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * AuthProvider sits INSIDE DataProvider (see app/layout.tsx) and owns the
 * session, while DataProvider owns the data the session unlocks. So the flow on
 * boot is: try to restore a session from the httpOnly refresh cookie, then tell
 * DataProvider to load master data — or to stay empty if there is no session.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { users, isLoading: dataLoading, reloadMasterData, clearMasterData } = useData();
  const [userId, setUserId] = useState<string | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const session = await restoreSession();
      if (cancelled) return;

      if (session) {
        setUserId(session.user.id);
        await reloadMasterData();
      } else {
        clearMasterData();
      }
      if (!cancelled) setBootstrapped(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [reloadMasterData, clearMasterData]);

  // Deriving `user` from the live `users` array (rather than storing the whole
  // object) means a name/role change or deactivation from the Admin pages is
  // reflected immediately — including logging the session out if an admin
  // deactivates the account currently signed in.
  const user = useMemo(() => {
    if (!userId) return null;
    const found = users.find((u) => u.id === userId);
    return found && found.isActive ? found : null;
  }, [userId, users]);

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const session = await apiLogin(email.trim(), password);
        setUserId(session.user.id);
        await reloadMasterData();
        return { ok: true } as const;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Gagal masuk. Coba lagi beberapa saat lagi.";
        return { ok: false, message } as const;
      }
    },
    [reloadMasterData]
  );

  const logout = useCallback(async () => {
    await apiLogout();
    setUserId(null);
    clearMasterData();
  }, [clearMasterData]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading: !bootstrapped || dataLoading,
      login,
      logout,
    }),
    [user, bootstrapped, dataLoading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
