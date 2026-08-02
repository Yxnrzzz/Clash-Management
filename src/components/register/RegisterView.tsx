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
import { DISCIPLINES, PRIORITIES, STATUSES, USERS, ZONES } from "@/lib/mock-data";
import {
  disciplineById,
  formatDate,
  isOverdue,
  priorityById,
  statusById,
  userById,
  zoneById,
} from "@/lib/lookup";
import type { Clash } from "@/lib/types";
import { PriorityBadge, StatusBadge, OverdueBadge } from "@/components/Badge";
import { FilterChipGroup } from "./FilterChips";

const PAGE_SIZE = 10;

// Derived once at module scope: these come from static master data, so
// rebuilding them per render would needlessly break memoization downstream.
const DISCIPLINE_OPTIONS = DISCIPLINES.map((d) => ({ id: d.id, label: d.kode }));
const STATUS_OPTIONS = STATUSES.map((s) => ({ id: s.id, label: s.nama }));
const PRIORITY_OPTIONS = PRIORITIES.map((p) => ({ id: p.id, label: p.nama }));
const ZONE_OPTIONS = ZONES.map((z) => ({ id: z.id, label: `${z.level} · ${z.nama}` }));
const ASSIGNEE_OPTIONS = USERS.map((u) => ({ id: u.id, label: u.nama }));

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

const columnHelper = createColumnHelper<Clash>();

export function RegisterView() {
  const { user, isLoading } = useRequireAuth();
  const { clashes } = useData();

  // Filters live entirely in client state — no Next.js router navigation on
  // every keystroke/click, only a cheap, non-blocking URL sync via the raw
  // History API so the view stays shareable/back-button friendly.
  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS);
  const [searchInput, setSearchInput] = useState("");
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

  const { q, disc: disciplineIds, stat: statusIds, prio: priorityIds, zone: zoneIds, assignee: assigneeIds, cf: createdFrom, ct: createdTo, overdue: overdueOnly, sort: sortBy, dir: sortDir, page } = filters;

  const filtered = useMemo(() => {
    let result = clashes.filter((c) => {
      if (disciplineIds.length && !disciplineIds.includes(c.disciplineId)) return false;
      if (statusIds.length && !statusIds.includes(c.statusId)) return false;
      if (priorityIds.length && !priorityIds.includes(c.priorityId)) return false;
      if (zoneIds.length && !zoneIds.includes(c.zoneId)) return false;
      if (assigneeIds.length && !(c.assigneeId && assigneeIds.includes(c.assigneeId))) return false;
      if (createdFrom && new Date(c.createdAt) < new Date(createdFrom)) return false;
      if (createdTo && new Date(c.createdAt) > new Date(createdTo + "T23:59:59")) return false;
      if (overdueOnly && !isOverdue(c)) return false;
      if (q) {
        const needle = q.toLowerCase();
        const haystack = `${c.kodeUnik} ${c.judul} ${c.deskripsi}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });

    result = [...result].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sortBy) {
        case "kodeUnik":
          av = a.kodeUnik;
          bv = b.kodeUnik;
          break;
        case "judul":
          av = a.judul;
          bv = b.judul;
          break;
        case "status":
          av = statusById(a.statusId)?.urutan ?? 0;
          bv = statusById(b.statusId)?.urutan ?? 0;
          break;
        case "priority":
          av = priorityById(a.priorityId)?.bobot ?? 0;
          bv = priorityById(b.priorityId)?.bobot ?? 0;
          break;
        case "dueDate":
          av = a.dueDate ?? "";
          bv = b.dueDate ?? "";
          break;
        case "createdAt":
        default:
          av = a.createdAt;
          bv = b.createdAt;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [
    clashes,
    disciplineIds,
    statusIds,
    priorityIds,
    zoneIds,
    assigneeIds,
    createdFrom,
    createdTo,
    overdueOnly,
    q,
    sortBy,
    sortDir,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const columns = useMemo(
    () => [
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
    []
  );

  const table = useReactTable({
    data: paged,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (isLoading || !user) {
    return <div className="p-8 text-sm text-zinc-500">Memuat…</div>;
  }

  const activeFilterCount =
    disciplineIds.length + statusIds.length + priorityIds.length + zoneIds.length + assigneeIds.length +
    (createdFrom ? 1 : 0) + (createdTo ? 1 : 0) + (overdueOnly ? 1 : 0);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Clash Register</h1>
          <p className="text-sm text-zinc-500">
            {filtered.length} item{filtered.length !== 1 ? "" : ""} ditemukan
            {user.peran === "Management" && " · Mode baca-saja"}
          </p>
        </div>
        {user.peran !== "Management" && (
          <Link
            href="/clashes/new"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            + Input Clash Baru
          </Link>
        )}
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
            options={DISCIPLINE_OPTIONS}
            selected={disciplineIds}
            onToggle={toggleDiscipline}
          />
          <FilterChipGroup
            label="Status"
            options={STATUS_OPTIONS}
            selected={statusIds}
            onToggle={toggleStatus}
          />
          <FilterChipGroup
            label="Prioritas"
            options={PRIORITY_OPTIONS}
            selected={priorityIds}
            onToggle={togglePriority}
          />
          <FilterChipGroup
            label="Zona"
            options={ZONE_OPTIONS}
            selected={zoneIds}
            onToggle={toggleZone}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FilterChipGroup
            label="Assignee"
            options={ASSIGNEE_OPTIONS}
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
            {paged.length === 0 && (
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
