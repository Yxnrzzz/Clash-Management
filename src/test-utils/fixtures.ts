import type { Project, User } from "@/lib/types";

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "u1",
    nama: "Test User",
    email: "test@example.com",
    peran: "Engineer",
    isActive: true,
    mustChangePassword: false,
    ...overrides,
  };
}

export function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "p1",
    nama: "Project One",
    kode: "P1",
    ...overrides,
  };
}
