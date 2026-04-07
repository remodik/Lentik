function getDefaultApiBase(): string {
  if (typeof window === "undefined") return "http://localhost:8000";

  const { protocol, hostname } = window.location;
  if (protocol === "http:" || protocol === "https:") {
    return `${protocol}//${hostname}:8000`;
  }

  return "http://localhost:8000";
}

function getDefaultWsBase(): string {
  if (typeof window === "undefined") return "ws://localhost:8000";

  const { protocol, hostname } = window.location;
  if (protocol === "http:" || protocol === "https:") {
    const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${hostname}:8000`;
  }

  return "ws://localhost:8000";
}

export const API_BASE =
  (process.env.NEXT_PUBLIC_API_BASE ?? getDefaultApiBase()).replace(/\/+$/, "");

export const WS_BASE =
  (process.env.NEXT_PUBLIC_WS_BASE ?? getDefaultWsBase()).replace(/\/+$/, "");
export const AUTH_TOKEN_KEY = "lentik_access_token";

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

export function apiUrl(path: string): string {
  return `${API_BASE}${normalizePath(path)}`;
}

export function wsUrl(path: string): string {
  return `${WS_BASE}${normalizePath(path)}`;
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {}
}

export function clearAuthToken(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {}
}

function isUrlField(key: string): boolean {
  return key.toLowerCase() === "url" || key.toLowerCase().endsWith("_url");
}

const STATIC_UPLOAD_PREFIX = "/static/uploads/";

function withApiBase(pathname: string, search = "", hash = ""): string {
  return `${API_BASE}${pathname}${search}${hash}`;
}

function maybeRebaseUploadUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (!/^https?:$/i.test(parsed.protocol)) return null;
    if (!parsed.pathname.startsWith(STATIC_UPLOAD_PREFIX)) return null;

    const apiBaseUrl = new URL(API_BASE);
    if (parsed.origin === apiBaseUrl.origin) return value;

    return withApiBase(parsed.pathname, parsed.search, parsed.hash);
  } catch {
    return null;
  }
}

export function toAbsoluteApiUrl(value: string): string {
  if (!value) return value;

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    const rebased = maybeRebaseUploadUrl(value);
    return rebased ?? value;
  }

  if (value.startsWith("//")) {
    if (typeof window !== "undefined") {
      const rebased = maybeRebaseUploadUrl(`${window.location.protocol}${value}`);
      if (rebased) return rebased;
    }
    return value;
  }

  if (value.startsWith("/")) {
    return withApiBase(value);
  }

  return `${API_BASE}/${value}`;
}

export function normalizeApiPayload<T>(payload: T): T {
  if (Array.isArray(payload)) {
    return payload.map((item) => normalizeApiPayload(item)) as T;
  }

  if (payload && typeof payload === "object") {
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      if (typeof value === "string" && isUrlField(key)) {
        normalized[key] = toAbsoluteApiUrl(value);
      } else if (Array.isArray(value) || (value && typeof value === "object")) {
        normalized[key] = normalizeApiPayload(value);
      } else {
        normalized[key] = value;
      }
    }
    return normalized as T;
  }

  return payload;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const hasBody = init.body !== undefined && init.body !== null;
  const isFormData =
    typeof FormData !== "undefined" && init.body instanceof FormData;
  const token = getAuthToken();

  if (hasBody && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  try {
    return await fetch(apiUrl(path), {
      credentials: "include",
      ...init,
      headers,
    });
  } catch (error) {
    throw new Error(
      `Не удалось подключиться к API (${API_BASE}). Проверь, что backend доступен.`,
      { cause: error },
    );
  }
}
