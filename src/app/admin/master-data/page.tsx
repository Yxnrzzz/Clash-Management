"use client";

import { useEffect, useState } from "react";
import { useRequireAdmin } from "@/lib/use-require-admin";
import { useData } from "@/lib/data-context";
import { copyMasterDataTemplate, listProjects } from "@/lib/api/import";
import { ApiError } from "@/lib/api/client";
import type { ApiCopyTemplateResult, ApiProject } from "@/lib/api/types";

type Tab = "disiplin" | "zona" | "prioritas" | "status";

/**
 * Sprint 9's "template master data antar project" deliverable. ClashHub is
 * single-project today (no create/switch-project UI exists), so in practice
 * the source dropdown is often empty — the dialog says so plainly rather
 * than pretending. The endpoint itself (POST /master-data/templates/copy)
 * works for any two existing projects and is unit-tested independently.
 */
function CopyTemplateDialog({
  currentProjectId,
  onClose,
  onCopied,
}: {
  currentProjectId: string;
  onClose: () => void;
  onCopied: () => void;
}) {
  const [projects, setProjects] = useState<ApiProject[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fromProjectId, setFromProjectId] = useState("");
  const [includeDisciplines, setIncludeDisciplines] = useState(true);
  const [includeZones, setIncludeZones] = useState(true);
  const [isCopying, setIsCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiCopyTemplateResult | null>(null);

  useEffect(() => {
    listProjects()
      .then((all) => {
        setProjects(all);
        const firstOther = all.find((p) => p.id !== currentProjectId);
        if (firstOther) setFromProjectId(firstOther.id);
      })
      .catch(() => setLoadError("Gagal memuat daftar proyek."));
  }, [currentProjectId]);

  const otherProjects = (projects ?? []).filter((p) => p.id !== currentProjectId);

  async function handleCopy() {
    if (!fromProjectId) return;
    const include: ("disciplines" | "zones")[] = [
      ...(includeDisciplines ? (["disciplines"] as const) : []),
      ...(includeZones ? (["zones"] as const) : []),
    ];
    if (include.length === 0) return;

    setIsCopying(true);
    setCopyError(null);
    try {
      const copyResult = await copyMasterDataTemplate({
        fromProjectId,
        toProjectId: currentProjectId,
        include,
      });
      setResult(copyResult);
      onCopied();
    } catch (error) {
      setCopyError(error instanceof ApiError ? error.message : "Gagal menyalin master data.");
    } finally {
      setIsCopying(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 text-zinc-900 shadow-lg">
        <h2 className="text-base font-semibold">Salin master data dari proyek lain</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Menyalin disiplin/zona aktif dari proyek sumber ke proyek ini. Baris yang sudah ada (kode/nama
          sama) dilewati — aman dijalankan berulang.
        </p>

        {loadError && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{loadError}</p>
        )}

        {result ? (
          <div className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Disalin: {result.copied.disciplines} disiplin, {result.copied.zones} zona. Dilewati (sudah
            ada): {result.skipped.disciplines} disiplin, {result.skipped.zones} zona.
          </div>
        ) : (
          <>
            {projects && otherProjects.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">Belum ada proyek lain untuk disalin datanya.</p>
            ) : (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">Dari proyek</label>
                  <select
                    value={fromProjectId}
                    onChange={(e) => setFromProjectId(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
                  >
                    <option value="">-- pilih proyek sumber --</option>
                    {otherProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-4 text-sm text-zinc-700">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={includeDisciplines}
                      onChange={(e) => setIncludeDisciplines(e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-300"
                    />
                    Disiplin
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={includeZones}
                      onChange={(e) => setIncludeZones(e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-300"
                    />
                    Zona
                  </label>
                </div>
              </div>
            )}
            {copyError && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{copyError}</p>
            )}
          </>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {result ? "Tutup" : "Batal"}
          </button>
          {!result && (
            <button
              type="button"
              onClick={handleCopy}
              disabled={isCopying || !fromProjectId || (!includeDisciplines && !includeZones)}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-40"
            >
              {isCopying ? "Menyalin…" : "Salin"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
        active
          ? "bg-emerald-50 text-emerald-700 ring-emerald-300"
          : "bg-zinc-100 text-zinc-500 ring-zinc-300"
      }`}
    >
      {active ? "Aktif" : "Nonaktif"}
    </span>
  );
}

export default function AdminMasterDataPage() {
  const { user, isLoading } = useRequireAdmin();
  const {
    project,
    disciplines,
    zones,
    priorities,
    statuses,
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
    reloadMasterData,
  } = useData();

  const [tab, setTab] = useState<Tab>("disiplin");
  const [showCopyDialog, setShowCopyDialog] = useState(false);

  const [newDiscKode, setNewDiscKode] = useState("");
  const [newDiscNama, setNewDiscNama] = useState("");
  const [newZoneLevel, setNewZoneLevel] = useState("");
  const [newZoneNama, setNewZoneNama] = useState("");
  const [newPrioNama, setNewPrioNama] = useState("");
  const [newPrioBobot, setNewPrioBobot] = useState(1);

  if (isLoading || !user) {
    return <div className="p-8 text-sm text-zinc-500">Memuat…</div>;
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Master Data</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Kelola disiplin, zona, prioritas, dan status yang dipakai di seluruh clash register. (US-F1)
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCopyDialog(true)}
          className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          Salin dari proyek lain
        </button>
      </div>

      {showCopyDialog && (
        <CopyTemplateDialog
          currentProjectId={project.id}
          onClose={() => setShowCopyDialog(false)}
          onCopied={() => void reloadMasterData()}
        />
      )}

      <div className="mt-6 flex gap-2 border-b border-zinc-200">
        {(
          [
            ["disiplin", "Disiplin"],
            ["zona", "Zona"],
            ["prioritas", "Prioritas"],
            ["status", "Status"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === key
                ? "border-b-2 border-zinc-900 text-zinc-900"
                : "text-zinc-400 hover:text-zinc-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "disiplin" && (
        <div className="mt-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newDiscKode.trim() || !newDiscNama.trim()) return;
              // Failures land in syncError, which AppShell renders as a banner.
              createDiscipline({
                kode: newDiscKode.trim().toUpperCase(),
                nama: newDiscNama.trim(),
              }).catch(() => {});
              setNewDiscKode("");
              setNewDiscNama("");
            }}
            className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 bg-white p-4"
          >
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Kode</label>
              <input
                value={newDiscKode}
                onChange={(e) => setNewDiscKode(e.target.value)}
                placeholder="mis. LSC"
                className="w-28 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-zinc-600">Nama</label>
              <input
                value={newDiscNama}
                onChange={(e) => setNewDiscNama(e.target.value)}
                placeholder="mis. Lansekap"
                className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
              />
            </div>
            <button className="rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-zinc-800">
              Tambah
            </button>
          </form>

          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-3">Kode</th>
                  <th className="px-4 py-3">Nama</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {disciplines.map((d) => (
                  <tr key={d.id} className="border-b border-zinc-100 last:border-0">
                    <td className="px-4 py-3">
                      <input
                        value={d.kode}
                        onChange={(e) => updateDiscipline(d.id, { kode: e.target.value.toUpperCase() })}
                        className="w-24 rounded border border-transparent bg-transparent px-1.5 py-0.5 font-mono text-sm hover:border-zinc-200 focus:border-zinc-300 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        value={d.nama}
                        onChange={(e) => updateDiscipline(d.id, { nama: e.target.value })}
                        className="w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm hover:border-zinc-200 focus:border-zinc-300 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <ActiveBadge active={d.isActive} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => toggleDisciplineActive(d.id)}
                        className="text-xs font-medium text-zinc-500 hover:text-zinc-900 hover:underline"
                      >
                        {d.isActive ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "zona" && (
        <div className="mt-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newZoneLevel.trim() || !newZoneNama.trim()) return;
              createZone({ level: newZoneLevel.trim(), nama: newZoneNama.trim() }).catch(() => {});
              setNewZoneLevel("");
              setNewZoneNama("");
            }}
            className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 bg-white p-4"
          >
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Level</label>
              <input
                value={newZoneLevel}
                onChange={(e) => setNewZoneLevel(e.target.value)}
                placeholder="mis. Lantai 4"
                className="w-36 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-zinc-600">Zona</label>
              <input
                value={newZoneNama}
                onChange={(e) => setNewZoneNama(e.target.value)}
                placeholder="mis. Zona C"
                className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
              />
            </div>
            <button className="rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-zinc-800">
              Tambah
            </button>
          </form>

          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-3">Level</th>
                  <th className="px-4 py-3">Zona</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {zones.map((z) => (
                  <tr key={z.id} className="border-b border-zinc-100 last:border-0">
                    <td className="px-4 py-3">
                      <input
                        value={z.level}
                        onChange={(e) => updateZone(z.id, { level: e.target.value })}
                        className="w-32 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm hover:border-zinc-200 focus:border-zinc-300 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        value={z.nama}
                        onChange={(e) => updateZone(z.id, { nama: e.target.value })}
                        className="w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm hover:border-zinc-200 focus:border-zinc-300 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <ActiveBadge active={z.isActive} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => toggleZoneActive(z.id)}
                        className="text-xs font-medium text-zinc-500 hover:text-zinc-900 hover:underline"
                      >
                        {z.isActive ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "prioritas" && (
        <div className="mt-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newPrioNama.trim()) return;
              createPriority({ nama: newPrioNama.trim(), bobot: newPrioBobot }).catch(() => {});
              setNewPrioNama("");
              setNewPrioBobot(1);
            }}
            className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 bg-white p-4"
          >
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-zinc-600">Nama</label>
              <input
                value={newPrioNama}
                onChange={(e) => setNewPrioNama(e.target.value)}
                placeholder="mis. Blocker"
                className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Bobot</label>
              <input
                type="number"
                min={1}
                value={newPrioBobot}
                onChange={(e) => setNewPrioBobot(Number(e.target.value))}
                className="w-20 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
              />
            </div>
            <button className="rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-zinc-800">
              Tambah
            </button>
          </form>
          <p className="mb-3 text-xs text-zinc-400">
            Bobot lebih besar = prioritas lebih tinggi; dipakai untuk sortir register dan warna ramp
            dashboard.
          </p>

          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-3">Nama</th>
                  <th className="px-4 py-3">Bobot</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {[...priorities].sort((a, b) => a.bobot - b.bobot).map((p) => (
                  <tr key={p.id} className="border-b border-zinc-100 last:border-0">
                    <td className="px-4 py-3">
                      <input
                        value={p.nama}
                        onChange={(e) => updatePriority(p.id, { nama: e.target.value })}
                        className="w-40 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm hover:border-zinc-200 focus:border-zinc-300 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={1}
                        value={p.bobot}
                        onChange={(e) => updatePriority(p.id, { bobot: Number(e.target.value) })}
                        className="w-16 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm hover:border-zinc-200 focus:border-zinc-300 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <ActiveBadge active={p.isActive} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => togglePriorityActive(p.id)}
                        className="text-xs font-medium text-zinc-500 hover:text-zinc-900 hover:underline"
                      >
                        {p.isActive ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "status" && (
        <div className="mt-4">
          <p className="mb-3 text-xs text-zinc-400">
            Alur status (Open → In Progress → Resolved → Closed) bersifat tetap agar transisi RBAC dan
            perhitungan KPI tetap konsisten — Anda dapat mengubah label dan menandai status penutup, tapi
            tidak menambah/menghapus tahap.
          </p>
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-3">Urutan</th>
                  <th className="px-4 py-3">Nama</th>
                  <th className="px-4 py-3">Status Penutup?</th>
                </tr>
              </thead>
              <tbody>
                {[...statuses].sort((a, b) => a.urutan - b.urutan).map((s) => (
                  <tr key={s.id} className="border-b border-zinc-100 last:border-0">
                    <td className="px-4 py-3 text-sm text-zinc-500">{s.urutan}</td>
                    <td className="px-4 py-3">
                      <input
                        value={s.nama}
                        onChange={(e) => updateStatus(s.id, { nama: e.target.value })}
                        className="w-48 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm hover:border-zinc-200 focus:border-zinc-300 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-600">
                        <input
                          type="checkbox"
                          checked={s.isClosedState}
                          onChange={(e) => updateStatus(s.id, { isClosedState: e.target.checked })}
                          className="h-4 w-4 rounded border-zinc-300"
                        />
                        Menandai clash sebagai selesai (closed_at diisi otomatis)
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
