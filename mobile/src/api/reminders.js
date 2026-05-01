import client from './client';

// GET /families/:id/reminders — список напоминаний семьи (с фильтром upcoming)
export const listReminders = (familyId, { upcoming } = {}) => {
  const params = {};
  if (upcoming) params.upcoming = true;
  return client.get(`/families/${familyId}/reminders`, { params });
};

// POST /families/:id/reminders — создать напоминание
export const createReminder = (familyId, payload) =>
  client.post(`/families/${familyId}/reminders`, payload);

// GET /reminders/:id
export const getReminder = (id) => client.get(`/reminders/${id}`);

// PATCH /reminders/:id
export const updateReminder = (id, payload) =>
  client.patch(`/reminders/${id}`, payload);

// POST /reminders/:id/toggle-done — отметить выполненным (или вернуть в активные)
// Для повторяющихся переносит на следующий период вместо завершения.
export const toggleReminderDone = (id) =>
  client.post(`/reminders/${id}/toggle-done`);

// DELETE /reminders/:id
export const deleteReminder = (id) => client.delete(`/reminders/${id}`);
