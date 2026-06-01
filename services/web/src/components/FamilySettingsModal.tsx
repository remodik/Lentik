"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ChevronRight,
  Crown,
  Download,
  Hash,
  History,
  Info,
  LogOut,
  MessageCircle,
  Pencil,
  Shield,
  Sparkles,
  Trash2,
  Users,
  Wand2,
  X,
} from "lucide-react";
import {
  deleteFamily,
  leaveFamily,
  renameFamily,
  transferOwnership,
  type Channel,
  type Chat,
  type Family,
  type Me,
} from "@/lib/api";
import { useConfirm } from "@/components/ConfirmDialog";
import { useUserMode } from "@/lib/useUserMode";
import { hasBit, PERM, usePermissions } from "@/lib/usePermissions";
import RolesEditor from "@/components/RolesEditor";
import ChannelPermissionsEditor from "@/components/ChannelPermissionsEditor";
import AuditLogView from "@/components/AuditLogView";
import ModerationEditor from "@/components/ModerationEditor";

type TabId =
  | "overview"
  | "roles"
  | "channels"
  | "chats"
  | "moderation"
  | "audit"
  | "integrations"
  | "danger";

type TabDef = {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Если true — пометка «скоро». */
  comingSoon?: boolean;
  /** Если true — только владельцам. */
  ownerOnly?: boolean;
  /** Если true — только тем, кто может управлять семьёй (owner или MANAGE_FAMILY). */
  manageOnly?: boolean;
  /** Если true — видна только в advanced-режиме. */
  advancedOnly?: boolean;
  /** Категория для группировки в сайдбаре. */
  category: "info" | "configure" | "danger";
};

const TABS: TabDef[] = [
  { id: "overview", label: "Обзор", icon: Info, category: "info" },
  { id: "roles", label: "Роли", icon: Shield, category: "configure", ownerOnly: true, advancedOnly: true },
  { id: "channels", label: "Каналы", icon: Hash, category: "configure", ownerOnly: true, advancedOnly: true },
  { id: "chats", label: "Чаты", icon: MessageCircle, category: "configure", ownerOnly: true, advancedOnly: true },
  { id: "moderation", label: "Модерация", icon: Wand2, category: "configure", manageOnly: true, advancedOnly: true },
  { id: "audit", label: "Журнал аудита", icon: History, category: "configure", ownerOnly: false, advancedOnly: true },
  { id: "integrations", label: "Интеграции", icon: Sparkles, category: "configure", comingSoon: true, ownerOnly: true, advancedOnly: true },
  { id: "danger", label: "Опасная зона", icon: AlertTriangle, category: "danger" },
];

const CATEGORY_LABELS: Record<TabDef["category"], string> = {
  info: "Информация",
  configure: "Настройка",
  danger: "Опасная зона",
};

const CLOSE_ANIM_MS = 170;

type Props = {
  open: boolean;
  family: Family;
  me: Me;
  isOwner: boolean;
  chats?: Chat[];
  channels?: Channel[];
  onClose: () => void;
  onRenamed: (next: Family) => void;
  onLeft: () => void;
  /** Семья полностью удалена владельцем. */
  onDeleted: () => void;
  /** Открыть модалку выбора нового владельца (вне этого компонента). */
  onTransferOwnership?: () => void;
};

export default function FamilySettingsModal({
  open,
  family,
  me,
  isOwner,
  chats = [],
  channels = [],
  onClose,
  onRenamed,
  onLeft,
  onDeleted,
  onTransferOwnership,
}: Props) {
  const { confirm, notify } = useConfirm();
  const { isAdvanced } = useUserMode();
  const { perms } = usePermissions();
  const canManageFamily =
    isOwner ||
    (!!perms && (perms.is_administrator || hasBit(perms.base, PERM.MANAGE_FAMILY)));
  const [active, setActive] = useState<TabId>("overview");
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setActive("overview");
      setClosing(false);
    }
  }, [open, family.id]);

  const triggerClose = () => {
    if (closing) return;
    setClosing(true);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      onClose();
      setClosing(false);
    }, CLOSE_ANIM_MS);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") triggerClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const visibleTabs = useMemo(
    () =>
      TABS.filter(
        (t) =>
          (!t.ownerOnly || isOwner) &&
          (!t.manageOnly || canManageFamily) &&
          (!t.advancedOnly || isAdvanced),
      ),
    [isOwner, canManageFamily, isAdvanced],
  );

  // Если активная вкладка вдруг отфильтровалась (выключили advanced) — откатываемся.
  useEffect(() => {
    if (!visibleTabs.some((t) => t.id === active)) {
      setActive("overview");
    }
  }, [visibleTabs, active]);

  const grouped = useMemo(() => {
    const map = new Map<TabDef["category"], TabDef[]>();
    for (const tab of visibleTabs) {
      const arr = map.get(tab.category) ?? [];
      arr.push(tab);
      map.set(tab.category, arr);
    }
    return map;
  }, [visibleTabs]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className={`lentik-overlay-anim ${closing ? "is-closing" : ""} fixed inset-0 z-[150] bg-black/55 backdrop-blur-sm flex items-stretch p-2 sm:p-3 md:p-6`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) triggerClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Настройки семьи"
    >
      <div
        className={`lentik-dialog-anim ${closing ? "is-closing" : ""} relative flex flex-col md:flex-row w-full max-w-[1100px] mx-auto rounded-2xl md:rounded-3xl overflow-hidden border border-[color:var(--border-glass-strong)] bg-[color:var(--bg-elevated)] backdrop-blur-2xl shadow-[0_30px_90px_var(--scrim-4)]`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Мобильная шапка + полоса чипов вкладок (<md) */}
        <div className="md:hidden border-b border-[color:var(--border-warm-dim)] bg-[color:var(--bg-surface-subtle)]">
          <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.16em] text-ink-400 font-body">
                Семья
              </p>
              <h2 className="font-display text-base text-ink-900 truncate">
                {family.name}
              </h2>
            </div>
            <button
              type="button"
              onClick={triggerClose}
              className="w-9 h-9 rounded-lg grid place-items-center text-ink-500 hover:text-ink-900 hover:bg-white/70 transition shrink-0"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" strokeWidth={2.3} />
            </button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto px-4 pb-3 -mb-px no-scrollbar">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = tab.id === active;
              const isDanger = tab.category === "danger";
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActive(tab.id)}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-body border transition ${
                    isActive
                      ? isDanger
                        ? "bg-red-500 text-white border-red-500"
                        : "bg-ink-900 text-[color:var(--text-on-dark)] border-ink-900"
                      : isDanger
                        ? "text-red-600 border-red-200 bg-red-50/40"
                        : "text-ink-600 border-[color:var(--border-glass)] bg-[color:var(--bg-surface)]"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={2.2} />
                  <span className="whitespace-nowrap">{tab.label}</span>
                  {tab.comingSoon && (
                    <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded-full bg-warm-100 text-warm-700 font-semibold">
                      скоро
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Левый сайдбар (только ≥md) */}
        <aside className="hidden md:flex w-[240px] shrink-0 border-r border-[color:var(--border-warm-dim)] bg-[color:var(--bg-surface-subtle)] md:flex-col">
          <div className="px-5 pt-5 pb-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-ink-400 font-body">
              Семья
            </p>
            <h2 className="font-display text-[1.05rem] text-ink-900 truncate mt-0.5">
              {family.name}
            </h2>
          </div>

          <nav className="flex-1 overflow-y-auto sidebar-scroll px-2 pb-3 space-y-3 min-h-0">
            {Array.from(grouped.entries()).map(([cat, tabs]) => (
              <div key={cat}>
                <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest font-semibold text-ink-400 font-body">
                  {CATEGORY_LABELS[cat]}
                </p>
                <div className="flex flex-col gap-0.5">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = tab.id === active;
                    const isDanger = tab.category === "danger";
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActive(tab.id)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-body text-left transition ${
                          isActive
                            ? isDanger
                              ? "bg-red-50 text-red-700"
                              : "bg-[color:var(--bg-elevated)] text-ink-900 shadow-sm"
                            : isDanger
                              ? "text-red-600 hover:bg-red-50/60"
                              : "text-ink-600 hover:bg-white/55 hover:text-ink-900"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={2.2} />
                        <span className="truncate flex-1">{tab.label}</span>
                        {tab.comingSoon && (
                          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-warm-100 text-warm-700 font-semibold">
                            скоро
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {!isAdvanced && isOwner && (
            <div className="border-t border-[color:var(--border-warm-dim)] p-3 m-2 rounded-xl bg-warm-50/60">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-warm-700 font-body inline-flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" strokeWidth={2.4} />
                Продвинутый режим
              </p>
              <p className="text-xs text-ink-600 font-body mt-1 leading-snug">
                Откройте роли, журнал аудита и интеграции — это можно включить в
                «Настройки профиля → Расширенное».
              </p>
            </div>
          )}
        </aside>

        {/* Контент */}
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="hidden md:flex items-center justify-between gap-3 px-7 pt-5 pb-4 border-b border-[color:var(--border-warm-dim)]">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.16em] text-ink-400 font-body">
                Настройки
              </p>
              <h3 className="font-display text-xl text-ink-900 truncate mt-0.5">
                {TABS.find((t) => t.id === active)?.label}
              </h3>
            </div>
            <button
              type="button"
              onClick={triggerClose}
              className="w-9 h-9 rounded-lg grid place-items-center text-ink-500 hover:text-ink-900 hover:bg-white/70 transition shrink-0"
              aria-label="Закрыть"
              data-tooltip="Закрыть (Esc)"
            >
              <X className="w-4 h-4" strokeWidth={2.3} />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto sidebar-scroll px-4 py-4 md:px-7 md:py-6 min-h-0">
            {active === "overview" && (
              <OverviewTab
                family={family}
                me={me}
                isOwner={isOwner}
                canManageFamily={canManageFamily}
                onRenamed={onRenamed}
                notify={notify}
              />
            )}

            {active === "danger" && (
              <DangerTab
                family={family}
                me={me}
                isOwner={isOwner}
                confirm={confirm}
                notify={notify}
                onLeft={onLeft}
                onDeleted={onDeleted}
                onTransferOwnership={onTransferOwnership}
              />
            )}

            {active === "roles" && (
              <RolesEditor familyId={family.id} isOwner={isOwner} />
            )}

            {active === "channels" && (
              <ChannelPermissionsEditor
                familyId={family.id}
                kind="channel"
                items={channels.map((c) => ({ id: c.id, name: c.name }))}
                members={family.members}
                canManage={isOwner}
              />
            )}

            {active === "chats" && (
              <ChannelPermissionsEditor
                familyId={family.id}
                kind="chat"
                items={chats.map((c) => ({ id: c.id, name: c.name }))}
                members={family.members}
                canManage={isOwner}
              />
            )}

            {active === "audit" && <AuditLogView familyId={family.id} />}

            {active === "moderation" && (
              <ModerationEditor familyId={family.id} canManage={canManageFamily} />
            )}

            {active !== "overview" &&
              active !== "danger" &&
              active !== "roles" &&
              active !== "channels" &&
              active !== "chats" &&
              active !== "audit" &&
              active !== "moderation" && <ComingSoonTab tabId={active} />}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabs
// ─────────────────────────────────────────────────────────────────────────────

function OverviewTab({
  family,
  me,
  isOwner,
  canManageFamily,
  onRenamed,
  notify,
}: {
  family: Family;
  me: Me;
  isOwner: boolean;
  canManageFamily: boolean;
  onRenamed: (next: Family) => void;
  notify: (opts: { title: string; description?: React.ReactNode; tone?: "default" | "danger" }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(family.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setValue(family.name);
    setEditing(false);
  }, [family.id, family.name]);

  const created = new Date(family.created_at).toLocaleDateString("ru", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const memberCount = family.members.length;
  const onlineCount = family.members.filter((m) => m.is_online === true).length;
  const owners = family.members.filter((m) => m.role === "owner");

  async function handleSave() {
    const next = value.trim();
    if (!next) {
      setError("Введите название");
      return;
    }
    if (next === family.name) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const updated = await renameFamily(family.id, next);
      onRenamed({ ...family, name: updated.name });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось переименовать");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-7">
      <Section title="Название семьи" description="Видно всем участникам.">
        {editing ? (
          <div className="flex flex-col gap-2">
            <input
              autoFocus
              className="input-field"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={120}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSave();
                } else if (e.key === "Escape") {
                  setEditing(false);
                  setValue(family.name);
                }
              }}
            />
            {error && <p className="text-sm text-red-500 font-body">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="ui-btn ui-btn-subtle"
                onClick={() => {
                  setEditing(false);
                  setValue(family.name);
                  setError("");
                }}
                disabled={saving}
              >
                Отмена
              </button>
              <button
                type="button"
                className="ui-btn ui-btn-primary"
                onClick={() => void handleSave()}
                disabled={saving || !value.trim()}
              >
                {saving ? "Сохранение…" : "Сохранить"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="flex-1 min-w-0 truncate font-display text-2xl text-ink-900">
              {family.name}
            </span>
            {canManageFamily && (
              <button
                type="button"
                className="ui-btn ui-btn-subtle inline-flex items-center gap-1.5"
                onClick={() => setEditing(true)}
              >
                <Pencil className="w-3.5 h-3.5" strokeWidth={2.2} />
                Изменить
              </button>
            )}
          </div>
        )}
      </Section>

      <Section title="О пространстве">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard label="Участников" value={memberCount} icon={Users} />
          <StatCard label="В сети" value={onlineCount} icon={Sparkles} />
          <StatCard label="Создано" value={created} icon={History} />
        </div>
      </Section>

      <Section title="Владельцы">
        <ul className="space-y-1.5">
          {owners.map((o) => (
            <li
              key={o.user_id}
              className="flex items-center gap-3 px-3 py-2 rounded-xl border border-[color:var(--border-glass)] bg-[color:var(--bg-surface-subtle)]"
            >
              <Crown className="w-3.5 h-3.5 text-warm-500 shrink-0" strokeWidth={2.3} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink-900 truncate">
                  {o.display_name}
                  {o.user_id === me.id && (
                    <span className="ml-2 text-[11px] font-normal text-ink-400">это вы</span>
                  )}
                </p>
                <p className="text-[11px] text-ink-400 truncate">@{o.username}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function ComingSoonTab({ tabId }: { tabId: TabId }) {
  const COPY: Record<string, { title: string; lines: string[] }> = {
    roles: {
      title: "Роли и права",
      lines: [
        "Создавайте собственные роли с цветом и набором разрешений.",
        "Назначайте права на каналы и чаты отдельно.",
        "Override allow/deny для каждой роли и каждого участника.",
      ],
    },
    channels: {
      title: "Управление каналами",
      lines: [
        "Категории, drag-and-drop сортировка, шаблоны разрешений.",
        "Архивирование каналов без удаления истории.",
        "Webhook'и и кастомные эмодзи на канал.",
      ],
    },
    chats: {
      title: "Управление чатами",
      lines: [
        "Bulk-операции: очистить чат, заархивировать, экспортировать.",
        "Шаблоны медленного режима и 18+.",
      ],
    },
    moderation: {
      title: "Модерация",
      lines: [
        "Авто-фильтры контента, anti-spam, лимиты приглашений.",
        "Журнал действий модераторов.",
      ],
    },
    audit: {
      title: "Журнал аудита",
      lines: [
        "Полная история действий в семье — кто что когда сделал.",
        "Фильтрация по типу события, участнику, периоду.",
      ],
    },
    integrations: {
      title: "Интеграции",
      lines: [
        "Webhook'и, бот-аккаунты, экспорт в Telegram/Discord.",
        "REST API для разработчиков.",
      ],
    },
  };
  const copy = COPY[tabId];
  if (!copy) return null;

  return (
    <div className="rounded-2xl border border-[color:var(--border-glass)] bg-[color:var(--bg-surface-subtle)] p-7">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-2xl bg-warm-100 text-warm-700 grid place-items-center shrink-0">
          <Sparkles className="w-5 h-5" strokeWidth={2.1} />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.16em] text-ink-400 font-body">
            Скоро
          </p>
          <h4 className="font-display text-xl text-ink-900 mt-1">
            {copy.title}
          </h4>
          <ul className="mt-3 space-y-1.5">
            {copy.lines.map((line) => (
              <li
                key={line}
                className="flex items-start gap-2 text-sm text-ink-600 font-body"
              >
                <ChevronRight className="w-3.5 h-3.5 text-ink-300 mt-0.5 shrink-0" strokeWidth={2.4} />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function DangerTab({
  family,
  me,
  isOwner,
  confirm,
  notify,
  onLeft,
  onDeleted,
  onTransferOwnership,
}: {
  family: Family;
  me: Me;
  isOwner: boolean;
  confirm: (opts: {
    title: string;
    description?: React.ReactNode;
    confirmLabel?: string;
    tone?: "default" | "danger";
  }) => Promise<boolean>;
  notify: (opts: { title: string; description?: React.ReactNode; tone?: "default" | "danger" }) => Promise<void>;
  onLeft: () => void;
  onDeleted: () => void;
  onTransferOwnership?: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const [deleteStep, setDeleteStep] = useState(false);
  const [deleteValue, setDeleteValue] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function handleDelete() {
    if (deleting) return;
    // Шаг 1 — общий confirm с tone:"danger".
    const ok = await confirm({
      title: `Удалить «${family.name}»?`,
      description:
        "Это безвозвратно удалит всё пространство: чаты, каналы, галерею, файлы, " +
        "календарь, бюджет, заметки, напоминания, древо и роли. " +
        "Восстановить данные будет невозможно.",
      confirmLabel: "Продолжить",
      tone: "danger",
    });
    if (!ok) return;
    // Шаг 2 — ввод точного названия семьи в отдельной мини-модалке.
    setDeleteValue("");
    setDeleteError("");
    setDeleteStep(true);
  }

  async function confirmDelete() {
    if (deleting) return;
    if (deleteValue.trim() !== family.name) {
      setDeleteError("Название не совпадает");
      return;
    }
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteFamily(family.id);
      setDeleteStep(false);
      onDeleted();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Не удалось удалить семью");
    } finally {
      setDeleting(false);
    }
  }

  async function handleLeave() {
    if (leaving) return;
    if (isOwner) {
      void notify({
        title: "Сначала передайте права",
        description:
          "Владелец не может покинуть семью. Передайте права другому участнику и попробуйте снова.",
        tone: "danger",
      });
      return;
    }
    const ok = await confirm({
      title: `Покинуть «${family.name}»?`,
      description:
        "Вы потеряете доступ к чатам, галерее, календарю и другим разделам этой семьи.",
      confirmLabel: "Покинуть",
      tone: "danger",
    });
    if (!ok) return;
    setLeaving(true);
    try {
      await leaveFamily(family.id);
      onLeft();
    } catch (e) {
      void notify({
        title: e instanceof Error ? e.message : "Не удалось покинуть семью",
        tone: "danger",
      });
    } finally {
      setLeaving(false);
    }
  }

  function handleExport() {
    const payload = {
      family: {
        id: family.id,
        name: family.name,
        created_at: family.created_at,
      },
      members: family.members.map((m) => ({
        user_id: m.user_id,
        username: m.username,
        display_name: m.display_name,
        role: m.role,
        joined_at: m.joined_at,
        birthday: m.birthday,
      })),
      exported_at: new Date().toISOString(),
      exported_by: me.username,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safe = family.name
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "family";
    a.href = url;
    a.download = `lentik-${safe}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <DangerCard
        title="Экспорт данных"
        description="Скачать JSON со списком участников, ролей и дат. История чатов экспортируется отдельно в каждом чате."
        action={
          <button
            type="button"
            className="ui-btn ui-btn-subtle inline-flex items-center gap-1.5"
            onClick={handleExport}
          >
            <Download className="w-3.5 h-3.5" strokeWidth={2.2} />
            Скачать JSON
          </button>
        }
      />

      {isOwner && (
        <DangerCard
          title="Передать права владельца"
          description="После передачи вы станете обычным участником. Действие необратимо."
          action={
            <button
              type="button"
              className="ui-btn ui-btn-subtle inline-flex items-center gap-1.5"
              onClick={() => onTransferOwnership?.()}
              disabled={!onTransferOwnership}
            >
              <Crown className="w-3.5 h-3.5" strokeWidth={2.2} />
              Передать
            </button>
          }
        />
      )}

      <DangerCard
        title={isOwner ? "Покинуть семью" : "Покинуть семью"}
        description={
          isOwner
            ? "Сначала передайте права владельца другому участнику."
            : "Вы потеряете доступ ко всему контенту этой семьи. Восстановиться можно только по новой ссылке-приглашению."
        }
        danger
        action={
          <button
            type="button"
            className="ui-btn ui-btn-danger inline-flex items-center gap-1.5"
            onClick={() => void handleLeave()}
            disabled={leaving || isOwner}
            title={isOwner ? "Сначала передайте права" : undefined}
          >
            <LogOut className="w-3.5 h-3.5" strokeWidth={2.2} />
            {leaving ? "Выход…" : "Покинуть"}
          </button>
        }
      />

      {isOwner && (
        <DangerCard
          title="Удалить семью"
          description="Полное и безвозвратное удаление пространства со всеми чатами, файлами, историей и ролями. Перед удалением рекомендуем скачать экспорт данных."
          danger
          action={
            <button
              type="button"
              className="ui-btn ui-btn-danger inline-flex items-center gap-1.5"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={2.2} />
              {deleting ? "Удаление…" : "Удалить семью"}
            </button>
          }
        />
      )}

      {deleteStep && (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center p-4 glass-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Подтверждение удаления семьи"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !deleting) setDeleteStep(false);
          }}
        >
          <div
            className="glass-modal-panel w-full max-w-sm p-6"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span
                className="w-10 h-10 rounded-2xl grid place-items-center shrink-0 bg-red-50 text-red-600 border border-red-200"
                aria-hidden
              >
                <AlertTriangle className="w-5 h-5" strokeWidth={2.1} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-lg text-ink-900 leading-snug">
                  Окончательное удаление
                </h3>
                <p className="text-sm text-ink-500 font-body mt-1.5 leading-relaxed">
                  Чтобы подтвердить, введите название семьи{" "}
                  <span className="font-semibold text-ink-800">«{family.name}»</span>.
                </p>
              </div>
            </div>

            <input
              autoFocus
              className="input-field mt-4"
              value={deleteValue}
              onChange={(e) => {
                setDeleteValue(e.target.value);
                if (deleteError) setDeleteError("");
              }}
              placeholder={family.name}
              maxLength={120}
              disabled={deleting}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void confirmDelete();
                } else if (e.key === "Escape") {
                  if (!deleting) setDeleteStep(false);
                }
              }}
            />
            {deleteError && (
              <p className="text-sm text-red-500 font-body mt-2">{deleteError}</p>
            )}

            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                className="ui-btn ui-btn-subtle"
                onClick={() => setDeleteStep(false)}
                disabled={deleting}
              >
                Отмена
              </button>
              <button
                type="button"
                className="ui-btn ui-btn-danger inline-flex items-center gap-1.5"
                onClick={() => void confirmDelete()}
                disabled={deleting || deleteValue.trim() !== family.name}
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={2.2} />
                {deleting ? "Удаление…" : "Удалить навсегда"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small primitives
// ─────────────────────────────────────────────────────────────────────────────

function Section({
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
      <h4 className="text-[11px] uppercase tracking-[0.16em] text-ink-400 font-body">
        {title}
      </h4>
      {description && (
        <p className="text-xs text-ink-500 font-body mt-1">{description}</p>
      )}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--border-glass)] bg-[color:var(--bg-surface-subtle)] px-4 py-3">
      <div className="flex items-center gap-2 text-ink-400">
        <Icon className="w-3.5 h-3.5" strokeWidth={2.2} />
        <span className="text-[11px] uppercase tracking-wider font-body">{label}</span>
      </div>
      <p className="font-display text-xl text-ink-900 mt-1 truncate">{value}</p>
    </div>
  );
}

function DangerCard({
  title,
  description,
  action,
  danger,
}: {
  title: string;
  description: string;
  action: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 ${
        danger
          ? "border-red-200 bg-red-50/45"
          : "border-[color:var(--border-glass)] bg-[color:var(--bg-surface-subtle)]"
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${danger ? "text-red-700" : "text-ink-900"}`}>
          {title}
        </p>
        <p className="text-xs text-ink-500 font-body mt-1 leading-relaxed">
          {description}
        </p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}
