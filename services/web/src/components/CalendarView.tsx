"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getCalendarEvents, createCalendarEvent, deleteCalendarEvent, updateCalendarEvent,
  type CalendarEvent, type CalendarEventCreate, type FamilyMember,
} from "@/lib/api";

const MONTHS = [
  "Январь","Февраль","Март","Апрель","Май","Июнь",
  "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь",
];
const WEEKDAYS = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

const COLOR_MAP: Record<CalendarEvent["color"], { bg: string; text: string; dot: string; light: string }> = {
  blue: { bg: "bg-blue-500", text: "text-blue-700", dot: "bg-blue-400", light: "bg-blue-50 border-blue-200" },
  red: { bg: "bg-red-500", text: "text-red-700", dot: "bg-red-400", light: "bg-red-50 border-red-200" },
  green: { bg: "bg-green-500", text: "text-green-700", dot: "bg-green-400", light: "bg-green-50 border-green-200" },
  yellow: { bg: "bg-amber-400", text: "text-amber-700", dot: "bg-amber-400", light: "bg-amber-50 border-amber-200" },
  purple: { bg: "bg-purple-500", text: "text-purple-700", dot: "bg-purple-400", light: "bg-purple-50 border-purple-200" },
  orange: { bg: "bg-orange-400", text: "text-orange-700", dot: "bg-orange-400", light: "bg-orange-50 border-orange-200" },
};

const COLOR_LABELS: { value: CalendarEvent["color"]; label: string }[] = [
  { value: "blue", label: "Синий" },
  { value: "green", label: "Зелёный" },
  { value: "red", label: "Красный" },
  { value: "yellow", label: "Жёлтый" },
  { value: "purple", label: "Фиолетовый" },
  { value: "orange", label: "Оранжевый" },
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1;
}
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
}
function formatDT(iso: string) {
  return new Date(iso).toLocaleString("ru", {
    day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  });
}
function birthdayEventsForMonth(members: FamilyMember[], year: number, month: number): BirthdayEvent[] {
  return members
    .filter(m => m.birthday)
    .map(m => {
      const bday = new Date(m.birthday!);
      return { day: bday.getDate(), month: bday.getMonth(), display_name: m.display_name };
    })
    .filter(b => b.month === month);
}

type BirthdayEvent = { day: number; month: number; display_name: string };

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
  const [color, setColor] = useState<CalendarEvent["color"]>(editing?.color ?? "blue");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const defaultDate = initial?.date ?? new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const defaultDateStr = `${defaultDate.getFullYear()}-${pad(defaultDate.getMonth() + 1)}-${pad(defaultDate.getDate())}`;

  const toInputValue = (iso: string | null | undefined, fallback: string) => {
    if (!iso) return `${fallback}T12:00`;
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [startsAt, setStartsAt] = useState(toInputValue(editing?.starts_at, defaultDateStr));
  const [endsAt, setEndsAt] = useState(toInputValue(editing?.ends_at, defaultDateStr));
  const [hasEnd, setHasEnd] = useState(!!editing?.ends_at);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Введи название");
    setSaving(true); setError("");
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: hasEnd ? new Date(endsAt).toISOString() : null,
        color,
      }, editing?.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally { setSaving(false); }
  }

  const colors = COLOR_MAP[color];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className={`${colors.bg} px-6 py-5`}>
          <p className="text-white/80 text-xs font-body uppercase tracking-widest mb-1">
            {editing ? "Редактировать событие" : "Новое событие"}
          </p>
          <p className="text-white font-display text-xl truncate">{title || "Без названия"}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-ink-400 uppercase tracking-wider font-body mb-1.5 block">
              Название
            </label>
            <input
              autoFocus value={title} onChange={e => setTitle(e.target.value)}
              placeholder="День рождения, встреча…"
              className="input-field"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-ink-400 uppercase tracking-wider font-body mb-1.5 block">
              Описание <span className="text-ink-300 normal-case font-normal">(необязательно)</span>
            </label>
            <textarea
              value={description} onChange={e => setDescription(e.target.value)}
              rows={2} maxLength={1000} placeholder="Подробности…"
              className="input-field resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-ink-400 uppercase tracking-wider font-body mb-1.5 block">
              Начало
            </label>
            <input
              type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)}
              className="input-field"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer mb-1.5">
              <input type="checkbox" checked={hasEnd} onChange={e => setHasEnd(e.target.checked)}
                className="accent-ink-900 w-3.5 h-3.5" />
              <span className="text-xs font-semibold text-ink-400 uppercase tracking-wider font-body">
                Конец события
              </span>
            </label>
            {hasEnd && (
              <input
                type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)}
                className="input-field"
              />
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-ink-400 uppercase tracking-wider font-body mb-2 block">
              Цвет метки
            </label>
            <div className="flex gap-2 flex-wrap">
              {COLOR_LABELS.map(({ value, label }) => (
                <button
                  key={value} type="button"
                  onClick={() => setColor(value)}
                  title={label}
                  className={`w-7 h-7 rounded-full ${COLOR_MAP[value].bg} transition-transform
                              ${color === value ? "ring-2 ring-offset-2 ring-ink-900 scale-110" : "opacity-60 hover:opacity-100"}`}
                />
              ))}
            </div>
          </div>

          {error && <p className="text-red-500 text-sm font-body">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 bg-ink-900 text-cream-50 text-sm font-medium rounded-xl
                         hover:bg-ink-700 transition-colors disabled:opacity-50 font-body">
              {saving ? "Сохранение…" : editing ? "Сохранить" : "Создать"}
            </button>
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 bg-cream-100 text-ink-700 text-sm font-medium rounded-xl
                         hover:bg-cream-200 transition-colors font-body">
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DayPanel({
  date, events, birthdays, meId,
  onEdit, onDelete, onAdd, onClose,
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

  const dateLabel = date.toLocaleDateString("ru", {
    weekday: "long", day: "numeric", month: "long",
  });

  const isToday = isSameDay(date, new Date());

  async function handleDelete(id: string) {
    if (!confirm("Удалить событие?")) return;
    setDeleting(id);
    try { await onDelete(id); }
    finally { setDeleting(null); }
  }

  return (
    <div className="flex flex-col h-full bg-white border-l border-cream-200">
      <div className="px-5 py-4 border-b border-cream-100 flex items-start justify-between shrink-0">
        <div>
          <p className={`font-display text-2xl ${isToday ? "text-warm-500" : "text-ink-900"}`}>
            {date.getDate()}
          </p>
          <p className="text-sm text-ink-400 font-body capitalize">{dateLabel.replace(/^\d+\s/, "")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onAdd}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-ink-900 text-white
                       hover:bg-ink-700 transition-colors text-xl leading-none font-body"
            title="Добавить событие">+
          </button>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-cream-100 text-ink-500
                       hover:bg-cream-200 transition-colors text-lg">×
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {birthdays.map((b, i) => (
          <div key={i} className="flex items-center gap-3 p-3 bg-pink-50 border border-pink-200 rounded-2xl">
            <span className="text-xl">🎂</span>
            <div>
              <p className="text-sm font-semibold text-ink-900 font-body">{b.display_name}</p>
              <p className="text-xs text-pink-500 font-body">День рождения</p>
            </div>
          </div>
        ))}

        {events.length === 0 && birthdays.length === 0 && (
          <div className="text-center py-8">
            <p className="text-3xl mb-2">📅</p>
            <p className="text-ink-400 text-sm font-body">Нет событий</p>
            <button onClick={onAdd}
              className="mt-3 text-sm text-warm-500 hover:underline font-body">
              Добавить событие
            </button>
          </div>
        )}

        {events.map(ev => {
          const c = COLOR_MAP[ev.color];
          const isOwner = ev.created_by === meId;
          return (
            <div key={ev.id} className={`rounded-2xl border p-4 ${c.light}`}>
              <div className="flex items-start gap-2">
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${c.dot}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink-900 font-body">{ev.title}</p>
                  {ev.description && (
                    <p className="text-xs text-ink-500 font-body mt-1 leading-relaxed">{ev.description}</p>
                  )}
                  <p className="text-xs text-ink-400 font-body mt-2">
                    {formatTime(ev.starts_at)}
                    {ev.ends_at && ` — ${formatTime(ev.ends_at)}`}
                    {ev.creator_name && ` · ${ev.creator_name}`}
                  </p>
                </div>
                {isOwner && (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => onEdit(ev)}
                      className="p-1 text-ink-300 hover:text-ink-700 transition-colors text-xs rounded-lg hover:bg-white/60">
                      ✏️
                    </button>
                    <button onClick={() => handleDelete(ev.id)} disabled={deleting === ev.id}
                      className="p-1 text-ink-300 hover:text-red-500 transition-colors text-xs rounded-lg hover:bg-white/60 disabled:opacity-50">
                      🗑️
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
  familyId, meId, members = [],
}: {
  familyId: string;
  meId: string;
  members?: FamilyMember[];
}) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [modal, setModal] = useState<{ date: Date; event?: CalendarEvent } | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const evs = await getCalendarEvents(familyId, year, month + 1);
      setEvents(evs);
    } finally { setLoading(false); }
  }, [familyId, year, month]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelectedDay(null);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelectedDay(null);
  }
  function goToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedDay(today);
  }

  async function handleSave(data: CalendarEventCreate, id?: string) {
    if (id) {
      const updated = await updateCalendarEvent(familyId, id, data);
      setEvents(p => p.map(e => e.id === id ? updated : e));
    } else {
      const created = await createCalendarEvent(familyId, data);
      setEvents(p => [...p, created]);
    }
  }

  async function handleDelete(id: string) {
    await deleteCalendarEvent(familyId, id);
    setEvents(p => p.filter(e => e.id !== id));
  }

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  const birthdays = birthdayEventsForMonth(members, year, month);

  function eventsForDay(day: number): CalendarEvent[] {
    return events.filter(ev => {
      const d = new Date(ev.starts_at);
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    });
  }

  function birthdaysForDay(day: number): BirthdayEvent[] {
    return birthdays.filter(b => b.day === day);
  }

  const upcomingEvents = events
    .filter(ev => new Date(ev.starts_at) >= today)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .slice(0, 5);

  const dayPanelEvents = selectedDay ? eventsForDay(selectedDay.getDate()) : [];
  const dayPanelBirthdays = selectedDay ? birthdaysForDay(selectedDay.getDate()) : [];

  return (
    <div className="flex h-full bg-cream-50 overflow-hidden">

      <div className="flex flex-col flex-1 min-w-0">

        <header className="shrink-0 bg-white border-b border-cream-200 px-6 py-4 flex items-center gap-4">
          <div className="flex items-center gap-3 mr-auto">
            <button onClick={prevMonth}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-cream-100 text-ink-600
                         hover:bg-cream-200 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="font-display text-xl text-ink-900 min-w-[180px] text-center">
              {MONTHS[month]} {year}
            </h2>
            <button onClick={nextMonth}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-cream-100 text-ink-600
                         hover:bg-cream-200 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <button onClick={goToday}
            className="px-4 py-2 text-sm bg-cream-100 text-ink-700 rounded-xl hover:bg-cream-200
                       transition-colors font-body font-medium">
            Сегодня
          </button>
          <button
            onClick={() => setModal({ date: selectedDay ?? today })}
            className="flex items-center gap-2 px-4 py-2 bg-ink-900 text-cream-50 text-sm
                       font-medium rounded-xl hover:bg-ink-700 transition-colors font-body">
            <span className="text-base leading-none">+</span> Событие
          </button>
        </header>

        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-7 border-b border-cream-200 bg-white sticky top-0 z-10">
            {WEEKDAYS.map(d => (
              <div key={d} className="py-2 text-center text-xs font-semibold text-ink-400 uppercase tracking-wider font-body">
                {d}
              </div>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-2 border-cream-300 border-t-warm-400 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {Array.from({ length: totalCells }).map((_, idx) => {
                const dayNum = idx - firstDay + 1;
                const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
                const dayDate = inMonth ? new Date(year, month, dayNum) : null;
                const isToday = dayDate ? isSameDay(dayDate, today) : false;
                const isSelected = dayDate && selectedDay ? isSameDay(dayDate, selectedDay) : false;
                const dayEvents = inMonth ? eventsForDay(dayNum) : [];
                const dayBdays = inMonth ? birthdaysForDay(dayNum) : [];
                const hasContent = dayEvents.length > 0 || dayBdays.length > 0;

                return (
                  <div
                    key={idx}
                    onClick={() => inMonth && dayDate && setSelectedDay(isSelected ? null : dayDate)}
                    className={`min-h-[100px] p-2 border-b border-r border-cream-200 transition-colors cursor-pointer
                      ${!inMonth ? "bg-cream-50/50" : isSelected ? "bg-warm-50" : "bg-white hover:bg-cream-50"}`}
                  >
                    {inMonth && (
                      <>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold font-body transition-colors
                            ${isToday ? "bg-warm-400 text-white" : isSelected ? "bg-ink-200 text-ink-900" : "text-ink-700"}`}>
                            {dayNum}
                          </span>
                          {hasContent && (
                            <span className="text-[10px] text-ink-300 font-body">
                              {dayEvents.length + dayBdays.length}
                            </span>
                          )}
                        </div>

                        <div className="space-y-0.5">
                          {dayBdays.slice(0, 1).map((b, i) => (
                            <div key={i} className="flex items-center gap-1 px-1.5 py-0.5 bg-pink-50 border border-pink-200 rounded-md">
                              <span className="text-[10px]">🎂</span>
                              <span className="text-[10px] font-body text-pink-700 truncate">{b.display_name}</span>
                            </div>
                          ))}

                          {dayEvents.slice(0, 2).map(ev => {
                            const c = COLOR_MAP[ev.color];
                            return (
                              <div key={ev.id}
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md ${c.light} border`}
                                onClick={e => { e.stopPropagation(); setSelectedDay(new Date(year, month, dayNum)); }}>
                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
                                <span className={`text-[10px] font-body truncate ${c.text}`}>{ev.title}</span>
                              </div>
                            );
                          })}

                          {(dayEvents.length + dayBdays.length) > 3 && (
                            <p className="text-[10px] text-ink-400 font-body px-1">
                              +{dayEvents.length + dayBdays.length - 3} ещё
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
        <div className="w-72 shrink-0 flex flex-col overflow-hidden">
          <DayPanel
            date={selectedDay}
            events={dayPanelEvents}
            birthdays={dayPanelBirthdays}
            meId={meId}
            onEdit={ev => setModal({ date: selectedDay, event: ev })}
            onDelete={async id => { await handleDelete(id); }}
            onAdd={() => setModal({ date: selectedDay })}
            onClose={() => setSelectedDay(null)}
          />
        </div>
      ) : (
        <div className="w-72 shrink-0 flex flex-col bg-white border-l border-cream-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-cream-100 shrink-0">
            <p className="font-display text-base text-ink-900">Ближайшие события</p>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {upcomingEvents.length === 0 && !loading && (
              <div className="text-center py-8">
                <p className="text-3xl mb-2">🗓️</p>
                <p className="text-ink-400 text-sm font-body">Нет предстоящих событий</p>
              </div>
            )}
            {upcomingEvents.map(ev => {
              const c = COLOR_MAP[ev.color];
              return (
                <div key={ev.id}
                  onClick={() => {
                    const d = new Date(ev.starts_at);
                    setYear(d.getFullYear());
                    setMonth(d.getMonth());
                    setSelectedDay(d);
                  }}
                  className={`p-3 rounded-2xl border cursor-pointer hover:shadow-sm transition-all ${c.light}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-2 h-2 rounded-full ${c.dot}`} />
                    <p className={`text-xs font-semibold font-body ${c.text}`}>
                      {formatDT(ev.starts_at)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-ink-900 font-body">{ev.title}</p>
                  {ev.description && (
                    <p className="text-xs text-ink-500 font-body mt-0.5 line-clamp-2">{ev.description}</p>
                  )}
                </div>
              );
            })}

            {birthdays.length > 0 && (
              <>
                <div className="pt-3 border-t border-cream-100">
                  <p className="text-xs font-semibold text-ink-300 uppercase tracking-wider font-body mb-2">
                    Дни рождения в {MONTHS[month].toLowerCase()}е
                  </p>
                </div>
                {birthdays.sort((a, b) => a.day - b.day).map((b, i) => (
                  <div key={i}
                    onClick={() => setSelectedDay(new Date(year, month, b.day))}
                    className="p-3 rounded-2xl bg-pink-50 border border-pink-200 cursor-pointer hover:shadow-sm transition-all flex items-center gap-3">
                    <span className="text-xl">🎂</span>
                    <div>
                      <p className="text-sm font-semibold text-ink-900 font-body">{b.display_name}</p>
                      <p className="text-xs text-pink-500 font-body">{b.day} {MONTHS[month].toLowerCase()}</p>
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