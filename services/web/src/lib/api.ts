import { apiFetch, clearAuthToken, normalizeApiPayload } from "@/lib/api-base";

type ApiError = Error & { status?: number };

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await apiFetch(path, {
    cache: "no-store",
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Ошибка сервера" }));
    const apiError: ApiError = new Error("Ошибка сервера");
    apiError.status = res.status;

    if (Array.isArray(err.detail)) {
      const msg = err.detail.map((e: { msg?: string }) => e.msg ?? "Ошибка").join(", ");
      apiError.message = msg;
      throw apiError;
    }
    apiError.message = err.detail ?? "Ошибка сервера";
    throw apiError;
  }

  if (res.status === 204) return undefined as T;
  const payload = await res.json();
  return normalizeApiPayload(payload) as T;
}

export function register(display_name: string, username: string, pin: string) {
  return request<{ user_id: string; access_token: string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ display_name, username, pin }),
  });
}

export function loginByPin(username: string, pin: string) {
  return request<{ user_id: string; access_token: string }>("/auth/pin", {
    method: "POST",
    body: JSON.stringify({ username, pin }),
  });
}

export async function logout() {
  try {
    await request<void>("/auth/logout", { method: "POST" });
  } finally {
    clearAuthToken();
  }
}

export function joinByInvite(token: string, display_name: string, pin: string) {
  return request<{ user_id: string; family_id: string; access_token?: string }>("/auth/invite", {
    method: "POST",
    body: JSON.stringify({ token, display_name, pin }),
  });
}

export type Me = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  birthday: string | null;
  is_online?: boolean;
  last_seen_at?: string | null;
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
  return request<any[]>("/me/families").then((rows) =>
    rows
      .map((row): MyFamily => {
        const role: MyFamily["role"] = row.role === "owner" ? "owner" : "member";
        return {
          family_id: row.family_id ?? row.id ?? "",
          family_name: row.family_name ?? row.name ?? "Семья",
          role,
          joined_at: row.joined_at ?? row.created_at ?? new Date().toISOString(),
        };
      })
      .filter((row) => row.family_id),
  );
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
  is_online?: boolean;
  last_seen_at?: string | null;
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

export function transferOwnership(familyId: string, userId: string) {
  return request<Family>(`/families/${familyId}/transfer-ownership`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });
}

export function buildFamilyInviteLink(token: string) {
  const encoded = encodeURIComponent(token);
  if (typeof window === "undefined") return `/onboarding?token=${encoded}`;
  const url = new URL("/onboarding", window.location.origin);
  url.searchParams.set("token", token);
  return url.toString();
}

export function createInvite(
  familyId: string,
  expiresInHours = 72,
  revokePrevious = false,
  maxUses = 1,
) {
  return request<{
    token: string;
    expires_at: string;
    max_uses: number;
    uses_count: number;
    join_url: string;
  }>("/invites", {
    method: "POST",
    body: JSON.stringify({
      family_id: familyId,
      expires_in_hours: expiresInHours,
      max_uses: maxUses,
      revoke_previous: revokePrevious,
    }),
  });
}

export function joinFamilyByToken(token: string) {
  return request<{ family_id: string }>("/families/join", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export type ChatPinnedMessagePreview = {
  preview_text: string;
  author_display_name: string | null;
  created_at: string;
};

export type Chat = {
  id: string;
  name: string;
  family_id: string;
  description?: string | null;
  slow_mode_seconds?: number;
  is_18plus?: boolean;
  pinned_message_id?: string | null;
  pinned_message?: ChatPinnedMessagePreview | null;
  created_at: string;
};

export type ChatSettingsUpdate = {
  name?: string;
  description?: string | null;
  slow_mode_seconds?: number;
  is_18plus?: boolean;
};

export function updateChat(
  familyId: string,
  chatId: string,
  data: ChatSettingsUpdate,
) {
  return request<Chat>(`/families/${familyId}/chats/${chatId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export type ReactionSummary = {
  emoji: string;
  count: number;
  user_ids: string[];
};

export type ReaderInfo = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
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
  attachments: MessageAttachment[];
  reactions?: ReactionSummary[];
  readers?: ReaderInfo[];
  created_at: string;
};

export type MessageSearchResult = {
  id: string;
  author_display_name: string | null;
  snippet: string;
  created_at: string;
  has_attachments: boolean;
  is_empty: boolean;
};

export type MessageAttachment = {
  kind: "image" | "video" | "file" | "voice";
  url: string;
  file_name: string;
  file_size: number | null;
  content_type: string | null;
};

export function getChats(familyId: string) {
  return request<Chat[]>(`/families/${familyId}/chats`);
}

export function pinChatMessage(
  familyId: string,
  chatId: string,
  messageId: string,
) {
  return request<Chat>(`/families/${familyId}/chats/${chatId}/pin`, {
    method: "POST",
    body: JSON.stringify({ message_id: messageId }),
  });
}

export function unpinChatMessage(familyId: string, chatId: string) {
  return request<Chat>(`/families/${familyId}/chats/${chatId}/pin`, {
    method: "DELETE",
  });
}

export function getMessages(
  familyId: string,
  chatId: string,
  options?: { limit?: number; beforeId?: string },
) {
  const params = new URLSearchParams();
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.beforeId) params.set("before_id", options.beforeId);

  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return request<Message[]>(`/families/${familyId}/chats/${chatId}/messages${suffix}`);
}

export function searchChatMessages(
  familyId: string,
  chatId: string,
  query: string,
) {
  const params = new URLSearchParams({ q: query });
  return request<MessageSearchResult[]>(
    `/families/${familyId}/chats/${chatId}/messages/search?${params.toString()}`,
  );
}

export function sendMessage(
  familyId: string,
  chatId: string,
  text: string,
  replyToId?: string | null,
) {
  return request<Message>(`/families/${familyId}/chats/${chatId}/messages`, {
    method: "POST",
    body: JSON.stringify({ text, reply_to_id: replyToId ?? null }),
  });
}

export function sendMessageWithFiles(
  familyId: string,
  chatId: string,
  files: File[],
  text?: string,
) {
  const form = new FormData();
  files.forEach((file) => form.append("files", file));
  if (text && text.trim()) form.append("text", text.trim());

  return request<Message>(`/families/${familyId}/chats/${chatId}/messages/attachments`, {
    method: "POST",
    body: form,
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

export function addReaction(
  familyId: string,
  chatId: string,
  messageId: string,
  emoji: string,
) {
  return request<void>(
    `/families/${familyId}/chats/${chatId}/messages/${messageId}/reactions`,
    {
      method: "POST",
      body: JSON.stringify({ emoji }),
    },
  );
}

export function removeReaction(
  familyId: string,
  chatId: string,
  messageId: string,
  emoji: string,
) {
  return request<void>(
    `/families/${familyId}/chats/${chatId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
    {
      method: "DELETE",
    },
  );
}

export function markMessagesRead(
  familyId: string,
  chatId: string,
  messageIds: string[],
) {
  return request<void>(`/families/${familyId}/chats/${chatId}/messages/read`, {
    method: "POST",
    body: JSON.stringify({ message_ids: messageIds }),
  });
}

export type Channel = {
  id: string;
  family_id: string;
  name: string;
  description: string | null;
  slow_mode_seconds?: number;
  is_18plus?: boolean;
  created_by: string | null;
  created_at: string;
};

export type ChannelSettingsUpdate = {
  name?: string;
  description?: string | null;
  slow_mode_seconds?: number;
  is_18plus?: boolean;
};

export function updateChannel(
  familyId: string,
  channelId: string,
  data: ChannelSettingsUpdate,
) {
  return request<Channel>(`/families/${familyId}/channels/${channelId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export type Post = {
  id: string;
  channel_id: string;
  author_id: string | null;
  text: string;
  media_urls: string[] | null;
  created_at: string;
};

export function getChannels(familyId: string) {
  return request<Channel[]>(`/families/${familyId}/channels`);
}

export function createChannel(
  familyId: string,
  name: string,
  description?: string,
) {
  return request<Channel>(`/families/${familyId}/channels`, {
    method: "POST",
    body: JSON.stringify({ name, description: description?.trim() || null }),
  });
}

export function getPosts(
  familyId: string,
  channelId: string,
  limit = 20,
  offset = 0,
) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  return request<Post[]>(
    `/families/${familyId}/channels/${channelId}/posts?${params.toString()}`,
  );
}

export function createPost(familyId: string, channelId: string, text: string) {
  return request<Post>(`/families/${familyId}/channels/${channelId}/posts`, {
    method: "POST",
    body: JSON.stringify({ text }),
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

export type CalendarEvent = {
  id: string;
  family_id: string;
  created_by: string | null;
  creator_name: string | null;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  color: "red" | "green" | "blue" | "yellow" | "purple" | "orange";
  reminder_minutes: number | null;
  created_at: string;
};

export type CalendarEventCreate = {
  title: string;
  description?: string | null;
  starts_at: string;
  ends_at?: string | null;
  color?: CalendarEvent["color"];
  reminder_minutes?: number | null;
};

export function getCalendarEvents(familyId: string, year?: number, month?: number) {
  const params = year && month ? `?year=${year}&month=${month}` : "";
  return request<CalendarEvent[]>(`/families/${familyId}/calendar${params}`);
}

export function createCalendarEvent(familyId: string, data: CalendarEventCreate) {
  return request<CalendarEvent>(`/families/${familyId}/calendar`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateCalendarEvent(familyId: string, eventId: string, data: Partial<CalendarEventCreate>) {
  return request<CalendarEvent>(`/families/${familyId}/calendar/${eventId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteCalendarEvent(familyId: string, eventId: string) {
  return request<void>(`/families/${familyId}/calendar/${eventId}`, { method: "DELETE" });
}

export type ExpenseSplit = {
  user_id: string;
  share: number | string;
  user_display_name: string | null;
};

export type Expense = {
  id: string;
  family_id: string;
  created_by: string;
  created_by_name: string | null;
  title: string;
  amount: number | string;
  currency: string;
  paid_by: string;
  paid_by_name: string | null;
  splits: ExpenseSplit[];
  created_at: string;
  updated_at: string;
};

export type Balance = {
  user_id: string;
  display_name: string;
  balance: number | string;
};

export type ExpenseCreateRequest = {
  title: string;
  amount: number;
  currency?: string;
  paid_by: string;
  splits: Array<{
    user_id: string;
    share: number;
  }>;
};

export function getExpenses(familyId: string) {
  return request<Expense[]>(`/families/${familyId}/expenses`);
}

export function createExpense(familyId: string, data: ExpenseCreateRequest) {
  return request<Expense>(`/families/${familyId}/expenses`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function getBalances(familyId: string) {
  return request<Balance[]>(`/families/${familyId}/expenses/balance`);
}

export type Note = {
  id: string;
  family_id: string | null;
  author_id: string | null;
  title: string;
  content: string;
  is_personal: boolean;
  created_at: string;
  updated_at: string;
};

export function getNotes(familyId: string) {
  return request<Note[]>(`/families/${familyId}/notes`);
}

export function createNote(
  familyId: string,
  data: { title: string; content: string; is_personal: boolean },
) {
  return request<Note>(`/families/${familyId}/notes`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateNote(
  noteId: string,
  data: { title?: string; content?: string; is_personal?: boolean },
) {
  return request<Note>(`/notes/${noteId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteNote(noteId: string) {
  return request<void>(`/notes/${noteId}`, { method: "DELETE" });
}

export type ReminderRepeatRule = "none" | "daily" | "weekly" | "monthly";

export type Reminder = {
  id: string;
  family_id: string | null;
  author_id: string | null;
  author_name: string | null;
  title: string;
  notes: string | null;
  remind_at: string;
  is_personal: boolean;
  repeat_rule: ReminderRepeatRule;
  is_done: boolean;
  reminder_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export function getReminders(familyId: string, opts?: { upcoming?: boolean }) {
  const qs = opts?.upcoming ? "?upcoming=true" : "";
  return request<Reminder[]>(`/families/${familyId}/reminders${qs}`);
}

export function createReminder(
  familyId: string,
  data: {
    title: string;
    notes?: string | null;
    remind_at: string;
    is_personal?: boolean;
    repeat_rule?: ReminderRepeatRule;
  },
) {
  return request<Reminder>(`/families/${familyId}/reminders`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateReminder(
  reminderId: string,
  data: {
    title?: string;
    notes?: string | null;
    remind_at?: string;
    is_personal?: boolean;
    repeat_rule?: ReminderRepeatRule;
    is_done?: boolean;
  },
) {
  return request<Reminder>(`/reminders/${reminderId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function toggleReminderDone(reminderId: string) {
  return request<{ id: string; is_done: boolean; next_remind_at: string | null }>(
    `/reminders/${reminderId}/toggle-done`,
    { method: "POST" },
  );
}

export function deleteReminder(reminderId: string) {
  return request<void>(`/reminders/${reminderId}`, { method: "DELETE" });
}

export type TreeGender = "male" | "female" | "other" | "unknown";
export type TreeRelationType = "parent" | "spouse";

export type TreePerson = {
  id: string;
  family_id: string;
  user_id: string | null;
  display_name: string;
  avatar_url: string | null;
  gender: TreeGender;
  birth_date: string | null;
  death_date: string | null;
  bio: string | null;
  pos_x: number | null;
  pos_y: number | null;
  created_at: string;
};

export type TreeRelation = {
  id: string;
  family_id: string;
  person_a_id: string;
  person_b_id: string;
  relation_type: TreeRelationType;
  created_at: string;
};

export type FamilyTree = {
  persons: TreePerson[];
  relations: TreeRelation[];
};

export type TreePersonInput = {
  display_name: string;
  user_id?: string | null;
  avatar_url?: string | null;
  gender?: TreeGender;
  birth_date?: string | null;
  death_date?: string | null;
  bio?: string | null;
  pos_x?: number | null;
  pos_y?: number | null;
};

export type TreePersonUpdateInput = Partial<TreePersonInput> & {
  clear_user_link?: boolean;
  clear_birth_date?: boolean;
  clear_death_date?: boolean;
};

export function moveTreePerson(personId: string, pos_x: number, pos_y: number) {
  return request<TreePerson>(`/tree/persons/${personId}`, {
    method: "PATCH",
    body: JSON.stringify({ pos_x, pos_y }),
  });
}

export function getFamilyTree(familyId: string) {
  return request<FamilyTree>(`/families/${familyId}/tree`);
}

export function createTreePerson(familyId: string, data: TreePersonInput) {
  return request<TreePerson>(`/families/${familyId}/tree/persons`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateTreePerson(personId: string, data: TreePersonUpdateInput) {
  return request<TreePerson>(`/tree/persons/${personId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteTreePerson(personId: string) {
  return request<void>(`/tree/persons/${personId}`, { method: "DELETE" });
}

export function createTreeRelation(
  familyId: string,
  data: {
    person_a_id: string;
    person_b_id: string;
    relation_type: TreeRelationType;
  },
) {
  return request<TreeRelation>(`/families/${familyId}/tree/relations`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function deleteTreeRelation(relationId: string) {
  return request<void>(`/tree/relations/${relationId}`, { method: "DELETE" });
}

export function sendVoiceMessage(familyId: string, chatId: string, blob: Blob) {
  const form = new FormData();
  form.append("file", blob, "voice.webm");
  return request<Message>(`/families/${familyId}/chats/${chatId}/messages/voice`, {
    method: "POST",
    body: form,
  });
}
