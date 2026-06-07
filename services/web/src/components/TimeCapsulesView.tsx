"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Hourglass,
  Lock,
  LockOpen,
  Plus,
  ArrowLeft,
  Paperclip,
  Trash2,
  Send,
  Users,
} from "lucide-react";
import {
  getCapsules,
  getCapsule,
  createCapsule,
  addCapsuleEntry,
  deleteCapsuleEntry,
  deleteCapsule,
  type TimeCapsule,
  type TimeCapsuleDetail,
} from "@/lib/api";
import Modal from "@/components/Modal";
import { useConfirm } from "@/components/ConfirmDialog";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("ru-RU");
}

function countdown(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "открывается…";
  const min = Math.floor(ms / 60000);
  const days = Math.floor(min / 1440);
  const hours = Math.floor((min % 1440) / 60);
  const mins = min % 60;
  if (days > 0) return `через ${days} д ${hours} ч`;
  if (hours > 0) return `через ${hours} ч ${mins} мин`;
  return `через ${mins} мин`;
}

export default function TimeCapsulesView({
  familyId,
  meId,
}: {
  familyId: string;
  meId: string;
}) {
  const { confirm, notify } = useConfirm();
  const [capsules, setCapsules] = useState<TimeCapsule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCapsules(await getCapsules(familyId));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [familyId]);

  useEffect(() => {
    void load();
    setSelectedId(null);
  }, [load]);

  if (selectedId) {
    return (
      <CapsuleDetail
        familyId={familyId}
        meId={meId}
        capsuleId={selectedId}
        onBack={() => {
          setSelectedId(null);
          void load();
        }}
        onDeleted={() => {
          setSelectedId(null);
          void load();
        }}
      />
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <Hourglass className="w-6 h-6 text-warm-500" strokeWidth={2} />
            <h2 className="font-display text-2xl text-ink-900">Капсулы времени</h2>
          </div>
          <button
            type="button"
            className="ui-btn ui-btn-primary inline-flex items-center gap-1.5"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="w-4 h-4" strokeWidth={2.2} />
            Создать
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-ink-400 font-body">Загрузка…</p>
        ) : capsules.length === 0 ? (
          <div className="text-center py-16 text-ink-400 font-body">
            <Hourglass className="w-10 h-10 mx-auto mb-3 text-ink-300" strokeWidth={1.8} />
            <p>Пока нет капсул. Создайте послание в будущее —<br />семья наполнит его, и оно откроется в назначенный день.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {capsules.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className="w-full text-left rounded-2xl border border-[color:var(--border-glass)] bg-[color:var(--bg-surface)] p-4 transition hover:translate-y-[-1px] hover:bg-[color:var(--bg-surface-strong)]"
              >
                <div className="flex items-center gap-2 mb-1">
                  {c.opened ? (
                    <LockOpen className="w-4 h-4 text-[color:var(--success-fg-bold)]" strokeWidth={2.2} />
                  ) : (
                    <Lock className="w-4 h-4 text-warm-500" strokeWidth={2.2} />
                  )}
                  <p className="font-semibold text-ink-800 flex-1 truncate">{c.title}</p>
                  <span
                    className={`pill ${c.opened ? "text-[color:var(--success-fg-bold)]" : "pill-muted"}`}
                  >
                    {c.opened ? "Открыта" : countdown(c.unlock_at)}
                  </span>
                </div>
                <p className="text-xs text-ink-400 font-body flex items-center gap-3">
                  <span className="inline-flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" strokeWidth={2} />
                    {c.contributors} участн. · {c.total_entries} запис.
                  </span>
                  {!c.opened && (
                    <span>· вы добавили: {c.your_entries}</span>
                  )}
                  <span className="ml-auto">{c.opened ? "открыта" : "до"} {fmtDate(c.unlock_at)}</span>
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateCapsuleModal
          familyId={familyId}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function CreateCapsuleModal({
  familyId,
  onClose,
  onCreated,
}: {
  familyId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!title.trim()) return setError("Введите название");
    if (!when) return setError("Выберите дату открытия");
    const unlock = new Date(when);
    if (Number.isNaN(unlock.getTime()) || unlock.getTime() <= Date.now()) {
      return setError("Дата открытия должна быть в будущем");
    }
    setError("");
    setLoading(true);
    try {
      await createCapsule(familyId, { title: title.trim(), unlock_at: unlock.toISOString() });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal onClose={onClose} eyebrow="Капсула времени" title="Новая капсула" closeOnBackdrop={!loading}>
      <label className="text-xs text-ink-500 font-body block mb-1.5">Название</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        placeholder="Например: Новый год 2027"
        className="w-full rounded-xl border border-[color:var(--border-glass)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-ink-700 font-body focus:outline-none focus:ring-2 focus:ring-warm-200"
        autoFocus
      />
      <label className="text-xs text-ink-500 font-body block mt-4 mb-1.5">Дата открытия</label>
      <input
        type="datetime-local"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
        className="w-full rounded-xl border border-[color:var(--border-glass)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-ink-700 font-body focus:outline-none focus:ring-2 focus:ring-warm-200"
      />
      <p className="text-xs text-ink-400 font-body mt-2">
        До этой даты записи каждого скрыты от остальных. В день открытия капсула раскроется всем.
      </p>
      {error && <p className="text-[color:var(--danger-fg-strong)] text-sm font-body mt-3">{error}</p>}
      <div className="flex justify-end gap-2 mt-6">
        <button type="button" className="ui-btn ui-btn-subtle" onClick={onClose} disabled={loading}>
          Отмена
        </button>
        <button type="button" className="ui-btn ui-btn-primary" onClick={() => void handleCreate()} disabled={loading}>
          {loading ? "Создаём…" : "Создать"}
        </button>
      </div>
    </Modal>
  );
}

function CapsuleDetail({
  familyId,
  meId,
  capsuleId,
  onBack,
  onDeleted,
}: {
  familyId: string;
  meId: string;
  capsuleId: string;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const { confirm, notify } = useConfirm();
  const [capsule, setCapsule] = useState<TimeCapsuleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCapsule(await getCapsule(familyId, capsuleId));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [familyId, capsuleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sealed = useMemo(
    () => (capsule ? !capsule.opened : true),
    [capsule],
  );

  async function handleSend() {
    if (!text.trim() && files.length === 0) return;
    setSending(true);
    try {
      await addCapsuleEntry(familyId, capsuleId, { text, files });
      setText("");
      setFiles([]);
      await load();
    } catch (e) {
      void notify({ title: e instanceof Error ? e.message : "Не удалось добавить", tone: "danger" });
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteEntry(entryId: string) {
    const ok = await confirm({ title: "Удалить вашу запись?", confirmLabel: "Удалить", tone: "danger" });
    if (!ok) return;
    try {
      await deleteCapsuleEntry(familyId, capsuleId, entryId);
      await load();
    } catch (e) {
      void notify({ title: e instanceof Error ? e.message : "Ошибка", tone: "danger" });
    }
  }

  async function handleDeleteCapsule() {
    const ok = await confirm({
      title: "Удалить капсулу?",
      description: "Все записи и вложения будут удалены безвозвратно.",
      confirmLabel: "Удалить",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteCapsule(familyId, capsuleId);
      onDeleted();
    } catch (e) {
      void notify({ title: e instanceof Error ? e.message : "Не удалось удалить", tone: "danger" });
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink-700 font-body mb-3 transition"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={2.1} />К списку
        </button>

        {loading || !capsule ? (
          <p className="text-sm text-ink-400 font-body">Загрузка…</p>
        ) : (
          <>
            <div className="flex items-start gap-2 mb-1">
              {sealed ? (
                <Lock className="w-5 h-5 text-warm-500 mt-0.5" strokeWidth={2.1} />
              ) : (
                <LockOpen className="w-5 h-5 text-[color:var(--success-fg-bold)] mt-0.5" strokeWidth={2.1} />
              )}
              <h2 className="font-display text-2xl text-ink-900 flex-1">{capsule.title}</h2>
              {capsule.created_by === meId && (
                <button
                  type="button"
                  onClick={() => void handleDeleteCapsule()}
                  className="text-[color:var(--danger-fg-bold)] hover:text-[color:var(--danger-fg-strong)] p-1.5"
                  title="Удалить капсулу"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={2.1} />
                </button>
              )}
            </div>
            <p className="text-sm text-ink-400 font-body mb-5">
              {sealed
                ? `Запечатано · открытие ${fmtDate(capsule.unlock_at)} (${countdown(capsule.unlock_at)})`
                : `Открыта ${fmtDate(capsule.unlock_at)}`}
              {" · "}
              {capsule.contributors} участн. · {capsule.total_entries} запис.
            </p>

            {sealed && (
              <div className="rounded-2xl border border-[color:var(--border-glass)] bg-[color:var(--bg-surface-subtle)] p-4 mb-5">
                <p className="text-xs uppercase tracking-wider text-ink-400 font-body mb-2">
                  Добавить запись
                </p>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={3}
                  maxLength={4000}
                  placeholder="Послание себе и семье в будущее…"
                  className="w-full rounded-xl border border-[color:var(--border-glass)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-ink-700 font-body focus:outline-none focus:ring-2 focus:ring-warm-200 resize-none"
                />
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                />
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    className="ui-btn ui-btn-subtle inline-flex items-center gap-1.5"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Paperclip className="w-4 h-4" strokeWidth={2.1} />
                    Фото{files.length > 0 ? ` (${files.length})` : ""}
                  </button>
                  <span className="flex-1" />
                  <button
                    type="button"
                    className="ui-btn ui-btn-primary inline-flex items-center gap-1.5"
                    onClick={() => void handleSend()}
                    disabled={sending || (!text.trim() && files.length === 0)}
                  >
                    <Send className="w-4 h-4" strokeWidth={2.1} />
                    {sending ? "Добавляем…" : "Вложить"}
                  </button>
                </div>
              </div>
            )}

            <p className="text-xs uppercase tracking-wider text-ink-400 font-body mb-2">
              {sealed ? "Ваши записи" : "Записи семьи"}
            </p>
            {capsule.entries.length === 0 ? (
              <p className="text-sm text-ink-400 font-body">
                {sealed ? "Вы ещё ничего не добавили." : "Записей нет."}
              </p>
            ) : (
              <div className="space-y-3">
                {capsule.entries.map((e) => (
                  <div
                    key={e.id}
                    className="rounded-2xl border border-[color:var(--border-glass)] bg-[color:var(--bg-surface)] p-4"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-sm font-semibold text-ink-700">
                        {e.author_display_name ?? "Участник"}
                      </span>
                      <span className="text-xs text-ink-400">{fmtDate(e.created_at)}</span>
                      <span className="flex-1" />
                      {sealed && e.author_id === meId && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteEntry(e.id)}
                          className="text-[color:var(--danger-fg-bold)] hover:text-[color:var(--danger-fg-strong)]"
                          title="Удалить"
                        >
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={2.1} />
                        </button>
                      )}
                    </div>
                    {e.text && (
                      <p className="text-[15px] text-ink-800 whitespace-pre-wrap break-words leading-relaxed">
                        {e.text}
                      </p>
                    )}
                    {e.attachments.length > 0 && (
                      <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {e.attachments.map((a, i) =>
                          a.kind === "image" ? (
                            <img
                              key={i}
                              src={a.url}
                              alt={a.file_name}
                              className="rounded-xl w-full h-32 object-cover border border-[color:var(--border-glass)]"
                              loading="lazy"
                            />
                          ) : (
                            <a
                              key={i}
                              href={a.url}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-xl border border-[color:var(--border-glass)] bg-[color:var(--bg-surface-subtle)] p-3 text-xs text-ink-600 font-body truncate flex items-center gap-2"
                            >
                              <Paperclip className="w-4 h-4 shrink-0" strokeWidth={2} />
                              {a.file_name}
                            </a>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
