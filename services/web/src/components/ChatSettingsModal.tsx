"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Hash, Lock, Megaphone, Timer, X } from "lucide-react";
import {
  updateChannel,
  updateChat,
  type Channel,
  type Chat,
} from "@/lib/api";

type Kind = "chat" | "channel";

type Props = {
  open: boolean;
  kind: Kind;
  familyId: string;
  target: Chat | Channel;
  canEdit: boolean;
  onClose: () => void;
  onUpdated: (next: Chat | Channel) => void;
};

const SLOW_MODE_PRESETS: { value: number; label: string }[] = [
  { value: 0, label: "Выкл" },
  { value: 5, label: "5 с" },
  { value: 10, label: "10 с" },
  { value: 30, label: "30 с" },
  { value: 60, label: "1 мин" },
  { value: 300, label: "5 мин" },
  { value: 900, label: "15 мин" },
  { value: 3600, label: "1 ч" },
  { value: 21600, label: "6 ч" },
];

export default function ChatSettingsModal({
  open,
  kind,
  familyId,
  target,
  canEdit,
  onClose,
  onUpdated,
}: Props) {
  const [name, setName] = useState(target.name);
  const [description, setDescription] = useState(target.description ?? "");
  const [slowMode, setSlowMode] = useState<number>(target.slow_mode_seconds ?? 0);
  const [is18plus, setIs18plus] = useState<boolean>(!!target.is_18plus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Сбрасываем форму при смене target/open
  useEffect(() => {
    if (!open) return;
    setName(target.name);
    setDescription(target.description ?? "");
    setSlowMode(target.slow_mode_seconds ?? 0);
    setIs18plus(!!target.is_18plus);
    setError("");
  }, [open, target]);

  const dirty = useMemo(() => {
    return (
      name.trim() !== target.name ||
      (description.trim() || null) !== (target.description ?? null) ||
      (slowMode || 0) !== (target.slow_mode_seconds ?? 0) ||
      !!is18plus !== !!target.is_18plus
    );
  }, [name, description, slowMode, is18plus, target]);

  if (!open) return null;

  async function handleSave() {
    if (!canEdit) return;
    if (!name.trim()) {
      setError("Введите название");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() ? description.trim() : null,
        slow_mode_seconds: slowMode,
        is_18plus: is18plus,
      };
      const next =
        kind === "chat"
          ? await updateChat(familyId, target.id, payload)
          : await updateChannel(familyId, target.id, payload);
      onUpdated(next);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  const Icon = kind === "channel" ? Megaphone : Hash;
  const titleNoun = kind === "channel" ? "канала" : "чата";

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/35 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => !saving && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={`Настройки ${titleNoun}`}
    >
      <div
        className="w-full max-w-lg rounded-3xl border border-white/70 bg-white/88 backdrop-blur-2xl p-6 shadow-[0_30px_90px_rgba(28,23,20,0.22)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl grid place-items-center"
              style={{ background: "var(--bg-surface-subtle)" }}>
              <Icon className="w-4 h-4 text-ink-700" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-xl text-ink-900 leading-tight truncate">
                Настройки {titleNoun}
              </h2>
              <p className="text-[12px] text-ink-400 font-body truncate"># {target.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg grid place-items-center text-ink-400 hover:text-ink-700 hover:bg-white/60 transition"
            disabled={saving}
            aria-label="Закрыть"
          >
            <X className="w-4 h-4" strokeWidth={2.3} />
          </button>
        </div>

        {!canEdit && (
          <div
            className="mb-4 rounded-xl border px-3 py-2 text-sm text-ink-500 font-body"
            style={{ background: "var(--bg-surface-subtle)", borderColor: "var(--border-warm-dim)" }}
          >
            Только владелец семьи может изменять настройки.
          </div>
        )}

        <div className="space-y-3.5">
          <div>
            <label className="block text-[12px] text-ink-500 font-body mb-1">
              Название
            </label>
            <input
              className="input-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              disabled={!canEdit || saving}
              data-testid="chat-settings-name"
            />
          </div>

          <div>
            <label className="block text-[12px] text-ink-500 font-body mb-1">
              Описание
              <span className="ml-2 text-ink-300">показывается в шапке</span>
            </label>
            <textarea
              className="input-field min-h-[88px] resize-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={kind === "channel" ? 500 : 2000}
              placeholder="Например: о чём этот канал, правила общения…"
              disabled={!canEdit || saving}
              data-testid="chat-settings-description"
            />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-[12px] text-ink-500 font-body mb-1.5">
              <Timer className="w-3.5 h-3.5" strokeWidth={2.2} />
              Медленный режим
            </label>
            <div className="flex flex-wrap gap-1.5">
              {SLOW_MODE_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  disabled={!canEdit || saving}
                  onClick={() => setSlowMode(p.value)}
                  className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold font-body border transition ${
                    slowMode === p.value
                      ? "bg-ink-900 text-white border-ink-900"
                      : "bg-white text-ink-700 border-ink-200 hover:border-ink-400 disabled:opacity-50"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-ink-400 font-body">
              {slowMode > 0
                ? `Между сообщениями участников должно проходить не менее ${formatSeconds(
                    slowMode,
                  )}. Владелец семьи правилу не подчиняется.`
                : "Сообщения отправляются без задержек."}
            </p>
          </div>

          <div
            className="flex items-start gap-3 p-3 rounded-xl border"
            style={{ background: "var(--bg-surface-subtle)", borderColor: "var(--border-warm-dim)" }}
          >
            <div className="mt-0.5">
              <Lock className="w-4 h-4 text-ink-600" strokeWidth={2.2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink-800 font-body">
                Только для участников 18+
              </p>
              <p className="text-[12px] text-ink-500 font-body mt-0.5 leading-relaxed">
                Если день рождения не указан или возраст меньше 18, доступ
                будет закрыт.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={is18plus}
              disabled={!canEdit || saving}
              onClick={() => setIs18plus((v) => !v)}
              className={`relative w-11 h-6 rounded-full border transition disabled:opacity-50 ${
                is18plus
                  ? "bg-ink-900 border-ink-900"
                  : "bg-ink-200 border-ink-200"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  is18plus ? "translate-x-5" : ""
                }`}
              />
            </button>
          </div>

          {error && (
            <p className="text-sm text-red-500 font-body" data-testid="chat-settings-error">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="ui-btn ui-btn-ghost"
              disabled={saving}
            >
              Закрыть
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={handleSave}
                className="ui-btn ui-btn-primary"
                disabled={saving || !dirty || !name.trim()}
                data-testid="chat-settings-save"
              >
                {saving ? "Сохраняем…" : "Сохранить"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatSeconds(sec: number): string {
  if (sec < 60) return `${sec} с`;
  if (sec < 3600) {
    const m = Math.round(sec / 60);
    return `${m} мин`;
  }
  const h = Math.round(sec / 3600);
  return `${h} ч`;
}
