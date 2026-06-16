import client from "./client";
import type { Chat, Message } from "./types";

// GET /families/:familyId/chats — список чатов
export const listChats = (familyId: string) =>
  client.get<Chat[]>(`/families/${familyId}/chats`);

// GET /families/:familyId/chats/:chatId/messages — сообщения
export const getMessages = (
  familyId: string,
  chatId: string,
  limit = 50,
  beforeId: string | null = null,
) => {
  const params: Record<string, string | number> = { limit };
  if (beforeId) params.before_id = beforeId;
  return client.get<Message[]>(
    `/families/${familyId}/chats/${chatId}/messages`,
    { params },
  );
};

// POST /families/:familyId/chats/:chatId/messages — отправить сообщение
export const sendMessage = (familyId: string, chatId: string, text: string) =>
  client.post<Message>(`/families/${familyId}/chats/${chatId}/messages`, {
    text,
  });

// POST .../messages/read — отметить как прочитанные
export const markRead = (
  familyId: string,
  chatId: string,
  messageIds: string[],
) =>
  client.post(`/families/${familyId}/chats/${chatId}/messages/read`, {
    message_ids: messageIds,
  });
