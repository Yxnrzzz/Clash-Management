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
import { apiGet, apiPatch, apiPost } from "./api/client";
import {
  disciplinePayload,
  newClashPayload,
  priorityPayload,
  projectPayload,
  statusPayload,
  toAuditLog,
  toClash,
  toComment,
  toDiscipline,
  toPriority,
  toProject,
  toStatus,
  toUser,
  toZone,
  userPayload,
  zonePayload,
  type ClashFieldPatch,
} from "./api/mappers";
import type {
  ApiClash,
  ApiClashDetail,
  ApiComment,
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
 * Post-hybrid phase (Sprint 2-4): master data — project, users, disciplines,
 * zones, statuses, priorities — plus clashes, comments and audit logs are all
 * served by the NestJS API. Only attachments and notification preferences
 * still live in localStorage: attachments because object storage doesn't
 * exist yet (deferred, see HANDOFF.md), notification preferences because the
 * notifications module hasn't been built.
 *
 * Comments and audit logs are loaded lazily per clash via loadClashDetail()
 * rather than in the initial batch fetch — the list view never needs them,
 * only the detail page does.
 */

const STORAGE_KEY = "clashhub-data-v4";

/** How long a keystroke-driven edit waits before it is PATCHed to the server. */
const PATCH_DEBOUNCE_MS = 500;

const EMPTY_PROJECT: Project = { id: "", nama: "", kode: "" };

/** The half still persisted in the browser (no backend module yet). */
interface LocalState {
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
  clashes: Clash[];
  /** Populated lazily, clash by clash, via loadClashDetail(). */
  comments: Comment[];
  auditLogs: AuditLogEntry[];
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
  /** Fetches one clash's comments + audit log and merges them into context. */
  loadClashDetail: (clashId: string) => Promise<void>;

  createClash: (input: NewClashInput, reporterId: string) => Promise<Clash>;
  updateClashField: (
    clashId: string,
    field: ClashEditableField,
    newValue: string | null,
    actorId: string
  ) => Promise<void>;
  bulkUpdateClashes: (
    ids: string[],
    patch: Partial<Record<ClashEditableField, string | null>>,
    actorId: string
  ) => Promise<{ updated: number }>;
  addComment: (clashId: string, authorId: string, isi: string) => Promise<void>;

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
  return { attachments: [], notificationPreferences: [] };
}

/** Merges `incoming` into `existing` by id, incoming wins on conflict. */
function mergeById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const map = new Map(existing.map((item) => [item.id, item]));
  for (const item of incoming) map.set(item.id, item);
  return Array.from(map.values());
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
      const [project, users, disciplines, zones, statuses, priorities, clashes] =
        await Promise.all([
          apiGet<ApiProject>("/projects/current"),
          apiGet<ApiUser[]>("/users"),
          apiGet<ApiDiscipline[]>("/master-data/disciplines"),
          apiGet<ApiZone[]>("/master-data/zones"),
          apiGet<ApiStatus[]>("/master-data/statuses"),
          apiGet<ApiPriority[]>("/master-data/priorities"),
          apiGet<ApiClash[]>("/clashes"),
        ]);

      setMaster({
        project: toProject(project),
        users: users.map(toUser),
        disciplines: disciplines.map(toDiscipline),
        zones: zones.map(toZone),
        statuses: statuses.map(toStatus),
        priorities: priorities.map(toPriority),
        clashes: clashes.map(toClash),
        comments: [],
        auditLogs: [],
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

  // --- Clashes ---------------------------------------------------------------

  /**
   * Creates the clash on the server (which assigns uniqueCode, default
   * status, reporterId from the JWT, and writes the "created" audit row),
   * then attaches whatever files were staged locally. Attachments stay
   * client-only until object storage exists — see the Attachment type.
   */
  const createClash = useCallback(
    async (input: NewClashInput, reporterId: string): Promise<Clash> => {
      const createdApi = await runWrite(
        () => apiPost<ApiClash>("/clashes", newClashPayload(input)),
        (result) =>
          patchMaster((prev) => ({ ...prev, clashes: [toClash(result), ...prev.clashes] }))
      );
      const created = toClash(createdApi);

      const newPreviewUrls: Record<string, string> = {};
      const nowIso = new Date().toISOString();
      const newAttachments: Attachment[] = input.attachments.map((a, idx) => {
        const id = `att-${created.id}-${idx}`;
        if (a.file) newPreviewUrls[id] = URL.createObjectURL(a.file);
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

      if (newAttachments.length > 0) {
        setLocal((prev) => {
          const base = prev ?? loadInitialLocal();
          return { ...base, attachments: [...base.attachments, ...newAttachments] };
        });
      }
      if (Object.keys(newPreviewUrls).length) {
        setAttachmentPreviewUrls((prev) => ({ ...prev, ...newPreviewUrls }));
      }

      return created;
    },
    [patchMaster, runWrite]
  );

  const updateClashField = useCallback(
    async (
      clashId: string,
      field: ClashEditableField,
      newValue: string | null,
      _actorId: string
    ): Promise<void> => {
      // Actor is derived server-side from the JWT now; the parameter is kept
      // so call sites (which still pass user.id for clarity) don't change.
      void _actorId;
      const patch: ClashFieldPatch = { [field]: newValue };
      await runWrite(
        () => apiPatch<ApiClash>(`/clashes/${clashId}`, patch),
        (updated) =>
          patchMaster((prev) => ({
            ...prev,
            clashes: prev.clashes.map((c) => (c.id === clashId ? toClash(updated) : c)),
          }))
      );
    },
    [patchMaster, runWrite]
  );

  const bulkUpdateClashes = useCallback(
    async (
      ids: string[],
      patch: Partial<Record<ClashEditableField, string | null>>,
      _actorId: string
    ): Promise<{ updated: number }> => {
      void _actorId;
      const result = await runWrite(
        () => apiPost<{ updated: number }>("/clashes/bulk", { ids, patch }),
        () => {}
      );

      // Bulk can touch many rows at once — refetch the list rather than
      // reconstructing every changed field (and its audit label) locally.
      // Best-effort: the mutation above already succeeded, so a refetch
      // failure only means the UI is stale until the next reload, not that
      // the bulk update itself failed.
      try {
        const clashes = await apiGet<ApiClash[]>("/clashes");
        patchMaster((prev) => ({ ...prev, clashes: clashes.map(toClash) }));
      } catch (error) {
        setSyncError(messageOf(error));
      }

      return result;
    },
    [patchMaster, runWrite]
  );

  const addComment = useCallback(
    async (clashId: string, _authorId: string, isi: string): Promise<void> => {
      void _authorId;
      await runWrite(
        () => apiPost<ApiComment>(`/clashes/${clashId}/comments`, { content: isi }),
        (created) =>
          patchMaster((prev) => ({ ...prev, comments: [...prev.comments, toComment(created)] }))
      );
    },
    [patchMaster, runWrite]
  );

  const loadClashDetail = useCallback(
    async (clashId: string): Promise<void> => {
      try {
        const detail = await apiGet<ApiClashDetail>(`/clashes/${clashId}`);
        const comments = detail.comments.map(toComment);
        const auditLogs = detail.auditLogs.map(toAuditLog);
        patchMaster((prev) => ({
          ...prev,
          clashes: mergeById(prev.clashes, [toClash(detail)]),
          comments: mergeById(prev.comments, comments),
          auditLogs: mergeById(prev.auditLogs, auditLogs),
        }));
        setSyncError(null);
      } catch (error) {
        setSyncError(messageOf(error));
      }
    },
    [patchMaster]
  );

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
      clashes: master?.clashes ?? [],
      comments: master?.comments ?? [],
      auditLogs: master?.auditLogs ?? [],
      attachments: local?.attachments ?? [],
      notificationPreferences: local?.notificationPreferences ?? [],
      isLoading: local === null || !masterResolved,
      syncError,
      attachmentPreviewUrls,
      reloadMasterData,
      clearMasterData,
      loadClashDetail,
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
      loadClashDetail,
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
