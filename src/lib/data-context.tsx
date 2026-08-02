"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { generateSeedData } from "./mock-data";
import { apiGet, apiPatch, apiPost } from "./api/client";
import {
  disciplinePayload,
  priorityPayload,
  projectPayload,
  statusPayload,
  toDiscipline,
  toPriority,
  toProject,
  toStatus,
  toUser,
  toZone,
  userPayload,
  zonePayload,
} from "./api/mappers";
import type {
  ApiDiscipline,
  ApiPriority,
  ApiProject,
  ApiStatus,
  ApiUser,
  ApiZone,
} from "./api/types";
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

/**
 * Hybrid phase (Sprint 1): master data — project, users, disciplines, zones,
 * statuses, priorities — is served by the NestJS API, while clashes, comments,
 * audit logs, attachments and notification preferences still live in
 * localStorage until their modules exist on the backend.
 *
 * The two halves line up because the API seed uses the same ids as
 * mock-data.ts (`disc-ars`, `u-eng`, `st-open`, …), so a mock clash's
 * disciplineId still resolves against master data coming from the database.
 */

const STORAGE_KEY = "clashhub-data-v3";

/** How long a keystroke-driven edit waits before it is PATCHed to the server. */
const PATCH_DEBOUNCE_MS = 500;

const EMPTY_PROJECT: Project = { id: "", nama: "", kode: "" };

/** The half that is still persisted in the browser. */
interface LocalState {
  clashes: Clash[];
  comments: Comment[];
  auditLogs: AuditLogEntry[];
  attachments: Attachment[];
  notificationPreferences: NotificationPreference[];
}

/** The half that comes from the API. */
interface MasterState {
  project: Project;
  users: User[];
  disciplines: Discipline[];
  zones: Zone[];
  statuses: Status[];
  priorities: Priority[];
}

type ClashEditableField = "assigneeId" | "priorityId" | "dueDate" | "statusId";

interface DataContextValue extends LocalState, MasterState {
  isLoading: boolean;
  /** Last failed server write, if any — the optimistic edit has been rolled back. */
  syncError: string | null;
  /** Object URLs for attachments uploaded THIS session — never persisted
   * (blob: URLs and File objects cannot survive a reload without a real
   * backend). Attachments created in a previous session show no preview. */
  attachmentPreviewUrls: Record<string, string>;

  /** Called by AuthProvider once a session is established (or restored). */
  reloadMasterData: () => Promise<void>;
  /** Called by AuthProvider on sign-out or when no session could be restored. */
  clearMasterData: () => void;

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

  createUser: (input: Pick<User, "nama" | "email" | "peran">) => Promise<User>;
  updateUser: (id: string, patch: Partial<Pick<User, "nama" | "email" | "peran">>) => void;
  toggleUserActive: (id: string) => void;

  createDiscipline: (input: Pick<Discipline, "kode" | "nama">) => Promise<Discipline>;
  updateDiscipline: (id: string, patch: Partial<Pick<Discipline, "kode" | "nama">>) => void;
  toggleDisciplineActive: (id: string) => void;

  createZone: (input: Pick<Zone, "nama" | "level">) => Promise<Zone>;
  updateZone: (id: string, patch: Partial<Pick<Zone, "nama" | "level">>) => void;
  toggleZoneActive: (id: string) => void;

  createPriority: (input: Pick<Priority, "nama" | "bobot">) => Promise<Priority>;
  updatePriority: (id: string, patch: Partial<Pick<Priority, "nama" | "bobot">>) => void;
  togglePriorityActive: (id: string) => void;

  updateStatus: (id: string, patch: Partial<Pick<Status, "nama" | "isClosedState">>) => void;

  setNotificationPreference: (
    userId: string,
    patch: Partial<Omit<NotificationPreference, "userId">>
  ) => void;
}

const DataContext = createContext<DataContextValue | null>(null);

function loadInitialLocal(): LocalState {
  return { notificationPreferences: [], ...generateSeedData() };
}

function genId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Gagal menyimpan perubahan ke server.";
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [local, setLocal] = useState<LocalState | null>(null);
  const [master, setMaster] = useState<MasterState | null>(null);
  const [masterResolved, setMasterResolved] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [attachmentPreviewUrls, setAttachmentPreviewUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage, client-only
        setLocal(JSON.parse(raw) as LocalState);
        return;
      } catch {
        // fall through to seed
      }
    }
    setLocal(loadInitialLocal());
  }, []);

  useEffect(() => {
    if (local) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(local));
    }
  }, [local]);

  // Revoke object URLs on unmount so the browser can reclaim the memory.
  useEffect(() => {
    return () => {
      Object.values(attachmentPreviewUrls).forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Master data from the API --------------------------------------------

  const reloadMasterData = useCallback(async () => {
    try {
      const [project, users, disciplines, zones, statuses, priorities] = await Promise.all([
        apiGet<ApiProject>("/projects/current"),
        apiGet<ApiUser[]>("/users"),
        apiGet<ApiDiscipline[]>("/master-data/disciplines"),
        apiGet<ApiZone[]>("/master-data/zones"),
        apiGet<ApiStatus[]>("/master-data/statuses"),
        apiGet<ApiPriority[]>("/master-data/priorities"),
      ]);

      setMaster({
        project: toProject(project),
        users: users.map(toUser),
        disciplines: disciplines.map(toDiscipline),
        zones: zones.map(toZone),
        statuses: statuses.map(toStatus),
        priorities: priorities.map(toPriority),
      });
      setSyncError(null);
    } catch (error) {
      setSyncError(messageOf(error));
    } finally {
      setMasterResolved(true);
    }
  }, []);

  const clearMasterData = useCallback(() => {
    setMaster(null);
    setMasterResolved(true);
  }, []);

  /**
   * Master-data edits are driven by onChange handlers on text inputs, so a
   * request per keystroke is not an option. The optimistic update lands
   * immediately and the PATCH is coalesced and delayed — the same approach the
   * Register uses for its filter URL sync.
   */
  const pendingPatches = useRef(
    new Map<string, { timer: ReturnType<typeof setTimeout>; body: Record<string, unknown> }>()
  );

  useEffect(() => {
    const pending = pendingPatches.current;
    return () => {
      pending.forEach(({ timer }) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const schedulePatch = useCallback(
    (key: string, path: string, body: Record<string, unknown>) => {
      const existing = pendingPatches.current.get(key);
      if (existing) clearTimeout(existing.timer);

      const merged = { ...existing?.body, ...body };
      const timer = setTimeout(() => {
        pendingPatches.current.delete(key);
        apiPatch(path, merged).catch((error: unknown) => {
          setSyncError(messageOf(error));
          // Server rejected it — pull the truth back so the UI stops lying.
          void reloadMasterData();
        });
      }, PATCH_DEBOUNCE_MS);

      pendingPatches.current.set(key, { timer, body: merged });
    },
    [reloadMasterData]
  );

  /** Applies an immediate optimistic change to one master-data collection. */
  const patchMaster = useCallback((apply: (prev: MasterState) => MasterState) => {
    setMaster((prev) => (prev ? apply(prev) : prev));
  }, []);

  /** Fires a write straight away (no debounce) and syncs from the response. */
  const runWrite = useCallback(
    async <T,>(write: () => Promise<T>, onSuccess: (result: T) => void): Promise<T> => {
      try {
        const result = await write();
        onSuccess(result);
        setSyncError(null);
        return result;
      } catch (error) {
        setSyncError(messageOf(error));
        throw error;
      }
    },
    []
  );

  // --- Clashes (still local) ------------------------------------------------

  /**
   * Clashes live in localStorage but their codes and default status come from
   * API-backed master data. A ref keeps that reachable from the setLocal
   * updater without adding `master` to every callback's dependency list.
   */
  const masterRef = useRef<MasterState | null>(null);
  useEffect(() => {
    masterRef.current = master;
  }, [master]);

  const createClash = useCallback((input: NewClashInput, reporterId: string): Clash => {
    let created!: Clash;
    const newPreviewUrls: Record<string, string> = {};
    const currentMaster = masterRef.current;

    setLocal((prev) => {
      const base = prev ?? loadInitialLocal();
      const nowIso = new Date().toISOString();

      const discipline = currentMaster?.disciplines.find((d) => d.id === input.disciplineId);
      const countExisting = base.clashes.filter(
        (c) => c.disciplineId === input.disciplineId
      ).length;
      const projectKode = currentMaster?.project.kode ?? "";
      const kodeUnik = `${projectKode}-${discipline?.kode ?? "???"}-${String(
        countExisting + 1
      ).padStart(4, "0")}`;
      const openStatus = [...(currentMaster?.statuses ?? [])].sort(
        (a, b) => a.urutan - b.urutan
      )[0];

      created = {
        id: genId("clash"),
        kodeUnik,
        projectId: currentMaster?.project.id ?? "",
        judul: input.judul,
        deskripsi: input.deskripsi,
        disciplineId: input.disciplineId,
        zoneId: input.zoneId,
        statusId: openStatus?.id ?? "",
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
      setLocal((prev) => {
        if (!prev) return prev;
        const nowIso = new Date().toISOString();
        const { clashes, auditLogs } = applyClashPatch(
          prev.clashes,
          prev.auditLogs,
          masterRef.current?.statuses ?? [],
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
      setLocal((prev) => {
        if (!prev) return prev;
        const nowIso = new Date().toISOString();
        let clashes = prev.clashes;
        let auditLogs = prev.auditLogs;
        for (const id of ids) {
          const result = applyClashPatch(
            clashes,
            auditLogs,
            masterRef.current?.statuses ?? [],
            id,
            patch,
            actorId,
            nowIso
          );
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
    setLocal((prev) => {
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

  // --- Project --------------------------------------------------------------

  const updateProject = useCallback(
    (patch: Partial<Pick<Project, "nama" | "kode">>) => {
      let projectId = "";
      patchMaster((prev) => {
        projectId = prev.project.id;
        return { ...prev, project: { ...prev.project, ...patch } };
      });
      if (projectId) {
        schedulePatch(`project:${projectId}`, `/projects/${projectId}`, projectPayload(patch));
      }
    },
    [patchMaster, schedulePatch]
  );

  // --- Users ----------------------------------------------------------------

  const createUser = useCallback(
    (input: Pick<User, "nama" | "email" | "peran">): Promise<User> =>
      runWrite(
        () => apiPost<ApiUser>("/users", userPayload(input)),
        (created) =>
          patchMaster((prev) => ({ ...prev, users: [...prev.users, toUser(created)] }))
      ).then(toUser),
    [patchMaster, runWrite]
  );

  const updateUser = useCallback(
    (id: string, patch: Partial<Pick<User, "nama" | "email" | "peran">>) => {
      patchMaster((prev) => ({
        ...prev,
        users: prev.users.map((u) => (u.id === id ? { ...u, ...patch } : u)),
      }));
      schedulePatch(`user:${id}`, `/users/${id}`, userPayload(patch));
    },
    [patchMaster, schedulePatch]
  );

  const toggleUserActive = useCallback(
    (id: string) => {
      let next = false;
      patchMaster((prev) => ({
        ...prev,
        users: prev.users.map((u) => {
          if (u.id !== id) return u;
          next = !u.isActive;
          return { ...u, isActive: next };
        }),
      }));
      schedulePatch(`user-active:${id}`, `/users/${id}/active`, { isActive: next });
    },
    [patchMaster, schedulePatch]
  );

  // --- Disciplines ----------------------------------------------------------

  const createDiscipline = useCallback(
    (input: Pick<Discipline, "kode" | "nama">): Promise<Discipline> =>
      runWrite(
        () => apiPost<ApiDiscipline>("/master-data/disciplines", disciplinePayload(input)),
        (created) =>
          patchMaster((prev) => ({
            ...prev,
            disciplines: [...prev.disciplines, toDiscipline(created)],
          }))
      ).then(toDiscipline),
    [patchMaster, runWrite]
  );

  const updateDiscipline = useCallback(
    (id: string, patch: Partial<Pick<Discipline, "kode" | "nama">>) => {
      patchMaster((prev) => ({
        ...prev,
        disciplines: prev.disciplines.map((d) => (d.id === id ? { ...d, ...patch } : d)),
      }));
      schedulePatch(
        `discipline:${id}`,
        `/master-data/disciplines/${id}`,
        disciplinePayload(patch)
      );
    },
    [patchMaster, schedulePatch]
  );

  const toggleDisciplineActive = useCallback(
    (id: string) => {
      let next = false;
      patchMaster((prev) => ({
        ...prev,
        disciplines: prev.disciplines.map((d) => {
          if (d.id !== id) return d;
          next = !d.isActive;
          return { ...d, isActive: next };
        }),
      }));
      schedulePatch(`discipline-active:${id}`, `/master-data/disciplines/${id}/active`, {
        isActive: next,
      });
    },
    [patchMaster, schedulePatch]
  );

  // --- Zones ----------------------------------------------------------------

  const createZone = useCallback(
    (input: Pick<Zone, "nama" | "level">): Promise<Zone> =>
      runWrite(
        () => apiPost<ApiZone>("/master-data/zones", zonePayload(input)),
        (created) => patchMaster((prev) => ({ ...prev, zones: [...prev.zones, toZone(created)] }))
      ).then(toZone),
    [patchMaster, runWrite]
  );

  const updateZone = useCallback(
    (id: string, patch: Partial<Pick<Zone, "nama" | "level">>) => {
      patchMaster((prev) => ({
        ...prev,
        zones: prev.zones.map((z) => (z.id === id ? { ...z, ...patch } : z)),
      }));
      schedulePatch(`zone:${id}`, `/master-data/zones/${id}`, zonePayload(patch));
    },
    [patchMaster, schedulePatch]
  );

  const toggleZoneActive = useCallback(
    (id: string) => {
      let next = false;
      patchMaster((prev) => ({
        ...prev,
        zones: prev.zones.map((z) => {
          if (z.id !== id) return z;
          next = !z.isActive;
          return { ...z, isActive: next };
        }),
      }));
      schedulePatch(`zone-active:${id}`, `/master-data/zones/${id}/active`, { isActive: next });
    },
    [patchMaster, schedulePatch]
  );

  // --- Priorities -----------------------------------------------------------

  const createPriority = useCallback(
    (input: Pick<Priority, "nama" | "bobot">): Promise<Priority> =>
      runWrite(
        () => apiPost<ApiPriority>("/master-data/priorities", priorityPayload(input)),
        (created) =>
          patchMaster((prev) => ({ ...prev, priorities: [...prev.priorities, toPriority(created)] }))
      ).then(toPriority),
    [patchMaster, runWrite]
  );

  const updatePriority = useCallback(
    (id: string, patch: Partial<Pick<Priority, "nama" | "bobot">>) => {
      patchMaster((prev) => ({
        ...prev,
        priorities: prev.priorities.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      }));
      schedulePatch(`priority:${id}`, `/master-data/priorities/${id}`, priorityPayload(patch));
    },
    [patchMaster, schedulePatch]
  );

  const togglePriorityActive = useCallback(
    (id: string) => {
      let next = false;
      patchMaster((prev) => ({
        ...prev,
        priorities: prev.priorities.map((p) => {
          if (p.id !== id) return p;
          next = !p.isActive;
          return { ...p, isActive: next };
        }),
      }));
      schedulePatch(`priority-active:${id}`, `/master-data/priorities/${id}/active`, {
        isActive: next,
      });
    },
    [patchMaster, schedulePatch]
  );

  // --- Statuses -------------------------------------------------------------

  const updateStatus = useCallback(
    (id: string, patch: Partial<Pick<Status, "nama" | "isClosedState">>) => {
      patchMaster((prev) => ({
        ...prev,
        statuses: prev.statuses.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      }));
      schedulePatch(`status:${id}`, `/master-data/statuses/${id}`, statusPayload(patch));
    },
    [patchMaster, schedulePatch]
  );

  // --- Notification preferences (still local) -------------------------------

  const setNotificationPreference = useCallback(
    (userId: string, patch: Partial<Omit<NotificationPreference, "userId">>) => {
      setLocal((prev) => {
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
      project: master?.project ?? EMPTY_PROJECT,
      users: master?.users ?? [],
      disciplines: master?.disciplines ?? [],
      zones: master?.zones ?? [],
      statuses: master?.statuses ?? [],
      priorities: master?.priorities ?? [],
      clashes: local?.clashes ?? [],
      comments: local?.comments ?? [],
      auditLogs: local?.auditLogs ?? [],
      attachments: local?.attachments ?? [],
      notificationPreferences: local?.notificationPreferences ?? [],
      isLoading: local === null || !masterResolved,
      syncError,
      attachmentPreviewUrls,
      reloadMasterData,
      clearMasterData,
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
      local,
      master,
      masterResolved,
      syncError,
      attachmentPreviewUrls,
      reloadMasterData,
      clearMasterData,
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
