const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Ошибка сервера" }));
    if (Array.isArray(err.detail)) {
      const msg = err.detail.map((e: { msg?: string }) => e.msg ?? "Ошибка").join(", ");
      throw new Error(msg);
    }
    throw new Error(err.detail ?? "Ошибка сервера");
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export function register(display_name: string, username: string, pin: string) {
  return request<{ user_id: string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ display_name, username, pin }),
  });
}

export function loginByPin(username: string, pin: string) {
  return request<{ user_id: string }>("/auth/pin", {
    method: "POST",
    body: JSON.stringify({ username, pin }),
  });
}

export function logout() {
  return request<void>("/auth/logout", { method: "POST" });
}

export function joinByInvite(token: string, display_name: string, pin: string) {
  return request<{ user_id: string; family_id: string }>("/auth/invite", {
    method: "POST",
    body: JSON.stringify({token, display_name, pin}),
  });
}

export type Me = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  birthday: string | null;
  created_at: string;
};

export type MyFamily = {
  family_id: string;
  family_name: string;
  role: "owner" | "member";
  joined_at: string;
};

export function getMe() {
  return request<Me>("/me");
}

export function getMyFamilies() {
  return request<MyFamily[]>("/me/families");
}

export function leaveFamily(familyId: string) {
  return request<void>(`/me/families/${familyId}`, { method: "DELETE" });
}

export type FamilyMember = {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  birthday: string | null;
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

export function kickMember(familyId: string, userId: string) {
  return request<void>(`/families/${familyId}/members/${userId}`, { method: "DELETE" });
}

export function createInvite(familyId: string, expiresInHours = 72) {
  return request<{ token: string; expires_at: string; join_url: string }>("/invites", {
    method: "POST",
    body: JSON.stringify({ family_id: familyId, expires_in_hours: expiresInHours }),
  });
}

export function joinFamilyByToken(token: string) {
  return request<{ family_id: string }>("/families/join", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export type Chat = {
  id: string;
  name: string;
  family_id: string;
  created_at: string;
};

export type Message = {
  id: string;
  chat_id: string;
  author_id: string | null;
  author_username: string | null;
  author_display_name: string | null;
  text: string;
  edited: boolean;
  reply_to_id: string | null;
  mentions: string[];
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
  family_id: string;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  media_type: "image" | "video";
  url: string;
  file_name: string | null;
  file_size: number | null;
  caption: string | null;
  created_at: string;
};

export function getGallery(familyId: string) {
  return request<GalleryItem[]>(`/families/${familyId}/gallery`);
}