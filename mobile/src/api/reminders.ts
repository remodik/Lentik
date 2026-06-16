import client from "./client";
import type {
  Reminder,
  ReminderCreateInput,
  ReminderToggleDone,
  ReminderUpdateInput,
} from "./types";

// GET /families/:id/reminders — список напоминаний семьи (фильтр upcoming)
export const listReminders = (
  familyId: string,
  { upcoming }: { upcoming?: boolean } = {},
) => {
  const params: Record<string, boolean> = {};
  if (upcoming) params.upcoming = true;
  return client.get<Reminder[]>(`/families/${familyId}/reminders`, { params });
};

// POST /families/:id/reminders — создать напоминание
export const createReminder = (familyId: string, payload: ReminderCreateInput) =>
  client.post<Reminder>(`/families/${familyId}/reminders`, payload);

// GET /reminders/:id
export const getReminder = (id: string) =>
  client.get<Reminder>(`/reminders/${id}`);

// PATCH /reminders/:id
export const updateReminder = (id: string, payload: ReminderUpdateInput) =>
  client.patch<Reminder>(`/reminders/${id}`, payload);

// POST /reminders/:id/toggle-done — отметить выполненным / вернуть в активные.
// Для повторяющихся переносит на следующий период вместо завершения.
export const toggleReminderDone = (id: string) =>
  client.post<ReminderToggleDone>(`/reminders/${id}/toggle-done`);

// DELETE /reminders/:id
export const deleteReminder = (id: string) =>
  client.delete(`/reminders/${id}`);
