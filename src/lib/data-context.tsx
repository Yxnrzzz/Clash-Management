"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  generateSeedData,
  INITIAL_DISCIPLINES,
  INITIAL_PRIORITIES,
  INITIAL_PROJECT,
  INITIAL_STATUSES,
  INITIAL_USERS,
  INITIAL_ZONES,
} from "./mock-data";
import type {
  AuditLogEntry,
  Attachment,
  Clash,
  Comment,
  Discipline,
  NewClashInput,
  NotificationPreference,
  Priority,
  Project,
  Status,
  User,
  Zone,
} from "./types";

const STORAGE_KEY = "clashhub-data-v2";

interface StoredState {
  project: Project;
  users: User[];
  disciplines: Discipline[];
  zones: Zone[];
  statuses: Status[];
  priorities: Priority[];
  clashes: Clash[];
  comments: Comment[];
  auditLogs: AuditLogEntry[];
  attachments: Attachment[];
  notificationPreferences: NotificationPreference[];
}

type ClashEditableField = "assigneeId" | "priorityId" | "dueDate" | "statusId";

interface DataContextValue extends StoredState {
  isLoading: boolean;
  /** Object URLs for attachments uploaded THIS session — never persisted
   * (blob: URLs and File objects cannot survive a reload without a real
   * backend). Attachments created in a previous session show no preview. */
  attachmentPreviewUrls: Record<string, string>;

  createClash: (input: NewClashInput, reporterId: string) => Clash;
  updateClashField: (
    clashId: string,
    field: ClashEditableField,
    newValue: string | null,
    actorId: string
  ) => void;
  bulkUpdateClashes: (
    ids: string[],
    patch: Partial<Record<ClashEditableField, string | null>>,
    actorId: string
  ) => { updated: number };
  addComment: (clashId: string, authorId: string, isi: string) => void;

  updateProject: (patch: Partial<Pick<Project, "nama" | "kode">>) => void;

  createUser: (input: Pick<User, "nama" | "email" | "peran">) => User;
  updateUser: (id: string, patch: Partial<Pick<User, "nama" | "email" | "peran">>) => void;
  toggleUserActive: (id: string) => void;

  createDiscipline: (input: Pick<Discipline, "kode" | "nama">) => Discipline;
  updateDiscipline: (id: string, patch: Partial<Pick<Discipline, "kode" | "nama">>) => void;
  toggleDisciplineActive: (id: string) => void;

  createZone: (input: Pick<Zone, "nama" | "level">) => Zone;
  updateZone: (id: string, patch: Partial<Pick<Zone, "nama" | "level">>) => void;
  toggleZoneActive: (id: string) => void;

  createPriority: (input: Pick<Priority, "nama" | "bobot">) => Priority;
  updatePriority: (id: string, patch: Partial<Pick<Priority, "nama" | "bobot">>) => void;
  togglePriorityActive: (id: string) => void;

  updateStatus: (id: string, patch: Partial<Pick<Status, "nama" | "isClosedState">>) => void;

  setNotificationPreference: (
    userId: string,
    patch: Partial<Omit<NotificationPreference, "userId">>
  ) => void;
}

const DataContext = createContext<DataContextValue | null>(null);

function loadInitial(): StoredState {
  const seed = generateSeedData();
  return {
    project: INITIAL_PROJECT,
    users: INITIAL_USERS,
    disciplines: INITIAL_DISCIPLINES,
    zones: INITIAL_ZONES,
    statuses: INITIAL_STATUSES,
    priorities: INITIAL_PRIORITIES,
    notificationPreferences: [],
    ...seed,
  };
}

function genId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StoredState | null>(null);
  const [attachmentPreviewUrls, setAttachmentPreviewUrls] = useState<Record<string, string>>({});

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

  // Revoke object URLs on unmount so the browser can reclaim the memory.
  useEffect(() => {
    return () => {
      Object.values(attachmentPreviewUrls).forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createClash = useCallback((input: NewClashInput, reporterId: string): Clash => {
    let created!: Clash;
    const newPreviewUrls: Record<string, string> = {};

    setState((prev) => {
      const base = prev ?? loadInitial();
      const discipline = base.disciplines.find((d) => d.id === input.disciplineId)!;
      const countExisting = base.clashes.filter((c) => c.disciplineId === input.disciplineId).length;
      const kodeUnik = `${base.project.kode}-${discipline.kode}-${String(countExisting + 1).padStart(4, "0")}`;
      const nowIso = new Date().toISOString();
      const openStatus = [...base.statuses].sort((a, b) => a.urutan - b.urutan)[0];

      created = {
        id: genId("clash"),
        kodeUnik,
        projectId: base.project.id,
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

      const newAttachments: Attachment[] = input.attachments.map((a, idx) => {
        const id = `att-${created.id}-${idx}`;
        if (a.file) {
          newPreviewUrls[id] = URL.createObjectURL(a.file);
        }
        return {
          id,
          clashId: created.id,
          namaFile: a.namaFile,
          tipe: a.tipe,
          ukuranBytes: a.ukuranBytes,
          uploadedBy: reporterId,
          createdAt: nowIso,
        };
      });

      return {
        ...base,
        clashes: [created, ...base.clashes],
        auditLogs: [...base.auditLogs, auditEntry],
        attachments: [...base.attachments, ...newAttachments],
      };
    });

    if (Object.keys(newPreviewUrls).length) {
      setAttachmentPreviewUrls((prev) => ({ ...prev, ...newPreviewUrls }));
    }
    return created;
  }, []);

  const applyClashPatch = useCallback(
    (
      clashes: Clash[],
      auditLogs: AuditLogEntry[],
      statuses: Status[],
      clashId: string,
      patch: Partial<Record<ClashEditableField, string | null>>,
      actorId: string,
      nowIso: string
    ): { clashes: Clash[]; auditLogs: AuditLogEntry[] } => {
      const clash = clashes.find((c) => c.id === clashId);
      if (!clash) return { clashes, auditLogs };

      let updatedClash = clash;
      const newEntries: AuditLogEntry[] = [];

      const labelFor = (f: ClashEditableField, v: string | null) => {
        if (v === null) return "-";
        if (f === "statusId") return statuses.find((s) => s.id === v)?.nama ?? v;
        return v;
      };

      (Object.entries(patch) as [ClashEditableField, string | null][]).forEach(([field, newValue]) => {
        if (newValue === undefined) return;
        const oldValueRaw = updatedClash[field];
        if (oldValueRaw === newValue) return;

        updatedClash = { ...updatedClash, [field]: newValue };
        if (field === "statusId") {
          const newStatus = statuses.find((s) => s.id === newValue);
          updatedClash.closedAt = newStatus?.isClosedState ? nowIso : null;
        }

        newEntries.push({
          id: genId(`audit-${clashId}`),
          clashId,
          actorId,
          aksi: "updated",
          field,
          nilaiLama: labelFor(field, oldValueRaw as string | null),
          nilaiBaru: labelFor(field, newValue),
          createdAt: nowIso,
        });
      });

      if (newEntries.length === 0) return { clashes, auditLogs };

      return {
        clashes: clashes.map((c) => (c.id === clashId ? updatedClash : c)),
        auditLogs: [...auditLogs, ...newEntries],
      };
    },
    []
  );

  const updateClashField = useCallback(
    (clashId: string, field: ClashEditableField, newValue: string | null, actorId: string) => {
      setState((prev) => {
        if (!prev) return prev;
        const nowIso = new Date().toISOString();
        const { clashes, auditLogs } = applyClashPatch(
          prev.clashes,
          prev.auditLogs,
          prev.statuses,
          clashId,
          { [field]: newValue },
          actorId,
          nowIso
        );
        if (clashes === prev.clashes) return prev;
        return { ...prev, clashes, auditLogs };
      });
    },
    [applyClashPatch]
  );

  const bulkUpdateClashes = useCallback(
    (
      ids: string[],
      patch: Partial<Record<ClashEditableField, string | null>>,
      actorId: string
    ): { updated: number } => {
      let updatedCount = 0;
      setState((prev) => {
        if (!prev) return prev;
        const nowIso = new Date().toISOString();
        let clashes = prev.clashes;
        let auditLogs = prev.auditLogs;
        for (const id of ids) {
          const result = applyClashPatch(clashes, auditLogs, prev.statuses, id, patch, actorId, nowIso);
          if (result.clashes !== clashes) updatedCount++;
          clashes = result.clashes;
          auditLogs = result.auditLogs;
        }
        if (updatedCount === 0) return prev;
        return { ...prev, clashes, auditLogs };
      });
      return { updated: updatedCount };
    },
    [applyClashPatch]
  );

  const addComment = useCallback((clashId: string, authorId: string, isi: string) => {
    setState((prev) => {
      if (!prev) return prev;
      const comment: Comment = {
        id: genId(`comment-${clashId}`),
        clashId,
        authorId,
        isi,
        createdAt: new Date().toISOString(),
      };
      return { ...prev, comments: [...prev.comments, comment] };
    });
  }, []);

  const updateProject = useCallback((patch: Partial<Pick<Project, "nama" | "kode">>) => {
    setState((prev) => (prev ? { ...prev, project: { ...prev.project, ...patch } } : prev));
  }, []);

  const createUser = useCallback((input: Pick<User, "nama" | "email" | "peran">): User => {
    let created!: User;
    setState((prev) => {
      const base = prev ?? loadInitial();
      created = { id: genId("user"), ...input, isActive: true };
      return { ...base, users: [...base.users, created] };
    });
    return created;
  }, []);

  const updateUser = useCallback(
    (id: string, patch: Partial<Pick<User, "nama" | "email" | "peran">>) => {
      setState((prev) =>
        prev ? { ...prev, users: prev.users.map((u) => (u.id === id ? { ...u, ...patch } : u)) } : prev
      );
    },
    []
  );

  const toggleUserActive = useCallback((id: string) => {
    setState((prev) =>
      prev
        ? { ...prev, users: prev.users.map((u) => (u.id === id ? { ...u, isActive: !u.isActive } : u)) }
        : prev
    );
  }, []);

  const createDiscipline = useCallback((input: Pick<Discipline, "kode" | "nama">): Discipline => {
    let created!: Discipline;
    setState((prev) => {
      const base = prev ?? loadInitial();
      created = { id: genId("disc"), ...input, isActive: true };
      return { ...base, disciplines: [...base.disciplines, created] };
    });
    return created;
  }, []);

  const updateDiscipline = useCallback(
    (id: string, patch: Partial<Pick<Discipline, "kode" | "nama">>) => {
      setState((prev) =>
        prev
          ? { ...prev, disciplines: prev.disciplines.map((d) => (d.id === id ? { ...d, ...patch } : d)) }
          : prev
      );
    },
    []
  );

  const toggleDisciplineActive = useCallback((id: string) => {
    setState((prev) =>
      prev
        ? {
            ...prev,
            disciplines: prev.disciplines.map((d) =>
              d.id === id ? { ...d, isActive: !d.isActive } : d
            ),
          }
        : prev
    );
  }, []);

  const createZone = useCallback((input: Pick<Zone, "nama" | "level">): Zone => {
    let created!: Zone;
    setState((prev) => {
      const base = prev ?? loadInitial();
      created = { id: genId("zone"), ...input, isActive: true };
      return { ...base, zones: [...base.zones, created] };
    });
    return created;
  }, []);

  const updateZone = useCallback((id: string, patch: Partial<Pick<Zone, "nama" | "level">>) => {
    setState((prev) =>
      prev ? { ...prev, zones: prev.zones.map((z) => (z.id === id ? { ...z, ...patch } : z)) } : prev
    );
  }, []);

  const toggleZoneActive = useCallback((id: string) => {
    setState((prev) =>
      prev
        ? { ...prev, zones: prev.zones.map((z) => (z.id === id ? { ...z, isActive: !z.isActive } : z)) }
        : prev
    );
  }, []);

  const createPriority = useCallback((input: Pick<Priority, "nama" | "bobot">): Priority => {
    let created!: Priority;
    setState((prev) => {
      const base = prev ?? loadInitial();
      created = { id: genId("pr"), ...input, isActive: true };
      return { ...base, priorities: [...base.priorities, created] };
    });
    return created;
  }, []);

  const updatePriority = useCallback((id: string, patch: Partial<Pick<Priority, "nama" | "bobot">>) => {
    setState((prev) =>
      prev
        ? { ...prev, priorities: prev.priorities.map((p) => (p.id === id ? { ...p, ...patch } : p)) }
        : prev
    );
  }, []);

  const togglePriorityActive = useCallback((id: string) => {
    setState((prev) =>
      prev
        ? {
            ...prev,
            priorities: prev.priorities.map((p) => (p.id === id ? { ...p, isActive: !p.isActive } : p)),
          }
        : prev
    );
  }, []);

  const updateStatus = useCallback(
    (id: string, patch: Partial<Pick<Status, "nama" | "isClosedState">>) => {
      setState((prev) =>
        prev
          ? { ...prev, statuses: prev.statuses.map((s) => (s.id === id ? { ...s, ...patch } : s)) }
          : prev
      );
    },
    []
  );

  const setNotificationPreference = useCallback(
    (userId: string, patch: Partial<Omit<NotificationPreference, "userId">>) => {
      setState((prev) => {
        if (!prev) return prev;
        const existing = prev.notificationPreferences.find((p) => p.userId === userId);
        const next: NotificationPreference = existing
          ? { ...existing, ...patch }
          : { userId, emailEnabled: true, whatsappEnabled: false, whatsappNumber: "", ...patch };
        return {
          ...prev,
          notificationPreferences: existing
            ? prev.notificationPreferences.map((p) => (p.userId === userId ? next : p))
            : [...prev.notificationPreferences, next],
        };
      });
    },
    []
  );

  const value = useMemo<DataContextValue>(
    () => ({
      project: state?.project ?? INITIAL_PROJECT,
      users: state?.users ?? [],
      disciplines: state?.disciplines ?? [],
      zones: state?.zones ?? [],
      statuses: state?.statuses ?? [],
      priorities: state?.priorities ?? [],
      clashes: state?.clashes ?? [],
      comments: state?.comments ?? [],
      auditLogs: state?.auditLogs ?? [],
      attachments: state?.attachments ?? [],
      notificationPreferences: state?.notificationPreferences ?? [],
      isLoading: state === null,
      attachmentPreviewUrls,
      createClash,
      updateClashField,
      bulkUpdateClashes,
      addComment,
      updateProject,
      createUser,
      updateUser,
      toggleUserActive,
      createDiscipline,
      updateDiscipline,
      toggleDisciplineActive,
      createZone,
      updateZone,
      toggleZoneActive,
      createPriority,
      updatePriority,
      togglePriorityActive,
      updateStatus,
      setNotificationPreference,
    }),
    [
      state,
      attachmentPreviewUrls,
      createClash,
      updateClashField,
      bulkUpdateClashes,
      addComment,
      updateProject,
      createUser,
      updateUser,
      toggleUserActive,
      createDiscipline,
      updateDiscipline,
      toggleDisciplineActive,
      createZone,
      updateZone,
      toggleZoneActive,
      createPriority,
      updatePriority,
      togglePriorityActive,
      updateStatus,
      setNotificationPreference,
    ]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
