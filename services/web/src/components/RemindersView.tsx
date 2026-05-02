"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlarmClock,
  CalendarClock,
  Check,
  Lock,
  Pencil,
  Plus,
  Repeat,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  createReminder,
  deleteReminder,
  getReminders,
  toggleReminderDone,
  updateReminder,
  type Reminder,
  type ReminderRepeatRule,
} from "@/lib/api";

const REPEAT_LABELS: Record<ReminderRepeatRule, string> = {
  none: "Не повторять",
  daily: "Каждый день",
  weekly: "Каждую неделю",
  monthly: "Каждый месяц",
};

const REPEAT_SHORT: Record<ReminderRepeatRule, string> = {
  none: "",
  daily: "каждый день",
  weekly: "каждую неделю",
  monthly: "каждый месяц",
};

type Filter = "upcoming" | "all" | "done";

const FILTER_LABELS: Record<Filter, string> = {
  upcoming: "Активные",
  all: "Все",
  done: "Готовые",
};

// ---------- helpers ----------

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatLocalDateTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow =
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate();
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (sameDay) return `Сегодня в ${time}`;
  if (isTomorrow) return `Завтра в ${time}`;
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} в ${time}`;
}

function isOverdue(iso: string, isDone: boolean) {
  if (isDone) return false;
  return new Date(iso).getTime() < Date.now();
}

function isToday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function toLocalInputValue(d: Date): string {
  // datetime-local format: YYYY-MM-DDTHH:MM (in local TZ)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function localInputToIso(value: string): string {
  // datetime-local has no TZ; treat as local and emit ISO with offset
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const oh = pad2(Math.floor(Math.abs(offsetMin) / 60));
  const om = pad2(Math.abs(offsetMin) % 60);
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}:${pad2(d.getMinutes())}:00${sign}${oh}:${om}`
  );
}

function defaultRemindAt(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

// ---------- card ----------

function ReminderCard({
  reminder,
  meId,
  onToggle,
  onEdit,
  onDelete,
}: {
  reminder: Reminder;
  meId: string;
  onToggle: (r: Reminder) => void;
  onEdit: (r: Reminder) => void;
  onDelete: (id: string) => void;
}) {
  const overdue = isOverdue(reminder.remind_at, reminder.is_done);
  const today = isToday(reminder.remind_at) && !reminder.is_done && !overdue;
  const isAuthor = reminder.author_id === meId;
  const repeatShort = REPEAT_SHORT[reminder.repeat_rule];

  let leftBorder = "var(--border-warm-dim)";
  if (overdue) leftBorder = "rgba(220, 38, 38, 0.7)";
  else if (today) leftBorder = "var(--accent-warm, #C8693A)";
  else if (reminder.is_done) leftBorder = "rgba(34, 197, 94, 0.45)";

  return (
    <div
      className={`group rounded-2xl border p-4 transition hover:shadow-md ${
        reminder.is_done ? "opacity-70" : ""
      }`}
      style={{
        background: "var(--bg-surface)",
        borderColor: "var(--border-glass)",
        borderLeft: `4px solid ${leftBorder}`,
      }}
      data-testid={`reminder-card-${reminder.id}`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onToggle(reminder)}
          className={`shrink-0 w-7 h-7 rounded-full grid place-items-center border-2 transition ${
            reminder.is_done
              ? "bg-green-500 border-green-500 text-white"
              : "border-ink-300 hover:border-ink-500"
          }`}
          aria-label={reminder.is_done ? "Снять отметку" : "Отметить выполненным"}
          title={
            reminder.is_done
              ? "Снять отметку"
              : reminder.repeat_rule !== "none"
              ? "Перенести на следующий период"
              : "Отметить выполненным"
          }
        >
          {reminder.is_done && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3
              className={`font-semibold text-ink-900 text-[0.97rem] leading-snug truncate flex-1 ${
                reminder.is_done ? "line-through text-ink-400" : ""
              }`}
            >
              {reminder.title}
            </h3>
            {isAuthor && (
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
                <button
                  type="button"
                  onClick={() => onEdit(reminder)}
                  className="w-7 h-7 rounded-lg grid place-items-center text-ink-400 hover:text-ink-700 hover:bg-white/60 transition"
                  title="Редактировать"
                  data-testid={`reminder-edit-${reminder.id}`}
                >
                  <Pencil className="w-3.5 h-3.5" strokeWidth={2.2} />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(reminder.id)}
                  className="w-7 h-7 rounded-lg grid place-items-center text-ink-400 hover:text-red-500 hover:bg-red-50 transition"
                  title="Удалить"
                  data-testid={`reminder-delete-${reminder.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={2.2} />
                </button>
              </div>
            )}
          </div>

          {reminder.notes && (
            <p className="mt-1.5 text-sm text-ink-600 font-body leading-relaxed whitespace-pre-wrap break-words line-clamp-3">
              {reminder.notes}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-body">
            <span
              className={`inline-flex items-center gap-1 ${
                overdue ? "text-red-600 font-semibold" : "text-ink-500"
              }`}
            >
              <CalendarClock className="w-3.5 h-3.5" strokeWidth={2.2} />
              {formatLocalDateTime(reminder.remind_at)}
            </span>

            {repeatShort && (
              <span className="inline-flex items-center gap-1 text-ink-500">
                <Repeat className="w-3.5 h-3.5" strokeWidth={2.2} />
                {repeatShort}
              </span>
            )}

            {reminder.is_personal ? (
              <span className="inline-flex items-center gap-1 text-ink-400">
                <Lock className="w-3 h-3" strokeWidth={2.4} />
                личное
              </span>
            ) : reminder.author_name ? (
              <span className="inline-flex items-center gap-1 text-ink-400">
                <Users className="w-3 h-3" strokeWidth={2.4} />
                от {reminder.author_name}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- view ----------

type ModalMode = "create" | "edit";

export default function RemindersView({
  familyId,
  meId,
}: {
  familyId: string;
  meId: string;
}) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("upcoming");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formWhen, setFormWhen] = useState<string>(toLocalInputValue(defaultRemindAt()));
  const [formRepeat, setFormRepeat] = useState<ReminderRepeatRule>("none");
  const [formPersonal, setFormPersonal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getReminders(familyId);
      setReminders(data);
    } catch (e) {
      console.error("getReminders failed", e);
    } finally {
      setLoading(false);
    }
  }, [familyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayed = useMemo(() => {
    if (filter === "all") return reminders;
    if (filter === "done") return reminders.filter((r) => r.is_done);
    return reminders.filter((r) => !r.is_done);
  }, [reminders, filter]);

  function openCreate() {
    setModalMode("create");
    setEditingId(null);
    setFormTitle("");
    setFormNotes("");
    setFormWhen(toLocalInputValue(defaultRemindAt()));
    setFormRepeat("none");
    setFormPersonal(false);
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(r: Reminder) {
    setModalMode("edit");
    setEditingId(r.id);
    setFormTitle(r.title);
    setFormNotes(r.notes ?? "");
    setFormWhen(toLocalInputValue(new Date(r.remind_at)));
    setFormRepeat(r.repeat_rule);
    setFormPersonal(r.is_personal);
    setFormError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
  }

  async function handleSave() {
    if (!formTitle.trim()) {
      setFormError("Введите название напоминания");
      return;
    }
    if (!formWhen) {
      setFormError("Укажите дату и время");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const isoWhen = localInputToIso(formWhen);
      if (modalMode === "create") {
        const created = await createReminder(familyId, {
          title: formTitle.trim(),
          notes: formNotes.trim() || null,
          remind_at: isoWhen,
          is_personal: formPersonal,
          repeat_rule: formRepeat,
        });
        setReminders((prev) =>
          [...prev, created].sort(
            (a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime(),
          ),
        );
      } else if (editingId) {
        const updated = await updateReminder(editingId, {
          title: formTitle.trim(),
          notes: formNotes.trim() || null,
          remind_at: isoWhen,
          is_personal: formPersonal,
          repeat_rule: formRepeat,
        });
        setReminders((prev) =>
          prev
            .map((r) => (r.id === updated.id ? updated : r))
            .sort(
              (a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime(),
            ),
        );
      }
      closeModal();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(r: Reminder) {
    try {
      await toggleReminderDone(r.id);
      await load();
    } catch (e) {
      console.error("toggleReminderDone failed", e);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteReminder(id);
      setReminders((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      console.error("deleteReminder failed", e);
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 px-5 pt-5 pb-3 flex items-center justify-between gap-3">
        <div
          className="flex items-center gap-1 p-1 rounded-xl border"
          style={{ background: "var(--bg-surface-subtle)", borderColor: "var(--border-warm-dim)" }}
        >
          {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3.5 py-1.5 rounded-lg text-[13px] font-semibold font-body transition ${
                filter === f
                  ? "bg-white text-ink-900 shadow-sm"
                  : "text-ink-500 hover:text-ink-700"
              }`}
              data-testid={`reminders-tab-${f}`}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="ui-btn ui-btn-primary inline-flex items-center gap-1.5"
          data-testid="reminder-create-btn"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2.4} />
          Напоминание
        </button>
      </div>

      <div className="flex-1 overflow-y-auto sidebar-scroll px-5 pb-5">
        {loading ? (
          <div className="text-sm text-ink-400 font-body py-6 text-center">Загрузка…</div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <AlarmClock className="w-10 h-10 text-ink-300" strokeWidth={1.6} />
            <p className="text-ink-800 font-semibold font-display text-base">
              {filter === "done"
                ? "Нет выполненных напоминаний"
                : filter === "all"
                ? "Напоминаний пока нет"
                : "Активных напоминаний нет"}
            </p>
            <p className="text-ink-400 text-sm font-body">
              {filter === "done"
                ? "Здесь появятся выполненные пункты"
                : "Нажмите «Напоминание», чтобы создать первое"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-1">
            {displayed.map((r) => (
              <ReminderCard
                key={r.id}
                reminder={r}
                meId={meId}
                onToggle={handleToggle}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-[80] bg-black/35 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !saving && closeModal()}
          role="dialog"
          aria-modal="true"
          aria-label={modalMode === "create" ? "Создать напоминание" : "Редактировать напоминание"}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-white/70 bg-white/88 backdrop-blur-2xl p-6 shadow-[0_30px_90px_rgba(28,23,20,0.22)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-xl text-ink-900">
                {modalMode === "create" ? "Новое напоминание" : "Редактировать"}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="w-8 h-8 rounded-lg grid place-items-center text-ink-400 hover:text-ink-700 hover:bg-white/60 transition"
                disabled={saving}
              >
                <X className="w-4 h-4" strokeWidth={2.3} />
              </button>
            </div>

            <div className="space-y-3">
              <input
                className="input-field"
                placeholder="Что напомнить (например: принять таблетки)"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                maxLength={200}
                autoFocus
                data-testid="reminder-form-title"
              />

              <textarea
                className="input-field min-h-[88px] resize-none"
                placeholder="Заметка (необязательно)"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                maxLength={2000}
                data-testid="reminder-form-notes"
              />

              <div>
                <label className="block text-[12px] text-ink-500 font-body mb-1">
                  Дата и время
                </label>
                <input
                  type="datetime-local"
                  className="input-field"
                  value={formWhen}
                  onChange={(e) => setFormWhen(e.target.value)}
                  data-testid="reminder-form-when"
                />
              </div>

              <div>
                <label className="block text-[12px] text-ink-500 font-body mb-1">
                  Повторение
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(REPEAT_LABELS) as ReminderRepeatRule[]).map((rule) => (
                    <button
                      key={rule}
                      type="button"
                      onClick={() => setFormRepeat(rule)}
                      className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold font-body border transition ${
                        formRepeat === rule
                          ? "bg-ink-900 text-white border-ink-900"
                          : "bg-white text-ink-700 border-ink-200 hover:border-ink-400"
                      }`}
                    >
                      {REPEAT_LABELS[rule]}
                    </button>
                  ))}
                </div>
              </div>

              <div
                className="flex items-center gap-3 p-3 rounded-xl border"
                style={{ background: "var(--bg-surface-subtle)", borderColor: "var(--border-warm-dim)" }}
              >
                <span className="text-sm text-ink-600 font-body flex-1">
                  {formPersonal
                    ? "Только для меня"
                    : "Видно всем участникам семьи"}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={formPersonal}
                  onClick={() => setFormPersonal((v) => !v)}
                  className={`relative w-11 h-6 rounded-full border transition ${
                    formPersonal
                      ? "bg-ink-900 border-ink-900"
                      : "bg-ink-200 border-ink-200"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      formPersonal ? "translate-x-5" : ""
                    }`}
                  />
                </button>
              </div>

              {formError && (
                <p className="text-sm text-red-500 font-body" data-testid="reminder-form-error">
                  {formError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  className="ui-btn ui-btn-ghost"
                  disabled={saving}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="ui-btn ui-btn-primary"
                  disabled={saving}
                  data-testid="reminder-form-save"
                >
                  {saving ? "Сохраняем…" : modalMode === "create" ? "Создать" : "Сохранить"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
