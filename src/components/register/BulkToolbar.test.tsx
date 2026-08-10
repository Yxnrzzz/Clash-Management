import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BulkToolbar } from "./BulkToolbar";
import type { Priority, Status, User } from "@/lib/types";

const STATUSES: Status[] = [
  { id: "s-open", nama: "Open", urutan: 1, isClosedState: false },
  { id: "s-closed", nama: "Closed", urutan: 2, isClosedState: true },
];

const PRIORITIES: Priority[] = [{ id: "p-low", nama: "Low", bobot: 1, isActive: true }];

// BulkToolbar itself never filters this list — filtering to active Engineers
// (isAssignable) happens one level up in RegisterView before the prop
// reaches here. These tests only prove the toolbar renders exactly the
// list it's handed, neither adding nor dropping anyone.
const ASSIGNABLE_USERS: User[] = [
  {
    id: "u-eng-1",
    nama: "Budi Engineer",
    email: "budi@eps.dev",
    peran: "Engineer",
    isActive: true,
    mustChangePassword: false,
  },
];

function renderToolbar(overrides: Partial<Parameters<typeof BulkToolbar>[0]> = {}) {
  const onClear = vi.fn();
  const onApply = vi.fn();
  render(
    <BulkToolbar
      selectedCount={2}
      statuses={STATUSES}
      priorities={PRIORITIES}
      assignableUsers={ASSIGNABLE_USERS}
      onClear={onClear}
      onApply={onApply}
      {...overrides}
    />,
  );
  return { onClear, onApply };
}

describe("BulkToolbar", () => {
  it("renders exactly the assignable users it was given, nothing added or dropped", () => {
    renderToolbar();
    const assigneeSelect = screen.getByDisplayValue("Ubah assignee…");
    expect(assigneeSelect).toHaveTextContent("Budi Engineer");
    // Only one real user option, plus the two placeholder/unassign options.
    expect(assigneeSelect.querySelectorAll("option")).toHaveLength(3);
  });

  it('"Terapkan" is disabled until a change is selected', () => {
    renderToolbar();
    expect(screen.getByRole("button", { name: "Terapkan" })).toBeDisabled();

    fireEvent.change(screen.getByDisplayValue("Ubah status…"), {
      target: { value: "s-closed" },
    });
    expect(screen.getByRole("button", { name: "Terapkan" })).toBeEnabled();
  });

  it('"Batal pilih" calls onClear', () => {
    const { onClear } = renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: "Batal pilih" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("confirming applies exactly the changed fields, omitting untouched ones", async () => {
    const { onApply } = renderToolbar();

    fireEvent.change(screen.getByDisplayValue("Ubah status…"), {
      target: { value: "s-closed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Terapkan" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ya, terapkan" }));

    expect(onApply).toHaveBeenCalledWith({ statusId: "s-closed" });
  });

  it('picking "Batalkan penugasan" sends assigneeId: null, not omitted or undefined', async () => {
    const { onApply } = renderToolbar();

    fireEvent.change(screen.getByDisplayValue("Ubah assignee…"), {
      target: { value: "__unassign__" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Terapkan" }));
    fireEvent.click(screen.getByRole("button", { name: "Ya, terapkan" }));

    expect(onApply).toHaveBeenCalledWith({ assigneeId: null });
  });

  it("canceling the confirmation dialog does not call onApply", () => {
    const { onApply } = renderToolbar();

    fireEvent.change(screen.getByDisplayValue("Ubah status…"), {
      target: { value: "s-closed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Terapkan" }));
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });
});
