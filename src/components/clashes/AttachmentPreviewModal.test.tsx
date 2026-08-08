import { Suspense, lazy, type ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AttachmentPreviewModal } from "./AttachmentPreviewModal";
import type { Attachment, Role, User } from "@/lib/types";

vi.mock("@/lib/use-signed-url", () => ({
  useSignedUrl: (_clashId: string, attachmentId: string | null) => ({
    url: attachmentId ? `https://example.test/signed/${attachmentId}` : null,
    error: false,
    refresh: vi.fn(),
  }),
}));

vi.mock("@/lib/api/client", () => ({
  apiGet: vi.fn(() => Promise.resolve([])),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}));

// PdfPageCanvas needs pdf.js, which doesn't run in jsdom — replaced with an
// identifiable stub. next/dynamic is mocked to resolve it via React.lazy so
// tests can await it with findBy* queries instead of dealing with SSR-only
// loading semantics.
vi.mock("./PdfPageCanvas", () => ({
  PdfPageCanvas: ({ url }: { url: string }) => <div data-testid="pdf-canvas" data-url={url} />,
}));

vi.mock("next/dynamic", () => ({
  // AttachmentPreviewModal's loader already resolves directly to the
  // component (`import("./PdfPageCanvas").then((m) => m.PdfPageCanvas)`),
  // not a `{ default }`-shaped module — React.lazy requires the latter, so
  // this normalizes whichever shape the loader hands back.
  default: (loader: () => Promise<ComponentType<unknown> | { default: ComponentType<unknown> }>) => {
    const LazyComponent = lazy(async () => {
      const resolved = await loader();
      const Component = "default" in resolved ? resolved.default : resolved;
      return { default: Component };
    });
    return function DynamicWrapper(props: object) {
      return (
        <Suspense fallback={null}>
          <LazyComponent {...props} />
        </Suspense>
      );
    };
  },
}));

const IMAGE: Attachment = {
  id: "att-img",
  clashId: "c1",
  namaFile: "foto.png",
  tipe: "image",
  ukuranBytes: 2048,
  uploadedBy: "u1",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const PDF: Attachment = {
  id: "att-pdf",
  clashId: "c1",
  namaFile: "dokumen.pdf",
  tipe: "pdf",
  ukuranBytes: 4096,
  uploadedBy: "u1",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const USER: User = {
  id: "u1",
  nama: "Budi",
  email: "budi@eps.dev",
  peran: "Engineer",
  isActive: true,
  mustChangePassword: false,
};
const CURRENT_USER: { id: string; peran: Role } = { id: "u1", peran: "Engineer" };

function userById() {
  return USER;
}

function renderModal(overrides: Partial<Parameters<typeof AttachmentPreviewModal>[0]> = {}) {
  const onIndexChange = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <AttachmentPreviewModal
      clashId="c1"
      attachments={[IMAGE, PDF]}
      index={0}
      onIndexChange={onIndexChange}
      onClose={onClose}
      userById={userById}
      currentUser={CURRENT_USER}
      {...overrides}
    />
  );
  return { onIndexChange, onClose, ...utils };
}

describe("AttachmentPreviewModal", () => {
  it("renders an <img> for an image attachment with the signed url", () => {
    renderModal();
    const img = screen.getByAltText("foto.png") as HTMLImageElement;
    expect(img.src).toContain("/signed/att-img");
  });

  it("renders a pdf canvas for a pdf attachment with the signed url", async () => {
    renderModal({ index: 1 });
    const canvas = await screen.findByTestId("pdf-canvas");
    expect(canvas.getAttribute("data-url")).toContain("/signed/att-pdf");
  });

  it("Escape calls onClose", () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clicking the backdrop closes; clicking inner content does not", () => {
    const { onClose } = renderModal();

    fireEvent.click(screen.getByAltText("foto.png"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ArrowRight moves forward and ArrowLeft clamps at the first item", () => {
    const { onIndexChange } = renderModal({ index: 0 });

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onIndexChange).toHaveBeenCalledWith(0);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it("ArrowRight clamps at the last item", () => {
    const { onIndexChange } = renderModal({ index: 1 });

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it("zoom buttons update the content wrapper's transform", () => {
    renderModal();
    const wrapper = screen.getByAltText("foto.png").parentElement as HTMLElement;
    expect(wrapper.style.transform).toBe("translate(0px, 0px) scale(1)");

    fireEvent.click(screen.getByRole("button", { name: "Perbesar" }));
    expect(wrapper.style.transform).toContain("scale(1.4)");

    fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));
    expect(wrapper.style.transform).toBe("translate(0px, 0px) scale(1)");
  });

  it("resets zoom when the previewed attachment changes", async () => {
    const { rerender } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Perbesar" }));
    expect(screen.getByAltText("foto.png").parentElement?.style.transform).toContain("scale(1.4)");

    rerender(
      <AttachmentPreviewModal
        clashId="c1"
        attachments={[IMAGE, PDF]}
        index={1}
        onIndexChange={vi.fn()}
        onClose={vi.fn()}
        userById={userById}
        currentUser={CURRENT_USER}
      />
    );
    await screen.findByTestId("pdf-canvas");
    // Switching back to the image confirms the reset stuck.
    rerender(
      <AttachmentPreviewModal
        clashId="c1"
        attachments={[IMAGE, PDF]}
        index={0}
        onIndexChange={vi.fn()}
        onClose={vi.fn()}
        userById={userById}
        currentUser={CURRENT_USER}
      />
    );
    expect(screen.getByAltText("foto.png").parentElement?.style.transform).toBe(
      "translate(0px, 0px) scale(1)"
    );
  });

  it("focuses the close button on open", () => {
    renderModal();
    expect(screen.getByRole("button", { name: "Tutup pratinjau" })).toHaveFocus();
  });

  it("hides prev/next disabled state correctly at each end", () => {
    renderModal({ index: 0 });
    expect(screen.getByRole("button", { name: "Sebelumnya" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Berikutnya" })).toBeEnabled();
  });

  it("shows drawing tools for a role that can draw", () => {
    renderModal({ currentUser: { id: "u1", peran: "Engineer" } });
    expect(screen.getByRole("button", { name: "Kotak" })).toBeInTheDocument();
  });

  it("hides drawing tools for Management but keeps pan/select", () => {
    renderModal({ currentUser: { id: "u1", peran: "Management" } });
    expect(screen.queryByRole("button", { name: "Kotak" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Geser" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pilih" })).toBeInTheDocument();
  });
});
