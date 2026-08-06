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
import { apiGet, apiPatch, apiPost, apiUpload, setActiveProjectId } from "./api/client";
import {
  disciplinePayload,
  newClashPayload,
  notificationPreferencePayload,
  priorityPayload,
  projectPayload,
  statusPayload,
  toAttachment,
  toAuditLog,
  toClash,
  toComment,
  toDiscipline,
  toNotificationPreference,
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
  ApiAttachment,
  ApiClash,
  ApiClashDetail,
  ApiComment,
  ApiDiscipline,
  ApiNotificationPreference,
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
 * Nothing here is client-only anymore. Project, users, disciplines, zones,
 * statuses, priorities, clashes, comments, audit logs, attachments, and
 * notification preferences are all served by the NestJS API — the last of
 * these (notification preferences) moved off localStorage once the
 * notifications module shipped (see apps/api/src/notifications/). Attachment
 * files themselves live on disk behind the API (see apps/api/src/storage/);
 * the client never sees a filesystem path, only ids to upload/download
 * through.
 *
 * Comments, audit logs, and attachments are loaded lazily per clash via
 * loadClashDetail() rather than in the initial batch fetch — the list view
 * never needs them, only the detail page does.
 *
 * Clashes are NOT bulk-loaded here (see clashesById below) — Register,
 * Dashboard, "Clash Saya", and the detail page each fetch exactly what they
 * need directly from /clashes, since the whole point of server-side
 * filter/sort/pagination is to stop shipping every clash to the browser on
 * every login (see HANDOFF.md §12).
 */

/** How long a keystroke-driven edit waits before it is PATCHed to the server. */
const PATCH_DEBOUNCE_MS = 500;

/** Remembers the user's pick across reloads — see setActiveProject() below. */
const ACTIVE_PROJECT_STORAGE_KEY = "clashhub:activeProjectId";

const EMPTY_PROJECT: Project = { id: "", nama: "", kode: "" };

/** Everything comes from the API — this is the whole client-side state. */
interface MasterState {
  /** The project currently selected via the switcher — every project-scoped
   * fetch (disciplines/zones/clashes/import) is implicitly scoped to it via
   * the X-Project-Id header (see api/client.ts's setActiveProjectId()). */
  project: Project;
  /** Every project this user is a member of (Admin/Management/Coordinator:
   * every project) — the switcher's source list. */
  projects: Project[];
  users: User[];
  disciplines: Discipline[];
  zones: Zone[];
  statuses: Status[];
  priorities: Priority[];
  /**
   * A small on-demand cache, NOT the full clash list — populated by
   * loadClashDetail(), createClash(), and updateClashField() as pages touch
   * individual clashes. Register/Dashboard/"Clash Saya" fetch their own data
   * straight from /clashes and don't read this.
   */
  clashesById: Record<string, Clash>;
  /** Populated lazily, clash by clash, via loadClashDetail(). */
  comments: Comment[];
  auditLogs: AuditLogEntry[];
  attachments: Attachment[];
  notificationPreference: NotificationPreference | null;
}

type ClashEditableField = "assigneeId" | "priorityId" | "dueDate" | "statusId";

interface DataContextValue extends MasterState {
  isLoading: boolean;
  /** Last failed server write, if any — the optimistic edit has been rolled back. */
  syncError: string | null;

  /** Called by AuthProvider once a session is established (or restored). */
  reloadMasterData: () => Promise<void>;
  /** Called by AuthProvider on sign-out or when no session could be restored. */
  clearMasterData: () => void;
  /** Fetches one clash's comments + audit log and merges them into context. */
  loadClashDetail: (clashId: string) => Promise<void>;
  /** Switches the active project: persists the choice, updates the
   * X-Project-Id header, and reloads project-scoped master data. */
  setActiveProject: (projectId: string) => Promise<void>;

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

  /** Admin-only — creates the project and switches to it immediately (it
   * starts with no disciplines/zones/members for the admin to set up next). */
  createProject: (input: Pick<Project, "nama" | "kode">) => Promise<Project>;
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

  updateNotificationPreference: (
    patch: Partial<Omit<NotificationPreference, "userId">>
  ) => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

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
  const [master, setMaster] = useState<MasterState | null>(null);
  const [masterResolved, setMasterResolved] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // --- Master data from the API --------------------------------------------

  const reloadMasterData = useCallback(async () => {
    try {
      // /projects itself is never X-Project-Id-scoped (see ProjectsController),
      // so this list is safe to fetch before an active project is known — it
      // IS the source of which project(s) this user may pick.
      const [projectsApi, users, statuses, priorities, notificationPreference] = await Promise.all([
        apiGet<ApiProject[]>("/projects"),
        apiGet<ApiUser[]>("/users"),
        apiGet<ApiStatus[]>("/master-data/statuses"),
        apiGet<ApiPriority[]>("/master-data/priorities"),
        apiGet<ApiNotificationPreference>("/notification-preferences/me"),
      ]);

      const projects = projectsApi.map(toProject);
      const storedId =
        typeof window !== "undefined" ? window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY) : null;
      const activeProject = projects.find((p) => p.id === storedId) ?? projects[0] ?? EMPTY_PROJECT;

      setActiveProjectId(activeProject.id || null);
      if (typeof window !== "undefined" && activeProject.id) {
        window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, activeProject.id);
      }

      // Disciplines/zones are per-project; only fetch them once a project is
      // known (a user with zero project memberships gets neither).
      const [disciplines, zones] = activeProject.id
        ? await Promise.all([
            apiGet<ApiDiscipline[]>("/master-data/disciplines"),
            apiGet<ApiZone[]>("/master-data/zones"),
          ])
        : [[] as ApiDiscipline[], [] as ApiZone[]];

      setMaster({
        project: activeProject,
        projects,
        users: users.map(toUser),
        disciplines: disciplines.map(toDiscipline),
        zones: zones.map(toZone),
        statuses: statuses.map(toStatus),
        priorities: priorities.map(toPriority),
        clashesById: {},
        comments: [],
        auditLogs: [],
        attachments: [],
        notificationPreference: toNotificationPreference(notificationPreference),
      });
      setSyncError(null);
    } catch (error) {
      setSyncError(messageOf(error));
    } finally {
      setMasterResolved(true);
    }
  }, []);

  const clearMasterData = useCallback(() => {
    setActiveProjectId(null);
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
   * then uploads whatever files were staged locally to the same clash.
   */
  const createClash = useCallback(
    async (input: NewClashInput, _reporterId: string): Promise<Clash> => {
      void _reporterId;
      const createdApi = await runWrite(
        () => apiPost<ApiClash>("/clashes", newClashPayload(input)),
        (result) =>
          patchMaster((prev) => ({
            ...prev,
            clashesById: { ...prev.clashesById, [result.id]: toClash(result) },
          }))
      );
      const created = toClash(createdApi);

      const files = input.attachments.map((a) => a.file).filter((f): f is File => !!f);
      if (files.length > 0) {
        const formData = new FormData();
        for (const file of files) formData.append("files", file);
        await runWrite(
          () => apiUpload<ApiAttachment[]>(`/clashes/${created.id}/attachments`, formData),
          (createdAttachments) =>
            patchMaster((prev) => ({
              ...prev,
              attachments: mergeById(prev.attachments, createdAttachments.map(toAttachment)),
            }))
        );
      }

      return created;
    },
    [patchMaster, runWrite]
  );

  /** Fetches one clash's comments + audit log + attachments and merges them into context. */
  const loadClashDetail = useCallback(
    async (clashId: string): Promise<void> => {
      try {
        const detail = await apiGet<ApiClashDetail>(`/clashes/${clashId}`);
        const comments = detail.comments.map(toComment);
        const auditLogs = detail.auditLogs.map(toAuditLog);
        const attachments = detail.attachments.map(toAttachment);
        patchMaster((prev) => ({
          ...prev,
          clashesById: { ...prev.clashesById, [clashId]: toClash(detail) },
          comments: mergeById(prev.comments, comments),
          auditLogs: mergeById(prev.auditLogs, auditLogs),
          attachments: mergeById(prev.attachments, attachments),
        }));
        setSyncError(null);
      } catch (error) {
        setSyncError(messageOf(error));
      }
    },
    [patchMaster]
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
            clashesById: { ...prev.clashesById, [clashId]: toClash(updated) },
          }))
      );
      // The PATCH response is just the updated clash row — the server-side
      // AuditLog row it wrote isn't in it, so the Riwayat tab needs a
      // follow-up fetch to see the new entry without a manual reload.
      await loadClashDetail(clashId);
    },
    [patchMaster, runWrite, loadClashDetail]
  );

  /**
   * Bulk can touch many rows at once, and none of them are necessarily in
   * clashesById's small on-demand cache — so unlike the single-clash mutators
   * above, this doesn't try to patch local state. RegisterView owns the page
   * these ids came from and re-fetches it after this resolves.
   */
  const bulkUpdateClashes = useCallback(
    async (
      ids: string[],
      patch: Partial<Record<ClashEditableField, string | null>>,
      _actorId: string
    ): Promise<{ updated: number }> => {
      void _actorId;
      return runWrite(
        () => apiPost<{ updated: number }>("/clashes/bulk", { ids, patch }),
        () => {}
      );
    },
    [runWrite]
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

  // --- Project --------------------------------------------------------------

  /**
   * Switches the active project without a full reloadMasterData() — users/
   * statuses/priorities/notification prefs aren't project-scoped, so only
   * disciplines/zones need refetching. The on-demand clash caches are
   * cleared since they belonged to the previous project.
   */
  const setActiveProject = useCallback(
    async (projectId: string): Promise<void> => {
      const target = master?.projects.find((p) => p.id === projectId);
      if (!target || target.id === master?.project.id) return;

      setActiveProjectId(target.id);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, target.id);
      }

      try {
        const [disciplines, zones] = await Promise.all([
          apiGet<ApiDiscipline[]>("/master-data/disciplines"),
          apiGet<ApiZone[]>("/master-data/zones"),
        ]);
        patchMaster((prev) => ({
          ...prev,
          project: target,
          disciplines: disciplines.map(toDiscipline),
          zones: zones.map(toZone),
          clashesById: {},
          comments: [],
          auditLogs: [],
          attachments: [],
        }));
        setSyncError(null);
      } catch (error) {
        setSyncError(messageOf(error));
      }
    },
    [master, patchMaster]
  );

  const createProject = useCallback(
    (input: Pick<Project, "nama" | "kode">): Promise<Project> =>
      runWrite(
        () => apiPost<ApiProject>("/projects", projectPayload(input)),
        (created) => {
          const project = toProject(created);
          setActiveProjectId(project.id);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, project.id);
          }
          patchMaster((prev) => ({
            ...prev,
            project,
            projects: [...prev.projects, project],
            disciplines: [],
            zones: [],
            clashesById: {},
            comments: [],
            auditLogs: [],
            attachments: [],
          }));
        }
      ).then(toProject),
    [patchMaster, runWrite]
  );

  const updateProject = useCallback(
    (patch: Partial<Pick<Project, "nama" | "kode">>) => {
      let projectId = "";
      patchMaster((prev) => {
        projectId = prev.project.id;
        return {
          ...prev,
          project: { ...prev.project, ...patch },
          projects: prev.projects.map((p) => (p.id === projectId ? { ...p, ...patch } : p)),
        };
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

  // --- Notification preferences ----------------------------------------------

  const updateNotificationPreference = useCallback(
    async (patch: Partial<Omit<NotificationPreference, "userId">>): Promise<void> => {
      await runWrite(
        () =>
          apiPatch<ApiNotificationPreference>(
            "/notification-preferences/me",
            notificationPreferencePayload(patch)
          ),
        (updated) =>
          patchMaster((prev) => ({ ...prev, notificationPreference: toNotificationPreference(updated) }))
      );
    },
    [patchMaster, runWrite]
  );

  const value = useMemo<DataContextValue>(
    () => ({
      project: master?.project ?? EMPTY_PROJECT,
      projects: master?.projects ?? [],
      users: master?.users ?? [],
      disciplines: master?.disciplines ?? [],
      zones: master?.zones ?? [],
      statuses: master?.statuses ?? [],
      priorities: master?.priorities ?? [],
      clashesById: master?.clashesById ?? {},
      comments: master?.comments ?? [],
      auditLogs: master?.auditLogs ?? [],
      attachments: master?.attachments ?? [],
      notificationPreference: master?.notificationPreference ?? null,
      isLoading: !masterResolved,
      syncError,
      reloadMasterData,
      clearMasterData,
      loadClashDetail,
      setActiveProject,
      createClash,
      updateClashField,
      bulkUpdateClashes,
      addComment,
      createProject,
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
      updateNotificationPreference,
    }),
    [
      master,
      masterResolved,
      syncError,
      reloadMasterData,
      clearMasterData,
      loadClashDetail,
      setActiveProject,
      createClash,
      updateClashField,
      bulkUpdateClashes,
      addComment,
      createProject,
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
      updateNotificationPreference,
    ]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
