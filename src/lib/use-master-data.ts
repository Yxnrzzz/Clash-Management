"use client";

import { useMemo } from "react";
import { useData } from "./data-context";
import type { Clash, Role } from "./types";

/**
 * Master data (disciplines, zones, statuses, priorities, users) is mutable —
 * editable via the Admin pages — so lookups must read the live arrays from
 * context rather than the static INITIAL_* seed constants. This hook is the
 * single place that binds id-lookup closures to the current arrays; call
 * sites destructure what they need and use it exactly like a plain function.
 */
export function useMasterDataLookups() {
  const { disciplines, zones, statuses, priorities, users } = useData();

  return useMemo(() => {
    const disciplineById = (id: string) => disciplines.find((d) => d.id === id);
    const zoneById = (id: string) => zones.find((z) => z.id === id);
    const statusById = (id: string) => statuses.find((s) => s.id === id);
    const priorityById = (id: string) => priorities.find((p) => p.id === id);
    const userById = (id: string | null) => (id ? users.find((u) => u.id === id) : undefined);

    const isOverdue = (clash: Clash) => {
      const status = statusById(clash.statusId);
      if (!clash.dueDate || status?.isClosedState) return false;
      return new Date(clash.dueDate).getTime() < Date.now();
    };

    /**
     * Coordinator/Admin may move to any other status. An Engineer may only
     * move their own assigned item forward one step, and never into a
     * closed-state status — this checks `isClosedState`, not the status
     * name, so renaming "Closed" from the Admin master-data page can't
     * silently let an Engineer close an item.
     */
    const allowedStatusTransitions = (role: Role, clash: Clash, userId: string): string[] => {
      const current = statusById(clash.statusId);
      if (!current) return [];
      if (role === "Coordinator" || role === "Admin") {
        return statuses.map((s) => s.id).filter((id) => id !== current.id);
      }
      if (role === "Engineer" && clash.assigneeId === userId) {
        return statuses
          .filter((s) => s.urutan === current.urutan + 1 && !s.isClosedState)
          .map((s) => s.id);
      }
      return [];
    };

    return {
      disciplines,
      zones,
      statuses,
      priorities,
      users,
      disciplineById,
      zoneById,
      statusById,
      priorityById,
      userById,
      isOverdue,
      allowedStatusTransitions,
    };
  }, [disciplines, zones, statuses, priorities, users]);
}
