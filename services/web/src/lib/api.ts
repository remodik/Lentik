const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Ошибка сервера" }));
    throw new Error(err.detail ?? "Ошибка сервера");
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export function register(username: string, pin: string) {
  return request<{ user_id: string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, pin }),
  });
}

export function loginByPin(username: string, pin: string) {
  return request<{ user_id: string }>("/auth/pin", {
    method: "POST",
    body: JSON.stringify({ username, pin }),
  });
}

export function joinByInviteToken(token: string) {
  return request<{ user_id: string; family_id: string }>("/auth/invite/join", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export type Me = {
  id: string;
  username: string;
  avatar_url: string | null;
  created_at: string;
};

export function getMe() {
  return request<Me>("/me");
}

export function getMyFamilies() {
  return request<{ family_id: string; role: string; joined_at: string }[]>("/me/families");
}

export type FamilyMember = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  role: "owner" | "member";
  joined_at: string;
};

export type Family = {
  id: string;
  name: string;
  created_at: string;
  members: FamilyMember[];
};

export function getFamily(familyId: string) {
  return request<Family>(`/families/${familyId}`);
}

export function createFamily(name: string) {
  return request<{ id: string; name: string; created_at: string }>("/families", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function createInvite(familyId: string, expiresInHours = 72) {
  return request<{ token: string; expires_at: string; join_url: string }>("/invites", {
    method: "POST",
    body: JSON.stringify({ family_id: familyId, expires_in_hours: expiresInHours }),
  });
}

export type Chat = { id: string; name: string; family_id: string; created_at: string };
export type Message = {
  id: string;
  chat_id: string;
  author_id: string | null;
  text: string;
  edited: boolean;
  reply_to_id: string | null;
  created_at: string;
};

export function getChats(familyId: string) {
  return request<Chat[]>(`/families/${familyId}/chats`);
}

export function getMessages(familyId: string, chatId: string) {
  return request<Message[]>(`/families/${familyId}/chats/${chatId}/messages`);
}

export function sendMessage(familyId: string, chatId: string, text: string) {
  return request<Message>(`/families/${familyId}/chats/${chatId}/messages`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export function editMessage(familyId: string, chatId: string, messageId: string, text: string) {
  return request<Message>(`/families/${familyId}/chats/${chatId}/messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify({ text }),
  });
}

export function deleteMessage(familyId: string, chatId: string, messageId: string) {
  return request<void>(`/families/${familyId}/chats/${chatId}/messages/${messageId}`, {
    method: "DELETE",
  });
}

export type GalleryItem = {
  id: string;
  media_type: "image" | "video";
  url: string;
  caption: string | null;
  uploaded_by: string | null;
  created_at: string;
};

export function getGallery(familyId: string) {
  return request<GalleryItem[]>(`/families/${familyId}/gallery`);
}