import type { Clash, Discipline, Priority, Status, Zone } from "./types";

export interface Slice {
  id: string;
  label: string;
  value: number;
}

export interface TrendPoint {
  weekStart: string;
  label: string;
  dibuat: number;
  ditutup: number;
}

export interface DashboardMetrics {
  totalClash: number;
  openCount: number;
  closedCount: number;
  overdueCount: number;
  mttrDays: number | null;
  trend: TrendPoint[];
  byDiscipline: Slice[];
  byPriority: Slice[];
  byZone: Slice[];
}

export type RangePreset = "30d" | "90d" | "1y" | "all";

export const RANGE_PRESETS: { id: RangePreset; label: string }[] = [
  { id: "30d", label: "30 hari" },
  { id: "90d", label: "90 hari" },
  { id: "1y", label: "1 tahun" },
  { id: "all", label: "Semua" },
];

function startOfWeek(date: Date) {
  const d = new Date(date);
  const dayFromMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayFromMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Exported so api/mappers.ts can format the weekStart the backend's
// /clashes/metrics endpoint returns without duplicating the Intl formatter —
// locale-specific presentation stays out of the API contract.
export const WEEK_LABEL = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" });

/**
 * Resolves the active window. An explicit from/to always wins over the preset,
 * so a custom range set in the UI is never silently overridden.
 */
export function resolveRange(preset: RangePreset, from: string, to: string) {
  const now = new Date();
  const end = to ? new Date(to + "T23:59:59") : now;
  if (from) return { start: new Date(from), end };

  switch (preset) {
    case "30d":
      return { start: addDays(end, -30), end };
    case "90d":
      return { start: addDays(end, -90), end };
    case "1y":
      return { start: addDays(end, -365), end };
    case "all":
    default:
      return { start: null as Date | null, end };
  }
}

function countBy(clashes: Clash[], key: keyof Clash, source: { id: string; label: string }[]): Slice[] {
  const counts = new Map<string, number>();
  for (const c of clashes) {
    const id = c[key] as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return source.map((s) => ({ id: s.id, label: s.label, value: counts.get(s.id) ?? 0 }));
}

export interface MasterDataForMetrics {
  statuses: Status[];
  disciplines: Discipline[];
  priorities: Priority[];
  zones: Zone[];
}

export function computeMetrics(
  allClashes: Clash[],
  range: { start: Date | null; end: Date },
  masterData: MasterDataForMetrics
): DashboardMetrics {
  const clashes = allClashes.filter((c) => {
    const created = new Date(c.createdAt);
    if (range.start && created < range.start) return false;
    return created <= range.end;
  });

  const statusMap = new Map(masterData.statuses.map((s) => [s.id, s]));
  const now = Date.now();

  let closedCount = 0;
  let overdueCount = 0;
  let resolutionMsTotal = 0;
  let resolvedForMttr = 0;

  for (const c of clashes) {
    const status = statusMap.get(c.statusId);
    const closed = status?.isClosedState ?? false;
    if (closed) closedCount++;
    const overdue = !closed && Boolean(c.dueDate) && new Date(c.dueDate as string).getTime() < now;
    if (overdue) overdueCount++;
    if (closed && c.closedAt) {
      resolutionMsTotal += new Date(c.closedAt).getTime() - new Date(c.createdAt).getTime();
      resolvedForMttr++;
    }
  }

  // Weekly buckets span the data actually in range, so the axis never shows
  // empty leading/trailing weeks that imply data we do not have.
  const trend: TrendPoint[] = [];
  if (clashes.length > 0) {
    const timestamps = clashes.map((c) => new Date(c.createdAt).getTime());
    const firstWeek = startOfWeek(new Date(Math.min(...timestamps)));
    const lastWeek = startOfWeek(range.end);
    const buckets = new Map<string, TrendPoint>();

    for (let w = new Date(firstWeek); w <= lastWeek; w = addDays(w, 7)) {
      const key = w.toISOString().slice(0, 10);
      buckets.set(key, { weekStart: key, label: WEEK_LABEL.format(w), dibuat: 0, ditutup: 0 });
    }

    for (const c of clashes) {
      const createdKey = startOfWeek(new Date(c.createdAt)).toISOString().slice(0, 10);
      const createdBucket = buckets.get(createdKey);
      if (createdBucket) createdBucket.dibuat++;

      if (c.closedAt) {
        const closedKey = startOfWeek(new Date(c.closedAt)).toISOString().slice(0, 10);
        const closedBucket = buckets.get(closedKey);
        if (closedBucket) closedBucket.ditutup++;
      }
    }
    trend.push(...buckets.values());
  }

  return {
    totalClash: clashes.length,
    openCount: clashes.length - closedCount,
    closedCount,
    overdueCount,
    mttrDays:
      resolvedForMttr > 0
        ? Math.round((resolutionMsTotal / resolvedForMttr / 86_400_000) * 10) / 10
        : null,
    trend,
    byDiscipline: countBy(
      clashes,
      "disciplineId",
      masterData.disciplines.map((d) => ({ id: d.id, label: d.kode }))
    ),
    byPriority: countBy(
      clashes,
      "priorityId",
      // Sorted by weight so the ordinal color ramp (light -> dark) always
      // lines up with Low -> Critical, even if an admin adds a priority.
      [...masterData.priorities].sort((a, b) => a.bobot - b.bobot).map((p) => ({ id: p.id, label: p.nama }))
    ),
    byZone: countBy(
      clashes,
      "zoneId",
      masterData.zones.map((z) => ({ id: z.id, label: `${z.level} · ${z.nama}` }))
    ),
  };
}
