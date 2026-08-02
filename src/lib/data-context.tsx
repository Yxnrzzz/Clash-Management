"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DISCIPLINES, generateSeedData, PROJECT, STATUSES } from "./mock-data";
import type { AuditLogEntry, Attachment, Clash, Comment, NewClashInput } from "./types";

const STORAGE_KEY = "clashhub-data-v1";

interface StoredState {
  clashes: Clash[];
  comments: Comment[];
  auditLogs: AuditLogEntry[];
  attachments: Attachment[];
}

interface DataContextValue extends StoredState {
  isLoading: boolean;
  createClash: (input: NewClashInput, reporterId: string) => Clash;
  updateClashField: (
    clashId: string,
    field: "assigneeId" | "priorityId" | "dueDate" | "statusId",
    newValue: string | null,
    actorId: string
  ) => void;
  addComment: (clashId: string, authorId: string, isi: string) => void;
}

const DataContext = createContext<DataContextValue | null>(null);

function loadInitial(): StoredState {
  return generateSeedData();
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StoredState | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage, client-only
        setState(JSON.parse(raw) as StoredState);
        return;
      } catch {
        // fall through to seed
      }
    }
    setState(loadInitial());
  }, []);

  useEffect(() => {
    if (state) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, [state]);

  const createClash = useCallback((input: NewClashInput, reporterId: string): Clash => {
    let created!: Clash;
    setState((prev) => {
      const base = prev ?? loadInitial();
      const discipline = DISCIPLINES.find((d) => d.id === input.disciplineId)!;
      const countExisting = base.clashes.filter((c) => c.disciplineId === input.disciplineId).length;
      const kodeUnik = `${PROJECT.kode}-${discipline.kode}-${String(countExisting + 1).padStart(4, "0")}`;
      const nowIso = new Date().toISOString();
      const openStatus = STATUSES[0];

      created = {
        id: `clash-${Date.now()}`,
        kodeUnik,
        projectId: PROJECT.id,
        judul: input.judul,
        deskripsi: input.deskripsi,
        disciplineId: input.disciplineId,
        zoneId: input.zoneId,
        statusId: openStatus.id,
        priorityId: input.priorityId,
        reporterId,
        assigneeId: null,
        dueDate: input.dueDate ? new Date(input.dueDate).toISOString() : null,
        createdAt: nowIso,
        closedAt: null,
      };

      const auditEntry: AuditLogEntry = {
        id: `audit-${created.id}-created`,
        clashId: created.id,
        actorId: reporterId,
        aksi: "created",
        createdAt: nowIso,
      };

      const newAttachments: Attachment[] = input.attachments.map((a, idx) => ({
        id: `att-${created.id}-${idx}`,
        clashId: created.id,
        namaFile: a.namaFile,
        tipe: a.tipe,
        ukuranBytes: a.ukuranBytes,
        uploadedBy: reporterId,
        createdAt: nowIso,
      }));

      return {
        ...base,
        clashes: [created, ...base.clashes],
        auditLogs: [...base.auditLogs, auditEntry],
        attachments: [...base.attachments, ...newAttachments],
      };
    });
    return created;
  }, []);

  const updateClashField = useCallback(
    (
      clashId: string,
      field: "assigneeId" | "priorityId" | "dueDate" | "statusId",
      newValue: string | null,
      actorId: string
    ) => {
      setState((prev) => {
        if (!prev) return prev;
        const clash = prev.clashes.find((c) => c.id === clashId);
        if (!clash) return prev;

        const oldValueRaw = clash[field];
        if (oldValueRaw === newValue) return prev;

        const nowIso = new Date().toISOString();
        const updatedClash: Clash = { ...clash, [field]: newValue };

        if (field === "statusId") {
          const newStatus = STATUSES.find((s) => s.id === newValue);
          if (newStatus?.isClosedState) {
            updatedClash.closedAt = nowIso;
          } else {
            updatedClash.closedAt = null;
          }
        }

        const labelFor = (f: typeof field, v: string | null) => {
          if (v === null) return "-";
          if (f === "statusId") return STATUSES.find((s) => s.id === v)?.nama ?? v;
          return v;
        };

        const auditEntry: AuditLogEntry = {
          id: `audit-${clashId}-${Date.now()}`,
          clashId,
          actorId,
          aksi: "updated",
          field,
          nilaiLama: labelFor(field, oldValueRaw as string | null),
          nilaiBaru: labelFor(field, newValue),
          createdAt: nowIso,
        };

        return {
          ...prev,
          clashes: prev.clashes.map((c) => (c.id === clashId ? updatedClash : c)),
          auditLogs: [...prev.auditLogs, auditEntry],
        };
      });
    },
    []
  );

  const addComment = useCallback((clashId: string, authorId: string, isi: string) => {
    setState((prev) => {
      if (!prev) return prev;
      const comment: Comment = {
        id: `comment-${clashId}-${Date.now()}`,
        clashId,
        authorId,
        isi,
        createdAt: new Date().toISOString(),
      };
      return { ...prev, comments: [...prev.comments, comment] };
    });
  }, []);

  const value = useMemo<DataContextValue>(
    () => ({
      clashes: state?.clashes ?? [],
      comments: state?.comments ?? [],
      auditLogs: state?.auditLogs ?? [],
      attachments: state?.attachments ?? [],
      isLoading: state === null,
      createClash,
      updateClashField,
      addComment,
    }),
    [state, createClash, updateClashField, addComment]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
