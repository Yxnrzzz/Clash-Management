import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AppShell } from "./AppShell";
import { useAuth } from "@/lib/auth-context";
import { useData } from "@/lib/data-context";
import { makeProject, makeUser } from "@/test-utils/fixtures";
import type { Project, User } from "@/lib/types";

// Mocked in this file (not a shared helper) so Vitest's compile-time hoist
// moves these calls above AppShell's own import of the real modules — a
// helper imported from elsewhere wouldn't get that hoisting guarantee,
// since ES module imports resolve before any of the helper's own code runs.
vi.mock("@/lib/auth-context", () => ({ useAuth: vi.fn() }));
vi.mock("@/lib/data-context", () => ({ useData: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/register",
  useRouter: () => ({ push: vi.fn() }),
}));

const mockedUseAuth = vi.mocked(useAuth);
const mockedUseData = vi.mocked(useData);

function setup(options: {
  user?: User | null;
  projects?: Project[];
  project?: Project;
  setActiveProject?: ReturnType<typeof vi.fn>;
  syncError?: string | null;
} = {}) {
  const projects = options.projects ?? [makeProject()];
  const project = options.project ?? projects[0] ?? { id: "", nama: "", kode: "" };
  const setActiveProject = options.setActiveProject ?? vi.fn();
  const logout = vi.fn().mockResolvedValue(undefined);

  mockedUseAuth.mockReturnValue({
    user: options.user === undefined ? makeUser() : options.user,
    logout,
  } as ReturnType<typeof useAuth>);

  mockedUseData.mockReturnValue({
    project,
    projects,
    setActiveProject,
    syncError: options.syncError ?? null,
  } as unknown as ReturnType<typeof useData>);

  return { setActiveProject, logout };
}

describe("AppShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the "EPS Workspace" title', () => {
    setup();
    render(<AppShell>content</AppShell>);
    expect(screen.getByText("EPS Workspace")).toBeInTheDocument();
  });

  it("renders only children, no chrome, when there is no signed-in user", () => {
    setup({ user: null });
    render(
      <AppShell>
        <p>bare content</p>
      </AppShell>,
    );
    expect(screen.getByText("bare content")).toBeInTheDocument();
    expect(screen.queryByText("EPS Workspace")).not.toBeInTheDocument();
  });

  it("shows a plain project name, not a switcher, when the user has only one project", () => {
    const projects = [makeProject({ id: "p1", nama: "Menara MCA", kode: "MCA" })];
    setup({ projects, project: projects[0] });
    render(<AppShell>content</AppShell>);

    expect(screen.getByText("Menara MCA")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Proyek aktif" })).not.toBeInTheDocument();
  });

  it("shows a switcher listing every project when the user belongs to more than one", () => {
    const projects = [
      makeProject({ id: "p1", nama: "Menara MCA", kode: "MCA" }),
      makeProject({ id: "p2", nama: "Gedung GSB", kode: "GSB" }),
    ];
    setup({ projects, project: projects[0] });
    render(<AppShell>content</AppShell>);

    const select = screen.getByRole("combobox", { name: "Proyek aktif" });
    expect(select).toHaveValue("p1");
    expect(screen.getByText("MCA — Menara MCA")).toBeInTheDocument();
    expect(screen.getByText("GSB — Gedung GSB")).toBeInTheDocument();
  });

  it("switching the project calls setActiveProject with the newly selected id", () => {
    const projects = [
      makeProject({ id: "p1", nama: "Menara MCA", kode: "MCA" }),
      makeProject({ id: "p2", nama: "Gedung GSB", kode: "GSB" }),
    ];
    const { setActiveProject } = setup({ projects, project: projects[0] });
    render(<AppShell>content</AppShell>);

    const select = screen.getByRole("combobox", { name: "Proyek aktif" });
    fireEvent.change(select, { target: { value: "p2" } });

    expect(setActiveProject).toHaveBeenCalledWith("p2");
  });

  it("shows the sync error banner when syncError is set", () => {
    setup({ syncError: "Network down" });
    render(<AppShell>content</AppShell>);
    expect(screen.getByRole("alert")).toHaveTextContent("Network down");
  });

  it("hides the sync error banner when syncError is null", () => {
    setup({ syncError: null });
    render(<AppShell>content</AppShell>);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
