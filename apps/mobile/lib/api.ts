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

export interface Achievement {
  code: string;
  title: string;
  description: string | null;
  iconUrl: string | null;
  earnedAt: string;
}

export type ReactionType = "fire" | "bulb" | "clap";

export interface FeedPost {
  id: string;
  content: string;
  mediaUrl: string | null;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  community: { id: string; name: string } | null;
  viewerReactions: ReactionType[];
  viewerHasBookmarked: boolean;
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
  // FormData (аватар) сама виставляє Content-Type із multipart boundary —
  // якщо форсувати application/json, сервер не розпарсить тіло.
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
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

export function getAchievements(accessToken: string) {
  return request<{ achievements: Achievement[] }>(
    "/api/users/me/achievements",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
}

export function updateProfile(
  accessToken: string,
  input: {
    displayName: string | null;
    bio: string | null;
    location: string | null;
  },
) {
  return request<{ user: SessionUser }>("/api/users/me", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
}

export function deleteAccount(accessToken: string, password: string) {
  return request<{ success: true }>("/api/users/me", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ password }),
  });
}

export function exportData(accessToken: string) {
  return request<{ exportedAt: string; user: SessionUser }>(
    "/api/users/me/export",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
}

export function uploadAvatar(
  accessToken: string,
  file: { uri: string; name: string; type: string },
) {
  const formData = new FormData();
  // RN FormData приймає об'єкт {uri,name,type} замість Blob — так само,
  // як для будь-якого файлу з ImagePicker/DocumentPicker.
  formData.append("avatar", file as unknown as Blob);

  return request<{ user: SessionUser }>("/api/users/me/avatar", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });
}

export function getFeed(accessToken: string, before?: string) {
  const query = before ? `?before=${before}` : "";
  return request<{ posts: FeedPost[]; nextCursor: string | null }>(
    `/api/feed${query}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
}

export function createPost(
  accessToken: string,
  input: { content: string; mediaUrl: string | null },
) {
  return request<{ post: { id: string } }>("/api/posts", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
}

export function uploadPostImage(
  accessToken: string,
  file: { uri: string; name: string; type: string },
) {
  const formData = new FormData();
  formData.append("image", file as unknown as Blob);

  return request<{ mediaUrl: string }>("/api/posts/media", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });
}

export function deletePost(accessToken: string, postId: string) {
  return request<{ success: true }>(`/api/posts/${postId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function setReaction(
  accessToken: string,
  postId: string,
  type: ReactionType,
) {
  return request<{ success: true }>(`/api/posts/${postId}/reactions/${type}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function removeReaction(
  accessToken: string,
  postId: string,
  type: ReactionType,
) {
  return request<{ success: true }>(`/api/posts/${postId}/reactions/${type}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function setBookmark(accessToken: string, postId: string) {
  return request<{ success: true }>(`/api/posts/${postId}/bookmark`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function removeBookmark(accessToken: string, postId: string) {
  return request<{ success: true }>(`/api/posts/${postId}/bookmark`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
