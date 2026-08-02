"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useRequireAuth } from "@/lib/use-require-auth";
import { useData } from "@/lib/data-context";
import {
  RANGE_PRESETS,
  resolveRange,
  type DashboardMetrics,
  type RangePreset,
  type Slice,
} from "@/lib/dashboard-metrics";
import { apiGet, ApiError } from "@/lib/api/client";
import { toDashboardMetrics } from "@/lib/api/mappers";
import type { ApiDashboardMetrics } from "@/lib/api/types";
import { ChartCard, formatNumber, LegendKey, StatTile, VizTooltip } from "./ChartPieces";
import { AXIS_TICK, VIZ } from "./viz-tokens";

interface DashFilters {
  preset: RangePreset;
  from: string;
  to: string;
}

const DEFAULT_DASH_FILTERS: DashFilters = { preset: "90d", from: "", to: "" };

function parseFromLocation(): DashFilters {
  if (typeof window === "undefined") return DEFAULT_DASH_FILTERS;
  const p = new URLSearchParams(window.location.search);
  const preset = (p.get("range") as RangePreset) ?? "90d";
  return {
    preset: RANGE_PRESETS.some((r) => r.id === preset) ? preset : "90d",
    from: p.get("from") ?? "",
    to: p.get("to") ?? "",
  };
}

function serialize(f: DashFilters) {
  const p = new URLSearchParams();
  if (f.preset !== "90d") p.set("range", f.preset);
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

const AXIS_LINE = { stroke: VIZ.axis };
const Y_TICK = { ...AXIS_TICK, style: { fontVariantNumeric: "tabular-nums" as const } };

export function DashboardView() {
  const { user, isLoading } = useRequireAuth();
  const { project, statuses } = useData();
  const router = useRouter();

  const openStatusQuery = useMemo(
    () => statuses.filter((s) => !s.isClosedState).map((s) => s.id).join(","),
    [statuses]
  );
  const closedStatusQuery = useMemo(
    () => statuses.filter((s) => s.isClosedState).map((s) => s.id).join(","),
    [statuses]
  );

  const [filters, setFilters] = useState<DashFilters>(DEFAULT_DASH_FILTERS);
  const [showTable, setShowTable] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from the URL, client-only
    setFilters(parseFromLocation());
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    const t = setTimeout(() => {
      window.history.replaceState(null, "", `${window.location.pathname}${serialize(filters)}`);
    }, 350);
    return () => clearTimeout(t);
  }, [filters]);

  // KPIs/trend/slices are computed server-side (see HANDOFF.md §12) — this
  // effect is the dashboard's only data fetch, debounced the same way the
  // URL sync above is so a burst of range-picker clicks coalesces into one
  // request.
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated.current) return;
    let cancelled = false;
    const timeout = setTimeout(() => {
      setMetricsLoading(true);
      const range = resolveRange(filters.preset, filters.from, filters.to);
      const params = new URLSearchParams();
      if (range.start) params.set("from", range.start.toISOString());
      params.set("to", range.end.toISOString());
      apiGet<ApiDashboardMetrics>(`/clashes/metrics?${params.toString()}`)
        .then((res) => {
          if (cancelled) return;
          setMetrics(toDashboardMetrics(res));
          setMetricsError(null);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setMetricsError(error instanceof ApiError ? error.message : "Gagal memuat data dashboard.");
        })
        .finally(() => {
          if (!cancelled) setMetricsLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [filters]);

  const drillTo = useCallback(
    (key: string) => (entry: unknown) => {
      const id = (entry as { id?: string } | undefined)?.id;
      if (id) router.push(`/register?${key}=${id}`);
    },
    [router]
  );

  if (isLoading || !user) {
    return <div className="p-8 text-sm text-zinc-500">Memuat…</div>;
  }

  // US-D1: dashboard is a management view. Engineers work from the register.
  if (user.peran === "Engineer") {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="text-lg font-semibold text-zinc-900">Dashboard tidak tersedia</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Dashboard manajemen hanya dapat diakses oleh peran Coordinator, Management, dan Admin.
        </p>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="p-8 text-sm text-zinc-500">
        {metricsError ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-red-600">{metricsError}</p>
        ) : (
          "Memuat…"
        )}
      </div>
    );
  }

  const sliceTable = (rows: Slice[]) => ({
    columns: ["Kategori", "Jumlah"],
    rows: rows.map((r) => [r.label, r.value] as (string | number)[]),
  });

  const isEmpty = metrics.totalClash === 0;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-1 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Dashboard Manajemen</h1>
        <span className="text-xs text-zinc-400">{metricsLoading ? "Memperbarui…" : "Read-only"}</span>
      </div>
      <p className="text-sm text-zinc-500">
        Ringkasan kesehatan proyek. Klik kartu atau batang chart untuk membuka register terfilter.
      </p>

      {/* One filter row above everything it scopes — never per-chart filters. */}
      <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            Proyek
          </label>
          <select
            value={project.id}
            disabled
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 disabled:opacity-70"
          >
            <option value={project.id}>
              {project.kode} — {project.nama}
            </option>
          </select>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">Rentang</p>
          <div className="flex flex-wrap gap-1.5">
            {RANGE_PRESETS.map((r) => {
              const active = !filters.from && !filters.to && filters.preset === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setFilters({ preset: r.id, from: "", to: "" })}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-300 bg-white text-zinc-600 hover:border-zinc-400"
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            Dari
          </label>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value }))}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            Sampai
          </label>
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value }))}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
          />
        </div>

        <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs font-medium text-zinc-600">
          <input
            type="checkbox"
            checked={showTable}
            onChange={(e) => setShowTable(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300"
          />
          Tampilkan tabel data
        </label>
      </div>

      {metricsError && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{metricsError}</p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Total clash" value={formatNumber(metrics.totalClash)} href="/register" />
        <StatTile
          label="Belum selesai"
          value={formatNumber(metrics.openCount)}
          caption="Open · In Progress · Resolved"
          href={`/register?stat=${openStatusQuery}`}
        />
        <StatTile
          label="Closed"
          value={formatNumber(metrics.closedCount)}
          href={`/register?stat=${closedStatusQuery}`}
        />
        <StatTile
          label="Overdue"
          value={formatNumber(metrics.overdueCount)}
          tone={metrics.overdueCount > 0 ? "critical" : "default"}
          caption="Lewat due date, belum ditutup"
          href="/register?overdue=1"
        />
        <StatTile
          label="Mean time to resolution"
          value={metrics.mttrDays === null ? "—" : `${metrics.mttrDays} hari`}
          caption="Rata-rata dibuat → ditutup"
        />
      </div>

      {isEmpty ? (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-12 text-center text-sm text-zinc-400">
          Tidak ada clash pada rentang tanggal ini.
        </div>
      ) : (
        <>
          <div className="mt-4">
            <ChartCard
              title="Tren penyelesaian"
              subtitle="Jumlah clash dibuat vs ditutup per minggu"
              showTable={showTable}
              table={{
                columns: ["Minggu", "Dibuat", "Ditutup"],
                rows: metrics.trend.map((t) => [t.label, t.dibuat, t.ditutup]),
              }}
            >
              <LegendKey
                items={[
                  { label: "Dibuat", color: VIZ.series1 },
                  { label: "Ditutup", color: VIZ.series2 },
                ]}
              />
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={metrics.trend} margin={{ top: 8, right: 16, bottom: 4, left: -12 }}>
                  <CartesianGrid stroke={VIZ.gridline} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={AXIS_TICK}
                    tickLine={false}
                    axisLine={AXIS_LINE}
                    minTickGap={16}
                  />
                  <YAxis tick={Y_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<VizTooltip />} cursor={{ stroke: VIZ.axis }} />
                  <Line
                    type="monotone"
                    dataKey="dibuat"
                    name="Dibuat"
                    isAnimationActive={false}
                    stroke={VIZ.series1}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={{ r: 4, fill: VIZ.series1, stroke: VIZ.surface, strokeWidth: 2 }}
                    activeDot={{ r: 5, fill: VIZ.series1, stroke: VIZ.surface, strokeWidth: 2 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="ditutup"
                    name="Ditutup"
                    isAnimationActive={false}
                    stroke={VIZ.series2}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={{ r: 4, fill: VIZ.series2, stroke: VIZ.surface, strokeWidth: 2 }}
                    activeDot={{ r: 5, fill: VIZ.series2, stroke: VIZ.surface, strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard
              title="Sebaran per disiplin"
              subtitle="Klik batang untuk membuka register terfilter"
              showTable={showTable}
              table={sliceTable(metrics.byDiscipline)}
            >
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={metrics.byDiscipline}
                  margin={{ top: 8, right: 16, bottom: 4, left: -12 }}
                >
                  <CartesianGrid stroke={VIZ.gridline} vertical={false} />
                  <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} />
                  <YAxis tick={Y_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<VizTooltip />} cursor={{ fill: "rgba(11,11,11,0.04)" }} />
                  <Bar
                    dataKey="value"
                    name="Clash"
                    isAnimationActive={false}
                    fill={VIZ.series1}
                    maxBarSize={24}
                    radius={[4, 4, 0, 0]}
                    cursor="pointer"
                    onClick={drillTo("disc")}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Sebaran per prioritas"
              subtitle="Warna menandai tingkat prioritas, Low → Critical"
              showTable={showTable}
              table={sliceTable(metrics.byPriority)}
            >
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={metrics.byPriority}
                  margin={{ top: 8, right: 16, bottom: 4, left: -12 }}
                >
                  <CartesianGrid stroke={VIZ.gridline} vertical={false} />
                  <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} />
                  <YAxis tick={Y_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<VizTooltip />} cursor={{ fill: "rgba(11,11,11,0.04)" }} />
                  <Bar
                    dataKey="value"
                    name="Clash"
                    isAnimationActive={false}
                    maxBarSize={24}
                    radius={[4, 4, 0, 0]}
                    cursor="pointer"
                    onClick={drillTo("prio")}
                  >
                    {metrics.byPriority.map((entry, i) => (
                      <Cell key={entry.id} fill={VIZ.priorityRamp[i] ?? VIZ.series1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="mt-4">
            <ChartCard
              title="Sebaran per zona"
              subtitle="Klik batang untuk membuka register terfilter"
              showTable={showTable}
              table={sliceTable(metrics.byZone)}
            >
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={metrics.byZone}
                  layout="vertical"
                  margin={{ top: 8, right: 24, bottom: 4, left: 0 }}
                >
                  <CartesianGrid stroke={VIZ.gridline} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={Y_TICK}
                    tickLine={false}
                    axisLine={AXIS_LINE}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tick={AXIS_TICK}
                    tickLine={false}
                    axisLine={false}
                    // Wide enough for the longest zone label on one line —
                    // at 110 Recharts wrapped "Lantai 3 · Zona Core" onto two.
                    width={150}
                  />
                  <Tooltip content={<VizTooltip />} cursor={{ fill: "rgba(11,11,11,0.04)" }} />
                  <Bar
                    dataKey="value"
                    name="Clash"
                    isAnimationActive={false}
                    fill={VIZ.series1}
                    maxBarSize={24}
                    radius={[0, 4, 4, 0]}
                    cursor="pointer"
                    onClick={drillTo("zone")}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
