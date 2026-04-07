"use client";

import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Crown } from "lucide-react";
import { toAbsoluteApiUrl } from "@/lib/api-base";
import { getPresenceLabel } from "@/lib/presence";

export type UserMiniProfile = {
  display_name: string;
  username: string;
  avatar_url?: string | null;
  role?: "owner" | "member" | null;
  bio?: string | null;
  birthday?: string | null;
  joined_at?: string | null;
  is_online?: boolean | null;
  last_seen_at?: string | null;
};

function formatBirthday(iso?: string | null) {
  if (!iso) return null;

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString("ru", {
    day: "numeric",
    month: "long",
  });
}

function formatJoinedAt(iso?: string | null) {
  if (!iso) return null;

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString("ru", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function ProfileAvatar({
  avatarUrl,
  displayName,
}: {
  avatarUrl?: string | null;
  displayName: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";
  const resolvedAvatarUrl = avatarUrl ? toAbsoluteApiUrl(avatarUrl) : null;
  const showImage = Boolean(resolvedAvatarUrl) && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [resolvedAvatarUrl]);

  return (
    <div className="user-mini-avatar" aria-hidden>
      {showImage ? (
        <img
          src={resolvedAvatarUrl ?? ""}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        initial
      )}
    </div>
  );
}

export default function UserMiniProfilePopover({
  user,
  anchorRect,
  popoverRef,
}: {
  user: UserMiniProfile | null;
  anchorRect: DOMRect | null;
  popoverRef: RefObject<HTMLDivElement | null>;
}) {
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  if (!portalRoot || !user || !anchorRect) return null;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const margin = 12;
  const maxWidth = 320;
  const width = Math.max(252, Math.min(maxWidth, viewportWidth - margin * 2));
  const spaceBelow = viewportHeight - anchorRect.bottom;
  const spaceAbove = anchorRect.top;
  const placement = spaceBelow < 210 && spaceAbove > spaceBelow ? "top" : "bottom";
  const centeredLeft = anchorRect.left + anchorRect.width / 2 - width / 2;
  const left = Math.max(margin, Math.min(centeredLeft, viewportWidth - width - margin));
  const top = placement === "bottom" ? anchorRect.bottom + 10 : anchorRect.top - 10;
  const role = user.role === "owner" ? "owner" : "member";
  const roleLabel = role === "owner" ? "Создатель" : "Участник";
  const isOnline = user.is_online === true;
  const presenceLabel = getPresenceLabel(user, {
    onlineLabel: "Сейчас в сети",
    offlineLabel: "Не в сети",
  });
  const birthdayLabel = formatBirthday(user.birthday);
  const joinedLabel = formatJoinedAt(user.joined_at);

  return createPortal(
    <div className="user-mini-popover-layer">
      <div
        ref={popoverRef}
        className={`user-mini-popover glass-dropdown glossy ${placement === "top" ? "is-top" : "is-bottom"}`}
        style={{
          width: `${width}px`,
          left: `${left}px`,
          top: `${top}px`,
          transform: placement === "top" ? "translateY(-100%)" : undefined,
        }}
        role="dialog"
        aria-label={`Мини-профиль ${user.display_name}`}
      >
        <div className="user-mini-popover__head">
          <ProfileAvatar avatarUrl={user.avatar_url} displayName={user.display_name} />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="user-mini-popover__name">{user.display_name}</p>
              <span className={`user-mini-role ${role}`}>
                {role === "owner" && <Crown className="w-3 h-3" strokeWidth={2.4} />}
                {roleLabel}
              </span>
            </div>

            <p className="user-mini-popover__username">
              @{user.username || "unknown"}
            </p>

            <p className={`profile-presence ${isOnline ? "online" : ""}`} title={presenceLabel}>
              <span className={`profile-presence-dot ${isOnline ? "online" : "offline"}`} aria-hidden />
              <span className="truncate">{presenceLabel}</span>
            </p>
          </div>
        </div>

        {user.bio && (
          <p className="user-mini-popover__bio">{user.bio}</p>
        )}

        {(birthdayLabel || joinedLabel) && (
          <div className="user-mini-popover__meta">
            {birthdayLabel && (
              <p className="user-mini-meta-row">
                <span className="user-mini-meta-row__label">День рождения</span>
                <span className="user-mini-meta-row__value">{birthdayLabel}</span>
              </p>
            )}
            {joinedLabel && (
              <p className="user-mini-meta-row compact">
                <span className="user-mini-meta-row__label">В семье с</span>
                <span className="user-mini-meta-row__value">{joinedLabel}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>,
    portalRoot,
  );
}
