import { describe, expect, it } from "vitest";
import { canComment, canEditClash, formatBytes, formatDate, formatDateTime, isAdmin } from "./lookup";
import type { Clash } from "./types";

function makeClash(overrides: Partial<Clash> = {}): Clash {
  return {
    id: "c1",
    kodeUnik: "CLH-001",
    projectId: "p1",
    judul: "Test clash",
    deskripsi: "",
    disciplineId: "d1",
    zoneId: "z1",
    statusId: "s1",
    priorityId: "pr1",
    reporterId: "reporter-1",
    assigneeId: "assignee-1",
    dueDate: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    closedAt: null,
    ...overrides,
  };
}

describe("formatDate", () => {
  it('returns "-" for null', () => {
    expect(formatDate(null)).toBe("-");
  });

  it("formats an ISO date", () => {
    expect(formatDate("2026-03-05T00:00:00.000Z")).toMatch(/2026/);
  });
});

describe("formatDateTime", () => {
  it('returns "-" for null', () => {
    expect(formatDateTime(null)).toBe("-");
  });

  it("formats an ISO datetime including time", () => {
    const formatted = formatDateTime("2026-03-05T10:30:00.000Z");
    expect(formatted).toMatch(/2026/);
  });
});

describe("formatBytes", () => {
  it("formats sub-MB sizes as KB", () => {
    expect(formatBytes(2048)).toBe("2 KB");
  });

  it("formats MB-and-above sizes as MB with one decimal", () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("canEditClash", () => {
  it("allows Coordinator regardless of ownership", () => {
    expect(canEditClash("Coordinator", makeClash(), "someone-else")).toBe(true);
  });

  it("allows Admin regardless of ownership", () => {
    expect(canEditClash("Admin", makeClash(), "someone-else")).toBe(true);
  });

  it("allows Engineer who is the assignee", () => {
    const clash = makeClash({ assigneeId: "user-1" });
    expect(canEditClash("Engineer", clash, "user-1")).toBe(true);
  });

  it("allows Engineer who is the reporter", () => {
    const clash = makeClash({ reporterId: "user-1", assigneeId: "someone-else" });
    expect(canEditClash("Engineer", clash, "user-1")).toBe(true);
  });

  it("denies Engineer who is neither reporter nor assignee", () => {
    const clash = makeClash({ reporterId: "a", assigneeId: "b" });
    expect(canEditClash("Engineer", clash, "user-1")).toBe(false);
  });

  it("denies Management", () => {
    expect(canEditClash("Management", makeClash(), "user-1")).toBe(false);
  });
});

describe("canComment", () => {
  it("denies Management", () => {
    expect(canComment("Management")).toBe(false);
  });

  it.each(["Engineer", "Coordinator", "Admin"] as const)("allows %s", (role) => {
    expect(canComment(role)).toBe(true);
  });
});

describe("isAdmin", () => {
  it("returns true only for Admin", () => {
    expect(isAdmin("Admin")).toBe(true);
    expect(isAdmin("Coordinator")).toBe(false);
  });
});
