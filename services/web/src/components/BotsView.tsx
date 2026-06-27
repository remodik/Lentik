"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot as BotIcon,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import {
  createBot,
  deleteBot,
  getBots,
  regenerateBotToken,
  type Bot,
} from "@/lib/api";
import { API_BASE } from "@/lib/api-base";
import { useConfirm } from "@/components/ConfirmDialog";
import { hasBit, PERM, usePermissions } from "@/lib/usePermissions";

function CopyButton({ value, label = "Скопировать" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="ui-btn ui-btn-subtle inline-flex items-center gap-1.5"
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? <Check className="w-3.5 h-3.5" strokeWidth={2.4} /> : <Copy className="w-3.5 h-3.5" strokeWidth={2.2} />}
      {copied ? "Скопировано" : label}
    </button>
  );
}

export default function BotsView({ familyId }: { familyId: string }) {
  const { confirm, notify } = useConfirm();
  const { perms, loading: permsLoading } = usePermissions();
  const canManage =
    !!perms &&
    (perms.is_owner ||
      perms.is_administrator ||
      hasBit(perms.base, PERM.MANAGE_FAMILY));

  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Сырой токен показывается один раз — после создания/перевыпуска. Ключ = bot id.
  const [freshToken, setFreshToken] = useState<{ botId: string; token: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => bots.find((b) => b.id === selectedId) ?? null,
    [bots, selectedId],
  );

  const load = useCallback(async () => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await getBots(familyId);
      setBots(next);
      setSelectedId((prev) => (prev && next.some((b) => b.id === prev) ? prev : next[0]?.id ?? null));
    } catch (e) {
      console.error("getBots failed", e);
    } finally {
      setLoading(false);
    }
  }, [familyId, canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    const display_name = newName.trim();
    const username = newUsername.trim();
    if (!display_name || username.length < 2 || creating) return;
    setCreating(true);
    setCreateError("");
    try {
      const created = await createBot(familyId, {
        display_name,
        username,
        description: newDesc.trim() || null,
      });
      setBots((prev) => [...prev, created]);
      setSelectedId(created.id);
      setFreshToken({ botId: created.id, token: created.token });
      setCreateOpen(false);
      setNewName("");
      setNewUsername("");
      setNewDesc("");
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Не удалось создать бота");
    } finally {
      setCreating(false);
    }
  }

  async function handleRegenerate(bot: Bot) {
    const ok = await confirm({
      title: "Перевыпустить токен?",
      description: "Старый токен сразу перестанет работать — бота нужно будет переподключить с новым.",
      confirmLabel: "Перевыпустить",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const updated = await regenerateBotToken(familyId, bot.id);
      setBots((prev) => prev.map((b) => (b.id === bot.id ? updated : b)));
      setFreshToken({ botId: bot.id, token: updated.token });
    } catch (e) {
      void notify({ title: "Не удалось перевыпустить токен", description: e instanceof Error ? e.message : undefined, tone: "danger" });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(bot: Bot) {
    const ok = await confirm({
      title: "Удалить бота?",
      description: `Бот @${bot.username} будет удалён, его токен перестанет работать. Прошлые сообщения останутся в чатах.`,
      confirmLabel: "Удалить",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteBot(familyId, bot.id);
      const next = bots.filter((b) => b.id !== bot.id);
      setBots(next);
      setSelectedId((cur) => (cur === bot.id ? next[0]?.id ?? null : cur));
      if (freshToken?.botId === bot.id) setFreshToken(null);
    } catch (e) {
      void notify({ title: "Не удалось удалить бота", description: e instanceof Error ? e.message : undefined, tone: "danger" });
    } finally {
      setBusy(false);
    }
  }

  if (permsLoading) {
    return (
      <div className="h-full grid place-items-center">
        <Loader2 className="w-6 h-6 text-ink-300 animate-spin" strokeWidth={2.2} />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="h-full grid place-items-center px-6 text-center">
        <div className="max-w-sm">
          <ShieldAlert className="w-9 h-9 text-ink-300 mx-auto mb-3" strokeWidth={1.8} />
          <p className="font-display text-lg text-ink-800">Доступ ограничен</p>
          <p className="text-sm text-ink-400 font-body mt-1.5">
            Создавать и настраивать ботов может владелец семьи или участник с правом «Настройки семьи».
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col md:flex-row">
      <aside
        className="relative w-full md:shrink-0 md:w-72 border-b md:border-b-0 md:border-r p-3 md:p-4"
        style={{ borderColor: "var(--border-warm-dim)", background: "var(--bg-surface-subtle)" }}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-ink-400 font-body">Боты</p>
            <p className="text-sm text-ink-600 font-body mt-0.5">Автоматизация в семье</p>
          </div>
          <button
            type="button"
            className="ui-btn ui-btn-subtle !px-2.5 !py-1.5 inline-flex items-center gap-1.5 shrink-0"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.2} />
            <span className="hidden sm:inline">Создать</span>
          </button>
        </div>

        <div className="mt-3 md:mt-4 space-y-1.5 max-h-[220px] md:max-h-none md:h-[calc(100%-72px)] overflow-y-auto sidebar-scroll pr-1">
          {loading ? (
            <div className="text-sm text-ink-400 font-body px-1">Загрузка…</div>
          ) : bots.length === 0 ? (
            <div
              className="rounded-2xl border p-4 text-sm text-ink-400 font-body"
              style={{ borderColor: "var(--border-glass)", background: "var(--bg-surface)" }}
            >
              <p>Ботов пока нет</p>
              <button type="button" className="ui-btn ui-btn-subtle mt-3" onClick={() => setCreateOpen(true)}>
                Создать бота
              </button>
            </div>
          ) : (
            bots.map((bot) => {
              const active = bot.id === selectedId;
              return (
                <button
                  key={bot.id}
                  type="button"
                  onClick={() => setSelectedId(bot.id)}
                  className={`w-full text-left rounded-xl border px-3 py-2.5 transition flex items-center gap-2.5 ${
                    active ? "shadow-sm" : "hover:translate-y-[-1px]"
                  }`}
                  style={{
                    borderColor: active ? "var(--accent-border)" : "var(--border-glass)",
                    background: active ? "var(--accent-soft)" : "var(--bg-surface)",
                  }}
                >
                  <span className="w-8 h-8 shrink-0 rounded-lg grid place-items-center bg-gradient-to-br from-warm-300 via-warm-400 to-warm-500 text-white">
                    <BotIcon className="w-4 h-4" strokeWidth={2.1} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-ink-800 truncate">{bot.display_name}</span>
                      <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md border border-[color:var(--accent-border)] bg-[var(--accent-soft)] text-[color:var(--warm-700)]">
                        Бот
                      </span>
                    </span>
                    <span className="block text-xs text-ink-400 font-body truncate">@{bot.username}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <section className="flex-1 min-h-0 min-w-0 overflow-y-auto sidebar-scroll">
        {!selected ? (
          <div className="h-full grid place-items-center px-6 text-center">
            <div>
              <BotIcon className="w-9 h-9 text-ink-300 mx-auto mb-3" strokeWidth={1.7} />
              <p className="text-base font-semibold text-ink-800">Создайте первого бота</p>
              <p className="text-sm text-ink-400 font-body mt-1">Получите токен и подключите свою автоматизацию.</p>
              <button type="button" className="btn-primary mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm rounded-xl" onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4" strokeWidth={2.2} /> Создать бота
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-5">
            <header className="flex items-start gap-3">
              <span className="w-12 h-12 shrink-0 rounded-2xl grid place-items-center bg-gradient-to-br from-warm-300 via-warm-400 to-warm-500 text-white">
                <BotIcon className="w-6 h-6" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-xl text-ink-900 truncate">{selected.display_name}</h2>
                  <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md border border-[color:var(--accent-border)] bg-[var(--accent-soft)] text-[color:var(--warm-700)]">
                    Бот
                  </span>
                </div>
                <p className="text-[13px] text-ink-400 font-body">@{selected.username}</p>
                {selected.description && (
                  <p className="text-sm text-ink-600 font-body mt-2 leading-relaxed">{selected.description}</p>
                )}
              </div>
            </header>

            {/* Токен */}
            <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border-glass)", background: "var(--bg-surface)" }}>
              <div className="flex items-center gap-2 mb-2">
                <KeyRound className="w-4 h-4 text-ink-500" strokeWidth={2.1} />
                <p className="text-sm font-semibold text-ink-800 font-body">Токен доступа</p>
              </div>

              {freshToken?.botId === selected.id ? (
                <div
                  className="rounded-xl border p-3"
                  style={{ borderColor: "var(--accent-border)", background: "var(--accent-soft)" }}
                >
                  <p className="text-[12px] text-[color:var(--warm-700)] font-body mb-2">
                    Новый токен — сохраните его сейчас, повторно мы его не покажем.
                  </p>
                  <code className="block text-[12.5px] font-mono text-ink-900 break-all bg-[var(--bg-surface)] border border-[color:var(--border-glass)] rounded-lg px-3 py-2">
                    {freshToken.token}
                  </code>
                  <div className="flex items-center gap-2 mt-2">
                    <CopyButton value={freshToken.token} />
                    <button
                      type="button"
                      className="ui-btn ui-btn-subtle inline-flex items-center gap-1.5"
                      onClick={() => setFreshToken(null)}
                    >
                      <Check className="w-3.5 h-3.5" strokeWidth={2.3} /> Я сохранил
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="flex-1 min-w-[180px] text-[12.5px] font-mono text-ink-500 bg-[var(--bg-surface-subtle)] border border-[color:var(--border-glass)] rounded-lg px-3 py-2">
                    {selected.token_prefix}••••••••••••
                  </code>
                  <button
                    type="button"
                    className="ui-btn ui-btn-subtle inline-flex items-center gap-1.5"
                    onClick={() => handleRegenerate(selected)}
                    disabled={busy}
                  >
                    <RefreshCw className="w-3.5 h-3.5" strokeWidth={2.2} /> Перевыпустить
                  </button>
                </div>
              )}
              <p className="text-[11px] text-ink-400 font-body mt-2">
                Токен виден один раз при создании или перевыпуске. Храните его в секрете — он действует от имени бота в семье.
              </p>
            </div>

            {/* Подключение */}
            <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border-glass)", background: "var(--bg-surface)" }}>
              <p className="text-sm font-semibold text-ink-800 font-body mb-2">Подключение</p>
              <pre className="text-[12px] font-mono text-ink-600 bg-[var(--bg-surface-subtle)] border border-[color:var(--border-glass)] rounded-xl p-3 overflow-x-auto leading-relaxed">{`curl -X POST ${API_BASE}/bot/families/${familyId}/chats/{chat_id}/messages \\
  -H "Authorization: Bearer ${selected.token_prefix}…" \\
  -H "Content-Type: application/json" \\
  -d '{"text":"Доброе утро, семья!"}'`}</pre>
              <p className="text-[11px] text-ink-400 font-body mt-2">
                Боту нужно право «Отправлять сообщения» в чате — назначьте ему роль в разделе «Участники».
              </p>
            </div>

            <div className="flex justify-end border-t pt-4" style={{ borderColor: "var(--border-glass)" }}>
              <button
                type="button"
                className="ui-btn ui-btn-danger inline-flex items-center gap-1.5"
                onClick={() => handleDelete(selected)}
                disabled={busy}
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={2.2} /> Удалить бота
              </button>
            </div>
          </div>
        )}
      </section>

      {createOpen && (
        <div
          className="fixed inset-0 z-[80] bg-black/35 backdrop-blur-sm p-4 flex items-center justify-center"
          onClick={() => !creating && setCreateOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Создать бота"
        >
          <div
            className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto sidebar-scroll rounded-3xl border border-[color:var(--border-glass-strong)] bg-[color:var(--bg-elevated)] backdrop-blur-2xl p-6 shadow-[0_30px_90px_var(--scrim-4)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-xl text-ink-900">Новый бот</h3>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="w-8 h-8 rounded-lg grid place-items-center text-ink-400 hover:text-ink-700 hover:bg-white/60 transition"
                disabled={creating}
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" strokeWidth={2.3} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-ink-400 uppercase tracking-widest font-body mb-1.5 block">
                  Имя
                </label>
                <input
                  autoFocus
                  className="input-field"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Например: Семейный помощник"
                  maxLength={64}
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-ink-400 uppercase tracking-widest font-body mb-1.5 block">
                  Юзернейм
                </label>
                <input
                  className="input-field"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value.replace(/\s+/g, ""))}
                  placeholder="helper"
                  maxLength={64}
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-ink-400 uppercase tracking-widest font-body mb-1.5 block">
                  Описание <span className="text-ink-300 normal-case font-normal">(необязательно)</span>
                </label>
                <textarea
                  className="input-field resize-none"
                  rows={2}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Что делает бот"
                  maxLength={500}
                />
              </div>

              {createError && <p className="text-red-500 text-sm font-body">{createError}</p>}
            </div>

            <div className="flex gap-3 pt-5">
              <button
                type="button"
                className="flex-1 btn-primary py-2.5 text-sm rounded-xl inline-flex items-center justify-center gap-2 disabled:opacity-50"
                onClick={() => void handleCreate()}
                disabled={creating || !newName.trim() || newUsername.trim().length < 2}
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.2} /> : null}
                {creating ? "Создание…" : "Создать"}
              </button>
              <button
                type="button"
                className="flex-1 ui-btn ui-btn-subtle py-2.5"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
