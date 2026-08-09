import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfirmCodeDialog } from "./ConfirmCodeDialog";

function renderDialog(overrides: Partial<Parameters<typeof ConfirmCodeDialog>[0]> = {}) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(
    <ConfirmCodeDialog
      title="Ubah kode proyek?"
      description="Ini akan menulis ulang 3 kode clash."
      codeToType="NEW"
      confirmLabel="Ya, ubah kode"
      confirmingLabel="Mengubah…"
      onCancel={onCancel}
      onConfirm={onConfirm}
      {...overrides}
    />
  );
  return { onCancel, onConfirm };
}

describe("ConfirmCodeDialog", () => {
  it("disables the confirm button until the exact code is typed", () => {
    renderDialog();
    const confirmButton = screen.getByRole("button", { name: /ya, ubah kode/i });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "new" } });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "NEW" } });
    expect(confirmButton).toBeEnabled();
  });

  it("calls onConfirm only once the code matches", () => {
    const { onConfirm } = renderDialog();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "NEW" } });
    fireEvent.click(screen.getByRole("button", { name: /ya, ubah kode/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancel does not call onConfirm", () => {
    const { onCancel, onConfirm } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("stays open and shows the error instead of closing when onConfirm fails", () => {
    // The caller (admin/projects page) controls `open` via whether stats are
    // still set — a 409 from the server should surface here, not silently
    // close the dialog the way DeleteClashDialog's simpler flow does.
    const { rerender } = render(
      <ConfirmCodeDialog
        title="Ubah kode proyek?"
        description="desc"
        codeToType="NEW"
        confirmLabel="Ya, ubah kode"
        confirmingLabel="Mengubah…"
        error={null}
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(screen.queryByText(/kode sudah dipakai/i)).not.toBeInTheDocument();

    rerender(
      <ConfirmCodeDialog
        title="Ubah kode proyek?"
        description="desc"
        codeToType="NEW"
        confirmLabel="Ya, ubah kode"
        confirmingLabel="Mengubah…"
        error="Kode sudah dipakai proyek lain."
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(screen.getByText("Kode sudah dipakai proyek lain.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("renders as an accessible dialog", () => {
    renderDialog();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
