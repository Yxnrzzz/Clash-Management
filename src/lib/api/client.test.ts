import { afterEach, describe, expect, it, vi } from "vitest";
import { apiGet, ApiError } from "./client";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

describe("client error handling — requestId surfacing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // AllExceptionsFilter only attaches requestId to 5xx bodies — this is
  // what lets a user quote something traceable back to a server log line
  // (see app.module.ts's genReqId) without every one of the ~20 call sites
  // that render `error.message` needing to know requestId exists at all.
  it("appends the request id to the message for a 500 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(500, { statusCode: 500, message: "Terjadi kesalahan pada server.", requestId: "req-xyz" }),
      ),
    );

    await expect(apiGet("/whatever")).rejects.toMatchObject({
      message: "Terjadi kesalahan pada server. (ID: req-xyz)",
      requestId: "req-xyz",
    });
  });

  it("does not append anything for a routine 4xx without a requestId", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(404, { statusCode: 404, message: "Clash tidak ditemukan." })),
    );

    await expect(apiGet("/whatever")).rejects.toMatchObject({
      message: "Clash tidak ditemukan.",
      requestId: undefined,
    });
  });

  it("falls back to a generic message with no id for a non-JSON error body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json", { status: 502 })));

    await expect(apiGet("/whatever")).rejects.toBeInstanceOf(ApiError);
    await expect(apiGet("/whatever")).rejects.toMatchObject({ message: "Permintaan gagal (502)" });
  });
});
