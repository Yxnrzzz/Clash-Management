import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AttachmentPanel } from "./AttachmentPanel";
import type { Attachment, User } from "@/lib/types";

const USERS: Record<string, User> = {
  "u-eng-1": { id: "u-eng-1", nama: "Budi Engineer", email: "budi@eps.dev", peran: "Engineer", isActive: true },
  "u-eng-2": { id: "u-eng-2", nama: "Citra Engineer", email: "citra@eps.dev", peran: "Engineer", isActive: true },
};

function userById(id: string) {
  return USERS[id];
}

const ATTACHMENT: Attachment = {
  id: "att-1",
  clashId: "c1",
  namaFile: "foto.png",
  tipe: "image",
  ukuranBytes: 2048,
  uploadedBy: "u-eng-1",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function renderPanel(overrides: Partial<Parameters<typeof AttachmentPanel>[0]> = {}) {
  const onUpload = vi.fn(() => Promise.resolve());
  const onDelete = vi.fn(() => Promise.resolve());
  render(
    <AttachmentPanel
      attachments={[ATTACHMENT]}
      previewUrls={{}}
      userById={userById}
      userRole="Engineer"
      userId="u-eng-1"
      onUpload={onUpload}
      onDelete={onDelete}
      {...overrides}
    />
  );
  return { onUpload, onDelete };
}

function makeFile(name: string, sizeBytes: number, type: string): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

describe("AttachmentPanel", () => {
  it("renders the attachment list with uploader name", () => {
    renderPanel();
    expect(screen.getByText("foto.png")).toBeInTheDocument();
    expect(screen.getByText(/Budi Engineer/)).toBeInTheDocument();
  });

  it("shows the upload dropzone for a role that can upload", () => {
    renderPanel({ userRole: "Coordinator" });
    expect(screen.getByText(/Seret & lepas file/)).toBeInTheDocument();
  });

  it("hides the upload dropzone for Management", () => {
    renderPanel({ userRole: "Management" });
    expect(screen.queryByText(/Seret & lepas file/)).not.toBeInTheDocument();
  });

  it("shows the delete button to the Engineer who uploaded the file", () => {
    renderPanel({ userRole: "Engineer", userId: "u-eng-1" });
    expect(screen.getByRole("button", { name: "Hapus" })).toBeInTheDocument();
  });

  it("hides the delete button from an Engineer who did not upload the file", () => {
    renderPanel({ userRole: "Engineer", userId: "u-eng-2" });
    expect(screen.queryByRole("button", { name: "Hapus" })).not.toBeInTheDocument();
  });

  it("hides the delete button from Management regardless of ownership", () => {
    renderPanel({ userRole: "Management", userId: "u-eng-1" });
    expect(screen.queryByRole("button", { name: "Hapus" })).not.toBeInTheDocument();
  });

  it("rejects an oversized file before calling onUpload", async () => {
    const { onUpload } = renderPanel({ userRole: "Coordinator" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const oversized = makeFile("besar.png", 11 * 1024 * 1024, "image/png");

    fireEvent.change(input, { target: { files: [oversized] } });

    expect(await screen.findByText(/Ukuran melebihi/)).toBeInTheDocument();
    expect(onUpload).not.toHaveBeenCalled();
  });

  it("rejects a disallowed file type before calling onUpload", async () => {
    const { onUpload } = renderPanel({ userRole: "Coordinator" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const badType = makeFile("dokumen.docx", 1024, "application/msword");

    fireEvent.change(input, { target: { files: [badType] } });

    expect(await screen.findByText(/Tipe file harus gambar atau PDF/)).toBeInTheDocument();
    expect(onUpload).not.toHaveBeenCalled();
  });

  it("calls onUpload with a valid file", async () => {
    const { onUpload } = renderPanel({ userRole: "Coordinator" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const valid = makeFile("foto2.png", 1024, "image/png");

    fireEvent.change(input, { target: { files: [valid] } });

    expect(onUpload).toHaveBeenCalledWith([valid]);
  });

  it("confirming the delete dialog calls onDelete with the attachment id", async () => {
    const { onDelete } = renderPanel({ userRole: "Engineer", userId: "u-eng-1" });

    fireEvent.click(screen.getByRole("button", { name: "Hapus" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Ya, hapus/ }));

    expect(onDelete).toHaveBeenCalledWith("att-1");
  });

  it("canceling the delete dialog does not call onDelete", () => {
    const { onDelete } = renderPanel({ userRole: "Engineer", userId: "u-eng-1" });

    fireEvent.click(screen.getByRole("button", { name: "Hapus" }));
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('shows "Belum ada lampiran" when the list is empty', () => {
    renderPanel({ attachments: [] });
    expect(screen.getByText("Belum ada lampiran.")).toBeInTheDocument();
  });
});
