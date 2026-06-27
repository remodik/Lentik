"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Clock as ClockIcon,
  Download,
  Eye,
  SmilePlus,
  CornerUpLeft,
  FileText,
  Image as ImageIcon,
  Loader2,
  Mic,
  Paperclip,
  Pause,
  Pencil,
  Pin,
  Play,
  Search,
  SendHorizontal,
  Smile,
  Trash2,
  X,
} from "lucide-react";

function formatChatSlowMode(sec: number): string {
  if (sec < 60) return `${sec} с`;
  if (sec < 3600) return `${Math.round(sec / 60)} мин`;
  return `${Math.round(sec / 3600)} ч`;
}

// ── Expert: debug-панель WebSocket ──────────────────────────────────────────
type WsDebugEntry = { raw: string; type: string; at: number };
const WS_DEBUG_LIMIT = 40;

function setWsDebugEntry(
  entry: WsDebugEntry,
  setter: React.Dispatch<React.SetStateAction<WsDebugEntry[]>>,
) {
  setter((prev) => {
    const next = [entry, ...prev];
    return next.length > WS_DEBUG_LIMIT ? next.slice(0, WS_DEBUG_LIMIT) : next;
  });
}

function formatWsTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}
import {
  addReaction,
  deleteMessage,
  editMessage,
  getMessages,
  markMessagesRead,
  pinChatMessage,
  removeReaction,
  searchChatMessages,
  sendMessage,
  sendMessageWithFiles,
  sendVoiceMessage,
  unpinChatMessage,
  type Chat,
  type Family,
  type Me,
  type Message,
  type MessageAttachment,
  type MessageSearchResult,
} from "@/lib/api";
import { fetchWsTicket, toAbsoluteApiUrl, wsUrl } from "@/lib/api-base";
import UserMiniProfilePopover, {
  type UserMiniProfile,
} from "@/components/UserMiniProfilePopover";
import { useConfirm } from "@/components/ConfirmDialog";
import { EmojiPickerPopover } from "@/components/EmojiPicker";
import { useUserMode } from "@/lib/useUserMode";
import {
  hasBit,
  PERM,
  useChatPermissions,
  usePermissions,
} from "@/lib/usePermissions";
import { useContextMenu } from "@/lib/useContextMenu";
import { buildUserMenuEntries } from "@/lib/userMenuItems";
import type { ContextMenuEntry } from "@/components/ContextMenu";
import BanUserModal from "@/components/BanUserModal";
import { adminUnbanUser } from "@/lib/api";
import { useRouter } from "next/navigation";
import { CornerUpLeft as ReplyIcon, Copy as CopyIcon, Pin as PinIcon, Pencil as PencilIcon, Trash2 as TrashIcon, Hash as HashIcon } from "lucide-react";
import MediaLightbox, {
  CustomVideoPlayer,
  type LightboxMedia,
} from "@/components/MediaLightbox";
import { useUserPopover } from "@/lib/useUserPopover";
import Age18Gate, { useAge18Gate } from "@/components/Age18Gate";

type ToolbarPlacement = "above" | "below";

const MAX_ATTACHMENTS_PER_MESSAGE = 8;
// Должно совпадать с MAX_ATTACHMENT_SIZE в services/api/app/routers/chats.py.
const MAX_CHAT_FILE_SIZE = 50 * 1024 * 1024;
const MAX_CHAT_FILE_LABEL = "50 МБ";
const TOOLBAR_MIN_SPACE = 72;
const TOOLBAR_HIDE_DELAY_MS = 120;
const MIN_SEARCH_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 260;

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Сегодня";
  if (d.toDateString() === yesterday.toDateString()) return "Вчера";

  return d.toLocaleDateString("ru", { day: "numeric", month: "long" });
}

function formatFullDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatSearchTimestamp(iso: string) {
  return `${formatDate(iso)} · ${formatTime(iso)}`;
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function summarizeMessagePreview(text: string | null | undefined, max = 100) {
  const compact = (text ?? "").replace(/\s+/g, " ").trim();
  if (!compact) return "Без текста";
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max)}…`;
}

function parsePinnedPreviewPayload(value: unknown): Chat["pinned_message"] | null {
  if (!value || typeof value !== "object") return null;

  const preview = value as {
    preview_text?: unknown;
    author_display_name?: unknown;
    created_at?: unknown;
  };

  if (typeof preview.preview_text !== "string") return null;
  if (typeof preview.created_at !== "string") return null;

  return {
    preview_text: preview.preview_text,
    author_display_name:
      typeof preview.author_display_name === "string"
        ? preview.author_display_name
        : null,
    created_at: preview.created_at,
  };
}

function normalizeMessage(message: Message): Message {
  return {
    ...message,
    attachments: (message.attachments ?? []).map((a) => ({
      ...a,
      url: toAbsoluteApiUrl(a.url),
    })),
    reactions: (message.reactions ?? []).map((reaction) => ({
      emoji: reaction.emoji,
      count: reaction.count ?? reaction.user_ids?.length ?? 0,
      user_ids: reaction.user_ids ?? [],
    })),
    readers: (message.readers ?? []).map((reader) => ({
      ...reader,
      avatar_url: reader.avatar_url ? toAbsoluteApiUrl(reader.avatar_url) : null,
    })),
  };
}

function renderText(text: string, meUsername: string) {
  const parts = text.split(/(@[\w_]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      const uname = part.slice(1);
      const isMe = uname === meUsername;
      return (
        <span
          key={i}
          className={`inline-flex rounded px-1.5 py-0.5 text-[13px] font-medium ${
            isMe
              ? "bg-warm-100/75 text-warm-700 border border-warm-200/55"
              : "bg-white/55 text-ink-700 border border-white/65"
          }`}
          title={isMe ? "Это вы" : `Упоминание: ${uname}`}
        >
          {part}
        </span>
      );
    }
    return part;
  });
}

function MessageAvatar({
  avatarUrl,
  fallback,
  label,
  active,
  onClick,
  onContextMenu,
}: {
  avatarUrl: string | null;
  fallback: string;
  label: string;
  active?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  const showImage = Boolean(avatarUrl) && !imageFailed;

  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`w-10 h-10 rounded-full overflow-hidden grid place-items-center font-semibold shrink-0 border border-[color:var(--border-glass-strong)] shadow-[0_8px_20px_var(--scrim-2)] bg-gradient-to-br from-warm-300 via-warm-400 to-warm-500 text-[color:var(--text-on-dark)] transition ${
        active ? "ring-2 ring-[color:var(--border-glass-strong)]" : "hover:scale-[1.03]"
      }`}
      aria-label={label}
      title={label}
    >
      {showImage ? (
        <img
          src={avatarUrl ?? ""}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        fallback
      )}
    </button>
  );
}


function VoiceAttachmentPlayer({ attachment }: { attachment: MessageAttachment }) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState<number | null>(null);

  const bars = React.useMemo(() => {
    let hash = 0;
    for (let i = 0; i < attachment.url.length; i++) {
      hash = (hash * 31 + attachment.url.charCodeAt(i)) & 0xffffffff;
    }
    return Array.from({ length: 28 }, (_, i) => {
      const h = (((hash >> (i % 8)) & 0xf) / 15) * 18 + 4;
      return Math.round(h);
    });
  }, [attachment.url]);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      void el.play();
    }
  };

  return (
    <div className="flex items-center gap-2.5 py-2 px-3 rounded-xl border border-white/65 bg-white/55 max-w-[260px]">
      <audio
        ref={audioRef}
        src={attachment.url}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? null)}
        preload="metadata"
      />
      <button
        type="button"
        onClick={toggle}
        className="w-8 h-8 rounded-full bg-ink-900 text-[color:var(--text-on-dark)] grid place-items-center shrink-0 hover:bg-ink-700 transition"
        aria-label={playing ? "Пауза" : "Воспроизвести"}
      >
        {playing ? (
          <Pause className="w-3.5 h-3.5" strokeWidth={2.2} />
        ) : (
          <Play className="w-3.5 h-3.5 ml-0.5" strokeWidth={2.2} />
        )}
      </button>
      <div className="flex items-center gap-px flex-1">
        {bars.map((h, i) => (
          <div
            key={i}
            className="rounded-full bg-ink-400 w-[2px] shrink-0"
            style={{ height: `${h}px`, opacity: playing ? 0.8 : 0.4 }}
          />
        ))}
      </div>
      <span className="text-[11px] text-ink-400 font-body shrink-0">
        {fmt(currentTime)}{duration ? ` / ${fmt(duration)}` : ""}
      </span>
    </div>
  );
}

function AttachmentView({
  attachment,
  onOpenMedia,
}: {
  attachment: MessageAttachment;
  onOpenMedia?: (media: LightboxMedia) => void;
}) {
  const size = attachment.file_size ? formatBytes(attachment.file_size) : null;

  if (attachment.kind === "voice") {
    return <VoiceAttachmentPlayer attachment={attachment} />;
  }

  if (attachment.kind === "image") {
    return (
      <button
        type="button"
        onClick={() =>
          onOpenMedia?.({
            kind: "image",
            url: attachment.url,
            fileName: attachment.file_name,
          })
        }
        className="inline-block group/img relative rounded-lg overflow-hidden border border-white/70 shadow-sm transition hover:brightness-95"
        aria-label={`Открыть ${attachment.file_name}`}
      >
        <img
          src={attachment.url}
          alt={attachment.file_name}
          className="max-w-[min(360px,100%)] max-h-[320px] block object-cover"
        />
      </button>
    );
  }

  if (attachment.kind === "video") {
    return (
      <div className="max-w-[min(420px,100%)] w-full">
        <CustomVideoPlayer
          src={attachment.url}
          className="max-h-[320px] border border-white/70 shadow-sm"
        />
      </div>
    );
  }

  return (
    <a
      href={attachment.url}
      download={attachment.file_name}
      className="inline-flex items-center gap-2 rounded-lg border border-white/65 bg-white/52 px-3 py-2 text-ink-700 hover:bg-white/72 transition"
    >
      <FileText className="w-4 h-4 text-ink-500" />
      <span className="text-[13px] font-medium">{attachment.file_name}</span>
      {size && <span className="text-[11px] text-ink-400">{size}</span>}
    </a>
  );
}

export default function ChatView({
  familyId,
  chat,
  me,
  family,
  onLeave,
}: {
  familyId: string;
  chat: Chat;
  me: Me;
  family?: Family;
  onLeave?: () => void;
}) {
  const ageGate = useAge18Gate(chat.id, !!chat.is_18plus, me.birthday);
  const { confirm, notify } = useConfirm();
  const { isExpert } = useUserMode();
  const chatPerms = useChatPermissions(chat.id);
  const canSendMessages = hasBit(chatPerms, PERM.SEND_MESSAGES);
  const canAttachFiles = hasBit(chatPerms, PERM.ATTACH_FILES);
  const canSendVoice = hasBit(chatPerms, PERM.SEND_VOICE);
  const canAddReactions = hasBit(chatPerms, PERM.ADD_REACTIONS);
  const canManageMessages = hasBit(chatPerms, PERM.MANAGE_MESSAGES);
  const canManageOwn = hasBit(chatPerms, PERM.MANAGE_OWN_MESSAGES);
  const { perms: familyPerms } = usePermissions();
  const { openContextMenu } = useContextMenu();
  const router = useRouter();
  const [banTarget, setBanTarget] = useState<{ user_id: string; display_name: string } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [emojiPickerForId, setEmojiPickerForId] = useState<string | null>(null);
  const [emojiPickerAnchorRect, setEmojiPickerAnchorRect] = useState<DOMRect | null>(null);
  // Composer emoji picker (Discord-style) — inserts into the message text.
  const [composerEmojiOpen, setComposerEmojiOpen] = useState(false);
  const [composerEmojiAnchor, setComposerEmojiAnchor] = useState<DOMRect | null>(null);
  const [toolbarPlacement, setToolbarPlacement] = useState<Record<string, ToolbarPlacement>>({});
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [pinnedMessageId, setPinnedMessageId] = useState<string | null>(
    chat.pinned_message_id ?? null,
  );
  const [pinnedMessagePreview, setPinnedMessagePreview] = useState<Chat["pinned_message"] | null>(
    chat.pinned_message ?? null,
  );
  const [pinUpdatingForId, setPinUpdatingForId] = useState<string | null>(null);

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [sendingVoice, setSendingVoice] = useState(false);

  // Expert: буфер последних сырых ws-сообщений для debug-панели.
  const [wsDebugLog, setWsDebugLog] = useState<WsDebugEntry[]>([]);
  const [wsDebugOpen, setWsDebugOpen] = useState(false);
  const isExpertRef = useRef(isExpert);
  useEffect(() => {
    isExpertRef.current = isExpert;
    if (!isExpert) setWsDebugOpen(false);
  }, [isExpert]);
  const pushWsDebug = useCallback((raw: string) => {
    if (!isExpertRef.current) return;
    let type = "—";
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.type === "string") type = parsed.type;
    } catch {
      type = "(не JSON)";
    }
    setWsDebugEntry({ raw, type, at: Date.now() }, setWsDebugLog);
  }, []);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [mentionStart, setMentionStart] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [lightboxMedia, setLightboxMedia] = useState<LightboxMedia | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MessageSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchHint, setSearchHint] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toolbarHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Trigger elements excluded from the emoji popover's outside-click so that
  // clicking the trigger again toggles (rather than close-then-reopen).
  const emojiBtnRef = useRef<HTMLButtonElement>(null);
  const reactionTriggerRef = useRef<HTMLElement | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const suppressAutoScrollRef = useRef(false);
  const lastMessageCountRef = useRef(0);
  const readMarkedIdsRef = useRef<Set<string>>(new Set());
  const {
    popoverUser,
    popoverAnchorRect,
    popoverOpenKey,
    popoverRef,
    openPopover,
    closePopover,
  } = useUserPopover<UserMiniProfile>();

  const members = family?.members ?? [];
  const onlineMembersCount = useMemo(
    () => members.filter((member) => member.is_online === true).length,
    [members],
  );
  const headerPresence = useMemo(() => {
    return {
      isOnline: onlineMembersCount > 0,
      label: `В сети: ${onlineMembersCount}`,
    };
  }, [onlineMembersCount]);
  const memberById = useMemo(
    () => new Map(members.map((member) => [member.user_id, member])),
    [members],
  );
  const memberByUsername = useMemo(
    () =>
      new Map(
        members.map((member) => [member.username.toLowerCase(), member]),
      ),
    [members],
  );
  const myRole = memberById.get(me.id)?.role ?? "member";
  const messageMap = useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages],
  );
  const oldestMessageId = messages[0]?.id ?? null;
  const pinnedMessageFromList = pinnedMessageId
    ? messageMap.get(pinnedMessageId) ?? null
    : null;
  const canPinMessages = canManageMessages;

  const resolveAuthorDisplayName = useCallback(
    (message: Message) => {
      const isMine = message.author_id === me.id;
      const authorMember = message.author_id
        ? memberById.get(message.author_id)
        : undefined;
      return (
        authorMember?.display_name ??
        (isMine ? me.display_name : null) ??
        message.author_display_name ??
        message.author_username ??
        "Участник"
      );
    },
    [memberById, me.display_name, me.id],
  );

  const resolveAuthorAvatarUrl = useCallback(
    (message: Message) => {
      const isMine = message.author_id === me.id;
      const authorMemberById = message.author_id
        ? memberById.get(message.author_id)
        : undefined;
      const authorMemberByUsername = message.author_username
        ? memberByUsername.get(message.author_username.toLowerCase())
        : undefined;
      const messageAvatarUrl =
        (message as Message & { author_avatar_url?: string | null }).author_avatar_url ??
        null;

      const rawAvatarUrl =
        messageAvatarUrl ??
        authorMemberById?.avatar_url ??
        authorMemberByUsername?.avatar_url ??
        (isMine ? me.avatar_url : null) ??
        null;

      return rawAvatarUrl ? toAbsoluteApiUrl(rawAvatarUrl) : null;
    },
    [memberById, memberByUsername, me.avatar_url, me.id],
  );

  const resolveAuthorMiniProfile = useCallback(
    (message: Message): UserMiniProfile => {
      const authorMemberById = message.author_id
        ? memberById.get(message.author_id)
        : undefined;
      const authorMemberByUsername = message.author_username
        ? memberByUsername.get(message.author_username.toLowerCase())
        : undefined;
      const authorMember = authorMemberById ?? authorMemberByUsername;
      const isMine =
        message.author_id === me.id ||
        message.author_username?.toLowerCase() === me.username.toLowerCase();
      const username =
        authorMember?.username ??
        message.author_username ??
        (isMine ? me.username : "unknown");

      return {
        display_name: resolveAuthorDisplayName(message),
        username,
        avatar_url: resolveAuthorAvatarUrl(message),
        role: authorMember?.role ?? "member",
        bio: authorMember?.bio ?? (isMine ? me.bio : null),
        birthday: authorMember?.birthday ?? (isMine ? me.birthday : null),
        joined_at: authorMember?.joined_at ?? null,
        is_online: authorMember?.is_online ?? (isMine ? me.is_online : null),
        last_seen_at: authorMember?.last_seen_at ?? (isMine ? me.last_seen_at : null),
        is_bot: authorMember?.is_bot ?? false,
      };
    },
    [
      memberById,
      memberByUsername,
      me.bio,
      me.birthday,
      me.id,
      me.is_online,
      me.last_seen_at,
      me.username,
      resolveAuthorAvatarUrl,
      resolveAuthorDisplayName,
    ],
  );

  const handleAuthorAvatarClick = useCallback(
    (message: Message, anchor: HTMLElement) => {
      const anchorKey = `message:${message.id}`;
      openPopover(resolveAuthorMiniProfile(message), anchor, anchorKey);
    },
    [openPopover, resolveAuthorMiniProfile],
  );

  const setRowRef = useCallback((id: string, node: HTMLDivElement | null) => {
    if (node) {
      rowRefs.current.set(id, node);
      return;
    }
    rowRefs.current.delete(id);
  }, []);

  // Тулбар всегда сверху: даже если сообщение у верхнего края — пусть
  // часть тулбара уходит за viewport, это удобнее, чем перемещать его вниз.
  const updateToolbarPlacement = useCallback((_id: string) => {
    /* no-op */
  }, []);

  const clearToolbarHideTimeout = useCallback(() => {
    if (!toolbarHideTimeoutRef.current) return;
    clearTimeout(toolbarHideTimeoutRef.current);
    toolbarHideTimeoutRef.current = null;
  }, []);

  const showToolbar = useCallback(
    (id: string) => {
      clearToolbarHideTimeout();
      updateToolbarPlacement(id);
      setHoveredId(id);
    },
    [clearToolbarHideTimeout, updateToolbarPlacement],
  );

  const scheduleToolbarHide = useCallback(
    (id: string) => {
      clearToolbarHideTimeout();
      toolbarHideTimeoutRef.current = setTimeout(() => {
        setHoveredId((current) => (current === id ? null : current));
        toolbarHideTimeoutRef.current = null;
      }, TOOLBAR_HIDE_DELAY_MS);
    },
    [clearToolbarHideTimeout],
  );

  // На touch нет ховера — действия с сообщением открываем по long-press через то
  // же контекст-меню, что и ПКМ на десктопе.
  const longPressRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    x: number;
    y: number;
  }>({ timer: null, x: 0, y: 0 });

  const cancelLongPress = useCallback(() => {
    if (longPressRef.current.timer) {
      clearTimeout(longPressRef.current.timer);
      longPressRef.current.timer = null;
    }
  }, []);

  const openContextMenuAt = useCallback(
    (x: number, y: number, entries: ContextMenuEntry[]) => {
      if (!entries.length) return;
      openContextMenu(
        {
          preventDefault() {},
          stopPropagation() {},
          clientX: x,
          clientY: y,
        } as unknown as React.MouseEvent,
        entries,
      );
    },
    [openContextMenu],
  );

  const markMessagesAsRead = useCallback(
    async (messageIds: string[]) => {
      const uniqueIds = [...new Set(messageIds)];
      const pending = uniqueIds.filter((id) => !readMarkedIdsRef.current.has(id));
      if (pending.length === 0) return;

      pending.forEach((id) => readMarkedIdsRef.current.add(id));
      try {
        await markMessagesRead(familyId, chat.id, pending);
      } catch (e) {
        pending.forEach((id) => readMarkedIdsRef.current.delete(id));
        console.error("markMessagesRead failed", e);
      }
    },
    [familyId, chat.id],
  );

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setLoadingMore(false);
    try {
      const msgs = await getMessages(familyId, chat.id, { limit: 50 });
      setMessages(msgs.map(normalizeMessage));
      setHasMore(msgs.length === 50);
    } catch (e) {
      console.error("loadMessages failed", e);
      setMessages([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [familyId, chat.id]);

  const loadMoreMessages = useCallback(async () => {
    if (!oldestMessageId || loadingMore || loading || !hasMore) return;

    const viewport = messagesViewportRef.current;
    const prevHeight = viewport?.scrollHeight ?? 0;
    const prevTop = viewport?.scrollTop ?? 0;

    setLoadingMore(true);
    try {
      const chunk = await getMessages(familyId, chat.id, {
        limit: 50,
        beforeId: oldestMessageId,
      });
      const normalized = chunk.map(normalizeMessage);

      if (normalized.length > 0) {
        suppressAutoScrollRef.current = true;
        setMessages((prev) => {
          const known = new Set(prev.map((message) => message.id));
          const older = normalized.filter((message) => !known.has(message.id));
          return [...older, ...prev];
        });

        requestAnimationFrame(() => {
          const node = messagesViewportRef.current;
          if (!node) return;
          const nextHeight = node.scrollHeight;
          node.scrollTop = Math.max(0, prevTop + (nextHeight - prevHeight));
        });
      }

      if (chunk.length < 50) {
        setHasMore(false);
      }
    } catch (e) {
      console.error("loadMoreMessages failed", e);
    } finally {
      setLoadingMore(false);
    }
  }, [chat.id, familyId, hasMore, loading, loadingMore, oldestMessageId]);

  useEffect(() => {
    if (ageGate.status !== "ok") return;
    void loadMessages();
  }, [ageGate.status, loadMessages]);

  useEffect(() => {
    const isNewMessage = messages.length > lastMessageCountRef.current;
    lastMessageCountRef.current = messages.length;

    if (!isNewMessage) return;

    if (suppressAutoScrollRef.current) {
      suppressAutoScrollRef.current = false;
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(
    () => () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
      clearToolbarHideTimeout();
    },
    [clearToolbarHideTimeout],
  );

  useEffect(() => {
    clearToolbarHideTimeout();
    setHoveredId(null);
    setReplyTo(null);
    setEmojiPickerForId(null);
    setEmojiPickerAnchorRect(null);
    setHighlightedId(null);
    setToolbarPlacement({});
    setHasMore(true);
    setLoadingMore(false);
    readMarkedIdsRef.current.clear();
    suppressAutoScrollRef.current = false;
    setPinnedMessageId(chat.pinned_message_id ?? null);
    setPinnedMessagePreview(chat.pinned_message ?? null);
    setPinUpdatingForId(null);
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchLoading(false);
    setSearchError("");
    setSearchHint(null);
  }, [chat.id, clearToolbarHideTimeout]);

  useEffect(() => {
    closePopover();
  }, [chat.id, closePopover]);

  useEffect(() => {
    if (!searchOpen) return;

    const raf = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;

    const normalizedQuery = searchQuery.trim();
    if (normalizedQuery.length < MIN_SEARCH_QUERY_LENGTH) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError("");
      return;
    }

    let cancelled = false;
    setSearchLoading(true);
    setSearchError("");

    const timeoutId = window.setTimeout(async () => {
      try {
        const results = await searchChatMessages(familyId, chat.id, normalizedQuery);
        if (cancelled) return;
        setSearchResults(results);
      } catch (error) {
        if (cancelled) return;
        setSearchResults([]);
        setSearchError(
          error instanceof Error ? error.message : "Не удалось выполнить поиск",
        );
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [chat.id, familyId, searchOpen, searchQuery]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) return;

    const onScroll = () => {
      if (viewport.scrollTop < 120 && hasMore && !loadingMore && !loading) {
        void loadMoreMessages();
      }
    };

    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      viewport.removeEventListener("scroll", onScroll);
    };
  }, [hasMore, loadMoreMessages, loading, loadingMore]);

  useEffect(() => {
    if (messages.length === 0) return;
    void markMessagesAsRead(messages.map((message) => message.id));
  }, [markMessagesAsRead, messages]);

  useEffect(() => {
    const activeId = hoveredId;
    if (!activeId) return;

    const handleReposition = () => {
      updateToolbarPlacement(activeId);
    };

    const raf = requestAnimationFrame(handleReposition);
    const viewport = messagesViewportRef.current;
    viewport?.addEventListener("scroll", handleReposition, { passive: true });
    window.addEventListener("resize", handleReposition);

    return () => {
      cancelAnimationFrame(raf);
      viewport?.removeEventListener("scroll", handleReposition);
      window.removeEventListener("resize", handleReposition);
    };
  }, [hoveredId, updateToolbarPlacement]);

  useEffect(() => {
    if (!emojiPickerForId) return;
    const closePickerOnScroll = () => {
      setEmojiPickerForId(null);
      setEmojiPickerAnchorRect(null);
    };
    const viewport = messagesViewportRef.current;
    viewport?.addEventListener("scroll", closePickerOnScroll, { passive: true });
    window.addEventListener("resize", closePickerOnScroll);
    return () => {
      viewport?.removeEventListener("scroll", closePickerOnScroll);
      window.removeEventListener("resize", closePickerOnScroll);
    };
  }, [emojiPickerForId]);

  // Close the composer emoji picker when switching chats.
  useEffect(() => {
    setComposerEmojiOpen(false);
    setComposerEmojiAnchor(null);
  }, [chat.id]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let pingInterval: ReturnType<typeof setInterval> | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    function clearTimers() {
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
    }

    async function connect() {
      if (!isMounted) return;

      const ticket = await fetchWsTicket();
      if (!isMounted) return;
      const query = ticket ? `?ticket=${encodeURIComponent(ticket)}` : "";
      ws = new WebSocket(wsUrl(`/families/${familyId}/chats/${chat.id}/ws${query}`));

      ws.onopen = () => {
        if (!isMounted) return;

        pingInterval = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send("ping");
          }
        }, 30000);
      };

      ws.onmessage = (e) => {
        try {
          if (typeof e.data === "string") pushWsDebug(e.data);
          const d = JSON.parse(e.data);

          if (d.type === "new_message") {
            const message = normalizeMessage(d.message as Message);
            setMessages((p) => (p.some((m) => m.id === message.id) ? p : [...p, message]));
            void markMessagesAsRead([message.id]);
          } else if (d.type === "message_edited") {
            setMessages((p) =>
              p.map((m) =>
                m.id === d.message.id
                  ? { ...m, text: d.message.text, edited: true }
                  : m,
              ),
            );
          } else if (d.type === "message_deleted") {
            setMessages((p) => p.filter((m) => m.id !== d.message_id));
          } else if (d.type === "reaction_added") {
            setMessages((p) =>
              p.map((message) =>
                message.id === d.message_id
                  ? appendReactionToMessage(message, d.emoji, d.user_id)
                  : message,
              ),
            );
          } else if (d.type === "reaction_removed") {
            setMessages((p) =>
              p.map((message) =>
                message.id === d.message_id
                  ? removeReactionFromMessage(message, d.emoji, d.user_id)
                  : message,
              ),
            );
          } else if (d.type === "messages_read") {
            const userId = typeof d.user_id === "string" ? d.user_id : null;
            const displayName =
              typeof d.user_display_name === "string" && d.user_display_name.trim()
                ? d.user_display_name
                : "Участник";
            const messageIds = Array.isArray(d.message_ids)
              ? d.message_ids.filter((id: unknown): id is string => typeof id === "string")
              : [];

            if (!userId || messageIds.length === 0) return;

            const affected = new Set(messageIds);
            setMessages((prev) =>
              prev.map((message) => {
                if (!affected.has(message.id)) return message;
                const readers = message.readers ?? [];
                if (readers.some((reader) => reader.user_id === userId)) return message;

                return {
                  ...message,
                  readers: [
                    ...readers,
                    { user_id: userId, display_name: displayName, avatar_url: null },
                  ],
                };
              }),
            );
          } else if (d.type === "chat_pin_updated") {
            const nextPinnedMessageId =
              typeof d.pinned_message_id === "string" ? d.pinned_message_id : null;
            setPinnedMessageId(nextPinnedMessageId);
            setPinnedMessagePreview(
              nextPinnedMessageId ? parsePinnedPreviewPayload(d.pinned_message) : null,
            );
          }
        } catch { }
      };

      ws.onclose = () => {
        if (!isMounted) return;

        clearTimers();

        reconnectTimeout = setTimeout(() => {
          void connect();
        }, 3000);
      };

      ws.onerror = () => {
        try {
          ws?.close();
        } catch {}
      };
    }

    void connect();

    return () => {
      isMounted = false;
      clearTimers();
      try {
        ws?.close();
      } catch {}
    };
  }, [chat.id, familyId, markMessagesAsRead]);

  const mentionSuggestions =
    mentionQuery !== null
      ? members
          .filter(
            (m) =>
              m.username.toLowerCase().startsWith(mentionQuery.toLowerCase()) ||
              m.display_name
                .toLowerCase()
                .startsWith(mentionQuery.toLowerCase()),
          )
          .slice(0, 5)
      : [];

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionQuery]);

  function adjustTextareaHeight(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 136) + "px";
  }

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setText(val);
    adjustTextareaHeight(e.target);

    const cursor = e.target.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const match = before.match(/@([\w_]*)$/);

    if (match) {
      setMentionQuery(match[1]);
      setMentionStart(cursor - match[0].length);
    } else {
      setMentionQuery(null);
    }
  }

  function insertMention(username: string) {
    const before = text.slice(0, mentionStart);
    const after = text.slice(mentionStart + 1 + (mentionQuery?.length ?? 0));
    const next = `${before}@${username} ${after}`;

    setText(next);
    setMentionQuery(null);

    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const pos = before.length + username.length + 2;
      el.setSelectionRange(pos, pos);
      adjustTextareaHeight(el);
    });
  }

  function insertEmojiAtCursor(emoji: string) {
    const el = textareaRef.current;
    // Fall back to appending if the textarea isn't focused/available.
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    setMentionQuery(null);

    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.focus();
      const pos = start + emoji.length;
      node.setSelectionRange(pos, pos);
      adjustTextareaHeight(node);
    });
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!picked.length) return;

    // Размер проверяем сразу при выборе — понятный отказ, а не падение отправки.
    const tooBig = picked.filter((f) => f.size > MAX_CHAT_FILE_SIZE);
    const allowed = picked.filter((f) => f.size <= MAX_CHAT_FILE_SIZE);

    if (allowed.length > 0) {
      setSelectedFiles((prev) =>
        [...prev, ...allowed].slice(0, MAX_ATTACHMENTS_PER_MESSAGE),
      );
    }

    if (tooBig.length > 0) {
      void notify({
        title: tooBig.length === 1 ? "Файл слишком большой" : "Файлы слишком большие",
        tone: "danger",
        description: (
          <div className="space-y-1 text-left">
            <p>Максимальный размер вложения — {MAX_CHAT_FILE_LABEL}. Не добавлены:</p>
            {tooBig.map((f) => (
              <p key={f.name} className="text-ink-500">
                • {f.name} — {formatBytes(f.size)}
              </p>
            ))}
          </div>
        ),
      });
    }
  }

  function removeSelectedFile(index: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function appendReactionToMessage(message: Message, emoji: string, userId: string): Message {
    const reactions = message.reactions ?? [];
    const existing = reactions.find((reaction) => reaction.emoji === emoji);

    if (!existing) {
      return {
        ...message,
        reactions: [...reactions, { emoji, count: 1, user_ids: [userId] }],
      };
    }
    if (existing.user_ids.includes(userId)) return message;

    return {
      ...message,
      reactions: reactions.map((reaction) =>
        reaction.emoji === emoji
          ? {
              ...reaction,
              count: reaction.count + 1,
              user_ids: [...reaction.user_ids, userId],
            }
          : reaction,
      ),
    };
  }

  function removeReactionFromMessage(message: Message, emoji: string, userId: string): Message {
    const reactions = message.reactions ?? [];
    const existing = reactions.find((reaction) => reaction.emoji === emoji);
    if (!existing) return message;
    if (!existing.user_ids.includes(userId)) return message;

    const nextUserIds = existing.user_ids.filter((id) => id !== userId);
    if (nextUserIds.length === 0) {
      return {
        ...message,
        reactions: reactions.filter((reaction) => reaction.emoji !== emoji),
      };
    }

    return {
      ...message,
      reactions: reactions.map((reaction) =>
        reaction.emoji === emoji
          ? {
              ...reaction,
              count: Math.max(reaction.count - 1, 0),
              user_ids: nextUserIds,
            }
          : reaction,
      ),
    };
  }

  async function handleReactionToggle(message: Message, emoji: string) {
    const alreadyReacted =
      message.reactions?.find((reaction) => reaction.emoji === emoji)?.user_ids.includes(me.id) ?? false;

    try {
      if (alreadyReacted) {
        await removeReaction(familyId, chat.id, message.id, emoji);
      } else {
        await addReaction(familyId, chat.id, message.id, emoji);
      }
    } catch (e) {
      console.error("toggleReaction failed", e);
    }
  }


  const startVoiceRecording = async () => {
    if (isRecording || sendingVoice) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        if (blob.size < 1000) return; // too short, discard
        setSendingVoice(true);
        try {
          const msg = await sendVoiceMessage(familyId, chat.id, blob);
          const normalized = normalizeMessage(msg);
          setMessages((prev) => prev.some((m) => m.id === normalized.id) ? prev : [...prev, normalized]);
        } catch (e) {
          console.error('sendVoiceMessage failed', e);
        } finally {
          setSendingVoice(false);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch (e) {
      console.error('startVoiceRecording failed', e);
    }
  };

  const stopVoiceRecording = () => {
    if (!isRecording) return;
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
    setRecordingSeconds(0);
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  async function handleSend() {
    if (sending) return;

    const value = text.trim();
    if (!value && selectedFiles.length === 0) return;

    setSending(true);
    try {
      const msg =
        selectedFiles.length > 0
          ? await sendMessageWithFiles(
              familyId,
              chat.id,
              selectedFiles,
              value || undefined,
            )
          : await sendMessage(familyId, chat.id, value, replyTo?.id ?? null);

      const normalized = normalizeMessage(msg);
      setMessages((prev) =>
        prev.some((m) => m.id === normalized.id) ? prev : [...prev, normalized],
      );
      setText("");
      setReplyTo(null);
      setSelectedFiles([]);
      setMentionQuery(null);

      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Не удалось отправить сообщение";
      const statusCode = (e as { status?: number })?.status;
      // 4xx — это ожидаемые пользовательские ситуации (медленный режим 429,
      // модерация 422 и т.п.). Их не логируем в console.error, иначе в dev
      // всплывает оверлей ошибки на штатное поведение. Логируем только 5xx/сетевые.
      if (statusCode === undefined || statusCode >= 500) {
        console.error("sendMessage failed", e);
      }
      const title =
        statusCode === 429
          ? "Медленный режим"
          : statusCode === 422
            ? "Сообщение отклонено"
            : statusCode === 413
              ? "Файл слишком большой"
              : "Не удалось отправить";
      void notify({
        title,
        description: message,
        tone: "danger",
      });
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(messageId: string, skipConfirm = false) {
    if (!skipConfirm) {
      const ok = await confirm({
        title: "Удалить сообщение",
        description: "Вы действительно хотите удалить это сообщение?",
        confirmLabel: "Удалить",
        tone: "danger",
      });
      if (!ok) return;
    }
    try {
      await deleteMessage(familyId, chat.id, messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (e) {
      console.error("deleteMessage failed", e);
    }
  }

  async function handlePinToggle(message: Message) {
    if (!canPinMessages || pinUpdatingForId) return;

    const isPinned = pinnedMessageId === message.id;
    setPinUpdatingForId(message.id);
    try {
      const updatedChat = isPinned
        ? await unpinChatMessage(familyId, chat.id)
        : await pinChatMessage(familyId, chat.id, message.id);

      setPinnedMessageId(updatedChat.pinned_message_id ?? null);
      setPinnedMessagePreview(updatedChat.pinned_message ?? null);
    } catch (e) {
      console.error("togglePin failed", e);
    } finally {
      setPinUpdatingForId(null);
    }
  }

  async function handleExportHistory() {
    if (exporting) return;

    setExporting(true);
    try {
      const pageSize = 200;
      let beforeId: string | undefined;
      let collected: Message[] = [];

      while (true) {
        const chunk = await getMessages(familyId, chat.id, {
          limit: pageSize,
          beforeId,
        });
        if (chunk.length === 0) break;

        const normalized = chunk.map(normalizeMessage);
        collected = [...normalized, ...collected];

        if (chunk.length < pageSize) break;

        beforeId = chunk[0]?.id;
        if (!beforeId) break;
      }

      const lines: string[] = [
        `=== Чат: ${chat.name} ===`,
        `Экспортировано: ${new Date().toLocaleString("ru")}`,
        "════════════════════════",
        "",
      ];

      let currentDay: string | null = null;
      for (const message of collected) {
        const day = formatFullDate(message.created_at);
        if (day !== currentDay) {
          currentDay = day;
          lines.push(`[${day}]`, "");
        }

        const author = resolveAuthorDisplayName(message);
        lines.push(`${author} [${formatTime(message.created_at)}]:`);
        if (message.text?.trim()) {
          lines.push(message.text);
        } else {
          lines.push("—");
        }

        if ((message.attachments ?? []).length > 0) {
          const files = (message.attachments ?? []).map((file) => file.file_name).join(", ");
          lines.push(`[Вложения: ${files}]`);
        }

        lines.push("", "---", "");
      }

      const content = lines.join("\n");
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const safeName =
        chat.name
          .trim()
          .replace(/[^\p{L}\p{N}]+/gu, "-")
          .replace(/^-+|-+$/g, "")
          .toLowerCase() || "chat";

      anchor.href = url;
      anchor.download = `lentik-${safeName}-${Date.now()}.txt`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("exportChatHistory failed", e);
    } finally {
      setExporting(false);
    }
  }

  // Expert: экспорт истории чата в JSON. Та же выгрузка, что и .txt, но
  // машиночитаемая (для разработчиков/гиков).
  async function handleExportHistoryJson() {
    if (exporting) return;

    setExporting(true);
    try {
      const pageSize = 200;
      let beforeId: string | undefined;
      let collected: Message[] = [];

      while (true) {
        const chunk = await getMessages(familyId, chat.id, {
          limit: pageSize,
          beforeId,
        });
        if (chunk.length === 0) break;

        const normalized = chunk.map(normalizeMessage);
        collected = [...normalized, ...collected];

        if (chunk.length < pageSize) break;
        beforeId = chunk[0]?.id;
        if (!beforeId) break;
      }

      const payload = {
        chat: {
          id: chat.id,
          name: chat.name,
          family_id: familyId,
          is_18plus: !!chat.is_18plus,
          slow_mode_seconds: chat.slow_mode_seconds ?? 0,
        },
        exported_at: new Date().toISOString(),
        message_count: collected.length,
        messages: collected.map((m) => ({
          id: m.id,
          author_id: m.author_id,
          author_display_name: resolveAuthorDisplayName(m),
          text: m.text,
          edited: m.edited,
          reply_to_id: m.reply_to_id,
          mentions: m.mentions ?? [],
          attachments: m.attachments ?? [],
          created_at: m.created_at,
        })),
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const safeName =
        chat.name
          .trim()
          .replace(/[^\p{L}\p{N}]+/gu, "-")
          .replace(/^-+|-+$/g, "")
          .toLowerCase() || "chat";
      anchor.href = url;
      anchor.download = `lentik-${safeName}-${Date.now()}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("exportChatHistoryJson failed", e);
      void notify({ title: "Не удалось экспортировать чат", tone: "danger" });
    } finally {
      setExporting(false);
    }
  }

  function startEdit(message: Message) {
    setEditingId(message.id);
    setEditText(message.text);
  }

  async function saveEdit(messageId: string) {
    const value = editText.trim();
    if (!value) return;

    try {
      const updated = await editMessage(familyId, chat.id, messageId, value);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, text: updated.text, edited: true }
            : m,
        ),
      );
      setEditingId(null);
      setEditText("");
    } catch (e) {
      console.error("editMessage failed", e);
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  function scrollToMessage(id: string) {
    const node = document.getElementById(`msg-${id}`);
    if (!node) return false;

    node.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    setHighlightedId(id);
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedId((current) => (current === id ? null : current));
      highlightTimeoutRef.current = null;
    }, 1500);
    return true;
  }

  function closeSearchPanel() {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchLoading(false);
    setSearchError("");
    setSearchHint(null);
  }

  function clearSearchResults() {
    setSearchQuery("");
    setSearchResults([]);
    setSearchLoading(false);
    setSearchError("");
    setSearchHint(null);
  }

  function handleSearchResultClick(result: MessageSearchResult) {
    const didScroll = scrollToMessage(result.id);
    if (didScroll) {
      closeSearchPanel();
      return;
    }

    setSearchHint("Сообщение пока вне загруженного диапазона истории");
  }

  const canSend = !sending && (text.trim().length > 0 || selectedFiles.length > 0);
  const replyAuthorDisplayName = replyTo ? resolveAuthorDisplayName(replyTo) : "Участник";
  const emojiPickerMessage = useMemo(
    () => (emojiPickerForId ? messages.find((m) => m.id === emojiPickerForId) ?? null : null),
    [emojiPickerForId, messages],
  );
  const replyPreviewText =
    replyTo?.text && replyTo.text.trim()
      ? replyTo.text.length > 80
        ? `${replyTo.text.slice(0, 80)}…`
        : replyTo.text
      : "Без текста";
  const hasPinnedBanner = Boolean(
    pinnedMessageId && (pinnedMessageFromList || pinnedMessagePreview),
  );
  const pinnedBannerAuthor = pinnedMessageFromList
    ? resolveAuthorDisplayName(pinnedMessageFromList)
    : pinnedMessagePreview?.author_display_name ?? "Участник";
  const pinnedBannerPreview = pinnedMessageFromList
    ? summarizeMessagePreview(pinnedMessageFromList.text)
    : pinnedMessagePreview?.preview_text ?? "Без текста";
  const canJumpToPinned = Boolean(pinnedMessageId && pinnedMessageFromList);
  const normalizedSearchQuery = searchQuery.trim();
  const canSearchInChat = normalizedSearchQuery.length >= MIN_SEARCH_QUERY_LENGTH;

  if (ageGate.status !== "ok") {
    return (
      <div className="h-full flex flex-col min-w-0 overflow-x-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/40 gap-3">
          <div className="min-w-0">
            <h2 className="font-body text-[1.02rem] font-semibold text-ink-900 truncate inline-flex items-center gap-2">
              <span className="truncate"># {chat.name}</span>
              {chat.is_18plus && (
                <span
                  className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold border border-[color:var(--danger-border)] bg-[var(--danger-bg-soft)] text-[color:var(--danger-fg-bold)]"
                  title="Только для 18+"
                >
                  18+
                </span>
              )}
            </h2>
            {chat.description?.trim() ? (
              <p className="text-[12px] text-ink-500 font-body mt-0.5 line-clamp-1">
                {chat.description}
              </p>
            ) : null}
          </div>
        </div>
        <Age18Gate
          status={ageGate.status}
          reason={ageGate.reason}
          targetId={chat.id}
          targetName={chat.name}
          onAccept={ageGate.accept}
          onCancel={() => onLeave?.()}
        />
      </div>
    );
  }

  return (
    <div className="relative h-full flex flex-col min-w-0 overflow-x-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/40 gap-3">
        <div className="min-w-0">
          <h2 className="font-body text-[1.02rem] font-semibold text-ink-900 truncate inline-flex items-center gap-2">
            <span className="truncate"># {chat.name}</span>
            {chat.is_18plus && (
              <span
                className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold border border-[color:var(--danger-border)] bg-[var(--danger-bg-soft)] text-[color:var(--danger-fg-bold)]"
                title="Только для 18+"
              >
                18+
              </span>
            )}
            {!!chat.slow_mode_seconds && chat.slow_mode_seconds > 0 && (
              <span
                className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold border border-[color:var(--warning-border)] bg-[var(--warning-bg-soft)] text-[color:var(--warning-fg-bold)]"
                title={`Медленный режим: ${formatChatSlowMode(chat.slow_mode_seconds)}`}
              >
                <ClockIcon className="w-3 h-3" strokeWidth={2.4} />
                {formatChatSlowMode(chat.slow_mode_seconds)}
              </span>
            )}
            {!canSendMessages && (
              <span
                className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold border border-[color:var(--border-glass-strong)] bg-[color:var(--bg-surface-subtle)] text-ink-500"
                title="У вашей роли нет права писать в этом чате"
              >
                <Eye className="w-3 h-3" strokeWidth={2.4} />
                Только чтение
              </span>
            )}
          </h2>
          {chat.description?.trim() ? (
            <p className="text-[12px] text-ink-500 font-body mt-0.5 line-clamp-1" title={chat.description}>
              {chat.description}
            </p>
          ) : null}
          <p className="text-[11px] text-ink-400 font-body mt-0.5 inline-flex items-center gap-1.5 pl-[15px]">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                headerPresence.isOnline
                  ? "bg-[#38c57a] shadow-[0_0_0_3px_rgba(56,197,122,0.18)]"
                  : "bg-[#b8bdc8]"
              }`}
              aria-hidden
            />
            <span className="truncate">{headerPresence.label}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (searchOpen) {
                closeSearchPanel();
                return;
              }
              setSearchOpen(true);
              setSearchHint(null);
            }}
            className={`ui-btn ui-btn-subtle !px-2.5 !py-1.5 inline-flex items-center gap-1.5 ${
              searchOpen ? "bg-[color:var(--bg-elevated)] border-[color:var(--border-glass-strong)]" : ""
            }`}
            title={searchOpen ? "Закрыть поиск" : "Поиск в чате"}
            aria-label={searchOpen ? "Закрыть поиск" : "Поиск в чате"}
          >
            <Search className="w-3.5 h-3.5" strokeWidth={2.2} />
            <span className="hidden sm:inline">Поиск</span>
          </button>
          <button
            type="button"
            onClick={() => void handleExportHistory()}
            className="ui-btn ui-btn-subtle !px-2.5 !py-1.5 inline-flex items-center gap-1.5"
            disabled={exporting}
            title="Экспортировать историю"
            aria-label="Экспортировать историю"
          >
            {exporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2.2} />
            ) : (
              <Download className="w-3.5 h-3.5" strokeWidth={2.2} />
            )}
            <span className="hidden sm:inline">Экспорт</span>
          </button>
          {isExpert && (
            <button
              type="button"
              onClick={() => void handleExportHistoryJson()}
              className="ui-btn ui-btn-subtle !px-2.5 !py-1.5 inline-flex items-center gap-1.5 font-mono"
              disabled={exporting}
              title="Экспортировать историю в JSON (эксперт)"
              aria-label="Экспортировать историю в JSON"
            >
              <Download className="w-3.5 h-3.5" strokeWidth={2.2} />
              <span className="hidden sm:inline">JSON</span>
            </button>
          )}
        </div>
      </div>

      {searchOpen && (
        <div className="px-4 pt-3 pb-1">
          <div className="rounded-2xl border border-[color:var(--border-glass-strong)] bg-[color:var(--bg-surface-strong)] backdrop-blur-md shadow-[0_14px_42px_var(--scrim-2)]">
            <div className="flex items-center gap-2 p-2.5">
              <span className="w-8 h-8 rounded-xl border border-[color:var(--border-glass-strong)] bg-[color:var(--bg-surface-strong)] grid place-items-center text-ink-500 shrink-0">
                <Search className="w-4 h-4" strokeWidth={2.1} />
              </span>

              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setSearchHint(null);
                }}
                placeholder="Поиск по сообщениям…"
                className="flex-1 bg-transparent text-[13px] text-ink-900 placeholder:text-ink-300 outline-none min-w-0"
              />

              {searchQuery && (
                <button
                  type="button"
                  onClick={clearSearchResults}
                  className="w-8 h-8 rounded-lg grid place-items-center text-ink-400 hover:text-ink-700 hover:bg-white/72 transition"
                  aria-label="Очистить поиск"
                  title="Очистить"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={2.3} />
                </button>
              )}

              <button
                type="button"
                onClick={closeSearchPanel}
                className="w-8 h-8 rounded-lg grid place-items-center text-ink-400 hover:text-ink-700 hover:bg-white/72 transition"
                aria-label="Закрыть поиск"
                title="Закрыть"
              >
                <X className="w-3.5 h-3.5" strokeWidth={2.3} />
              </button>
            </div>

            <div className="border-t border-white/60 px-2.5 py-2">
              {!canSearchInChat ? (
                <p className="px-1 text-[11px] text-ink-400 font-body">
                  Введи минимум {MIN_SEARCH_QUERY_LENGTH} символа
                </p>
              ) : searchLoading ? (
                <div className="flex items-center gap-2 px-1 text-[12px] text-ink-400 font-body">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2.2} />
                  Поиск…
                </div>
              ) : searchError ? (
                <p className="px-1 text-[12px] text-[color:var(--danger-fg-strong)] font-body">{searchError}</p>
              ) : searchResults.length === 0 ? (
                <p className="px-1 text-[12px] text-ink-400 font-body">Ничего не найдено</p>
              ) : (
                <div className="max-h-[260px] overflow-y-auto sidebar-scroll space-y-1 pr-1">
                  {searchResults.map((result) => (
                    <button
                      key={`search-${result.id}`}
                      type="button"
                      onClick={() => handleSearchResultClick(result)}
                      className="w-full text-left rounded-xl border border-white/65 bg-white/58 px-2.5 py-2 hover:bg-white/75 transition"
                      title={result.snippet}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-semibold text-ink-800 truncate">
                          {result.author_display_name ?? "Участник"}
                        </span>
                        <span className="text-[10px] text-ink-400 shrink-0">
                          {formatSearchTimestamp(result.created_at)}
                        </span>
                      </div>
                      <p className="mt-1 text-[12px] text-ink-600 leading-[1.35] break-words whitespace-pre-wrap">
                        {result.snippet}
                      </p>
                    </button>
                  ))}
                </div>
              )}

              {searchHint && (
                <p className="mt-2 px-1 text-[11px] text-ink-500 font-body">{searchHint}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {hasPinnedBanner && (
        <div className="px-4 pt-3 pb-1">
          <button
            type="button"
            onClick={() => {
              if (pinnedMessageId && pinnedMessageFromList) {
                scrollToMessage(pinnedMessageId);
              }
            }}
            className={`w-full rounded-xl border border-white/65 bg-white/62 px-3 py-2 text-left transition ${
              canJumpToPinned ? "hover:bg-white/75" : ""
            }`}
            title={canJumpToPinned ? "Перейти к закреплённому сообщению" : "Сообщение не загружено"}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <span className="mt-0.5 w-5 h-5 rounded-md bg-white/70 border border-white/65 grid place-items-center shrink-0">
                <Pin className="w-3 h-3 text-warm-700" strokeWidth={2.2} />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] text-ink-500 font-body truncate">
                  Закреплено · {pinnedBannerAuthor}
                </p>
                <p className="text-[13px] text-ink-800 font-body truncate mt-0.5">
                  {pinnedBannerPreview}
                </p>
              </div>
            </div>
          </button>
        </div>
      )}

      <div ref={messagesViewportRef} className="flex-1 overflow-y-auto px-4 py-4 sidebar-scroll">
        {loadingMore && (
          <div className="flex justify-center py-3">
            <Loader2 className="w-5 h-5 animate-spin text-ink-400" />
          </div>
        )}

        {!loading && !hasMore && messages.length > 0 && (
          <div className="text-center text-[11px] text-ink-300 py-4 font-body">
            Начало переписки · {formatDate(messages[0].created_at)}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-ink-400 px-2">Загрузка сообщений…</div>
        ) : messages.length === 0 ? (
          <div className="text-sm text-ink-400 px-2">Сообщений пока нет</div>
        ) : (
          messages.map((message, index) => {
            const prev = messages[index - 1];
            const next = messages[index + 1];
            const isGrouped =
              index > 0 &&
              !message.reply_to_id &&
              messages[index - 1].author_id === message.author_id &&
              new Date(message.created_at).getTime() -
                new Date(messages[index - 1].created_at).getTime() <
                5 * 60 * 1000;
            const isLastInGroup =
              !next ||
              next.author_id !== message.author_id ||
              new Date(next.created_at).getTime() -
                new Date(message.created_at).getTime() >=
                5 * 60 * 1000;
            const showDate =
              !prev ||
              new Date(prev.created_at).toDateString() !==
                new Date(message.created_at).toDateString();

            const isMine = message.author_id === me.id;
            const authorDisplayName = resolveAuthorDisplayName(message);
            const authorAvatarUrl = resolveAuthorAvatarUrl(message);
            const authorPopoverKey = `message:${message.id}`;
            const authorInitial = authorDisplayName[0]?.toUpperCase() ?? "?";
            const authorIsBot = message.author_id
              ? memberById.get(message.author_id)?.is_bot ?? false
              : false;
            const canEdit = isMine && canManageOwn;
            const canDelete = (isMine && canManageOwn) || canManageMessages;
            const isPinned = pinnedMessageId === message.id;
            const isToolbarVisible =
              (hoveredId === message.id || emojiPickerForId === message.id) &&
              editingId !== message.id;
            const toolbarDirection = toolbarPlacement[message.id] ?? "above";
            const buildMsgEntries = (): ContextMenuEntry[] => {
              const entries: ContextMenuEntry[] = [];
              if (canAddReactions)
                entries.push({
                  label: "Реакция",
                  icon: SmilePlus,
                  onClick: () => {
                    const node = rowRefs.current.get(message.id);
                    if (!node) return;
                    reactionTriggerRef.current = node;
                    setEmojiPickerAnchorRect(node.getBoundingClientRect());
                    setEmojiPickerForId(message.id);
                  },
                });
              if (canSendMessages)
                entries.push({ label: "Ответить", icon: ReplyIcon, onClick: () => setReplyTo(message) });
              if (message.text)
                entries.push({
                  label: "Копировать текст",
                  icon: CopyIcon,
                  onClick: () => void navigator.clipboard?.writeText(message.text),
                });
              if (canPinMessages)
                entries.push({
                  label: isPinned ? "Открепить" : "Закрепить",
                  icon: PinIcon,
                  onClick: () => void handlePinToggle(message),
                });
              if (canEdit)
                entries.push({ label: "Изменить", icon: PencilIcon, onClick: () => startEdit(message) });
              if (familyPerms?.is_developer)
                entries.push({
                  label: "Копировать ID",
                  icon: HashIcon,
                  onClick: () => void navigator.clipboard?.writeText(message.id),
                });
              if (canDelete) {
                entries.push({ type: "separator" });
                entries.push({
                  label: "Удалить",
                  icon: TrashIcon,
                  danger: true,
                  onClick: () => void handleDelete(message.id),
                });
              }
              return entries;
            };
            const originalMessage = message.reply_to_id
              ? messageMap.get(message.reply_to_id) ?? null
              : null;
            const originalAuthorDisplayName = originalMessage
              ? resolveAuthorDisplayName(originalMessage)
              : null;
            const originalAuthorAvatarUrl = originalMessage
              ? resolveAuthorAvatarUrl(originalMessage)
              : null;
            const originalAuthorInitial =
              originalAuthorDisplayName?.[0]?.toUpperCase() ?? "?";
            const originalHasAttachment =
              (originalMessage?.attachments?.length ?? 0) > 0;
            const originalPreviewText = originalMessage
              ? originalMessage.text && originalMessage.text.trim()
                ? originalMessage.text.length > 80
                  ? `${originalMessage.text.slice(0, 80)}…`
                  : originalMessage.text
                : originalHasAttachment
                  ? "Вложение"
                  : "Без текста"
              : "Оригинал недоступен";
            const reactions = message.reactions ?? [];
            const readers = Array.from(
              new Map(
                (message.readers ?? [])
                  .filter(
                    (reader) =>
                      reader.user_id !== message.author_id && reader.user_id !== me.id,
                  )
                  .map((reader) => [reader.user_id, reader]),
              ).values(),
            );
            const readersTooltip = readers
              .map(
                (reader) =>
                  memberById.get(reader.user_id)?.display_name ??
                  reader.display_name ??
                  "Участник",
              )
              .join(", ");
            const readersPreview = readers.slice(0, 3);

            return (
              <React.Fragment key={message.id}>
                {showDate && (
                  <div className="flex items-center gap-3 py-3">
                    <div className="flex-1 h-px bg-white/40" />
                    <div className="text-[11px] text-ink-300 font-semibold px-3 py-1 rounded-full bg-white/45 border border-white/55">
                      {formatDate(message.created_at)}
                    </div>
                    <div className="flex-1 h-px bg-white/40" />
                  </div>
                )}

                {message.reply_to_id && editingId !== message.id && (
                  <div className="msg-reply-context">
                    <span className="msg-reply-hook" aria-hidden />
                    {originalMessage ? (
                      <button
                        type="button"
                        onClick={() => scrollToMessage(originalMessage.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            scrollToMessage(originalMessage.id);
                          }
                        }}
                        className="msg-reply-link"
                        title={`Перейти к сообщению от ${originalAuthorDisplayName}`}
                      >
                        {originalAuthorAvatarUrl ? (
                          <img
                            src={originalAuthorAvatarUrl}
                            alt=""
                            className="msg-reply-avatar"
                          />
                        ) : (
                          <span className="msg-reply-avatar msg-reply-avatar--fallback">
                            {originalAuthorInitial}
                          </span>
                        )}
                        <span className="msg-reply-author">
                          {originalAuthorDisplayName}
                        </span>
                        {originalHasAttachment && (
                          <ImageIcon
                            className="msg-reply-attach-ic"
                            strokeWidth={2.1}
                            aria-hidden
                          />
                        )}
                        <span className="msg-reply-preview-text">
                          {originalPreviewText}
                        </span>
                      </button>
                    ) : (
                      <span className="msg-reply-link msg-reply-link--missing">
                        <CornerUpLeft className="w-3 h-3" strokeWidth={2.3} />
                        <span>Оригинал недоступен</span>
                      </span>
                    )}
                  </div>
                )}

                <div
                  id={`msg-${message.id}`}
                  ref={(node) => setRowRef(message.id, node)}
                  className={`msg-row group relative flex gap-3 px-2 py-1.5 rounded-md transition-colors ${
                    isGrouped ? "msg-row--grouped" : ""
                  } ${
                    highlightedId === message.id ? "msg-row--highlighted" : ""
                  } ${
                    hoveredId === message.id ? "bg-white/24" : "hover:bg-white/24"
                  }`}
                  onMouseEnter={() => showToolbar(message.id)}
                  onMouseLeave={() => scheduleToolbarHide(message.id)}
                  onContextMenu={(e) => {
                    const entries = buildMsgEntries();
                    if (entries.length) openContextMenu(e, entries);
                  }}
                  onPointerDown={(e) => {
                    if (e.pointerType === "mouse") return;
                    const el = e.target as Element;
                    if (
                      el.closest(
                        "button, a, input, textarea, [role='button'], .msg-actions-panel",
                      )
                    )
                      return;
                    cancelLongPress();
                    const x = e.clientX;
                    const y = e.clientY;
                    longPressRef.current.x = x;
                    longPressRef.current.y = y;
                    longPressRef.current.timer = setTimeout(() => {
                      longPressRef.current.timer = null;
                      const entries = buildMsgEntries();
                      if (entries.length) {
                        navigator.vibrate?.(12);
                        openContextMenuAt(x, y, entries);
                      }
                    }, 450);
                  }}
                  onPointerMove={(e) => {
                    if (
                      longPressRef.current.timer &&
                      Math.hypot(
                        e.clientX - longPressRef.current.x,
                        e.clientY - longPressRef.current.y,
                      ) > 12
                    )
                      cancelLongPress();
                  }}
                  onPointerUp={cancelLongPress}
                  onPointerCancel={cancelLongPress}
                >
                  {isGrouped ? (
                    <div className="w-10 h-10 shrink-0" aria-hidden />
                  ) : (
                    <MessageAvatar
                      avatarUrl={authorAvatarUrl}
                      fallback={authorInitial}
                      label={`Профиль ${authorDisplayName}`}
                      active={popoverOpenKey === authorPopoverKey}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleAuthorAvatarClick(message, event.currentTarget);
                      }}
                      onContextMenu={(event) => {
                        if (!message.author_id) return;
                        const member = memberById.get(message.author_id);
                        const username = member?.username ?? message.author_username ?? "";
                        const anchor = event.currentTarget;
                        const authorId = message.author_id;
                        openContextMenu(
                          event,
                          buildUserMenuEntries({
                            target: {
                              user_id: authorId,
                              display_name: authorDisplayName,
                              username,
                              role: member?.role,
                              is_developer: member?.is_developer,
                              is_banned: member?.is_banned,
                            },
                            meId: me.id,
                            perms: familyPerms,
                            actions: {
                              openProfile: () => handleAuthorAvatarClick(message, anchor),
                              mention: username
                                ? () => setText((t) => (t ? `${t} @${username} ` : `@${username} `))
                                : undefined,
                              openInAdmin: () => router.push(`/admin?user=${authorId}`),
                              ban: () => setBanTarget({ user_id: authorId, display_name: authorDisplayName }),
                              unban: () => void adminUnbanUser(authorId).catch(() => {}),
                            },
                          }),
                        );
                      }}
                    />
                  )}

                  <div className="relative flex-1 min-w-0">
                    {isGrouped ? (
                      <div className={`pointer-events-none absolute right-0 top-0 text-[11px] text-ink-300 transition-opacity ${isToolbarVisible ? "opacity-0" : "opacity-0 group-hover:opacity-100"}`}>
                        {formatTime(message.created_at)}
                        {message.edited && (
                          <span className="ml-1 text-[10px] text-ink-300">(изменено)</span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-2 pr-16">
                        <span className={`text-[14px] font-semibold ${isMine ? "text-warm-700" : "text-ink-900"}`}>
                          {authorDisplayName}
                        </span>
                        {authorIsBot && (
                          <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md border border-[color:var(--accent-border)] bg-[var(--accent-soft)] text-[color:var(--warm-700)] self-center">
                            Бот
                          </span>
                        )}
                        <span className="text-[11px] text-ink-300">
                          {formatTime(message.created_at)}
                        </span>
                        {message.edited && (
                          <span className="text-[10px] text-ink-300">(изменено)</span>
                        )}
                      </div>
                    )}

                    <div
                      className={`msg-actions msg-actions-panel msg-actions-panel--${toolbarDirection} absolute z-20 ${
                        isToolbarVisible ? "is-visible" : ""
                      }`}
                      onMouseEnter={() => showToolbar(message.id)}
                      onMouseLeave={() => scheduleToolbarHide(message.id)}
                    >
                      {canAddReactions && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (emojiPickerForId === message.id) {
                              setEmojiPickerForId(null);
                              setEmojiPickerAnchorRect(null);
                            } else {
                              reactionTriggerRef.current = e.currentTarget;
                              setEmojiPickerAnchorRect(e.currentTarget.getBoundingClientRect());
                              setEmojiPickerForId(message.id);
                            }
                          }}
                          className="msg-actions-btn"
                          data-tooltip="Реакция"
                        >
                          <SmilePlus className="w-4 h-4" strokeWidth={2.2} />
                        </button>
                      )}
                      {canSendMessages && (
                      <button
                        type="button"
                        onClick={() => setReplyTo(message)}
                        className="msg-actions-btn"
                        data-tooltip="Ответить"
                      >
                        <CornerUpLeft className="w-4 h-4" strokeWidth={2.2} />
                      </button>
                      )}
                      {canPinMessages && (
                        <button
                          type="button"
                          onClick={() => void handlePinToggle(message)}
                          className={`msg-actions-btn ${isPinned ? "text-warm-700" : ""}`}
                          data-tooltip={isPinned ? "Открепить" : "Закрепить"}
                          disabled={pinUpdatingForId === message.id}
                        >
                          <Pin className="w-4 h-4" strokeWidth={2.2} />
                        </button>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => startEdit(message)}
                          className="msg-actions-btn"
                          data-tooltip="Изменить"
                        >
                          <Pencil className="w-4 h-4" strokeWidth={2.2} />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={(e) => handleDelete(message.id, e.shiftKey)}
                          className="msg-actions-btn danger"
                          data-tooltip="Удалить"
                        >
                          <Trash2 className="w-4 h-4" strokeWidth={2.2} />
                        </button>
                      )}

                    </div>

                    {editingId === message.id ? (
                      <div className="mt-2 space-y-2 max-w-[720px]">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="w-full min-h-[84px] rounded-lg border border-white/65 bg-white/70 px-3 py-2 text-ink-800 outline-none resize-none"
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="px-3 py-1.5 rounded-md border border-white/65 bg-white/55 text-ink-600"
                          >
                            Отмена
                          </button>
                          <button
                            type="button"
                            onClick={() => saveEdit(message.id)}
                            className="px-3 py-1.5 rounded-md border border-ink-900 bg-ink-900 text-[color:var(--text-on-dark)]"
                          >
                            Сохранить
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>

                        {message.attachments?.length > 0 && (
                          <div className={`mt-1.5 flex flex-col items-start gap-2 ${message.text ? "mb-1.5" : ""}`}>
                            {message.attachments.map((attachment, idx) => (
                              <AttachmentView
                                key={`${message.id}-att-${idx}`}
                                attachment={attachment}
                                onOpenMedia={setLightboxMedia}
                              />
                            ))}
                          </div>
                        )}

                        {message.text && (
                          <div className="text-[15px] text-ink-800 whitespace-pre-wrap break-words leading-relaxed">
                            {renderText(message.text, me.username)}
                          </div>
                        )}

                        {reactions.length > 0 && (
                          <div className="reactions-row">
                            {reactions.map((reaction) => {
                              const reacted = reaction.user_ids.includes(me.id);
                              const names = reaction.user_ids
                                .slice(0, 3)
                                .map((uid) => memberById.get(uid)?.display_name ?? "Участник");
                              const tooltip =
                                reaction.count > 3
                                  ? `${names.join(", ")} и ещё ${reaction.count - 3}`
                                  : names.join(", ");
                              return (
                                <button
                                  key={`${message.id}-${reaction.emoji}`}
                                  type="button"
                                  onClick={() => void handleReactionToggle(message, reaction.emoji)}
                                  className={`reaction-chip ${reacted ? "reacted" : ""}`}
                                  title={tooltip}
                                  aria-label={`${reaction.emoji} ${reaction.count}, ${tooltip}`}
                                >
                                  <span className="reaction-chip__emoji">{reaction.emoji}</span>
                                  <span className="reaction-chip__count">{reaction.count}</span>
                                </button>
                              );
                            })}
                            <button
                              type="button"
                              className="reaction-add-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (emojiPickerForId === message.id) {
                                  setEmojiPickerForId(null);
                                  setEmojiPickerAnchorRect(null);
                                } else {
                                  reactionTriggerRef.current = e.currentTarget;
                                  setEmojiPickerAnchorRect(e.currentTarget.getBoundingClientRect());
                                  setEmojiPickerForId(message.id);
                                }
                              }}
                              aria-label="Добавить реакцию"
                              title="Добавить реакцию"
                            >
                              <SmilePlus className="w-3 h-3" strokeWidth={2.3} />
                            </button>
                          </div>
                        )}

                        {isLastInGroup && readers.length > 0 && (
                          <div className="mt-1.5 flex justify-end">
                            <div
                              className="inline-flex items-center -space-x-1.5 opacity-60"
                              title={`Прочитали: ${readersTooltip}`}
                            >
                              {readersPreview.map((reader) => {
                                const fallback = (
                                  memberById.get(reader.user_id)?.display_name ??
                                  reader.display_name ??
                                  "Участник"
                                )
                                  .trim()
                                  .charAt(0)
                                  .toUpperCase();
                                const avatar =
                                  reader.avatar_url ??
                                  memberById.get(reader.user_id)?.avatar_url ??
                                  null;

                                return (
                                  <span
                                    key={`${message.id}-reader-${reader.user_id}`}
                                    className="w-4 h-4 rounded-full overflow-hidden border border-white/80 bg-white/55 text-[9px] font-semibold text-ink-600 grid place-items-center"
                                  >
                                    {avatar ? (
                                      <img
                                        src={toAbsoluteApiUrl(avatar)}
                                        alt=""
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      fallback || "?"
                                    )}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-white/40 px-4 py-3">
        {mentionQuery !== null && mentionSuggestions.length > 0 && (
          <div className="mb-3 rounded-lg border border-white/65 bg-white/78 shadow-lg p-2 max-h-[200px] overflow-y-auto">
            {mentionSuggestions.map((member, idx) => (
              <button
                key={member.username}
                type="button"
                onClick={() => insertMention(member.username)}
                className={`w-full text-left px-3 py-2 rounded-md transition ${
                  idx === mentionIndex ? "bg-white/90" : "hover:bg-white/70"
                }`}
              >
                <div className="text-[13px] text-ink-900 font-semibold">
                  {member.display_name}
                </div>
                <div className="text-[11px] text-ink-400">@{member.username}</div>
              </button>
            ))}
          </div>
        )}

        {replyTo && (
          <div className="reply-bar glass-compose">
            <CornerUpLeft className="w-3.5 h-3.5 text-warm-700 shrink-0" strokeWidth={2.4} />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold text-ink-700 truncate">
                {replyAuthorDisplayName}
              </div>
              <div className="text-[12px] text-ink-500 truncate">{replyPreviewText}</div>
            </div>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="w-6 h-6 rounded grid place-items-center text-ink-400 hover:text-ink-900 hover:bg-white/70 transition shrink-0"
              aria-label="Отменить ответ"
            >
              <X className="w-3.5 h-3.5" strokeWidth={2.3} />
            </button>
          </div>
        )}

        {selectedFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {selectedFiles.map((file, idx) => (
              <div
                key={`${file.name}-${idx}`}
                className="inline-flex items-center gap-2 rounded-md border border-white/65 bg-white/58 px-2 py-1.5 text-ink-700"
              >
                <FileText className="w-3.5 h-3.5 text-ink-500" />
                <span className="text-[12px] max-w-[220px] truncate">{file.name}</span>
                <span className="text-[11px] text-ink-400">{formatBytes(file.size)}</span>
                <button
                  type="button"
                  onClick={() => removeSelectedFile(idx)}
                  className="w-5 h-5 rounded grid place-items-center text-ink-400 hover:text-ink-900 hover:bg-white/75"
                  aria-label="Убрать файл"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={2.4} />
                </button>
              </div>
            ))}
          </div>
        )}

        {!canSendMessages ? (
          <div className="rounded-xl border border-white/65 bg-white/52 px-3.5 py-3 text-[13px] text-ink-500 font-body">
            У вас нет права писать в этом чате
          </div>
        ) : (
        <div className="relative flex items-center gap-2 rounded-xl border border-white/65 bg-white/62 px-2.5 py-2 focus-within:outline-none [&_textarea]:focus:outline-none [&_textarea]:focus-visible:outline-none">
          {isRecording && (
            <div className="absolute -top-8 left-0 right-0 flex items-center justify-center gap-2 text-[12px] text-[color:var(--danger-fg-strong)] font-semibold font-body">
              <span className="w-2 h-2 rounded-full bg-[var(--danger-solid)] animate-pulse" />
              Запись {recordingSeconds}с — отпустите для отправки
            </div>
          )}
          {canAttachFiles && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-9 h-9 rounded-md grid place-items-center text-ink-500 hover:text-ink-900 hover:bg-white/75 transition shrink-0"
              data-tooltip="Прикрепить файл"
              aria-label="Прикрепить файл"
            >
              <Paperclip className="w-4 h-4" strokeWidth={2.2} />
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            onChange={handleFilePick}
          />

          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={(e) => {
              if (mentionQuery !== null && mentionSuggestions.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMentionIndex((i) => (i + 1) % mentionSuggestions.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMentionIndex((i) =>
                    i === 0 ? mentionSuggestions.length - 1 : i - 1,
                  );
                  return;
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  const selected = mentionSuggestions[mentionIndex];
                  if (selected) insertMention(selected.username);
                  return;
                }
                if (e.key === "Escape") {
                  setMentionQuery(null);
                  return;
                }
              }

              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={`Написать в #${chat.name}`}
            className="flex-1 bg-transparent resize-none outline-none focus:outline-none focus:ring-0 focus-visible:outline-none text-[14px] leading-[1.42] text-ink-900 placeholder:text-ink-300 max-h-[136px] min-h-[40px] py-[9px] border-0 appearance-none"
            rows={1}
          />

          <button
            ref={emojiBtnRef}
            type="button"
            onClick={(e) => {
              if (composerEmojiOpen) {
                setComposerEmojiOpen(false);
                setComposerEmojiAnchor(null);
              } else {
                setComposerEmojiAnchor(e.currentTarget.getBoundingClientRect());
                setComposerEmojiOpen(true);
              }
            }}
            className={`w-9 h-9 rounded-md grid place-items-center shrink-0 transition ${
              composerEmojiOpen
                ? "text-[var(--accent)] bg-[var(--accent-soft)]"
                : "text-ink-500 hover:text-ink-900 hover:bg-white/75"
            }`}
            data-tooltip="Эмодзи"
            aria-label="Эмодзи"
            aria-expanded={composerEmojiOpen}
          >
            <Smile className="w-4 h-4" strokeWidth={2.2} />
          </button>

          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className="w-10 h-10 rounded-md text-ink-900 grid place-items-center shrink-0 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/55 hover:text-ink-900 transition"
            aria-label="Отправить"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.2} />
            ) : (
              <SendHorizontal className="w-4 h-4" strokeWidth={2.2} />
            )}
          </button>

          {canSendVoice && !text.trim() && selectedFiles.length === 0 && (
            <button
              type="button"
              onMouseDown={() => void startVoiceRecording()}
              onMouseUp={stopVoiceRecording}
              onMouseLeave={stopVoiceRecording}
              onTouchStart={() => void startVoiceRecording()}
              onTouchEnd={stopVoiceRecording}
              disabled={sendingVoice}
              className={`w-10 h-10 rounded-md grid place-items-center shrink-0 transition select-none ${
                isRecording
                  ? "bg-[var(--danger-solid)] text-white animate-pulse"
                  : "text-ink-500 hover:text-ink-900 hover:bg-white/75"
              }`}
              aria-label={isRecording ? `Запись ${recordingSeconds}с — отпустите` : "Записать голосовое"}
              title={isRecording ? `Запись ${recordingSeconds}с…` : "Удерживайте для записи"}
              data-testid="voice-record-btn"
            >
              {sendingVoice ? (
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.2} />
              ) : (
                <Mic className="w-4 h-4" strokeWidth={2.2} />
              )}
            </button>
          )}
        </div>
        )}
      </div>

      {emojiPickerMessage && (
        <EmojiPickerPopover
          anchorRect={emojiPickerAnchorRect}
          triggerRef={reactionTriggerRef}
          closeOnPick
          onPick={(emoji) => void handleReactionToggle(emojiPickerMessage, emoji)}
          onClose={() => {
            setEmojiPickerForId(null);
            setEmojiPickerAnchorRect(null);
          }}
        />
      )}

      {composerEmojiOpen && (
        <EmojiPickerPopover
          anchorRect={composerEmojiAnchor}
          triggerRef={emojiBtnRef}
          onPick={insertEmojiAtCursor}
          onClose={() => {
            setComposerEmojiOpen(false);
            setComposerEmojiAnchor(null);
          }}
        />
      )}

      <UserMiniProfilePopover
        user={popoverUser}
        anchorRect={popoverAnchorRect}
        popoverRef={popoverRef}
      />

      <MediaLightbox media={lightboxMedia} onClose={() => setLightboxMedia(null)} />

      {banTarget && (
        <BanUserModal
          userId={banTarget.user_id}
          displayName={banTarget.display_name}
          onClose={() => setBanTarget(null)}
          onBanned={() => void notify({ title: "Пользователь забанен" })}
        />
      )}

      {isExpert && (
        <WsDebugPanel
          entries={wsDebugLog}
          open={wsDebugOpen}
          onToggle={() => setWsDebugOpen((v) => !v)}
          onClear={() => setWsDebugLog([])}
        />
      )}
    </div>
  );
}

function WsDebugPanel({
  entries,
  open,
  onToggle,
  onClear,
}: {
  entries: WsDebugEntry[];
  open: boolean;
  onToggle: () => void;
  onClear: () => void;
}) {
  return (
    <div className="absolute bottom-2 right-2 z-[60] w-[min(420px,calc(100%-1rem))] font-mono pointer-events-none">
      <div className="pointer-events-auto rounded-xl border border-[color:var(--border-glass-strong)] bg-[color:var(--bg-surface-strong)] backdrop-blur-md shadow-[0_14px_42px_var(--scrim-2)] overflow-hidden">
        <button
          type="button"
          onClick={onToggle}
          className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-[11px] text-ink-600 hover:bg-white/40 transition"
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--success-fg)]" aria-hidden />
            WS debug · {entries.length}
          </span>
          <span className="text-ink-400">{open ? "▼" : "▲"}</span>
        </button>

        {open && (
          <div className="border-t border-[color:var(--border-warm-dim)]">
            <div className="flex items-center justify-between px-3 py-1 text-[10px] text-ink-400">
              <span>последние {WS_DEBUG_LIMIT} сообщений</span>
              <button
                type="button"
                onClick={onClear}
                className="hover:text-ink-700 transition"
              >
                очистить
              </button>
            </div>
            <ul className="max-h-[220px] overflow-y-auto sidebar-scroll px-2 pb-2 space-y-1 text-[10.5px]">
              {entries.length === 0 ? (
                <li className="text-ink-400 px-1 py-2">Пока нет событий…</li>
              ) : (
                entries.map((entry, i) => (
                  <li
                    key={`${entry.at}-${i}`}
                    className="rounded-md border border-[color:var(--border-glass)] bg-[color:var(--bg-surface-subtle)] px-2 py-1"
                  >
                    <div className="flex items-center justify-between gap-2 text-ink-500">
                      <span className="font-semibold text-ink-700 truncate">{entry.type}</span>
                      <span className="text-ink-400 shrink-0">{formatWsTime(entry.at)}</span>
                    </div>
                    <pre className="mt-0.5 whitespace-pre-wrap break-all text-ink-500 leading-snug">
                      {entry.raw}
                    </pre>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
