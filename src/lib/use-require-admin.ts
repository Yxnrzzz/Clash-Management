"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "./use-require-auth";

/** Gate for /admin/* pages — redirects non-Admin roles back to the register. */
export function useRequireAdmin() {
  const { user, isLoading } = useRequireAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user && user.peran !== "Admin") {
      router.replace("/register");
    }
  }, [isLoading, user, router]);

  const isAdmin = !!user && user.peran === "Admin";
  return { user, isLoading: isLoading || !isAdmin };
}
