"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useRequireAuth } from "@/lib/use-require-auth";
import { useData } from "@/lib/data-context";
import { useMasterDataLookups } from "@/lib/use-master-data";
import { formatDate, isAssignable } from "@/lib/lookup";
import { exportClashesToExcel, exportClashesToPdf } from "@/lib/export";
import { apiGet, ApiError } from "@/lib/api/client";
import { toClash } from "@/lib/api/mappers";
import type {
  ApiClashListResponse,
  ApiClashReportResponse,
  ApiReportCapability,
} from "@/lib/api/types";
import type { Clash } from "@/lib/types";
import { PriorityBadge, StatusBadge, OverdueBadge } from "@/components/Badge";
import { FilterChipGroup } from "./FilterChips";
import { BulkToolbar } from "./BulkToolbar";

const PAGE_SIZE = 10;
/** Passed to buildQueryParams() for the export request too, but GET
 * /clashes/export ignores page/pageSize entirely — it returns every
 * matching row up to its own server-side cap (see ClashesService.export()).
 * Any value within the DTO's pageSize range works here; this just keeps
 * the request well-formed. */
const EXPORT_PAGE_SIZE = 500;

const SORTABLE_FIELDS = new Set([
  "kodeUnik",
  "judul",
  "status",
  "priority",
  "dueDate",
  "createdAt",
]);

type ListFilterKey = "disc" | "stat" | "prio" | "zone" | "assignee";

interface FiltersState {
  q: string;
  disc: string[];
  stat: string[];
  prio: string[];
  zone: string[];
  assignee: string[];
  cf: string;
  ct: string;
  overdue: boolean;
  sort: string;
  dir: "asc" | "desc";
  page: number;
}

const DEFAULT_FILTERS: FiltersState = {
  q: "",
  disc: [],
  stat: [],
  prio: [],
  zone: [],
  assignee: [],
  cf: "",
  ct: "",
  overdue: false,
  sort: "createdAt",
  dir: "desc",
  page: 1,
};

function parseListParam(params: URLSearchParams, key: string) {
  const raw = params.get(key);
  return raw ? raw.split(",").filter(Boolean) : [];
}

function parseFiltersFromLocation(): FiltersState {
  if (typeof window === "undefined") return DEFAULT_FILTERS;
  const params = new URLSearchParams(window.location.search);
  return {
    q: params.get("q") ?? "",
    disc: parseListParam(params, "disc"),
    stat: parseListParam(params, "stat"),
    prio: parseListParam(params, "prio"),
    zone: parseListParam(params, "zone"),
    assignee: parseListParam(params, "assignee"),
    cf: params.get("cf") ?? "",
    ct: params.get("ct") ?? "",
    overdue: params.get("overdue") === "1",
    sort: params.get("sort") ?? "createdAt",
    dir: (params.get("dir") as "asc" | "desc") ?? "desc",
    page: Number(params.get("page") ?? "1"),
  };
}

function serializeFilters(filters: FiltersState) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.disc.length) params.set("disc", filters.disc.join(","));
  if (filters.stat.length) params.set("stat", filters.stat.join(","));
  if (filters.prio.length) params.set("prio", filters.prio.join(","));
  if (filters.zone.length) params.set("zone", filters.zone.join(","));
  if (filters.assignee.length) params.set("assignee", filters.assignee.join(","));
  if (filters.cf) params.set("cf", filters.cf);
  if (filters.ct) params.set("ct", filters.ct);
  if (filters.overdue) params.set("overdue", "1");
  if (filters.sort !== "createdAt") params.set("sort", filters.sort);
  if (filters.dir !== "desc") params.set("dir", filters.dir);
  if (filters.page > 1) params.set("page", String(filters.page));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Same param names as serializeFilters(), but always explicit (no "only if
 * non-default" omission) since this is what the server actually reads. */
function buildQueryParams(filters: FiltersState, pageSize: number): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.disc.length) params.set("disc", filters.disc.join(","));
  if (filters.stat.length) params.set("stat", filters.stat.join(","));
  if (filters.prio.length) params.set("prio", filters.prio.join(","));
  if (filters.zone.length) params.set("zone", filters.zone.join(","));
  if (filters.assignee.length) params.set("assignee", filters.assignee.join(","));
  if (filters.cf) params.set("cf", filters.cf);
  if (filters.ct) params.set("ct", filters.ct);
  if (filters.overdue) params.set("overdue", "1");
  params.set("sort", filters.sort);
  params.set("dir", filters.dir);
  params.set("page", String(filters.page));
  params.set("pageSize", String(pageSize));
  return params;
}

const columnHelper = createColumnHelper<Clash>();

export function RegisterView() {
  const { user, isLoading } = useRequireAuth();
  const { project, bulkUpdateClashes } = useData();
  const {
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
  } = useMasterDataLookups();

  const canBulkEdit = user?.peran === "Coordinator" || user?.peran === "Admin";

  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const hydrated = useRef(false);

  useEffect(() => {
    const initial = parseFiltersFromLocation();
    setFilters(initial);
    setSearchInput(initial.q);
    hydrated.current = true;
  }, []);

  // URL sync is debounced and deliberately kept off the click path: Next.js
  // patches history.replaceState and dispatches router work on each call, so
  // firing it per chip click made rapid filtering janky. The URL still ends up
  // shareable, just a beat after the last change.
  useEffect(() => {
    if (!hydrated.current) return;
    const timeout = setTimeout(() => {
      const url = `${window.location.pathname}${serializeFilters(filters)}`;
      window.history.replaceState(null, "", url);
    }, 350);
    return () => clearTimeout(timeout);
  }, [filters]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setFilters((prev) => (prev.q === searchInput ? prev : { ...prev, q: searchInput, page: 1 }));
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const patchFilters = useCallback((patch: Partial<FiltersState>, resetPage = true) => {
    setFilters((prev) => ({ ...prev, ...patch, page: resetPage ? 1 : (patch.page ?? prev.page) }));
  }, []);

  const toggleListFilter = useCallback((key: ListFilterKey, id: string) => {
    setFilters((prev) => {
      const current = prev[key];
      const next = current.includes(id) ? current.filter((v) => v !== id) : [...current, id];
      // Only the touched key gets a new array identity, so the other chip
      // groups keep their props and skip re-rendering.
      return { ...prev, [key]: next, page: 1 };
    });
  }, []);

  const toggleDiscipline = useCallback((id: string) => toggleListFilter("disc", id), [toggleListFilter]);
  const toggleStatus = useCallback((id: string) => toggleListFilter("stat", id), [toggleListFilter]);
  const togglePriority = useCallback((id: string) => toggleListFilter("prio", id), [toggleListFilter]);
  const toggleZone = useCallback((id: string) => toggleListFilter("zone", id), [toggleListFilter]);
  const toggleAssignee = useCallback((id: string) => toggleListFilter("assignee", id), [toggleListFilter]);

  const handleSort = useCallback((field: string) => {
    setFilters((prev) =>
      prev.sort === field
        ? { ...prev, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { ...prev, sort: field, dir: "asc" }
    );
  }, []);

  const toggleOverdue = useCallback(() => {
    setFilters((prev) => ({ ...prev, overdue: !prev.overdue, page: 1 }));
  }, []);

  const { disc: disciplineIds, stat: statusIds, prio: priorityIds, zone: zoneIds, assignee: assigneeIds, cf: createdFrom, ct: createdTo, overdue: overdueOnly, sort: sortBy, dir: sortDir, page } = filters;

  // Filter chips show every discipline/zone/priority ever used — including
  // deactivated ones — so a coordinator can still find historical clashes
  // tagged under master data an admin later retired.
  const disciplineOptions = useMemo(
    () => disciplines.map((d) => ({ id: d.id, label: d.isActive ? d.kode : `${d.kode} (nonaktif)` })),
    [disciplines]
  );
  const statusOptions = useMemo(() => statuses.map((s) => ({ id: s.id, label: s.nama })), [statuses]);
  const priorityOptions = useMemo(
    () =>
      [...priorities]
        .sort((a, b) => a.bobot - b.bobot)
        .map((p) => ({ id: p.id, label: p.isActive ? p.nama : `${p.nama} (nonaktif)` })),
    [priorities]
  );
  const zoneOptions = useMemo(
    () =>
      zones.map((z) => ({
        id: z.id,
        label: z.isActive ? `${z.level} · ${z.nama}` : `${z.level} · ${z.nama} (nonaktif)`,
      })),
    [zones]
  );
  const assigneeOptions = useMemo(
    () =>
      users
        .filter((u) => u.peran === "Engineer")
        .map((u) => ({ id: u.id, label: u.isActive ? u.nama : `${u.nama} (nonaktif)` })),
    [users]
  );
  const assignableUsers = useMemo(() => users.filter(isAssignable), [users]);

  // Filtering, sorting, and pagination all happen server-side now (see
  // HANDOFF.md §12) — this effect is the Register's only data fetch. It's
  // debounced the same way the URL sync above is, so a burst of chip clicks
  // coalesces into one request instead of one per click.
  const [rows, setRows] = useState<Clash[]>([]);
  const [total, setTotal] = useState(0);
  const [isFetching, setIsFetching] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!hydrated.current) return;
    let cancelled = false;
    const timeout = setTimeout(() => {
      setIsFetching(true);
      const params = buildQueryParams(filters, PAGE_SIZE);
      apiGet<ApiClashListResponse>(`/clashes?${params.toString()}`)
        .then((res) => {
          if (cancelled) return;
          setRows(res.data.map(toClash));
          setTotal(res.total);
          setFetchError(null);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setFetchError(error instanceof ApiError ? error.message : "Gagal memuat data clash.");
        })
        .finally(() => {
          if (!cancelled) setIsFetching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [filters, reloadTick, project.id]);

  const currentPage = page;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pagedIds = useMemo(() => rows.map((c) => c.id), [rows]);
  const allOnPageSelected = pagedIds.length > 0 && pagedIds.every((id) => selectedIds.has(id));

  /** Same filters, unpaginated — used only when the user clicks Export. */
  const fetchAllMatching = useCallback(async (): Promise<Clash[]> => {
    const params = buildQueryParams(filters, EXPORT_PAGE_SIZE);
    params.set("page", "1");
    const res = await apiGet<ApiClashListResponse>(`/clashes/export?${params.toString()}`);
    return res.data.map(toClash);
  }, [filters]);

  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // --- Laporan clash (format konsultan) ---------------------------------
  //
  // Ditanya sekali saat mount, bukan disimpulkan dari kegagalan: tanpa ini
  // tombolnya tetap terlihat setelah CLASH_REPORT_ENABLED dimatikan dan
  // pengguna baru tahu setelah mengklik dan mendapat error. Gagal = tombol
  // disembunyikan (fail closed).
  const [reportEnabled, setReportEnabled] = useState(false);
  const [reportProgress, setReportProgress] = useState<{ done: number; total: number } | null>(null);
  const [reportSummary, setReportSummary] = useState<string | null>(null);
  const reportAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<ApiReportCapability>("/clashes/report/capability")
      .then((res) => {
        if (!cancelled) setReportEnabled(res.enabled);
      })
      .catch(() => {
        if (!cancelled) setReportEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleRowSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAllOnPage = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        pagedIds.forEach((id) => next.delete(id));
      } else {
        pagedIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [allOnPageSelected, pagedIds]);

  const columns = useMemo(
    () => [
      ...(canBulkEdit
        ? [
            columnHelper.display({
              id: "select",
              header: () => (
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={toggleSelectAllOnPage}
                  aria-label="Pilih semua di halaman ini"
                  className="h-4 w-4 rounded border-zinc-300"
                />
              ),
              cell: (info: { row: { original: Clash } }) => (
                <input
                  type="checkbox"
                  checked={selectedIds.has(info.row.original.id)}
                  onChange={() => toggleRowSelected(info.row.original.id)}
                  aria-label={`Pilih ${info.row.original.kodeUnik}`}
                  className="h-4 w-4 rounded border-zinc-300"
                  onClick={(e) => e.stopPropagation()}
                />
              ),
            }),
          ]
        : []),
      columnHelper.accessor("kodeUnik", {
        header: "Kode",
        cell: (info) => (
          <Link
            href={`/clashes/${info.row.original.id}`}
            className="font-mono text-xs font-semibold text-zinc-900 hover:underline"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      columnHelper.accessor("judul", {
        header: "Judul",
        cell: (info) => (
          <Link href={`/clashes/${info.row.original.id}`} className="hover:underline">
            <span className="line-clamp-1 text-sm text-zinc-800">{info.getValue()}</span>
          </Link>
        ),
      }),
      columnHelper.display({
        id: "disiplin",
        header: "Disiplin",
        cell: (info) => (
          <span className="text-sm text-zinc-600">
            {disciplineById(info.row.original.disciplineId)?.kode}
          </span>
        ),
      }),
      columnHelper.display({
        id: "zona",
        header: "Zona",
        cell: (info) => {
          const zone = zoneById(info.row.original.zoneId);
          return <span className="text-sm text-zinc-600">{zone ? `${zone.level} · ${zone.nama}` : "-"}</span>;
        },
      }),
      columnHelper.display({
        id: "status",
        header: "Status",
        cell: (info) => <StatusBadge status={statusById(info.row.original.statusId)} />,
      }),
      columnHelper.display({
        id: "priority",
        header: "Prioritas",
        cell: (info) => <PriorityBadge priority={priorityById(info.row.original.priorityId)} />,
      }),
      columnHelper.display({
        id: "assignee",
        header: "Assignee",
        cell: (info) => (
          <span className="text-sm text-zinc-600">
            {userById(info.row.original.assigneeId)?.nama ?? (
              <span className="italic text-zinc-400">Belum ditugaskan</span>
            )}
          </span>
        ),
      }),
      columnHelper.display({
        id: "dueDate",
        header: "Due Date",
        cell: (info) => {
          const clash = info.row.original;
          const overdue = isOverdue(clash);
          return (
            <div className="flex items-center gap-2">
              <span className={`text-sm ${overdue ? "font-semibold text-red-600" : "text-zinc-600"}`}>
                {formatDate(clash.dueDate)}
              </span>
              {overdue && <OverdueBadge />}
            </div>
          );
        },
      }),
      columnHelper.accessor("createdAt", {
        header: "Dibuat",
        cell: (info) => <span className="text-sm text-zinc-500">{formatDate(info.getValue())}</span>,
      }),
    ],
    [canBulkEdit, allOnPageSelected, toggleSelectAllOnPage, selectedIds, toggleRowSelected, disciplineById, zoneById, statusById, priorityById, userById, isOverdue]
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (isLoading || !user) {
    return <div className="p-8 text-sm text-zinc-500">Memuat…</div>;
  }

  const activeFilterCount =
    disciplineIds.length + statusIds.length + priorityIds.length + zoneIds.length + assigneeIds.length +
    (createdFrom ? 1 : 0) + (createdTo ? 1 : 0) + (overdueOnly ? 1 : 0);

  const exportLookups = { disciplineById, zoneById, statusById, priorityById, userById };
  const dateStamp = new Date().toISOString().slice(0, 10);

  async function handleExportExcel() {
    setIsExporting(true);
    setExportError(null);
    try {
      const all = await fetchAllMatching();
      exportClashesToExcel(all, exportLookups, `eps-workspace-register-${dateStamp}.xlsx`);
    } catch {
      setExportError("Gagal mengambil data untuk export. Periksa koneksi dan coba lagi.");
    } finally {
      setIsExporting(false);
    }
  }

  async function handleExportPdf() {
    setIsExporting(true);
    setExportError(null);
    try {
      const all = await fetchAllMatching();
      const closedCount = all.filter((c) => statusById(c.statusId)?.isClosedState).length;
      const overdueCount = all.filter((c) => isOverdue(c)).length;
      const resolved = all.filter((c) => c.closedAt);
      const mttrDays =
        resolved.length > 0
          ? Math.round(
              (resolved.reduce(
                (sum, c) => sum + (new Date(c.closedAt!).getTime() - new Date(c.createdAt).getTime()),
                0
              ) /
                resolved.length /
                86_400_000) *
                10
            ) / 10
          : null;
      exportClashesToPdf(
        all,
        exportLookups,
        { total: all.length, open: all.length - closedCount, closed: closedCount, overdue: overdueCount, mttrDays },
        project.nama,
        `eps-workspace-register-${dateStamp}.pdf`
      );
    } catch {
      setExportError("Gagal mengambil data untuk export. Periksa koneksi dan coba lagi.");
    } finally {
      setIsExporting(false);
    }
  }

  /**
   * Laporan format konsultan. Jauh lebih berat dari kedua export di atas —
   * setiap baris berarti browser mengunduh, mendekode, membakar markup, dan
   * mengencode ulang sampai dua gambar — jadi ini satu-satunya export dengan
   * progress dan pembatalan.
   */
  async function handleExportReport() {
    setIsExporting(true);
    setExportError(null);
    setReportSummary(null);
    setReportProgress(null);

    const controller = new AbortController();
    reportAbortRef.current = controller;

    try {
      const params = buildQueryParams(filters, EXPORT_PAGE_SIZE);
      params.set("page", "1");
      const res = await apiGet<ApiClashReportResponse>(`/clashes/report?${params.toString()}`);

      if (res.data.length === 0) {
        setExportError("Tidak ada data untuk diekspor dengan filter ini.");
        return;
      }

      // Peringatan SEBELUM menghabiskan menit-menit mengambil gambar, bukan
      // sesudah.
      if (res.total > res.data.length) {
        const proceed = window.confirm(
          `Filter ini cocok dengan ${res.total} clash, tapi laporan dibatasi ${res.maxRows} baris. ` +
            `Hanya ${res.data.length} baris teratas yang akan diekspor. Lanjutkan?`
        );
        if (!proceed) return;
      }

      const { collectImageTasks } = await import("@/lib/report/images");
      const imageCount = collectImageTasks(res.data).length;
      if (imageCount > 150) {
        const proceed = window.confirm(
          `Laporan ini berisi ${imageCount} gambar dan bisa memakan beberapa menit. Lanjutkan?`
        );
        if (!proceed) return;
      }

      const [{ fetchReportImages }, { buildClashReportWorkbook }, { downloadWorkbook, reportFilename }, { monthLabel }, ExcelJSModule] =
        await Promise.all([
          import("@/lib/report/images"),
          import("@/lib/report/workbook"),
          import("@/lib/report/download"),
          import("@/lib/report/layout"),
          import("exceljs"),
        ]);

      const { images, failed } = await fetchReportImages({
        rows: res.data,
        onProgress: (done, total) => setReportProgress({ done, total }),
        signal: controller.signal,
      });

      if (controller.signal.aborted) {
        setExportError("Export dibatalkan.");
        return;
      }

      setReportProgress(null);
      const workbook = buildClashReportWorkbook(
        ExcelJSModule.default ?? ExcelJSModule,
        res.data,
        images,
        {
          projectName: project.nama,
          monthLabel: monthLabel(filters.cf, filters.ct),
          zoneOrder: zones.map((z) => z.level),
        }
      );

      const bytes = await downloadWorkbook(workbook, reportFilename(project.kode));

      const untagged = res.data.filter((r) => !r.original && !r.clashDetection).length;
      const parts = [
        `${res.data.length} baris`,
        `${images.size} gambar tertanam`,
        // Laporan tanpa gambar bisa hanya puluhan KB; "0.0 MB" terbaca
        // seperti file gagal dibuat.
        bytes < 1024 * 1024
          ? `${Math.round(bytes / 1024)} KB`
          : `${(bytes / 1024 / 1024).toFixed(1)} MB`,
      ];
      if (failed.length > 0) parts.push(`${failed.length} gambar gagal dimuat`);
      if (untagged > 0) parts.push(`${untagged} clash belum ditandai lampirannya`);
      setReportSummary(parts.join(" · "));
    } catch (error) {
      if (controller.signal.aborted) setExportError("Export dibatalkan.");
      else if (error instanceof ApiError && error.status === 404) {
        setExportError("Fitur laporan clash sedang dimatikan.");
        setReportEnabled(false);
      } else {
        setExportError("Gagal membuat laporan. Periksa koneksi dan coba lagi.");
      }
    } finally {
      reportAbortRef.current = null;
      setReportProgress(null);
      setIsExporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Clash Register</h1>
          <p className="text-sm text-zinc-500">
            {total} item ditemukan
            {user.peran === "Management" && " · Mode baca-saja"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={isExporting}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
          >
            {isExporting ? "Mengekspor…" : "Export Excel"}
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isExporting}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
          >
            {isExporting ? "Mengekspor…" : "Export PDF"}
          </button>
          {reportEnabled && (
            <button
              type="button"
              onClick={handleExportReport}
              disabled={isExporting}
              title="Format konsultan: dikelompokkan per lantai, dengan kolom gambar Original dan Clash Detection"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
            >
              {isExporting ? "Mengekspor…" : "Export Laporan Clash"}
            </button>
          )}
          {user.peran !== "Management" && (
            <Link
              href="/clashes/new"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              + Input Clash Baru
            </Link>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center gap-3">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Cari kode, judul, atau deskripsi…"
            className="w-full max-w-sm rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
          />
          <button
            type="button"
            onClick={toggleOverdue}
            aria-pressed={overdueOnly}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              overdueOnly
                ? "border-red-600 bg-red-600 text-white"
                : "border-zinc-300 bg-white text-zinc-600 hover:border-zinc-400"
            }`}
          >
            Hanya overdue
          </button>
          {activeFilterCount > 0 && (
            <button
              onClick={() =>
                patchFilters({
                  disc: [],
                  stat: [],
                  prio: [],
                  zone: [],
                  assignee: [],
                  cf: "",
                  ct: "",
                  overdue: false,
                })
              }
              className="text-xs font-medium text-zinc-500 hover:text-zinc-800 hover:underline"
            >
              Bersihkan filter ({activeFilterCount})
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <FilterChipGroup
            label="Disiplin"
            options={disciplineOptions}
            selected={disciplineIds}
            onToggle={toggleDiscipline}
          />
          <FilterChipGroup
            label="Status"
            options={statusOptions}
            selected={statusIds}
            onToggle={toggleStatus}
          />
          <FilterChipGroup
            label="Prioritas"
            options={priorityOptions}
            selected={priorityIds}
            onToggle={togglePriority}
          />
          <FilterChipGroup
            label="Zona"
            options={zoneOptions}
            selected={zoneIds}
            onToggle={toggleZone}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FilterChipGroup
            label="Assignee"
            options={assigneeOptions}
            selected={assigneeIds}
            onToggle={toggleAssignee}
          />
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Dibuat dari
            </p>
            <input
              type="date"
              value={createdFrom}
              onChange={(e) => patchFilters({ cf: e.target.value })}
              className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
            />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Dibuat sampai
            </p>
            <input
              type="date"
              value={createdTo}
              onChange={(e) => patchFilters({ ct: e.target.value })}
              className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
            />
          </div>
        </div>
      </div>

      {exportError && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{exportError}</p>
      )}

      {/* Determinate, bukan spinner: pengguna berhak tahu apakah ini 10 detik
          atau 3 menit sebelum memutuskan menunggu. */}
      {reportProgress && (
        <div className="mb-4 flex items-center gap-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
          <span>
            Mengambil gambar {reportProgress.done}/{reportProgress.total}…
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200">
            <div
              className="h-full rounded-full bg-zinc-700 transition-all"
              style={{
                width: `${reportProgress.total ? (reportProgress.done / reportProgress.total) * 100 : 0}%`,
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => reportAbortRef.current?.abort()}
            className="shrink-0 text-xs font-semibold text-zinc-500 hover:text-red-600"
          >
            Batal
          </button>
        </div>
      )}

      {reportSummary && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Laporan selesai — {reportSummary}
        </p>
      )}

      {fetchError && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{fetchError}</p>
      )}

      {canBulkEdit && selectedIds.size > 0 && (
        <BulkToolbar
          selectedCount={selectedIds.size}
          statuses={statuses}
          priorities={priorities.filter((p) => p.isActive)}
          assignableUsers={assignableUsers}
          onClear={() => setSelectedIds(new Set())}
          onApply={async (patch) => {
            try {
              await bulkUpdateClashes(Array.from(selectedIds), patch, user.id);
              setSelectedIds(new Set());
              // bulkUpdateClashes doesn't touch any shared state (see
              // data-context.tsx) — this page owns refreshing its own page.
              setReloadTick((t) => t + 1);
            } catch {
              // Failure is already surfaced via the syncError banner
              // (AppShell); keep the selection so the user can retry.
            }
          }}
        />
      )}

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full border-collapse text-left">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-zinc-200 bg-zinc-50">
                {headerGroup.headers.map((header) => {
                  const sortField = SORTABLE_FIELDS.has(header.column.id) ? header.column.id : null;
                  return (
                    <th key={header.id} className="whitespace-nowrap px-4 py-3">
                      {sortField ? (
                        <button
                          onClick={() => handleSort(sortField)}
                          className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 hover:text-zinc-800"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sortBy === sortField && <span>{sortDir === "asc" ? "↑" : "↓"}</span>}
                        </button>
                      ) : (
                        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {isFetching && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-zinc-400">
                  Memuat…
                </td>
              </tr>
            )}
            {!isFetching && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-zinc-400">
                  Tidak ada clash yang cocok dengan filter saat ini.
                </td>
              </tr>
            )}
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="whitespace-nowrap px-4 py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-zinc-500">
        <span>
          Halaman {currentPage} dari {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            disabled={currentPage <= 1}
            onClick={() => patchFilters({ page: currentPage - 1 }, false)}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 font-medium disabled:opacity-40"
          >
            Sebelumnya
          </button>
          <button
            disabled={currentPage >= totalPages}
            onClick={() => patchFilters({ page: currentPage + 1 }, false)}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 font-medium disabled:opacity-40"
          >
            Berikutnya
          </button>
        </div>
      </div>
    </div>
  );
}
