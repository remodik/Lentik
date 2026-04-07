"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CalendarRange,
  Cake,
  ChevronLeft,
  ChevronRight,
  PencilLine,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  getCalendarEvents,
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
  type CalendarEvent,
  type CalendarEventCreate,
  type FamilyMember,
} from "@/lib/api";

const MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const COLOR_MAP: Record<
  CalendarEvent["color"],
  { bg: string; text: string; dot: string; light: string; ring: string }
> = {
  blue: {
    bg: "bg-blue-500",
    text: "text-blue-700",
    dot: "bg-blue-400",
    light: "bg-blue-50 border-blue-200",
    ring: "ring-blue-300",
  },
  red: {
    bg: "bg-red-500",
    text: "text-red-700",
    dot: "bg-red-400",
    light: "bg-red-50 border-red-200",
    ring: "ring-red-300",
  },
  green: {
    bg: "bg-green-500",
    text: "text-green-700",
    dot: "bg-green-400",
    light: "bg-green-50 border-green-200",
    ring: "ring-green-300",
  },
  yellow: {
    bg: "bg-amber-400",
    text: "text-amber-700",
    dot: "bg-amber-400",
    light: "bg-amber-50 border-amber-200",
    ring: "ring-ring-amber-300",
  },
  purple: {
    bg: "bg-purple-500",
    text: "text-purple-700",
    dot: "bg-purple-400",
    light: "bg-purple-50 border-purple-200",
    ring: "ring-purple-300",
  },
  orange: {
    bg: "bg-orange-400",
    text: "text-orange-700",
    dot: "bg-orange-400",
    light: "bg-orange-50 border-orange-200",
    ring: "ring-orange-300",
  },
};

COLOR_MAP.yellow.ring = "ring-amber-300";

const COLOR_LABELS: { value: CalendarEvent["color"]; label: string }[] = [
  { value: "blue", label: "Синий" },
  { value: "green", label: "Зелёный" },
  { value: "red", label: "Красный" },
  { value: "yellow", label: "Жёлтый" },
  { value: "purple", label: "Фиолетовый" },
  { value: "orange", label: "Оранжевый" },
];

const REMINDER_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Нет" },
  { value: 10, label: "За 10 минут" },
  { value: 30, label: "За 30 минут" },
  { value: 60, label: "За 1 час" },
  { value: 1440, label: "За 1 день" },
];

function formatReminderLabel(minutes: number | null | undefined): string {
  if (!minutes) return "Нет";
  const option = REMINDER_OPTIONS.find((item) => item.value === minutes);
  return option?.label ?? `За ${minutes} мин`;
}

function getDaysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}
function getFirstDayOfMonth(y: number, m: number) {
  const d = new Date(y, m, 1).getDay();
  return d === 0 ? 6 : d - 1;
}
function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
function formatDT(iso: string) {
  return new Date(iso).toLocaleString("ru", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type BirthdayEvent = { day: number; month: number; display_name: string };

function birthdayEventsForMonth(
  members: FamilyMember[],
  month: number,
): BirthdayEvent[] {
  return members
    .filter((m) => m.birthday)
    .map((m) => {
      const d = new Date(m.birthday!);
      return {
        day: d.getDate(),
        month: d.getMonth(),
        display_name: m.display_name,
      };
    })
    .filter((b) => b.month === month);
}

function EventModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: { date: Date; event?: CalendarEvent };
  onSave: (data: CalendarEventCreate, id?: string) => Promise<void>;
  onClose: () => void;
}) {
  const editing = initial?.event;

  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [color, setColor] = useState<CalendarEvent["color"]>(
    editing?.color ?? "blue",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const defaultDate = initial?.date ?? new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const defaultDateStr = `${defaultDate.getFullYear()}-${pad(defaultDate.getMonth() + 1)}-${pad(defaultDate.getDate())}`;

  const toInputValue = (iso: string | null | undefined, fallback: string) => {
    if (!iso) return `${fallback}T12:00`;
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [startsAt, setStartsAt] = useState(
    toInputValue(editing?.starts_at, defaultDateStr),
  );
  const [endsAt, setEndsAt] = useState(
    toInputValue(editing?.ends_at, defaultDateStr),
  );
  const [hasEnd, setHasEnd] = useState(!!editing?.ends_at);
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(
    editing?.reminder_minutes ?? null,
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Введи название");

    setSaving(true);
    setError("");
    try {
      await onSave(
        {
          title: title.trim(),
          description: description.trim() || null,
          starts_at: new Date(startsAt).toISOString(),
          ends_at: hasEnd ? new Date(endsAt).toISOString() : null,
          color,
          reminder_minutes: reminderMinutes,
        },
        editing?.id,
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  const c = COLOR_MAP[color];

  return (
    <div
      className="glass-overlay fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="glass-elevated glossy rounded-3xl w-full max-w-md overflow-hidden animate-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`${c.bg} px-6 py-5`}>
          <p className="text-white/70 text-[11px] font-body uppercase tracking-widest mb-1">
            {editing ? "Редактировать" : "Новое событие"}
          </p>
          <p className="text-white font-display text-xl leading-tight truncate">
            {title || "Без названия"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-[11px] font-semibold text-ink-400 uppercase tracking-widest font-body mb-1.5 block">
              Название
            </label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="День рождения, встреча…"
              className="input-field"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-ink-400 uppercase tracking-widest font-body mb-1.5 block">
              Описание{" "}
              <span className="text-ink-300 normal-case font-normal">
                (необязательно)
              </span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="Подробности…"
              className="input-field resize-none"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-ink-400 uppercase tracking-widest font-body mb-1.5 block">
              Начало
            </label>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="input-field"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer mb-1.5">
              <input
                type="checkbox"
                checked={hasEnd}
                onChange={(e) => setHasEnd(e.target.checked)}
                className="accent-ink-900 w-3.5 h-3.5 rounded"
              />
              <span className="text-[11px] font-semibold text-ink-400 uppercase tracking-widest font-body">
                Конец события
              </span>
            </label>
            {hasEnd && (
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="input-field"
              />
            )}
          </div>

          <div>
            <label className="text-[11px] font-semibold text-ink-400 uppercase tracking-widest font-body mb-2 block">
              Цвет
            </label>
            <div className="flex gap-2.5 flex-wrap">
              {COLOR_LABELS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setColor(value)}
                  title={label}
                  className={`w-7 h-7 rounded-full ${COLOR_MAP[value].bg} transition-all duration-150
                    ${
                      color === value
                        ? "ring-2 ring-offset-2 ring-ink-900 scale-110 shadow-sm"
                        : "opacity-55 hover:opacity-90 hover:scale-105"
                    }`}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-ink-400 uppercase tracking-widest font-body mb-1.5 block">
              Напоминание
            </label>
            <div className="rounded-xl border border-white/70 bg-white/62 px-3 py-2.5">
              <select
                value={reminderMinutes === null ? "" : String(reminderMinutes)}
                onChange={(event) => {
                  const raw = event.target.value;
                  setReminderMinutes(raw ? Number(raw) : null);
                }}
                className="w-full bg-transparent text-[13px] text-ink-900 outline-none font-body"
              >
                {REMINDER_OPTIONS.map((option) => (
                  <option
                    key={option.value === null ? "none" : String(option.value)}
                    value={option.value === null ? "" : String(option.value)}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="text-red-500 text-sm font-body">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 bg-ink-900 text-cream-50 text-sm font-medium rounded-xl
                         hover:bg-ink-700 transition-colors disabled:opacity-50 font-body active:scale-[0.97]"
            >
              {saving ? "Сохранение…" : editing ? "Сохранить" : "Создать"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 text-ink-700 text-sm font-medium rounded-xl
                         transition-all font-body glass-button"
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DayPanel({
  date,
  events,
  birthdays,
  meId,
  onEdit,
  onDelete,
  onAdd,
  onClose,
}: {
  date: Date;
  events: CalendarEvent[];
  birthdays: BirthdayEvent[];
  meId: string;
  onEdit: (e: CalendarEvent) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const isToday = isSameDay(date, new Date());

  const dateLabel = date.toLocaleDateString("ru", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="flex flex-col h-full glass-surface glossy cal-event-panel relative">
      <div
        className="cal-day-panel-head px-5 py-4 flex items-start justify-between shrink-0"
      >
        <div>
          <p
            className={`font-display text-2xl leading-none ${isToday ? "text-warm-500" : "text-ink-900"}`}
          >
            {date.getDate()}
          </p>
          <p className="text-sm text-ink-400 font-body capitalize mt-0.5">
            {dateLabel.replace(/^\d+\s/, "")}
          </p>
          {isToday && (
            <p className="text-[11px] text-warm-400 font-body font-medium mt-0.5">
              Сегодня
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onAdd}
            className="ui-btn ui-btn-icon cal-daypanel-add"
            title="Добавить"
            aria-label="Добавить событие"
          >
            <Plus className="w-[14px] h-[14px]" strokeWidth={2.3} />
          </button>

          <button
            onClick={onClose}
            className="ui-btn ui-btn-icon cal-daypanel-close text-xl leading-none"
            aria-label="Закрыть"
            title="Закрыть"
          >
            <X className="w-[14px] h-[14px]" strokeWidth={2.3} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {birthdays.map((b, i) => (
          <div
            key={`bday-${i}`}
            className="cal-birthday-card flex items-center gap-3 p-3 rounded-2xl"
          >
            <Cake className="w-5 h-5 shrink-0 text-pink-500" strokeWidth={2.1} />
            <div>
              <p className="text-sm font-semibold text-ink-900 font-body">
                {b.display_name}
              </p>
              <p className="text-xs text-pink-500 font-body">День рождения</p>
            </div>
          </div>
        ))}

        {events.length === 0 && birthdays.length === 0 && (
          <div className="text-center py-8">
            <CalendarDays className="w-8 h-8 mx-auto mb-2 text-ink-300" strokeWidth={1.9} />
            <p className="text-ink-400 text-sm font-body">Нет событий</p>
            <button
              onClick={onAdd}
              className="mt-3 text-sm text-warm-500 hover:underline font-body"
            >
              Добавить событие
            </button>
          </div>
        )}

        {events.map((ev) => {
          const c = COLOR_MAP[ev.color];
          const canEdit = ev.created_by === meId;

          return (
            <div
              key={ev.id}
              className="cal-event-card rounded-2xl p-4 glossy"
            >
              <div className="flex items-start gap-2.5">
                <div
                  className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${c.dot}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink-900 font-body">
                    {ev.title}
                  </p>
                  {ev.description && (
                    <p className="text-xs text-ink-500 font-body mt-1 leading-relaxed">
                      {ev.description}
                    </p>
                  )}
                  <p className="text-xs text-ink-400 font-body mt-2">
                    {formatTime(ev.starts_at)}
                    {ev.ends_at && ` — ${formatTime(ev.ends_at)}`}
                    {ev.creator_name && ` · ${ev.creator_name}`}
                  </p>
                  {ev.reminder_minutes !== null && (
                    <p className="text-[11px] text-ink-400 font-body mt-1">
                      Напоминание: {formatReminderLabel(ev.reminder_minutes)}
                    </p>
                  )}
                </div>

                {canEdit && (
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => onEdit(ev)}
                      className="p-1.5 text-ink-300 hover:text-ink-700 transition-colors text-xs rounded-lg hover:bg-white/60"
                      aria-label="Редактировать"
                      title="Редактировать"
                    >
                      <PencilLine className="w-3.5 h-3.5" strokeWidth={2.2} />
                    </button>

                    <button
                      onClick={async () => {
                        if (!confirm("Удалить событие?")) return;
                        setDeleting(ev.id);
                        try {
                          await onDelete(ev.id);
                        } finally {
                          setDeleting(null);
                        }
                      }}
                      disabled={deleting === ev.id}
                      className="p-1.5 text-ink-300 hover:text-red-500 transition-colors text-xs rounded-lg hover:bg-white/60 disabled:opacity-40"
                      aria-label="Удалить"
                      title="Удалить"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={2.1} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CalendarView({
  familyId,
  meId,
  members = [],
}: {
  familyId: string;
  meId: string;
  members?: FamilyMember[];
}) {
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [modal, setModal] = useState<{
    date: Date;
    event?: CalendarEvent;
  } | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      setEvents(await getCalendarEvents(familyId, year, month + 1));
    } finally {
      setLoading(false);
    }
  }, [familyId, year, month]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  function prevMonth() {
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else {
      setMonth((m) => m - 1);
    }
    setSelectedDay(null);
  }

  function nextMonth() {
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else {
      setMonth((m) => m + 1);
    }
    setSelectedDay(null);
  }

  async function handleSave(data: CalendarEventCreate, id?: string) {
    if (id) {
      const updated = await updateCalendarEvent(familyId, id, data);
      setEvents((p) => p.map((e) => (e.id === id ? updated : e)));
    } else {
      const created = await createCalendarEvent(familyId, data);
      setEvents((p) => [...p, created]);
    }
  }

  async function handleDelete(id: string) {
    await deleteCalendarEvent(familyId, id);
    setEvents((p) => p.filter((e) => e.id !== id));
  }

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  const birthdays = useMemo(
    () => birthdayEventsForMonth(members, month),
    [members, month],
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<number, CalendarEvent[]>();
    for (const ev of events) {
      const d = new Date(ev.starts_at);
      if (d.getFullYear() !== year || d.getMonth() !== month) continue;
      const day = d.getDate();
      const arr = map.get(day) ?? [];
      arr.push(ev);
      map.set(day, arr);
    }
    for (const [day, arr] of map.entries()) {
      arr.sort(
        (a, b) =>
          new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
      );
      map.set(day, arr);
    }
    return map;
  }, [events, year, month]);

  const birthdaysByDay = useMemo(() => {
    const map = new Map<number, BirthdayEvent[]>();
    for (const b of birthdays) {
      const arr = map.get(b.day) ?? [];
      arr.push(b);
      map.set(b.day, arr);
    }
    return map;
  }, [birthdays]);

  const upcomingEvents = useMemo(() => {
    return events
      .filter((ev) => new Date(ev.starts_at) >= today)
      .sort(
        (a, b) =>
          new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
      )
      .slice(0, 6);
  }, [events, today]);

  const dayPanelEvents = selectedDay
    ? (eventsByDay.get(selectedDay.getDate()) ?? [])
    : [];
  const dayPanelBirthdays = selectedDay
    ? (birthdaysByDay.get(selectedDay.getDate()) ?? [])
    : [];

  const glassButton = "ui-btn ui-btn-icon cal-nav-btn";

  return (
    <div className="calendar-layout flex h-full overflow-hidden">
      <div className="flex flex-col flex-1 min-w-0">
        <header className="shrink-0 glass-topbar glossy px-6 py-4 flex items-center gap-4">
          <div className="flex items-center gap-2.5 mr-auto">
            <button
              onClick={prevMonth}
              className={glassButton}
              aria-label="Предыдущий месяц"
              title="Предыдущий месяц"
            >
              <ChevronLeft className="w-4 h-4 text-ink-600" strokeWidth={2.2} />
            </button>

            <h2 className="font-display text-xl text-ink-900 min-w-[180px] text-center">
              {MONTHS[month]} {year}
            </h2>

            <button
              onClick={nextMonth}
              className={glassButton}
              aria-label="Следующий месяц"
              title="Следующий месяц"
            >
              <ChevronRight className="w-4 h-4 text-ink-600" strokeWidth={2.2} />
            </button>
          </div>

          <button
            onClick={() => {
              setYear(today.getFullYear());
              setMonth(today.getMonth());
              setSelectedDay(new Date(today));
            }}
            className="ui-btn ui-btn-subtle"
          >
            Сегодня
          </button>

          <button
            onClick={() => setModal({ date: selectedDay ?? new Date(today) })}
            className="btn-primary flex items-center gap-2 px-4 py-2 text-sm rounded-xl"
          >
            <Plus className="w-4 h-4" strokeWidth={2.2} /> Событие
          </button>
        </header>

        <div className="flex-1 overflow-auto">
          <div className="calendar-weekdays grid grid-cols-7 sticky top-0 z-10 glass-surface glossy">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="py-2.5 text-center text-[11px] font-semibold text-ink-400 uppercase tracking-widest font-body"
              >
                {d}
              </div>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-2 border-cream-300 border-t-warm-400 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="calendar-grid grid grid-cols-7 border-l border-t border-[rgba(240,228,204,0.35)]">
              {Array.from({ length: totalCells }).map((_, idx) => {
                const dayNum = idx - firstDay + 1;
                const inMonth = dayNum >= 1 && dayNum <= daysInMonth;

                const dayDate = inMonth ? new Date(year, month, dayNum) : null;
                const isToday2 = dayDate
                  ? isSameDay(dayDate, new Date(today))
                  : false;
                const isSelected =
                  dayDate && selectedDay
                    ? isSameDay(dayDate, selectedDay)
                    : false;

                const dayEvents = inMonth
                  ? (eventsByDay.get(dayNum) ?? [])
                  : [];
                const dayBdays = inMonth
                  ? (birthdaysByDay.get(dayNum) ?? [])
                  : [];

                const count = dayEvents.length + dayBdays.length;

                return (
                  <div
                    key={idx}
                    onClick={() => {
                      if (!inMonth || !dayDate) return;
                      setSelectedDay(isSelected ? null : dayDate);
                    }}
                    className={`cal-day min-h-[100px] p-2 border-b border-r cursor-pointer
                      ${isToday2 ? "cal-day-today" : ""}
                      ${count > 0 ? "has-events" : ""}
                      ${!inMonth ? "cal-day-out" : ""}
                      ${isSelected ? "cal-day-selected" : ""}
                    `}
                    role="button"
                    tabIndex={inMonth ? 0 : -1}
                    onKeyDown={(e) => {
                      if (!inMonth || !dayDate) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedDay(isSelected ? null : dayDate);
                      }
                    }}
                  >
                    {inMonth && (
                      <>
                        <div className="flex items-center justify-between mb-1.5">
                          <span
                            className={`cal-day-num w-6 h-6 flex items-center justify-center rounded-full
                              text-[12px] font-semibold font-body transition-all duration-150
                              ${
                                isToday2
                                  ? "cal-day-num-today"
                                  : isSelected
                                    ? "cal-day-num-selected"
                                    : "text-ink-700 hover:bg-white/40"
                              }`}
                          >
                            {dayNum}
                          </span>

                          {count > 0 && (
                            <span className="text-[9px] text-ink-300 font-body">
                              {count}
                            </span>
                          )}
                        </div>

                        <div className="space-y-0.5">
                          {dayBdays.slice(0, 1).map((b, i) => (
                            <div
                              key={`b-${i}`}
                              className="cal-day-birthday-chip flex items-center gap-1 px-1.5 py-0.5 rounded-md"
                            >
                              <Cake className="w-[10px] h-[10px] text-pink-600 shrink-0" strokeWidth={2.2} />
                              <span className="text-[10px] font-body text-pink-700 truncate">
                                {b.display_name}
                              </span>
                            </div>
                          ))}

                          {dayEvents.slice(0, 2).map((ev) => {
                            const c = COLOR_MAP[ev.color];
                            return (
                              <div
                                key={ev.id}
                                className={`cal-day-event-chip flex items-center gap-1 px-1.5 py-0.5 rounded-md ${c.light} border`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDay(new Date(year, month, dayNum));
                                }}
                                role="button"
                                tabIndex={0}
                              >
                                <div
                                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`}
                                />
                                <span
                                  className={`text-[10px] font-body truncate ${c.text}`}
                                >
                                  {ev.title}
                                </span>
                              </div>
                            );
                          })}

                          {count > 3 && (
                            <p className="text-[10px] text-ink-400 font-body px-1.5">
                              +{count - 3}
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selectedDay ? (
        <div className="calendar-side-panel w-72 shrink-0 flex flex-col overflow-hidden">
          <DayPanel
            date={selectedDay}
            events={dayPanelEvents}
            birthdays={dayPanelBirthdays}
            meId={meId}
            onEdit={(ev) => setModal({ date: selectedDay, event: ev })}
            onDelete={handleDelete}
            onAdd={() => setModal({ date: selectedDay })}
            onClose={() => setSelectedDay(null)}
          />
        </div>
      ) : (
        <div className="calendar-side-panel w-72 shrink-0 flex flex-col overflow-hidden glass-sidebar glossy">
          <div
            className="calendar-side-head px-5 py-4 shrink-0"
          >
            <p className="font-display text-base text-ink-900">
              Ближайшие события
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {upcomingEvents.length === 0 && !loading && (
              <div className="text-center py-8">
                <CalendarRange className="w-8 h-8 mx-auto mb-2 text-ink-300" strokeWidth={1.9} />
                <p className="text-ink-400 text-sm font-body">
                  Нет предстоящих событий
                </p>
              </div>
            )}

            {upcomingEvents.map((ev) => {
              const c = COLOR_MAP[ev.color];
              return (
                <div
                  key={ev.id}
                  onClick={() => {
                    const d = new Date(ev.starts_at);
                    setYear(d.getFullYear());
                    setMonth(d.getMonth());
                    setSelectedDay(d);
                  }}
                  className="glass-card glossy p-3.5 cursor-pointer"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className={`w-2 h-2 rounded-full ${c.dot}`} />
                    <p
                      className={`text-[11px] font-semibold font-body ${c.text}`}
                    >
                      {formatDT(ev.starts_at)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-ink-900 font-body leading-tight">
                    {ev.title}
                  </p>
                  {ev.description && (
                    <p className="text-xs text-ink-500 font-body mt-1 line-clamp-2 leading-relaxed">
                      {ev.description}
                    </p>
                  )}
                </div>
              );
            })}

            {birthdays.length > 0 && (
              <>
                <div
                  className="calendar-side-divider pt-3"
                >
                  <p className="text-[11px] font-semibold text-ink-300 uppercase tracking-widest font-body mb-2 px-1">
                    Дни рождения в {MONTHS[month].toLowerCase()}е
                  </p>
                </div>

                {birthdays
                  .slice()
                  .sort((a, b) => a.day - b.day)
                  .map((b, i) => (
                    <div
                      key={`sb-${i}`}
                      onClick={() =>
                        setSelectedDay(new Date(year, month, b.day))
                      }
                      className="glass-card glossy p-3 cursor-pointer flex items-center gap-3 active:scale-[0.99]"
                    >
                      <Cake className="w-5 h-5 shrink-0 text-pink-500" strokeWidth={2.1} />
                      <div>
                        <p className="text-sm font-semibold text-ink-900 font-body">
                          {b.display_name}
                        </p>
                        <p className="text-xs text-warm-500 font-body">
                          {b.day} {MONTHS[month].toLowerCase()}
                        </p>
                      </div>
                    </div>
                  ))}
              </>
            )}
          </div>
        </div>
      )}

      {modal && (
        <EventModal
          initial={modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
