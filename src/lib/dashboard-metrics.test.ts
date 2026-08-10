import { describe, expect, it } from "vitest";
import { computeMetrics, resolveRange, type MasterDataForMetrics } from "./dashboard-metrics";
import type { Clash } from "./types";

const masterData: MasterDataForMetrics = {
  statuses: [
    { id: "open", nama: "Open", urutan: 1, isClosedState: false },
    { id: "closed", nama: "Closed", urutan: 2, isClosedState: true },
  ],
  disciplines: [
    { id: "arc", kode: "ARC", nama: "Architecture", isActive: true },
    { id: "str", kode: "STR", nama: "Structure", isActive: true },
  ],
  priorities: [
    { id: "low", nama: "Low", bobot: 1, isActive: true },
    { id: "high", nama: "High", bobot: 2, isActive: true },
  ],
  zones: [{ id: "z1", nama: "Zone A", level: "L1", isActive: true }],
};

function makeClash(overrides: Partial<Clash>): Clash {
  return {
    id: "c1",
    kodeUnik: "CLH-001",
    projectId: "p1",
    judul: "Test",
    deskripsi: "",
    disciplineId: "arc",
    zoneId: "z1",
    statusId: "open",
    priorityId: "low",
    reporterId: "u1",
    assigneeId: null,
    dueDate: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    closedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe("resolveRange", () => {
  it("prefers an explicit from over the preset", () => {
    const { start, end } = resolveRange("30d", "2026-01-01", "2026-01-31");
    expect(start).toEqual(new Date("2026-01-01"));
    expect(end).toEqual(new Date("2026-01-31T23:59:59"));
  });

  it("computes a 30d window back from end when no from is given", () => {
    const { start, end } = resolveRange("30d", "", "2026-01-31");
    expect(end).toEqual(new Date("2026-01-31T23:59:59"));
    expect(start).toEqual(new Date(end.getTime() - 30 * 86_400_000));
  });

  it("returns a null start for the all preset", () => {
    const { start } = resolveRange("all", "", "2026-01-31");
    expect(start).toBeNull();
  });
});

describe("computeMetrics", () => {
  const range = { start: null, end: new Date("2026-12-31T23:59:59") };

  it("excludes clashes created outside the range", () => {
    const inRange = makeClash({ id: "in", createdAt: "2026-01-01T00:00:00.000Z" });
    const outOfRange = makeClash({ id: "out", createdAt: "2099-01-01T00:00:00.000Z" });
    const metrics = computeMetrics([inRange, outOfRange], range, masterData);
    expect(metrics.totalClash).toBe(1);
  });

  it("splits open vs closed counts using status.isClosedState", () => {
    const clashes = [
      makeClash({ id: "a", statusId: "open" }),
      makeClash({ id: "b", statusId: "closed", closedAt: "2026-01-05T00:00:00.000Z" }),
    ];
    const metrics = computeMetrics(clashes, range, masterData);
    expect(metrics.totalClash).toBe(2);
    expect(metrics.openCount).toBe(1);
    expect(metrics.closedCount).toBe(1);
  });

  it("flags overdue only for open clashes with a past dueDate", () => {
    const clashes = [
      makeClash({ id: "overdue", statusId: "open", dueDate: "2020-01-01T00:00:00.000Z" }),
      makeClash({
        id: "closed-but-past-due",
        statusId: "closed",
        dueDate: "2020-01-01T00:00:00.000Z",
        closedAt: "2026-01-05T00:00:00.000Z",
      }),
      makeClash({ id: "no-due-date", statusId: "open", dueDate: null }),
    ];
    const metrics = computeMetrics(clashes, range, masterData);
    expect(metrics.overdueCount).toBe(1);
  });

  it("computes mttrDays as the average resolution time in days, rounded to 1 decimal", () => {
    const clashes = [
      makeClash({
        id: "a",
        statusId: "closed",
        createdAt: "2026-01-01T00:00:00.000Z",
        closedAt: "2026-01-03T00:00:00.000Z", // 2 days
      }),
      makeClash({
        id: "b",
        statusId: "closed",
        createdAt: "2026-01-01T00:00:00.000Z",
        closedAt: "2026-01-05T00:00:00.000Z", // 4 days
      }),
    ];
    const metrics = computeMetrics(clashes, range, masterData);
    expect(metrics.mttrDays).toBe(3);
  });

  it("returns null mttrDays when nothing has been resolved", () => {
    const metrics = computeMetrics([makeClash({ statusId: "open" })], range, masterData);
    expect(metrics.mttrDays).toBeNull();
  });

  it("buckets counts by discipline, priority (sorted by bobot), and zone", () => {
    const clashes = [
      makeClash({ id: "a", disciplineId: "arc", priorityId: "low" }),
      makeClash({ id: "b", disciplineId: "arc", priorityId: "high" }),
      makeClash({ id: "c", disciplineId: "str", priorityId: "high" }),
    ];
    const metrics = computeMetrics(clashes, range, masterData);

    expect(metrics.byDiscipline).toEqual([
      { id: "arc", label: "ARC", value: 2 },
      { id: "str", label: "STR", value: 1 },
    ]);
    expect(metrics.byPriority).toEqual([
      { id: "low", label: "Low", value: 1 },
      { id: "high", label: "High", value: 2 },
    ]);
    expect(metrics.byZone).toEqual([{ id: "z1", label: "L1 · Zone A", value: 3 }]);
  });
});
