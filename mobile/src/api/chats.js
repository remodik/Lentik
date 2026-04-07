import client from './client';

// GET /families/:familyId/chats — список чатов
export const listChats = (familyId) =>
  client.get(`/families/${familyId}/chats`);

// GET /families/:familyId/chats/:chatId/messages — сообщения
export const getMessages = (familyId, chatId, limit = 50, beforeId = null) => {
  const params = { limit };
  if (beforeId) params.before_id = beforeId;
  return client.get(
    `/families/${familyId}/chats/${chatId}/messages`,
    { params }
  );
};

// POST /families/:familyId/chats/:chatId/messages — отправить сообщение
export const sendMessage = (familyId, chatId, text) =>
  client.post(`/families/${familyId}/chats/${chatId}/messages`, { text });

// POST .../messages/read — отметить как прочитанные
export const markRead = (familyId, chatId, messageIds) =>
  client.post(
    `/families/${familyId}/chats/${chatId}/messages/read`,
    { message_ids: messageIds }
  );
