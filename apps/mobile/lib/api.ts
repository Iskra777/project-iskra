const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export interface SessionUser {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  location: string | null;
  role: string;
  isEmailVerified: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiError {
  code: string;
  message: string;
}

export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; error: ApiError; status: number };

/** Кожен auth-запит несе `X-Client: mobile` — бекенд лише за ним додає
 * `refreshToken` у тіло JSON-відповіді (lib/auth/cookies.ts →
 * isMobileClient на веб-боці). */
async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResult<T>> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Client": "mobile",
      ...options.headers,
    },
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: body?.error ?? { code: "unknown", message: "Щось пішло не так." },
    };
  }

  return { ok: true, data: body as T };
}

export function login(email: string, password: string) {
  return request<{
    user: SessionUser;
    accessToken: string;
    refreshToken: string;
  }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function register(input: {
  email: string;
  username: string;
  password: string;
  displayName?: string | null;
  consent: true;
}) {
  return request<{ user: SessionUser }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function refresh(refreshToken: string) {
  return request<{ accessToken: string; refreshToken: string }>(
    "/api/auth/refresh",
    { method: "POST", headers: { "X-Refresh-Token": refreshToken } },
  );
}

export function logout(refreshToken: string) {
  return request<{ success: true }>("/api/auth/logout", {
    method: "POST",
    headers: { "X-Refresh-Token": refreshToken },
  });
}

export function requestPasswordReset(email: string) {
  return request<{ success: true }>("/api/auth/request-password-reset", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(token: string, password: string) {
  return request<{ success: true }>("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
}

export function getMe(accessToken: string) {
  return request<{ user: SessionUser }>("/api/auth/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
