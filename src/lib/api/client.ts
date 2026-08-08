import type { ApiSession } from "./types";

/**
 * The access token lives in a module variable rather than localStorage so a
 * stray XSS cannot read it. Sessions survive a reload through the httpOnly
 * refresh cookie instead — see restoreSession() below.
 */
let accessToken: string | null = null;

/**
 * The backend resolves every project-scoped request (clashes, master-data,
 * import) against this header rather than any per-user "current project"
 * concept — see data-context.tsx's setActiveProject(). Routes that aren't
 * project-scoped (auth, users, /projects itself) simply ignore it.
 */
let activeProjectId: string | null = null;

/** Single in-flight refresh, so a burst of 401s does not fan out into N calls. */
let refreshInFlight: Promise<ApiSession | null> | null = null;

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setActiveProjectId(projectId: string | null) {
  activeProjectId = projectId;
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(", ");
    if (body.message) return body.message;
  } catch {
    // Non-JSON error body — fall through to the generic text.
  }
  return `Permintaan gagal (${res.status})`;
}

function authHeaders(init?: RequestInit): HeadersInit {
  // FormData sets its own multipart boundary in Content-Type; letting the
  // browser do it (by omitting the header here) is required for uploads.
  const isFormData = init?.body instanceof FormData;
  return {
    ...(init?.body && !isFormData ? { "Content-Type": "application/json" } : {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(activeProjectId ? { "X-Project-Id": activeProjectId } : {}),
    ...init?.headers,
  };
}

async function send<T>(path: string, init?: RequestInit): Promise<T> {
  // Same-origin: next.config.ts rewrites /api/* to the NestJS server.
  const res = await fetch(`/api${path}`, { ...init, headers: authHeaders(init) });

  if (!res.ok) throw new ApiError(res.status, await readError(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function sendBlob(path: string, init?: RequestInit): Promise<Blob> {
  const res = await fetch(`/api${path}`, { ...init, headers: authHeaders(init) });
  if (!res.ok) throw new ApiError(res.status, await readError(res));
  return res.blob();
}

/** Exchanges the refresh cookie for a new access token. Never retried itself. */
export function restoreSession(): Promise<ApiSession | null> {
  if (!refreshInFlight) {
    refreshInFlight = send<ApiSession>("/auth/refresh", { method: "POST" })
      .then((session) => {
        setAccessToken(session.accessToken);
        return session;
      })
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

/**
 * Calls the API, transparently refreshing the access token once if it has
 * expired. Auth endpoints are excluded from the retry to avoid recursion.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await send<T>(path, init);
  } catch (error) {
    const isAuthRoute = path.startsWith("/auth/");
    if (error instanceof ApiError && error.status === 401 && !isAuthRoute) {
      const session = await restoreSession();
      if (session) return send<T>(path, init);
    }
    throw error;
  }
}

export function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

export function apiDelete<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: "DELETE" });
}

export function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body: formData });
}

/** Same 401-retry-once behavior as apiFetch, but for binary responses. */
export async function apiDownloadBlob(path: string): Promise<Blob> {
  try {
    return await sendBlob(path);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      const session = await restoreSession();
      if (session) return sendBlob(path);
    }
    throw error;
  }
}

export async function login(email: string, password: string): Promise<ApiSession> {
  const session = await send<ApiSession>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setAccessToken(session.accessToken);
  return session;
}

export async function logout(): Promise<void> {
  try {
    await send<void>("/auth/logout", { method: "POST" });
  } finally {
    setAccessToken(null);
  }
}

/**
 * Changing the password revokes every other session server-side (see
 * AuthService.changePassword), including the one this very request rides
 * on — the response carries a fresh access token (and resets the refresh
 * cookie) so the caller isn't logged out by the action they just took.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<ApiSession> {
  const session = await send<ApiSession>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  setAccessToken(session.accessToken);
  return session;
}
