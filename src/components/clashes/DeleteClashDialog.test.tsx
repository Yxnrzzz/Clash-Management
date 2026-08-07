import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DeleteClashDialog } from "./DeleteClashDialog";

function renderDialog(overrides: Partial<Parameters<typeof DeleteClashDialog>[0]> = {}) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(
    <DeleteClashDialog kodeUnik="MCA-ARS-0001" onCancel={onCancel} onConfirm={onConfirm} {...overrides} />
  );
  return { onCancel, onConfirm };
}

describe("DeleteClashDialog", () => {
  it("disables the confirm button until the exact kodeUnik is typed", () => {
    renderDialog();
    const confirmButton = screen.getByRole("button", { name: /ya, hapus clash/i });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "wrong-code" } });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "MCA-ARS-0001" } });
    expect(confirmButton).toBeEnabled();
  });

  it("calls onConfirm only once the code matches", () => {
    const { onConfirm } = renderDialog();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "MCA-ARS-0001" } });
    fireEvent.click(screen.getByRole("button", { name: /ya, hapus clash/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancel does not call onConfirm", () => {
    const { onCancel, onConfirm } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("renders as an accessible dialog", () => {
    renderDialog();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
