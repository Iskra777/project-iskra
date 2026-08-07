export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
export const WS_PORT = process.env.EXPO_PUBLIC_WS_PORT ?? "4001";

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

export interface ConversationParticipant {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
}

export interface ConversationListItem {
  id: string;
  type: string;
  title: string | null;
  otherParticipant: ConversationParticipant | null;
  lastMessage: { content: string; senderId: string; sentAt: string } | null;
  unread: boolean;
}

export interface ConversationDetail {
  id: string;
  type: string;
  title: string | null;
  otherParticipant: ConversationParticipant | null;
  participants: ConversationParticipant[];
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  sentAt: string;
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

export function getConversations(accessToken: string) {
  return request<{ conversations: ConversationListItem[] }>(
    "/api/conversations",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
}

export function getConversation(accessToken: string, conversationId: string) {
  return request<{ conversation: ConversationDetail }>(
    `/api/conversations/${conversationId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
}

export function getMessages(
  accessToken: string,
  conversationId: string,
  before?: string,
) {
  const query = before ? `?before=${before}` : "";
  return request<{ messages: ChatMessage[]; nextCursor: string | null }>(
    `/api/conversations/${conversationId}/messages${query}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
}

export function sendMessage(
  accessToken: string,
  conversationId: string,
  content: string,
) {
  return request<{ message: ChatMessage }>(
    `/api/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ content }),
    },
  );
}

export function markConversationRead(
  accessToken: string,
  conversationId: string,
) {
  return request<{ lastReadAt: string }>(
    `/api/conversations/${conversationId}/read`,
    { method: "PATCH", headers: { Authorization: `Bearer ${accessToken}` } },
  );
}

export function createDirectConversation(
  accessToken: string,
  username: string,
) {
  return request<{
    conversation: { id: string; otherParticipant: ConversationParticipant };
  }>("/api/conversations", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ username }),
  });
}

export function createGroupConversation(
  accessToken: string,
  title: string,
  usernames: string[],
) {
  return request<{ conversation: { id: string } }>("/api/conversations/group", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ title, usernames }),
  });
}

export interface UserSearchResult {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export function searchUsers(query: string) {
  return request<{ users: UserSearchResult[] }>(
    `/api/users/search?q=${encodeURIComponent(query)}`,
  );
}

export function addParticipants(
  accessToken: string,
  conversationId: string,
  usernames: string[],
) {
  return request<{ success: true }>(
    `/api/conversations/${conversationId}/participants`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ usernames }),
    },
  );
}

export function promoteParticipant(
  accessToken: string,
  conversationId: string,
  userId: string,
) {
  return request<{ success: true }>(
    `/api/conversations/${conversationId}/participants/${userId}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ role: "admin" }),
    },
  );
}

export function removeParticipant(
  accessToken: string,
  conversationId: string,
  userId: string,
) {
  return request<{ success: true }>(
    `/api/conversations/${conversationId}/participants/${userId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
  );
}

export function leaveConversation(
  accessToken: string,
  conversationId: string,
  newAdminUserId?: string,
) {
  return request<{ success: true }>(
    `/api/conversations/${conversationId}/leave`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(newAdminUserId ? { newAdminUserId } : {}),
    },
  );
}

export interface Friend {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface FriendRequest {
  id: string;
  createdAt: string;
  requester: Friend;
}

export function getFriends(accessToken: string) {
  return request<{ friends: Friend[] }>("/api/users/me/friends", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function getFriendRequests(accessToken: string) {
  return request<{ requests: FriendRequest[] }>(
    "/api/users/me/friend-requests",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
}

export function sendFriendRequest(accessToken: string, username: string) {
  return request<{ success: true }>(`/api/users/${username}/friend-request`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function respondFriendRequest(
  accessToken: string,
  username: string,
  action: "accept" | "reject",
) {
  return request<{ success: true }>(`/api/users/${username}/friend-request`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ action }),
  });
}

export interface CommunityListItem {
  id: string;
  name: string;
  description: string | null;
  visibility: "public" | "private";
  memberCount: number;
}

export interface CommunityMember {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: "admin" | "moderator" | "member";
}

export interface CommunityDetail {
  id: string;
  name: string;
  description: string | null;
  visibility: "public" | "private";
  ownerId: string;
  memberCount: number;
  members: CommunityMember[] | null;
  viewerMembership: { role: string; status: "approved" | "pending" } | null;
  pendingRequests: CommunityMember[] | null;
}

export function getCommunities(accessToken: string, query?: string) {
  const q = query ? `?q=${encodeURIComponent(query)}` : "";
  return request<{ communities: CommunityListItem[] }>(`/api/communities${q}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function getCommunity(accessToken: string, communityId: string) {
  return request<{ community: CommunityDetail }>(
    `/api/communities/${communityId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
}

export function createCommunity(
  accessToken: string,
  input: {
    name: string;
    description: string | null;
    visibility: "public" | "private";
  },
) {
  return request<{ community: { id: string } }>("/api/communities", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
}

export function joinCommunity(accessToken: string, communityId: string) {
  return request<{ status: "approved" | "pending" }>(
    `/api/communities/${communityId}/join`,
    { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } },
  );
}

export function leaveCommunity(accessToken: string, communityId: string) {
  return request<{ success: true }>(`/api/communities/${communityId}/leave`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({}),
  });
}

export function respondCommunityJoinRequest(
  accessToken: string,
  communityId: string,
  targetUserId: string,
  action: "approve" | "reject",
) {
  return request<{ success: true }>(
    `/api/communities/${communityId}/members/${targetUserId}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ action }),
    },
  );
}

export function changeCommunityMemberRole(
  accessToken: string,
  communityId: string,
  targetUserId: string,
  role: "admin" | "moderator" | "member",
) {
  return request<{ success: true }>(
    `/api/communities/${communityId}/members/${targetUserId}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ role }),
    },
  );
}

export function removeCommunityMember(
  accessToken: string,
  communityId: string,
  targetUserId: string,
) {
  return request<{ success: true }>(
    `/api/communities/${communityId}/members/${targetUserId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
  );
}
