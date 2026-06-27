"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Cake,
  Bot,
  Check,
  ChevronDown,
  Copy,
  Crown,
  Link2,
  QrCode,
  RefreshCw,
  Search,
  SearchX,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  adminUnbanUser,
  buildFamilyInviteLink,
  createInvite,
  getAllMemberRoles,
  getRoles,
  transferOwnership,
  type Family,
  type FamilyRole,
  type Me,
} from "@/lib/api";
import { getPresenceLabel } from "@/lib/presence";
import UserMiniProfilePopover, {
  type UserMiniProfile,
} from "@/components/UserMiniProfilePopover";
import { useUserPopover } from "@/lib/useUserPopover";
import { useConfirm } from "@/components/ConfirmDialog";
import { useUserMode } from "@/lib/useUserMode";
import MemberRolesModal from "@/components/MemberRolesModal";
import { hasBit, PERM, usePermissions } from "@/lib/usePermissions";
import CopyIdButton from "@/components/CopyIdButton";
import BanUserModal from "@/components/BanUserModal";
import { useContextMenu } from "@/lib/useContextMenu";
import { buildUserMenuEntries } from "@/lib/userMenuItems";

type Member = Family["members"][0];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatInviteExpiry(iso: string) {
  return new Date(iso).toLocaleString("ru", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildInviteQrUrl(link: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=480x480&data=${encodeURIComponent(link)}&bgcolor=ffffff&color=1c1714`;
}

function formatBirthday(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("ru", {
    day: "numeric",
    month: "long",
  });
}

function isBirthdaySoon(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const now = new Date();
  const bday = new Date(iso);
  const next = new Date(now.getFullYear(), bday.getMonth(), bday.getDate());
  if (next < now) next.setFullYear(now.getFullYear() + 1);
  return (next.getTime() - now.getTime()) / 86400000 <= 7;
}

function MemberCard({
  member,
  isMe,
  isOwnerViewing,
  onKick,
  onTransferOwnership,
  kicking,
  transferringOwnership,
  onAvatarClick,
  isAvatarPopoverOpen,
  roleChips,
  onManageRoles,
  showRolesUi,
  canKick: canKickProp,
  canManageRolesPerm,
  canTransferOwnership,
  isDeveloperViewer,
  onContextMenu,
}: {
  member: Member & { bio?: string; birthday?: string };
  isMe: boolean;
  isOwnerViewing: boolean;
  onKick?: (id: string, name: string) => void;
  onTransferOwnership?: (member: Member) => void;
  kicking: boolean;
  transferringOwnership: boolean;
  onAvatarClick?: (member: Member, anchor: HTMLElement) => void;
  isAvatarPopoverOpen?: boolean;
  /** Роли, которые видимо отображаются чипами (без @everyone). */
  roleChips?: { id: string; name: string; color: string }[];
  /** Открыть модалку управления ролями (если разрешено). */
  onManageRoles?: (m: Member) => void;
  /** Показывать UI ролей (включено в advanced-режиме). */
  showRolesUi?: boolean;
  /** Право на исключение из семьи. */
  canKick?: boolean;
  /** Право на управление ролями. */
  canManageRolesPerm?: boolean;
  /** Право на передачу владения (всегда только текущий владелец). */
  canTransferOwnership?: boolean;
  /** Текущий зритель — платформенный разработчик (видит ID, ПКМ-действия). */
  isDeveloperViewer?: boolean;
  /** ПКМ по карточке участника. */
  onContextMenu?: (member: Member, e: React.MouseEvent) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { isExpert } = useUserMode();
  const isOwner = member.role === "owner";
  const birthdaySoon = isBirthdaySoon(member.birthday);
  const isOnline = member.is_online === true;
  const presenceLabel = getPresenceLabel(member);

  return (
    <div
      className={`member-card ${expanded ? "expanded" : ""}`}
      onContextMenu={onContextMenu ? (e) => onContextMenu(member, e) : undefined}
    >
      <button
        className="member-card__top"
        onClick={() => setExpanded((v) => !v)}
        type="button"
        aria-expanded={expanded}
      >
        <div
          className={`member-card__avatar ${isAvatarPopoverOpen ? "ring-2 ring-white/80 rounded-full" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            onAvatarClick?.(member, event.currentTarget);
          }}
          title={`Профиль ${member.display_name}`}
        >
          <div className={`member-avatar ${isOwner ? "owner" : "member"}`}>
            {member.avatar_url ? (
              <img
                src={member.avatar_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              member.display_name[0].toUpperCase()
            )}
          </div>
          <span
            className={`member-presence-dot ${isOnline ? "online" : "offline"}`}
            aria-label={presenceLabel}
            title={presenceLabel}
          />

          {isOwner && (
            <div className="member-badge" title="Создатель">
              <Crown className="w-3 h-3 text-warm-500" strokeWidth={2.3} />
            </div>
          )}
          {birthdaySoon && !isOwner && (
            <div className="member-badge" title="Скоро день рождения">
              <Cake className="w-3 h-3 text-pink-500" strokeWidth={2.2} />
            </div>
          )}
        </div>

        <div className="member-card__main">
          <div className="member-card__line">
            <p className="member-name" title={member.display_name}>
              {member.display_name}
            </p>

            {isMe && <span className="pill pill-muted">Это ты</span>}
            {member.is_bot && (
              <span
                className="pill inline-flex items-center gap-1 bg-[var(--accent-soft)] text-[color:var(--warm-700)]"
                title="Бот"
              >
                <Bot className="w-3 h-3" strokeWidth={2.2} />
                Бот
              </span>
            )}
            {member.is_developer && (
              <span
                className="pill inline-flex items-center gap-1 bg-[var(--special-bg)] text-[color:var(--special-fg)]"
                title="Разработчик"
              >
                <ShieldCheck className="w-3 h-3" strokeWidth={2.2} />
                Разработчик
              </span>
            )}
            {birthdaySoon && (
              <span className="pill pill-warm inline-flex items-center gap-1">
                <Cake className="w-3 h-3" strokeWidth={2.1} />
                скоро
              </span>
            )}
          </div>

          <p className="member-username" title={`@${member.username}`}>
            @{member.username}
          </p>
          <p className={`member-presence-text ${isOnline ? "online" : ""}`} title={presenceLabel}>
            {presenceLabel}
          </p>
        </div>

        <div className="member-card__right">
          <span className={`pill ${isOwner ? "pill-warm-soft" : "pill-muted"}`}>
            {isOwner ? "Создатель" : "Участник"}
          </span>

          <ChevronDown
            className={`member-chevron ${expanded ? "open" : ""}`}
            strokeWidth={2.2}
            aria-hidden
          />
        </div>
      </button>

      <div className={`member-card__body ${expanded ? "open" : ""}`}>
        <div className="member-divider" />

        <div className="member-grid">
          <div className="member-info">
            <p className="member-info__k">В семье с</p>
            <p className="member-info__v">{formatDate(member.joined_at)}</p>
          </div>

          <div className="member-info">
            <p className="member-info__k">День рождения</p>
            <p className="member-info__v">
              {formatBirthday(member.birthday) ?? "—"}
            </p>
          </div>
        </div>

        {member.bio && (
          <div className="member-bio">
            <p className="member-info__k">О себе</p>
            <p className="member-bio__v">{member.bio}</p>
          </div>
        )}

        {/* Expert или разработчик: user_id участника с кнопкой копирования. */}
        {(isExpert || isDeveloperViewer) && (
          <div className="mt-2 flex items-center gap-1.5 font-mono text-[10.5px] text-ink-400">
            <CopyIdButton value={member.user_id} label={member.display_name} />
            <span className="truncate">{member.user_id}</span>
          </div>
        )}

        {showRolesUi && roleChips && roleChips.length > 0 && (
          <div className="mt-3">
            <p className="member-info__k mb-1.5">Роли</p>
            <div className="flex flex-wrap gap-1.5">
              {roleChips.map((r) => (
                <span
                  key={r.id}
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-body bg-white/55"
                  style={{ borderColor: `${r.color}55`, color: r.color }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: r.color }}
                    aria-hidden
                  />
                  <span className="text-ink-700">{r.name}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {(canManageRolesPerm || canTransferOwnership || canKickProp) && !isMe && (
          <div className="mt-3 space-y-2">
            {showRolesUi && canManageRolesPerm && onManageRoles && (
              <button
                onClick={() => onManageRoles(member)}
                className="ui-btn ui-btn-subtle w-full"
                type="button"
              >
                Управлять ролями
              </button>
            )}

            {member.role !== "owner" && canTransferOwnership && onTransferOwnership && (
              <button
                onClick={() => onTransferOwnership(member)}
                disabled={transferringOwnership}
                className="ui-btn ui-btn-subtle w-full"
                type="button"
              >
                {transferringOwnership ? "Передача…" : "Передать права"}
              </button>
            )}

            {canKickProp && onKick && (
              <button
                onClick={() => onKick(member.user_id, member.display_name)}
                disabled={kicking || transferringOwnership}
                className="btn-danger-wide !mt-0"
                type="button"
              >
                {kicking ? "Исключение…" : "Исключить из семьи"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MembersList({
  family,
  me,
  onKick,
  onRefresh,
}: {
  family: Family;
  me: Me;
  onKick?: (userId: string) => Promise<void>;
  onRefresh?: () => Promise<void>;
}) {
  const { confirm, notify } = useConfirm();
  const { isAdvanced } = useUserMode();
  const router = useRouter();
  const { perms: familyPerms } = usePermissions();
  const isDeveloperViewer = !!familyPerms?.is_developer;
  const { openContextMenu } = useContextMenu();
  const [banTarget, setBanTarget] = useState<Member | null>(null);
  const baseBits = familyPerms?.base ?? 0;
  const isOwnerOrAdmin =
    !!familyPerms && (familyPerms.is_owner || familyPerms.is_administrator);
  const canKick = isOwnerOrAdmin || hasBit(baseBits, PERM.KICK_MEMBERS);
  const canCreateInvites = isOwnerOrAdmin || hasBit(baseBits, PERM.CREATE_INVITES);
  const canManageRoles = isOwnerOrAdmin || hasBit(baseBits, PERM.MANAGE_ROLES);
  const [kicking, setKicking] = useState<string | null>(null);
  const [rolesByMember, setRolesByMember] = useState<Record<string, string[]>>({});
  const [allRoles, setAllRoles] = useState<FamilyRole[]>([]);
  const [rolesTarget, setRolesTarget] = useState<Member | null>(null);
  const [search, setSearch] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [inviteExpiresAt, setInviteExpiresAt] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteHours, setInviteHours] = useState(72);
  const [inviteMaxUses, setInviteMaxUses] = useState(1);
  const [lastInviteMaxUses, setLastInviteMaxUses] = useState<number | null>(null);
  const [transferTarget, setTransferTarget] = useState<Member | null>(null);
  const [transferringOwnership, setTransferringOwnership] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const {
    popoverUser,
    popoverAnchorRect,
    popoverOpenKey,
    popoverRef,
    openPopover,
    closePopover,
  } = useUserPopover<UserMiniProfile>();

  const isOwnerViewing =
    family.members.find((m) => m.user_id === me.id)?.role === "owner";
  const owners = family.members.filter((m) => m.role === "owner");
  const members = family.members.filter((m) => m.role !== "owner");

  const query = search.trim().toLowerCase();

  const filteredOwners = useMemo(() => {
    if (!query) return owners;
    return owners.filter(
      (m) =>
        m.display_name.toLowerCase().includes(query) ||
        m.username.toLowerCase().includes(query),
    );
  }, [owners, query]);

  const filteredMembers = useMemo(() => {
    if (!query) return members;
    return members.filter(
      (m) =>
        m.display_name.toLowerCase().includes(query) ||
        m.username.toLowerCase().includes(query),
    );
  }, [members, query]);

  useEffect(() => {
    closePopover();
  }, [closePopover, family.id]);

  // Подгружаем роли всех участников одним запросом + список ролей семьи.
  useEffect(() => {
    if (!isAdvanced) {
      setRolesByMember({});
      setAllRoles([]);
      return;
    }
    let alive = true;
    Promise.all([getAllMemberRoles(family.id), getRoles(family.id)])
      .then(([map, all]) => {
        if (!alive) return;
        setRolesByMember(map);
        setAllRoles(all);
      })
      .catch(() => {
        if (!alive) return;
        setRolesByMember({});
        setAllRoles([]);
      });
    return () => {
      alive = false;
    };
  }, [family.id, isAdvanced]);

  const rolesById = useMemo(() => {
    const map = new Map<string, FamilyRole>();
    for (const r of allRoles) map.set(r.id, r);
    return map;
  }, [allRoles]);

  function chipsFor(userId: string): { id: string; name: string; color: string }[] {
    const ids = rolesByMember[userId] ?? [];
    const chips: { id: string; name: string; color: string }[] = [];
    for (const id of ids) {
      const r = rolesById.get(id);
      if (!r) continue;
      if (r.is_everyone) continue; // не показываем @everyone — он у всех
      chips.push({ id: r.id, name: r.name, color: r.color });
    }
    // Сортируем по приоритету
    chips.sort((a, b) => {
      const ra = rolesById.get(a.id)?.priority ?? 999;
      const rb = rolesById.get(b.id)?.priority ?? 999;
      return ra - rb;
    });
    return chips;
  }

  const canAssignOwnerRole = isOwnerViewing;

  async function handleKick(userId: string, name: string) {
    const ok = await confirm({
      title: `Исключить ${name} из семьи?`,
      confirmLabel: "Исключить",
      tone: "danger",
    });
    if (!ok) return;
    setKicking(userId);
    try {
      await onKick?.(userId);
    } catch (e) {
      void notify({ title: e instanceof Error ? e.message : "Ошибка", tone: "danger" });
    } finally {
      setKicking(null);
    }
  }

  function handleContextMenu(member: Member, e: React.MouseEvent) {
    const anchor = e.currentTarget as HTMLElement;
    const entries = buildUserMenuEntries({
      target: {
        user_id: member.user_id,
        display_name: member.display_name,
        username: member.username,
        role: member.role,
        is_developer: member.is_developer,
        is_banned: member.is_banned,
      },
      meId: me.id,
      perms: familyPerms,
      actions: {
        openProfile: () => openMemberPopover(member, anchor),
        manageRoles: canManageRoles ? () => setRolesTarget(member) : undefined,
        openInAdmin: () => router.push(`/admin?user=${member.user_id}`),
        kick: () => void handleKick(member.user_id, member.display_name),
        ban: () => setBanTarget(member),
        unban: () => void handleUnban(member),
      },
    });
    openContextMenu(e, entries);
  }

  async function handleUnban(member: Member) {
    const ok = await confirm({
      title: `Разбанить ${member.display_name}?`,
      confirmLabel: "Разбанить",
    });
    if (!ok) return;
    try {
      await adminUnbanUser(member.user_id);
      void notify({ title: "Пользователь разбанен" });
    } catch (e) {
      void notify({
        title: e instanceof Error ? e.message : "Не удалось разбанить",
        tone: "danger",
      });
    }
  }

  async function handleConfirmOwnershipTransfer() {
    if (!transferTarget || transferringOwnership) return;

    setTransferringOwnership(true);
    try {
      await transferOwnership(family.id, transferTarget.user_id);
      await onRefresh?.();
      setTransferTarget(null);
    } catch (e) {
      void notify({
        title: e instanceof Error ? e.message : "Не удалось передать права",
        tone: "danger",
      });
    } finally {
      setTransferringOwnership(false);
    }
  }

  async function handleGenerateInvite() {
    setInviteLoading(true);
    setInviteError("");
    setInviteCopied(false);
    try {
      const invite = await createInvite(family.id, inviteHours, true, inviteMaxUses);
      setInviteLink(buildFamilyInviteLink(invite.token));
      setInviteExpiresAt(invite.expires_at);
      setLastInviteMaxUses(invite.max_uses);
    } catch (e) {
      setInviteError(
        e instanceof Error ? e.message : "Не удалось создать ссылку",
      );
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleCopyInvite() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 1800);
    } catch {
      setInviteError("Не удалось скопировать ссылку");
    }
  }

  function handleOpenInviteQr() {
    if (!inviteLink) return;
    setQrOpen(true);
  }

  function openMemberPopover(member: Member, anchor: HTMLElement) {
    openPopover(
      {
        display_name: member.display_name,
        username: member.username,
        avatar_url: member.avatar_url,
        role: member.role,
        bio: member.bio,
        birthday: member.birthday,
        joined_at: member.joined_at,
        is_online: member.is_online,
        last_seen_at: member.last_seen_at,
      },
      anchor,
      member.user_id,
    );
  }

  return (
    <div className="members-shell">
      <header className="members-head glass-topbar glossy">
        <div className="members-head__inner">
          <div className="members-head__row">
            <div className="min-w-0">
              <h2 className="members-title">Участники</h2>
              <p className="members-sub">
                Семья · {family.members.length} человек
              </p>
            </div>

            <span className="members-count" title="Всего участников">
              {family.members.length}
            </span>
          </div>

          <div className="members-search">
            <Search className="members-search__ic" strokeWidth={2.1} aria-hidden />

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск участников…"
              className="members-search__input"
            />

            {search && (
              <button
                onClick={() => setSearch("")}
                className="members-search__clear"
                type="button"
                aria-label="Очистить поиск"
                title="Очистить"
              >
                <X className="w-3.5 h-3.5" strokeWidth={2.3} />
              </button>
            )}
          </div>

          {canCreateInvites && (
            <div className="mt-3 rounded-2xl border border-[color:var(--border-glass-strong)] bg-[color:var(--bg-surface)] p-3 backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.12em] text-ink-400 font-body">
                    Приглашение
                  </p>
                  <p className="text-sm text-ink-700 font-body mt-0.5">
                    Ссылка для вступления в семью
                  </p>
                </div>
                <button
                  type="button"
                  className="ui-btn ui-btn-subtle inline-flex items-center gap-1.5 shrink-0"
                  onClick={() => void handleGenerateInvite()}
                  disabled={inviteLoading}
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${inviteLoading ? "animate-spin" : ""}`}
                    strokeWidth={2.2}
                  />
                  {inviteLink ? "Новая ссылка" : "Сгенерировать"}
                </button>
              </div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="text-xs text-ink-500 font-body">
                  <span className="block mb-1">Срок действия (часы)</span>
                  <input
                    type="number"
                    min={1}
                    max={720}
                    step={1}
                    value={inviteHours}
                    onChange={(event) => {
                      const next = Number.parseInt(event.target.value, 10);
                      if (Number.isNaN(next)) return;
                      setInviteHours(Math.min(720, Math.max(1, next)));
                    }}
                    className="w-full rounded-xl border border-white/65 bg-white/70 px-2.5 py-1.5 text-sm text-ink-700 font-body focus:outline-none focus:ring-2 focus:ring-warm-200"
                  />
                </label>
                <label className="text-xs text-ink-500 font-body">
                  <span className="block mb-1">Лимит использований</span>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    step={1}
                    value={inviteMaxUses}
                    onChange={(event) => {
                      const next = Number.parseInt(event.target.value, 10);
                      if (Number.isNaN(next)) return;
                      setInviteMaxUses(Math.min(1000, Math.max(1, next)));
                    }}
                    className="w-full rounded-xl border border-white/65 bg-white/70 px-2.5 py-1.5 text-sm text-ink-700 font-body focus:outline-none focus:ring-2 focus:ring-warm-200"
                  />
                </label>
              </div>

              {!inviteLink && !inviteError && (
                <p className="mt-2 text-xs text-ink-400 font-body inline-flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5" strokeWidth={2.1} />
                  Старая ссылка будет отключена после генерации новой
                </p>
              )}

              {inviteError && (
                <p className="mt-2 text-xs text-[color:var(--danger-fg-strong)] font-body">{inviteError}</p>
              )}

              {inviteLink && (
                <>
                  <button
                    type="button"
                    className="mt-3 w-full rounded-xl border border-white/65 bg-white/68 px-3 py-2 text-left text-xs text-ink-700 font-body break-all hover:bg-white/78 transition"
                    onClick={() => void handleCopyInvite()}
                    title="Нажми, чтобы скопировать"
                  >
                    {inviteLink}
                  </button>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-[11px] text-ink-400 font-body">
                      Действует до {formatInviteExpiry(inviteExpiresAt)}
                      {lastInviteMaxUses ? ` · до ${lastInviteMaxUses} использ.` : ""}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="ui-btn ui-btn-subtle !px-2.5 !py-1.5 inline-flex items-center gap-1.5"
                        onClick={handleOpenInviteQr}
                      >
                        <QrCode className="w-3.5 h-3.5" strokeWidth={2.2} />
                        QR-код
                      </button>

                      <button
                        type="button"
                        className="ui-btn ui-btn-subtle !px-2.5 !py-1.5 inline-flex items-center gap-1.5"
                        onClick={() => void handleCopyInvite()}
                      >
                        {inviteCopied ? (
                          <>
                            <Check className="w-3.5 h-3.5" strokeWidth={2.4} />
                            Скопировано
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" strokeWidth={2.2} />
                            Копировать
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="members-body">
        <div className="members-body__inner">
          {filteredOwners.length > 0 && (
            <section>
              <p className="members-section">Создатель</p>
              <div className="space-y-10px">
                {filteredOwners.map((m) => (
                  <MemberCard
                    key={m.user_id}
                    member={m as Member & { bio?: string; birthday?: string }}
                    isMe={m.user_id === me.id}
                    isOwnerViewing={!!isOwnerViewing}
                    onKick={handleKick}
                    kicking={kicking === m.user_id}
                    onTransferOwnership={(member) => setTransferTarget(member)}
                    transferringOwnership={transferringOwnership}
                    onAvatarClick={openMemberPopover}
                    isAvatarPopoverOpen={popoverOpenKey === m.user_id}
                    roleChips={chipsFor(m.user_id)}
                    onManageRoles={(target) => setRolesTarget(target)}
                    showRolesUi={isAdvanced}
                    canKick={canKick}
                    canManageRolesPerm={canManageRoles}
                    canTransferOwnership={isOwnerViewing}
                    isDeveloperViewer={isDeveloperViewer}
                    onContextMenu={handleContextMenu}
                  />
                ))}
              </div>
            </section>
          )}

          {filteredMembers.length > 0 && (
            <section className="mt-6">
              <p className="members-section">
                Участники — {filteredMembers.length}
              </p>
              <div className="space-y-10px">
                {filteredMembers.map((m) => (
                  <MemberCard
                    key={m.user_id}
                    member={m as Member & { bio?: string; birthday?: string }}
                    isMe={m.user_id === me.id}
                    isOwnerViewing={!!isOwnerViewing}
                    onKick={handleKick}
                    kicking={kicking === m.user_id}
                    onTransferOwnership={(member) => setTransferTarget(member)}
                    transferringOwnership={transferringOwnership}
                    onAvatarClick={openMemberPopover}
                    isAvatarPopoverOpen={popoverOpenKey === m.user_id}
                    roleChips={chipsFor(m.user_id)}
                    onManageRoles={(target) => setRolesTarget(target)}
                    showRolesUi={isAdvanced}
                    canKick={canKick}
                    canManageRolesPerm={canManageRoles}
                    canTransferOwnership={isOwnerViewing}
                    isDeveloperViewer={isDeveloperViewer}
                    onContextMenu={handleContextMenu}
                  />
                ))}
              </div>
            </section>
          )}

          {filteredOwners.length === 0 && filteredMembers.length === 0 && (
            <div className="members-empty">
              <SearchX className="w-8 h-8 mb-3 text-ink-300" aria-hidden strokeWidth={2.1} />
              <p className="text-ink-400 text-sm font-body">
                Никого не найдено
              </p>
            </div>
          )}
        </div>
      </div>

      {banTarget && (
        <BanUserModal
          userId={banTarget.user_id}
          displayName={banTarget.display_name}
          onClose={() => setBanTarget(null)}
          onBanned={() => void notify({ title: "Пользователь забанен" })}
        />
      )}

      <UserMiniProfilePopover
        user={popoverUser}
        anchorRect={popoverAnchorRect}
        popoverRef={popoverRef}
      />

      {rolesTarget && (
        <MemberRolesModal
          open={!!rolesTarget}
          familyId={family.id}
          member={{
            user_id: rolesTarget.user_id,
            display_name: rolesTarget.display_name,
            username: rolesTarget.username,
          }}
          canAssignOwner={canAssignOwnerRole}
          onClose={() => setRolesTarget(null)}
          onChanged={(userId, roleIds) => {
            // Включаем @everyone в локальный кэш (бэк автоматически держит).
            const everyoneId = allRoles.find((r) => r.is_everyone)?.id;
            const finalIds = everyoneId && !roleIds.includes(everyoneId)
              ? [...roleIds, everyoneId]
              : roleIds;
            setRolesByMember((prev) => ({ ...prev, [userId]: finalIds }));
            // Локально пересчитываем member_count в списке ролей.
            setAllRoles((prev) =>
              prev.map((r) => {
                const wasAssigned = (rolesByMember[userId] ?? []).includes(r.id);
                const nowAssigned = finalIds.includes(r.id);
                if (wasAssigned === nowAssigned) return r;
                return {
                  ...r,
                  member_count: r.member_count + (nowAssigned ? 1 : -1),
                };
              }),
            );
          }}
        />
      )}

      {qrOpen && inviteLink && (
        <div
          className="fixed inset-0 z-[80] bg-black/45 backdrop-blur-sm p-4 flex items-center justify-center"
          onClick={() => setQrOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="QR-код приглашения"
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-[color:var(--border-glass-strong)] bg-[color:var(--bg-elevated)] backdrop-blur-2xl p-6 shadow-[0_30px_90px_var(--scrim-4)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-ink-400 font-body">
                  Приглашение
                </p>
                <h3 className="font-display text-xl text-ink-900 mt-0.5">QR-код</h3>
              </div>
              <button
                type="button"
                onClick={() => setQrOpen(false)}
                className="w-8 h-8 rounded-lg grid place-items-center text-ink-400 hover:text-ink-700 hover:bg-white/60 transition shrink-0"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" strokeWidth={2.3} />
              </button>
            </div>

            <div className="rounded-2xl bg-white p-4 grid place-items-center">
              <img
                src={buildInviteQrUrl(inviteLink)}
                alt="QR-код приглашения"
                className="w-full max-w-[320px] aspect-square object-contain"
                loading="lazy"
              />
            </div>

            <p className="text-[11px] text-ink-400 font-body mt-3 break-all">
              {inviteLink}
            </p>

            <div className="flex gap-2 justify-end mt-4">
              <button
                type="button"
                className="ui-btn ui-btn-subtle inline-flex items-center gap-1.5"
                onClick={() => void handleCopyInvite()}
              >
                {inviteCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5" strokeWidth={2.4} />
                    Скопировано
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" strokeWidth={2.2} />
                    Копировать ссылку
                  </>
                )}
              </button>
              <button
                type="button"
                className="ui-btn ui-btn-primary"
                onClick={() => setQrOpen(false)}
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      )}

      {transferTarget && (
        <div
          className="fixed inset-0 z-[80] bg-black/35 backdrop-blur-sm p-4 flex items-center justify-center"
          onClick={() => !transferringOwnership && setTransferTarget(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Передача прав владельца"
        >
          <div
            className="w-full max-w-md rounded-3xl border border-[color:var(--border-glass-strong)] bg-[color:var(--bg-elevated)] backdrop-blur-2xl p-6 shadow-[0_30px_90px_var(--scrim-4)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-xl text-ink-900">
              Передать права владельца
            </h3>
            <p className="text-sm text-ink-500 mt-2 font-body">
              После передачи ты станешь обычным участником. Это действие необратимо.
            </p>
            <p className="text-sm text-ink-700 mt-3 font-body">
              Новый владелец: <span className="font-semibold">{transferTarget.display_name}</span>
            </p>

            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                className="ui-btn ui-btn-subtle"
                onClick={() => setTransferTarget(null)}
                disabled={transferringOwnership}
              >
                Отмена
              </button>
              <button
                type="button"
                className="ui-btn ui-btn-danger"
                onClick={() => void handleConfirmOwnershipTransfer()}
                disabled={transferringOwnership}
              >
                {transferringOwnership ? "Передача…" : "Передать"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

