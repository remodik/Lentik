"use client";

import React, { useEffect, useRef, useState } from "react";
import { Loader2, ShieldAlert, X } from "lucide-react";
import Select from "@/components/Select";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  getModeration,
  updateModeration,
  type ModerationSettings,
} from "@/lib/api";

const SLOW_MODE_PRESETS = [
  { value: 0, label: "Выключен" },
  { value: 5, label: "5 секунд" },
  { value: 10, label: "10 секунд" },
  { value: 30, label: "30 секунд" },
  { value: 60, label: "1 минута" },
  { value: 300, label: "5 минут" },
  { value: 900, label: "15 минут" },
  { value: 3600, label: "1 час" },
];

const MAX_WORD_LEN = 60;
const MAX_WORDS = 200;

type Props = {
  familyId: string;
  canManage: boolean;
};

export default function ModerationEditor({ familyId, canManage }: Props) {
  const { notify } = useConfirm();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);

  const [inviteMax, setInviteMax] = useState(0);
  const [slowmode, setSlowmode] = useState(0);
  const [maxLen, setMaxLen] = useState(0);
  const [words, setWords] = useState<string[]>([]);
  const [wordDraft, setWordDraft] = useState("");
  const wordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError("");
    getModeration(familyId)
      .then((s) => {
        if (!alive) return;
        setInviteMax(s.invite_max_active);
        setSlowmode(s.slowmode_default_seconds);
        setMaxLen(s.max_message_length);
        setWords(s.banned_words ?? []);
      })
      .catch((e) => {
        if (!alive) return;
        setLoadError(e instanceof Error ? e.message : "Не удалось загрузить настройки");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [familyId]);

  function addWord(raw: string) {
    const word = raw.replace(/\s+/g, " ").trim().slice(0, MAX_WORD_LEN);
    if (!word) return;
    setWords((prev) => {
      if (prev.length >= MAX_WORDS) return prev;
      if (prev.some((w) => w.toLowerCase() === word.toLowerCase())) return prev;
      return [...prev, word];
    });
    setWordDraft("");
  }

  function removeWord(target: string) {
    setWords((prev) => prev.filter((w) => w !== target));
  }

  function handleWordKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addWord(wordDraft);
    } else if (e.key === "Backspace" && !wordDraft && words.length > 0) {
      setWords((prev) => prev.slice(0, -1));
    }
  }

  async function handleSave() {
    if (!canManage) return;
    setSaving(true);
    try {
      const pending = wordDraft.replace(/\s+/g, " ").trim();
      const finalWords =
        pending && !words.some((w) => w.toLowerCase() === pending.toLowerCase())
          ? [...words, pending.slice(0, MAX_WORD_LEN)]
          : words;

      const payload: ModerationSettings = {
        invite_max_active: Math.max(0, Math.floor(inviteMax) || 0),
        slowmode_default_seconds: slowmode,
        banned_words: finalWords,
        max_message_length: Math.max(0, Math.floor(maxLen) || 0),
      };
      const saved = await updateModeration(familyId, payload);
      setInviteMax(saved.invite_max_active);
      setSlowmode(saved.slowmode_default_seconds);
      setMaxLen(saved.max_message_length);
      setWords(saved.banned_words ?? []);
      setWordDraft("");
      void notify({ title: "Настройки модерации сохранены" });
    } catch (e) {
      void notify({
        title: "Не удалось сохранить",
        description: e instanceof Error ? e.message : undefined,
        tone: "danger",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-ink-400 font-body text-sm py-8 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.2} />
        Загрузка настроек…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/50 p-5 text-sm text-red-700 font-body">
        {loadError}
      </div>
    );
  }

  const disabled = !canManage || saving;

  return (
    <div className="space-y-7">
      <div className="rounded-2xl border border-[color:var(--border-glass)] bg-[color:var(--bg-surface-subtle)] px-4 py-3 flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-warm-100 text-warm-700 grid place-items-center shrink-0">
          <ShieldAlert className="w-4 h-4" strokeWidth={2.1} />
        </span>
        <p className="text-xs text-ink-500 font-body leading-relaxed">
          Базовые правила модерации для всей семьи. Применяются ко всем чатам и
          каналам.
        </p>
      </div>

      <Field
        title="Стоп-слова"
        description="Сообщения и посты, содержащие эти слова, не будут отправлены. Регистр не важен, проверка по целым словам."
      >
        <div
          className={`flex flex-wrap gap-1.5 rounded-xl border px-2.5 py-2 min-h-[44px] transition ${
            disabled
              ? "border-[color:var(--border-glass)] bg-[color:var(--bg-surface)] opacity-70"
              : "border-[color:var(--border-glass-strong)] bg-[color:var(--bg-elevated)]"
          }`}
          onClick={() => wordInputRef.current?.focus()}
        >
          {words.map((w) => (
            <span
              key={w}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-warm-100 text-warm-800 text-xs font-medium"
            >
              {w}
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeWord(w);
                  }}
                  className="text-warm-600 hover:text-warm-900 transition"
                  aria-label={`Удалить «${w}»`}
                >
                  <X className="w-3 h-3" strokeWidth={2.6} />
                </button>
              )}
            </span>
          ))}
          <input
            ref={wordInputRef}
            className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-ink-800 placeholder:text-ink-400 py-1"
            value={wordDraft}
            onChange={(e) => setWordDraft(e.target.value)}
            onKeyDown={handleWordKeyDown}
            onBlur={() => addWord(wordDraft)}
            placeholder={words.length === 0 ? "Введите слово и нажмите Enter" : "Добавить…"}
            maxLength={MAX_WORD_LEN}
            disabled={disabled}
          />
        </div>
        <p className="text-[11px] text-ink-400 font-body mt-1.5">
          {words.length}/{MAX_WORDS} слов. Enter или запятая — добавить.
        </p>
      </Field>

      <Field
        title="Максимальная длина сообщения"
        description="Дополнительный лимит поверх стандартных 4000 символов. 0 — без доп. ограничения."
      >
        <input
          type="number"
          min={0}
          max={4000}
          className="input-field max-w-[200px]"
          value={maxLen}
          onChange={(e) => setMaxLen(Number(e.target.value))}
          disabled={disabled}
        />
      </Field>

      <Field
        title="Дефолтный медленный режим"
        description="Применяется к новым чатам и каналам при создании."
      >
        <div className="max-w-[260px]">
          <Select
            value={String(slowmode)}
            onChange={(v) => setSlowmode(Number(v))}
            options={SLOW_MODE_PRESETS.map((p) => ({
              value: String(p.value),
              label: p.label,
            }))}
            disabled={disabled}
            ariaLabel="Дефолтный медленный режим"
          />
        </div>
      </Field>

      <Field
        title="Лимит активных приглашений"
        description="Максимум одновременно действующих приглашений. 0 — без лимита."
      >
        <input
          type="number"
          min={0}
          max={1000}
          className="input-field max-w-[200px]"
          value={inviteMax}
          onChange={(e) => setInviteMax(Number(e.target.value))}
          disabled={disabled}
        />
      </Field>

      {canManage && (
        <div className="flex justify-end pt-2 border-t border-[color:var(--border-warm-dim)]">
          <button
            type="button"
            className="ui-btn ui-btn-primary inline-flex items-center gap-2"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.2} />}
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      )}
    </div>
  );
}

function Field({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h4 className="text-sm font-semibold text-ink-800 font-body inline-flex items-center gap-1.5">
        {title}
      </h4>
      {description && (
        <p className="text-xs text-ink-500 font-body mt-1 leading-relaxed">{description}</p>
      )}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}
