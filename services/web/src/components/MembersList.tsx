"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Cake,
  Check,
  ChevronDown,
  Copy,
  Crown,
  Link2,
  QrCode,
  RefreshCw,
  Search,
  SearchX,
  X,
} from "lucide-react";
import {
  buildFamilyInviteLink,
  createInvite,
  transferOwnership,
  type Family,
  type Me,
} from "@/lib/api";
import { getPresenceLabel } from "@/lib/presence";
import UserMiniProfilePopover, {
  type UserMiniProfile,
} from "@/components/UserMiniProfilePopover";
import { useUserPopover } from "@/lib/useUserPopover";

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
}) {
  const [expanded, setExpanded] = useState(false);
  const isOwner = member.role === "owner";
  const birthdaySoon = isBirthdaySoon(member.birthday);
  const isOnline = member.is_online === true;
  const presenceLabel = getPresenceLabel(member);

  return (
    <div className={`member-card ${expanded ? "expanded" : ""}`}>
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

        {isOwnerViewing && !isMe && (
          <div className="mt-3 space-y-2">
            {member.role !== "owner" && onTransferOwnership && (
              <button
                onClick={() => onTransferOwnership(member)}
                disabled={transferringOwnership}
                className="ui-btn ui-btn-subtle w-full"
                type="button"
              >
                {transferringOwnership ? "Передача…" : "Передать права"}
              </button>
            )}

            {onKick && (
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
  const [kicking, setKicking] = useState<string | null>(null);
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

  async function handleKick(userId: string, name: string) {
    if (!confirm(`Исключить ${name} из семьи?`)) return;
    setKicking(userId);
    try {
      await onKick?.(userId);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setKicking(null);
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
      alert(e instanceof Error ? e.message : "Не удалось передать права");
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
    const qrUrl = buildInviteQrUrl(inviteLink);
    window.open(qrUrl, "_blank", "noopener,noreferrer");
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

          {isOwnerViewing && (
            <div className="mt-3 rounded-2xl border border-white/70 bg-white/58 p-3 backdrop-blur">
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
                <p className="mt-2 text-xs text-red-500 font-body">{inviteError}</p>
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

      <UserMiniProfilePopover
        user={popoverUser}
        anchorRect={popoverAnchorRect}
        popoverRef={popoverRef}
      />

      {transferTarget && (
        <div
          className="fixed inset-0 z-[80] bg-black/35 backdrop-blur-sm p-4 flex items-center justify-center"
          onClick={() => !transferringOwnership && setTransferTarget(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Передача прав владельца"
        >
          <div
            className="w-full max-w-md rounded-3xl border border-white/70 bg-white/88 backdrop-blur-2xl p-6 shadow-[0_30px_90px_rgba(28,23,20,0.25)]"
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

