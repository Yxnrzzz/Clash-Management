"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { useRequireAdmin } from "@/lib/use-require-admin";
import { useData } from "@/lib/data-context";
import { ApiError } from "@/lib/api/client";
import {
  addProjectMember,
  getProjectStats,
  listProjectMembers,
  listProjects,
  removeProjectMember,
} from "@/lib/api/projects";
import type { ApiProject, ApiProjectMember, ApiProjectStats } from "@/lib/api/types";
import { ConfirmCodeDialog } from "@/components/admin/ConfirmCodeDialog";

const projectSchema = z.object({
  nama: z.string().min(2, "Nama proyek minimal 2 karakter"),
  kode: z
    .string()
    .min(2, "Kode minimal 2 karakter")
    .max(6, "Kode maksimal 6 karakter")
    .regex(/^[A-Za-z0-9]+$/, "Kode hanya boleh huruf/angka"),
});

type FormValues = z.infer<typeof projectSchema>;
type FormErrors = Partial<Record<keyof FormValues, string>>;

export default function AdminProjectsPage() {
  const { user, isLoading } = useRequireAdmin();
  const {
    project,
    projects,
    users,
    createProject,
    updateProjectName,
    renameProjectCode,
    archiveProject,
    unarchiveProject,
    deleteProject,
  } = useData();
  const [values, setValues] = useState<FormValues>({ nama: project.nama, kode: project.kode });
  const [errors, setErrors] = useState<FormErrors>({});
  const [saved, setSaved] = useState(false);

  const [newValues, setNewValues] = useState<FormValues>({ nama: "", kode: "" });
  const [newErrors, setNewErrors] = useState<FormErrors>({});
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // The form (and membership list below) always reflects whichever project
  // is active — switching via the sidebar switcher should update this page.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resyncs the editable copy when the active project changes, not on every render
    setValues({ nama: project.nama, kode: project.kode });
  }, [project.id, project.nama, project.kode]);

  const [members, setMembers] = useState<ApiProjectMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");

  // --- Rename (code change) confirmation ------------------------------------

  const [renameDialogStats, setRenameDialogStats] = useState<ApiProjectStats | null>(null);
  const [renameChecking, setRenameChecking] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  // --- Archive panel ---------------------------------------------------------

  const [archivedProjects, setArchivedProjects] = useState<ApiProject[] | null>(null);
  const [archivePanelLoading, setArchivePanelLoading] = useState(false);
  const [archivePanelError, setArchivePanelError] = useState<string | null>(null);
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ project: ApiProject; stats: ApiProjectStats } | null>(
    null
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const reloadMembers = useCallback(async (projectId: string) => {
    if (!projectId) {
      setMembers([]);
      setMembersLoading(false);
      return;
    }
    setMembersLoading(true);
    try {
      const result = await listProjectMembers(projectId);
      setMembers(result);
      setMembersError(null);
    } catch (error) {
      setMembersError(error instanceof ApiError ? error.message : "Gagal memuat anggota proyek.");
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches the active project's members, same data-fetch-on-mount/change pattern as reloadMasterData
    void reloadMembers(project.id);
  }, [project.id, reloadMembers]);

  const loadArchivedProjects = useCallback(async () => {
    setArchivePanelLoading(true);
    try {
      const all = await listProjects({ includeArchived: true });
      setArchivedProjects(all.filter((p) => p.archivedAt !== null));
      setArchivePanelError(null);
    } catch (error) {
      setArchivePanelError(error instanceof ApiError ? error.message : "Gagal memuat proyek terarsip.");
    } finally {
      setArchivePanelLoading(false);
    }
  }, []);

  if (isLoading || !user) {
    return <div className="p-8 text-sm text-zinc-500">Memuat…</div>;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = projectSchema.safeParse(values);
    if (!result.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of result.error.issues) {
        fieldErrors[issue.path[0] as keyof FormValues] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});

    const nextKode = result.data.kode.toUpperCase();
    const kodeChanged = nextKode !== project.kode;
    const namaChanged = result.data.nama !== project.nama;

    if (!kodeChanged) {
      if (namaChanged) updateProjectName(result.data.nama);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      return;
    }

    // Code changes rewrite every clash's uniqueCode in this project — show
    // the admin how many before doing it, instead of silently rewriting.
    setRenameError(null);
    setRenameChecking(true);
    try {
      const stats = await getProjectStats(project.id);
      setRenameDialogStats(stats);
    } catch (error) {
      setRenameError(error instanceof ApiError ? error.message : "Gagal memuat statistik proyek.");
    } finally {
      setRenameChecking(false);
    }
  }

  async function handleConfirmRename() {
    const result = projectSchema.safeParse(values);
    if (!result.success) return;
    const nextKode = result.data.kode.toUpperCase();
    const namaChanged = result.data.nama !== project.nama;

    try {
      await renameProjectCode({ kode: nextKode, ...(namaChanged ? { nama: result.data.nama } : {}) });
      setRenameDialogStats(null);
      setRenameError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (error) {
      setRenameError(error instanceof ApiError ? error.message : "Gagal mengubah kode proyek.");
    }
  }

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    const result = projectSchema.safeParse(newValues);
    if (!result.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of result.error.issues) {
        fieldErrors[issue.path[0] as keyof FormValues] = issue.message;
      }
      setNewErrors(fieldErrors);
      return;
    }
    setNewErrors({});
    setCreating(true);
    setCreateError(null);
    try {
      await createProject({ nama: result.data.nama, kode: result.data.kode.toUpperCase() });
      setNewValues({ nama: "", kode: "" });
    } catch (error) {
      setCreateError(error instanceof ApiError ? error.message : "Gagal membuat proyek.");
    } finally {
      setCreating(false);
    }
  }

  const memberIds = new Set(members.map((m) => m.userId));
  const addableUsers = users.filter((u) => !memberIds.has(u.id));

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUserId) return;
    const targetUser = users.find((u) => u.id === selectedUserId);
    if (!targetUser) return;
    try {
      const result = await addProjectMember(project.id, {
        userId: targetUser.id,
        projectRole: targetUser.peran,
      });
      setMembers(result);
      setSelectedUserId("");
      setMembersError(null);
    } catch (error) {
      setMembersError(error instanceof ApiError ? error.message : "Gagal menambah anggota.");
    }
  }

  async function handleRemoveMember(userId: string) {
    try {
      const result = await removeProjectMember(project.id, userId);
      setMembers(result);
      setMembersError(null);
    } catch (error) {
      setMembersError(error instanceof ApiError ? error.message : "Gagal menghapus anggota.");
    }
  }

  async function handleArchiveActive() {
    if (!project.id) return;
    setBusyProjectId(project.id);
    setArchivePanelError(null);
    try {
      await archiveProject(project.id);
      if (archivedProjects !== null) await loadArchivedProjects();
    } catch (error) {
      setArchivePanelError(error instanceof ApiError ? error.message : "Gagal mengarsipkan proyek.");
    } finally {
      setBusyProjectId(null);
    }
  }

  async function handleUnarchive(id: string) {
    setBusyProjectId(id);
    setArchivePanelError(null);
    try {
      await unarchiveProject(id);
      await loadArchivedProjects();
    } catch (error) {
      setArchivePanelError(error instanceof ApiError ? error.message : "Gagal memulihkan proyek.");
    } finally {
      setBusyProjectId(null);
    }
  }

  async function handleOpenDeleteDialog(target: ApiProject) {
    setArchivePanelError(null);
    try {
      const stats = await getProjectStats(target.id);
      if (stats.totalClashCount > 0) {
        setArchivePanelError(
          `Proyek "${target.name}" masih punya ${stats.totalClashCount} clash (termasuk yang terhapus) dan tidak bisa dihapus permanen.`
        );
        return;
      }
      setDeleteTarget({ project: target, stats });
      setDeleteError(null);
    } catch (error) {
      setArchivePanelError(error instanceof ApiError ? error.message : "Gagal memuat statistik proyek.");
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteProject(deleteTarget.project.id);
      setDeleteTarget(null);
      setDeleteError(null);
      await loadArchivedProjects();
    } catch (error) {
      setDeleteError(error instanceof ApiError ? error.message : "Gagal menghapus proyek.");
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-xl font-semibold text-zinc-900">Pengaturan Proyek</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Mengelola proyek aktif: <span className="font-medium text-zinc-700">{project.nama || "—"}</span>.
        Ganti proyek aktif lewat pemilih di sidebar. Kode proyek dipakai sebagai awalan kode unik clash
        (mis. {values.kode || "MCA"}-MEP-0001).
      </p>

      {projects.length === 0 && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 ring-1 ring-inset ring-amber-200">
          Belum ada proyek. Buat proyek baru lewat form di bawah sebelum mengelola anggotanya di sini.
        </p>
      )}

      <form
        onSubmit={handleCreateProject}
        className="mt-6 space-y-4 rounded-2xl border border-zinc-200 bg-white p-5"
      >
        <h2 className="text-sm font-semibold text-zinc-700">Buat Proyek Baru</h2>
        {createError && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
            {createError}
          </div>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Nama Proyek</label>
          <input
            value={newValues.nama}
            onChange={(e) => setNewValues((v) => ({ ...v, nama: e.target.value }))}
            placeholder="mis. Menara Sentosa — Tower C"
            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${
              newErrors.nama ? "border-red-300 focus:ring-red-200" : "border-zinc-300 focus:ring-zinc-300"
            }`}
          />
          {newErrors.nama && <p className="mt-1 text-xs text-red-600">{newErrors.nama}</p>}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Kode Proyek</label>
          <input
            value={newValues.kode}
            onChange={(e) => setNewValues((v) => ({ ...v, kode: e.target.value.toUpperCase() }))}
            placeholder="mis. MST"
            className={`w-full max-w-xs rounded-lg border px-3 py-2 text-sm font-mono outline-none focus:ring-2 ${
              newErrors.kode ? "border-red-300 focus:ring-red-200" : "border-zinc-300 focus:ring-zinc-300"
            }`}
          />
          {newErrors.kode && <p className="mt-1 text-xs text-red-600">{newErrors.kode}</p>}
          <p className="mt-1 text-xs text-zinc-400">
            Dipakai sebagai awalan kode unik clash (mis. {newValues.kode || "MST"}-MEP-0001). Proyek baru
            langsung jadi proyek aktif, belum punya disiplin/zona/anggota — lengkapi lewat &quot;Salin dari
            proyek lain&quot; di Master Data dan form anggota di bawah.
          </p>
        </div>
        <button
          type="submit"
          disabled={creating}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {creating ? "Membuat…" : "Buat Proyek"}
        </button>
      </form>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="mt-6 space-y-4 rounded-2xl border border-zinc-200 bg-white p-5"
      >
        {saved && (
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-200">
            Perubahan tersimpan.
          </div>
        )}
        {renameError && !renameDialogStats && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
            {renameError}
          </div>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Nama Proyek</label>
          <input
            value={values.nama}
            onChange={(e) => setValues((v) => ({ ...v, nama: e.target.value }))}
            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${
              errors.nama ? "border-red-300 focus:ring-red-200" : "border-zinc-300 focus:ring-zinc-300"
            }`}
          />
          {errors.nama && <p className="mt-1 text-xs text-red-600">{errors.nama}</p>}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Kode Proyek</label>
          <input
            value={values.kode}
            onChange={(e) => setValues((v) => ({ ...v, kode: e.target.value.toUpperCase() }))}
            className={`w-full max-w-xs rounded-lg border px-3 py-2 text-sm font-mono outline-none focus:ring-2 ${
              errors.kode ? "border-red-300 focus:ring-red-200" : "border-zinc-300 focus:ring-zinc-300"
            }`}
          />
          {errors.kode && <p className="mt-1 text-xs text-red-600">{errors.kode}</p>}
          <p className="mt-1 text-xs text-zinc-400">
            Mengubah kode akan menulis ulang kode_unik SEMUA clash proyek ini (termasuk yang terhapus).
          </p>
        </div>
        <button
          type="submit"
          disabled={!project.id || renameChecking}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {renameChecking ? "Memeriksa…" : "Simpan"}
        </button>
      </form>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-700">Anggota Proyek</h2>
        <p className="mt-1 text-xs text-zinc-400">
          Hanya user yang terdaftar di sini (atau berperan Coordinator/Management/Admin, yang otomatis
          lintas-proyek) yang bisa mengakses data proyek ini.
        </p>

        {membersError && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{membersError}</p>
        )}

        <form onSubmit={(e) => void handleAddMember(e)} className="mt-4 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[12rem]">
            <label className="mb-1 block text-xs font-medium text-zinc-500">Tambah user</label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
            >
              <option value="">Pilih user…</option>
              {addableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nama} ({u.peran})
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={!selectedUserId}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Tambah
          </button>
        </form>

        <div className="mt-4 divide-y divide-zinc-100 border-t border-zinc-100">
          {membersLoading ? (
            <p className="py-3 text-sm text-zinc-400">Memuat anggota…</p>
          ) : members.length === 0 ? (
            <p className="py-3 text-sm text-zinc-400">Belum ada anggota eksplisit untuk proyek ini.</p>
          ) : (
            members.map((m) => (
              <div key={m.userId} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium text-zinc-800">{m.name}</p>
                  <p className="text-xs text-zinc-400">
                    {m.email} · {m.projectRole}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRemoveMember(m.userId)}
                  className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Hapus
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-700">Arsip Proyek</h2>
        <p className="mt-1 text-xs text-zinc-400">
          Proyek yang diarsipkan hilang dari pemilih proyek dan tidak bisa diakses, tapi datanya tetap
          tersimpan dan bisa dipulihkan kapan saja. Hapus permanen hanya bisa dilakukan pada proyek yang
          sudah tidak punya clash sama sekali.
        </p>

        {archivePanelError && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{archivePanelError}</p>
        )}

        {project.id && (
          <div className="mt-4 flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-zinc-800">
                {project.nama} <span className="font-mono text-xs text-zinc-500">({project.kode})</span>
              </p>
              <p className="text-xs text-zinc-400">Proyek aktif saat ini</p>
            </div>
            <button
              type="button"
              onClick={() => void handleArchiveActive()}
              disabled={busyProjectId === project.id}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busyProjectId === project.id ? "Mengarsipkan…" : "Arsipkan"}
            </button>
          </div>
        )}

        {archivedProjects === null ? (
          <button
            type="button"
            onClick={() => void loadArchivedProjects()}
            disabled={archivePanelLoading}
            className="mt-4 text-sm font-medium text-zinc-700 underline hover:text-zinc-900"
          >
            {archivePanelLoading ? "Memuat…" : "Lihat proyek terarsip"}
          </button>
        ) : archivedProjects.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-400">Tidak ada proyek terarsip.</p>
        ) : (
          <div className="mt-4 divide-y divide-zinc-100 border-t border-zinc-100">
            {archivedProjects.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium text-zinc-800">
                    {p.name} <span className="font-mono text-xs text-zinc-500">({p.code})</span>
                  </p>
                  <p className="text-xs text-zinc-400">
                    Diarsipkan {p.archivedAt ? new Date(p.archivedAt).toLocaleDateString("id-ID") : "-"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleUnarchive(p.id)}
                    disabled={busyProjectId === p.id}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busyProjectId === p.id ? "Memulihkan…" : "Pulihkan"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleOpenDeleteDialog(p)}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Hapus permanen
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {renameDialogStats && (
        <ConfirmCodeDialog
          title="Ubah kode proyek?"
          description={
            <>
              Kode proyek akan berubah dari <strong className="font-mono">{project.kode}</strong> ke{" "}
              <strong className="font-mono">{values.kode.toUpperCase()}</strong>. Ini akan menulis ulang
              kode_unik pada <strong>{renameDialogStats.totalClashCount} clash</strong>
              {renameDialogStats.deletedClashCount > 0
                ? ` (termasuk ${renameDialogStats.deletedClashCount} yang terhapus)`
                : ""}
              . Setiap perubahan kode dicatat di riwayat masing-masing clash.
            </>
          }
          codeToType={values.kode.toUpperCase()}
          confirmLabel="Ya, ubah kode"
          confirmingLabel="Mengubah…"
          tone="warning"
          error={renameError}
          onCancel={() => {
            setRenameDialogStats(null);
            setRenameError(null);
          }}
          onConfirm={handleConfirmRename}
        />
      )}

      {deleteTarget && (
        <ConfirmCodeDialog
          title="Hapus proyek permanen?"
          description={
            <>
              Proyek <strong>{deleteTarget.project.name}</strong> ({deleteTarget.project.code}) akan
              dihapus permanen beserta disiplin, zona, dan keanggotaannya. Tindakan ini tidak bisa
              dibatalkan.
            </>
          }
          codeToType={deleteTarget.project.code}
          confirmLabel="Ya, hapus permanen"
          confirmingLabel="Menghapus…"
          tone="danger"
          error={deleteError}
          onCancel={() => {
            setDeleteTarget(null);
            setDeleteError(null);
          }}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
}
