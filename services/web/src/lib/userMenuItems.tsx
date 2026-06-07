"use client";

import {
  AtSign,
  Ban,
  ExternalLink,
  Hash,
  Shield,
  ShieldOff,
  User as UserIcon,
  UserMinus,
} from "lucide-react";
import type { ContextMenuEntry } from "@/components/ContextMenu";
import { hasBit, PERM } from "@/lib/usePermissions";
import type { MyEffectivePermissions } from "@/lib/api";

export type UserMenuTarget = {
  user_id: string;
  display_name: string;
  username: string;
  role?: "owner" | "member";
  is_developer?: boolean;
  is_banned?: boolean;
};

export type UserMenuActions = {
  openProfile?: () => void;
  mention?: () => void;
  manageRoles?: () => void;
  openInAdmin?: () => void;
  kick?: () => void;
  ban?: () => void;
  unban?: () => void;
};

/**
 * Строит пункты контекстного меню пользователя (Discord-style), рендеря каждый
 * по правам зрителя. Переиспользуется в списке участников и в чате (аватар/автор).
 */
export function buildUserMenuEntries({
  target,
  meId,
  perms,
  actions,
}: {
  target: UserMenuTarget;
  meId: string;
  perms: MyEffectivePermissions | null;
  actions: UserMenuActions;
}): ContextMenuEntry[] {
  const entries: ContextMenuEntry[] = [];
  const isSelf = target.user_id === meId;
  const isDeveloperViewer = !!perms?.is_developer;
  const ownerOrAdmin = !!perms && (perms.is_owner || perms.is_administrator);
  const baseBits = perms?.base ?? 0;
  const canKick = ownerOrAdmin || hasBit(baseBits, PERM.KICK_MEMBERS);
  const canManageRoles = ownerOrAdmin || hasBit(baseBits, PERM.MANAGE_ROLES);

  if (actions.openProfile) {
    entries.push({ label: "Профиль", icon: UserIcon, onClick: actions.openProfile });
  }
  if (actions.mention && !isSelf) {
    entries.push({ label: "Упомянуть", icon: AtSign, onClick: actions.mention });
  }
  if (canManageRoles && actions.manageRoles && !isSelf) {
    entries.push({ label: "Управлять ролями", icon: Shield, onClick: actions.manageRoles });
  }
  if (isDeveloperViewer) {
    entries.push({
      label: "Копировать ID",
      icon: Hash,
      onClick: () => void navigator.clipboard?.writeText(target.user_id),
    });
    if (actions.openInAdmin) {
      entries.push({
        label: "Открыть в админке",
        icon: ExternalLink,
        onClick: actions.openInAdmin,
      });
    }
  }

  const danger: ContextMenuEntry[] = [];
  if (canKick && actions.kick && !isSelf && target.role !== "owner") {
    danger.push({
      label: "Исключить из семьи",
      icon: UserMinus,
      danger: true,
      onClick: actions.kick,
    });
  }
  if (isDeveloperViewer && !isSelf && !target.is_developer) {
    if (target.is_banned && actions.unban) {
      danger.push({ label: "Разбанить", icon: ShieldOff, onClick: actions.unban });
    }
    if (!target.is_banned && actions.ban) {
      danger.push({
        label: "Забанить в приложении",
        icon: Ban,
        danger: true,
        onClick: actions.ban,
      });
    }
  }

  if (danger.length > 0) {
    if (entries.length > 0) entries.push({ type: "separator" });
    entries.push(...danger);
  }
  return entries;
}
