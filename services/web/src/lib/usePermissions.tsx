"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getMyEffectivePermissions,
  type MyEffectivePermissions,
} from "@/lib/api";

// Биты должны совпадать с app/core/permissions.py (Perm IntFlag).
export const PERM = {
  VIEW_CHANNEL: 1 << 0,
  READ_HISTORY: 1 << 1,
  SEND_MESSAGES: 1 << 2,
  ATTACH_FILES: 1 << 3,
  EMBED_LINKS: 1 << 4,
  ADD_REACTIONS: 1 << 5,
  MENTION_EVERYONE: 1 << 6,
  SEND_VOICE: 1 << 7,
  MANAGE_OWN_MESSAGES: 1 << 8,
  MANAGE_MESSAGES: 1 << 9,
  MANAGE_CHANNELS: 1 << 10,
  MANAGE_ROLES: 1 << 11,
  KICK_MEMBERS: 1 << 12,
  CREATE_INVITES: 1 << 13,
  MANAGE_FAMILY: 1 << 14,
  VIEW_AUDIT_LOG: 1 << 15,
  ACCESS_18PLUS: 1 << 16,
  MANAGE_GALLERY: 1 << 17,
  MANAGE_CALENDAR: 1 << 18,
  MANAGE_BUDGET: 1 << 19,
  MANAGE_NOTES: 1 << 20,
  MANAGE_REMINDERS: 1 << 21,
  MANAGE_TREE: 1 << 22,
  ADMINISTRATOR: 1 << 31,
} as const;

export type PermBit = (typeof PERM)[keyof typeof PERM];

export function hasBit(bits: number, perm: PermBit): boolean {
  if (bits & PERM.ADMINISTRATOR) return true;
  return (bits & perm) !== 0;
}

type Ctx = {
  perms: MyEffectivePermissions | null;
  loading: boolean;
  refetch: () => Promise<void>;
};

const PermissionsContext = createContext<Ctx>({
  perms: null,
  loading: true,
  refetch: async () => {},
});

export function PermissionsProvider({
  familyId,
  children,
}: {
  familyId: string | null;
  children: React.ReactNode;
}) {
  const [perms, setPerms] = useState<MyEffectivePermissions | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!familyId) {
      setPerms(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await getMyEffectivePermissions(familyId);
      setPerms(data);
    } catch (e) {
      console.warn("Failed to load effective permissions", e);
      setPerms(null);
    } finally {
      setLoading(false);
    }
  }, [familyId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const value = useMemo<Ctx>(
    () => ({ perms, loading, refetch }),
    [perms, loading, refetch],
  );

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions(): Ctx {
  return useContext(PermissionsContext);
}

/** Хелпер: вернёт effective-биты для указанного чата (с overrides). */
export function useChatPermissions(chatId: string | null) {
  const { perms } = usePermissions();
  return useMemo(() => {
    if (!perms || !chatId) return 0;
    if (perms.is_owner || perms.is_administrator) {
      // owner всё видит/делает
      return perms.base | PERM.ADMINISTRATOR;
    }
    return perms.chats[chatId] ?? perms.base;
  }, [perms, chatId]);
}

/** Хелпер: вернёт effective-биты для указанного канала. */
export function useChannelPermissions(channelId: string | null) {
  const { perms } = usePermissions();
  return useMemo(() => {
    if (!perms || !channelId) return 0;
    if (perms.is_owner || perms.is_administrator) {
      return perms.base | PERM.ADMINISTRATOR;
    }
    return perms.channels[channelId] ?? perms.base;
  }, [perms, channelId]);
}
