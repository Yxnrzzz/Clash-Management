import { describe, expect, it } from "vitest";
import {
  allowedStatusTransitions,
  canComment,
  canEditClash,
  formatBytes,
  formatDate,
  formatDateTime,
  isAdmin,
  isAssignable,
} from "./lookup";
import type { Clash, Status, User } from "./types";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "u1",
    nama: "Test User",
    email: "test@example.com",
    peran: "Engineer",
    isActive: true,
    ...overrides,
  };
}

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

function makeStatus(overrides: Partial<Status> = {}): Status {
  return {
    id: "s1",
    nama: "Open",
    urutan: 1,
    isClosedState: false,
    ...overrides,
  };
}

const STATUSES: Status[] = [
  makeStatus({ id: "s-open", nama: "Open", urutan: 1, isClosedState: false }),
  makeStatus({ id: "s-inprogress", nama: "In Progress", urutan: 2, isClosedState: false }),
  makeStatus({ id: "s-closed", nama: "Closed", urutan: 3, isClosedState: true }),
];

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

describe("isAssignable", () => {
  it("allows an active Engineer", () => {
    expect(isAssignable(makeUser({ peran: "Engineer", isActive: true }))).toBe(true);
  });

  it("denies an inactive Engineer", () => {
    expect(isAssignable(makeUser({ peran: "Engineer", isActive: false }))).toBe(false);
  });

  it.each(["Coordinator", "Management", "Admin"] as const)("denies %s", (peran) => {
    expect(isAssignable(makeUser({ peran, isActive: true }))).toBe(false);
  });
});

describe("allowedStatusTransitions", () => {
  it.each(["Coordinator", "Admin"] as const)(
    "%s may move to any other status",
    (peran) => {
      const clash = makeClash({ statusId: "s-open" });
      expect(allowedStatusTransitions(STATUSES, peran, clash, "someone-else")).toEqual([
        "s-inprogress",
        "s-closed",
      ]);
    },
  );

  it("assigned Engineer may only move one step forward into a non-closed status", () => {
    const clash = makeClash({ statusId: "s-open", assigneeId: "user-1" });
    expect(allowedStatusTransitions(STATUSES, "Engineer", clash, "user-1")).toEqual([
      "s-inprogress",
    ]);
  });

  it("assigned Engineer cannot close an item, even one step forward", () => {
    const clash = makeClash({ statusId: "s-inprogress", assigneeId: "user-1" });
    expect(allowedStatusTransitions(STATUSES, "Engineer", clash, "user-1")).toEqual([]);
  });

  it("unassigned Engineer gets no transitions", () => {
    const clash = makeClash({ statusId: "s-open", assigneeId: "someone-else" });
    expect(allowedStatusTransitions(STATUSES, "Engineer", clash, "user-1")).toEqual([]);
  });

  it("Management gets no transitions", () => {
    const clash = makeClash({ statusId: "s-open", assigneeId: "user-1" });
    expect(allowedStatusTransitions(STATUSES, "Management", clash, "user-1")).toEqual([]);
  });

  it("returns an empty list when the clash's statusId isn't in master data", () => {
    const clash = makeClash({ statusId: "s-unknown" });
    expect(allowedStatusTransitions(STATUSES, "Admin", clash, "user-1")).toEqual([]);
  });

  it("checks isClosedState, not the status name — renaming 'Closed' can't open a loophole", () => {
    const statuses = [
      makeStatus({ id: "s-open", nama: "Open", urutan: 1, isClosedState: false }),
      // Renamed away from "Closed" but still flagged as a closed state.
      makeStatus({ id: "s-done", nama: "Selesai", urutan: 2, isClosedState: true }),
    ];
    const clash = makeClash({ statusId: "s-open", assigneeId: "user-1" });
    expect(allowedStatusTransitions(statuses, "Engineer", clash, "user-1")).toEqual([]);
  });
});
