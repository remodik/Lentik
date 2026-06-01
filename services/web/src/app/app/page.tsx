"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Lock, MessageCircle, Pencil, Plus, RefreshCw, Timer, Trash2 } from "lucide-react";
import {
  createFamily,
  deleteChat,
  getMe,
  getFamily,
  getChats,
  getChannels,
  getMyFamilies,
  joinFamilyByToken,
  kickMember,
  logout,
  renameFamily,
  type Chat,
  type Channel,
  type Family,
  type Me,
  type MyFamily,
} from "@/lib/api";

import AppLayout, { type AppSection } from "@/components/AppLayout";
import { useConfirm } from "@/components/ConfirmDialog";
import FamilySettingsModal from "@/components/FamilySettingsModal";
import { UserModeProvider } from "@/lib/useUserMode";
import { PermissionsProvider } from "@/lib/usePermissions";
import { ExpertIdRow } from "@/components/CopyIdButton";
import { useCtrlResize } from "@/lib/useCtrlResize";
import ChatView from "@/components/ChatView";
import ChatSettingsModal from "@/components/ChatSettingsModal";
import GalleryView from "@/components/GalleryView";
import FilesView from "@/components/FilesView";
import MembersList from "@/components/MembersList";
import CalendarView from "@/components/CalendarView";
import ChannelsView from "@/components/ChannelsView";
import NotesView from "@/components/NotesView";
import BudgetView from "@/components/BudgetView";
import RemindersView from "@/components/RemindersView";
import FamilyTreeView from "@/components/FamilyTreeView";
import SubscriptionModal from "@/components/SubscriptionModal";
import { FREE_FAMILY_LIMIT, isFamilyLimitError } from "@/lib/families";
import { apiFetch } from "@/lib/api-base";
import type { PresenceUpdateEvent } from "@/components/NotificationSystem";

export default function AppPage() {
  const router = useRouter();
  const { confirm, notify } = useConfirm();
  const chatSidebarResize = useCtrlResize({
    storageKey: "lentik:chat-sidebar-w",
    initial: 288,
    min: 220,
    max: 520,
    side: "right",
  });

  const [me, setMe] = useState<Me | null>(null);
  const [myFamilies, setMyFamilies] = useState<MyFamily[]>([]);
  const [family, setFamily] = useState<Family | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [section, setSection] = useState<AppSection>(() => {
    if (typeof window === "undefined") return "chat";
    const allowed: AppSection[] = [
      "chat",
      "gallery",
      "files",
      "calendar",
      "members",
      "channels",
      "notes",
      "budget",
      "reminders",
      "tree",
    ];
    try {
      const saved = localStorage.getItem("lentik_section") as AppSection | null;
      return saved && allowed.includes(saved) ? saved : "chat";
    } catch {
      return "chat";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("lentik_section", section);
    } catch {}
  }, [section]);
  const [loading, setLoading] = useState(true);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showCreateFamily, setShowCreateFamily] = useState(false);
  const [newFamilyName, setNewFamilyName] = useState("");
  const [creatingFamily, setCreatingFamily] = useState(false);
  const [createFamilyError, setCreateFamilyError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [chatSettingsTarget, setChatSettingsTarget] = useState<Chat | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState("");
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinValue, setJoinValue] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [familySettingsOpen, setFamilySettingsOpen] = useState(false);

  const activeChat = useMemo(
    () => chats.find((c) => c.id === activeChatId) ?? null,
    [chats, activeChatId],
  );

  useEffect(() => {
    void loadApp();
  }, []);

  async function loadApp(familyId?: string) {
    setLoading(true);
    setLoadError("");
    try {
      const meData = await getMe();
      setMe(meData);

      const families = await getMyFamilies();
      setMyFamilies(families);

      if (families.length === 0) {
        router.push("/onboarding");
        return;
      }

      const stored = localStorage.getItem("familyId");
      let targetId =
        familyId ??
        (stored && families.find((f) => f.family_id === stored)
          ? stored
          : families[0].family_id);
      localStorage.setItem("familyId", targetId);

      let familyData: Family;
      let chatsData: Chat[];
      let channelsData: Channel[];
      try {
        [familyData, chatsData, channelsData] = await Promise.all([
          getFamily(targetId),
          getChats(targetId),
          getChannels(targetId).catch(() => [] as Channel[]),
        ]);
      } catch {
        const fallbackId = families.find((f) => f.family_id !== targetId)?.family_id;
        if (!fallbackId) throw new Error("Не удалось открыть выбранную семью");
        targetId = fallbackId;
        localStorage.setItem("familyId", targetId);
        [familyData, chatsData, channelsData] = await Promise.all([
          getFamily(targetId),
          getChats(targetId),
          getChannels(targetId).catch(() => [] as Channel[]),
        ]);
      }

      setFamily(familyData);
      setChats(chatsData);
      setChannels(channelsData);
      setSelectedChannelId(null);

      const nextChatId =
        (activeChatId && chatsData.find((c) => c.id === activeChatId)?.id) ??
        chatsData[0]?.id ??
        null;
      setActiveChatId(nextChatId);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 401) {
        localStorage.removeItem("familyId");
        router.push("/login");
        return;
      }
      console.error("loadApp failed", err);
      setLoadError(err instanceof Error ? err.message : "Ошибка загрузки данных");
    } finally {
      setLoading(false);
    }
  }

  async function switchFamily(familyId: string) {
    setSection("chat");
    setActiveChatId(null);
    await loadApp(familyId);
  }

  // Сброс активной семьи и перезагрузка списка (используется при выходе и
  // при полном удалении семьи). loadApp сам уведёт на /onboarding, если семей
  // не осталось.
  function resetActiveFamily() {
    setFamilySettingsOpen(false);
    setSection("chat");
    setActiveChatId(null);
    localStorage.removeItem("familyId");
    void loadApp();
  }

  // WS-событие "family_deleted": если удалили текущую семью — сбрасываем и
  // перезагружаем. Чужие семьи нас здесь не касаются (ws привязан к family.id).
  const handleFamilyDeleted = useCallback(
    (deletedFamilyId: string) => {
      setFamily((prev) => {
        if (prev && prev.id === deletedFamilyId) {
          resetActiveFamily();
        }
        return prev;
      });
    },
    // resetActiveFamily стабильна по составу (использует сеттеры/loadApp).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  async function handleLogout() {
    try {
      await logout();
    } catch {}
    localStorage.removeItem("familyId");
    router.push("/login");
  }

  function handleOpenLogin() {
    localStorage.removeItem("familyId");
    router.push("/login");
  }

  const familyId = family?.id ?? "";
  const myRole = myFamilies.find((f) => f.family_id === familyId)?.role;
  const isOwner = myRole === "owner";

  const handlePresenceUpdate = useCallback((event: PresenceUpdateEvent) => {
    setFamily((prev) => {
      if (!prev || prev.id !== event.family_id) return prev;

      let changed = false;
      const nextMembers = prev.members.map((member) => {
        if (member.user_id !== event.user_id) return member;

        const nextLastSeen = event.last_seen_at ?? null;
        if (
          member.is_online === event.is_online &&
          (member.last_seen_at ?? null) === nextLastSeen
        ) {
          return member;
        }

        changed = true;
        return {
          ...member,
          is_online: event.is_online,
          last_seen_at: nextLastSeen,
        };
      });

      return changed ? { ...prev, members: nextMembers } : prev;
    });

    setMe((prev) => {
      if (!prev || prev.id !== event.user_id) return prev;

      const nextLastSeen = event.last_seen_at ?? null;
      if (
        prev.is_online === event.is_online &&
        (prev.last_seen_at ?? null) === nextLastSeen
      ) {
        return prev;
      }

      return {
        ...prev,
        is_online: event.is_online,
        last_seen_at: nextLastSeen,
      };
    });
  }, []);

  async function refreshFamily() {
    if (!familyId) return;
    const updated = await getFamily(familyId);
    setFamily(updated);
  }

  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatName, setNewChatName] = useState("");
  const [creatingChat, setCreatingChat] = useState(false);

  async function handleCreateChat(e: React.FormEvent) {
    e.preventDefault();
    if (!newChatName.trim() || !family) return;
    setCreatingChat(true);
    try {
      const res = await apiFetch(`/families/${family.id}/chats`, {
        method: "POST",
        body: JSON.stringify({ name: newChatName.trim() }),
      });
      if (!res.ok) throw new Error("create_chat_failed");
      const chat: Chat = await res.json();
      setChats((p) => [...p, chat]);
      setActiveChatId(chat.id);
      setSection("chat");
      setNewChatName("");
      setShowNewChat(false);
    } catch {
      void notify({ title: "Ошибка при создании чата", tone: "danger" });
    } finally {
      setCreatingChat(false);
    }
  }

  async function handleDeleteChat(chat: Chat, skipConfirm: boolean) {
    if (!familyId) return;
    if (!skipConfirm) {
      const ok = await confirm({
        title: "Удалить чат",
        description: `Вы уверены, что хотите удалить #${chat.name}?`,
        confirmLabel: "Удалить",
        tone: "danger",
      });
      if (!ok) return;
    }
    try {
      await deleteChat(familyId, chat.id);
      setChats((prev) => prev.filter((c) => c.id !== chat.id));
      setActiveChatId((current) => (current === chat.id ? null : current));
    } catch (e) {
      console.error("deleteChat failed", e);
      void notify({ title: "Не удалось удалить чат", tone: "danger" });
    }
  }

  async function handleKick(userId: string) {
    if (!familyId) return;
    await kickMember(familyId, userId);
    await refreshFamily();
  }

  function openCreateFamily() {
    if (myFamilies.length >= FREE_FAMILY_LIMIT) {
      setShowSubscriptionModal(true);
      return;
    }
    setCreateFamilyError("");
    setNewFamilyName("");
    setShowCreateFamily(true);
  }

  function openRenameFamily(id: string, name: string) {
    setRenameTarget({ id, name });
    setRenameValue(name);
    setRenameError("");
  }

  async function submitRenameFamily(e: React.FormEvent) {
    e.preventDefault();
    if (!renameTarget) return;
    const next = renameValue.trim();
    if (!next || next === renameTarget.name) {
      setRenameTarget(null);
      return;
    }
    setRenaming(true);
    setRenameError("");
    try {
      const updated = await renameFamily(renameTarget.id, next);
      setMyFamilies((prev) =>
        prev.map((f) =>
          f.family_id === renameTarget.id ? { ...f, family_name: updated.name } : f,
        ),
      );
      setFamily((prev) =>
        prev && prev.id === renameTarget.id ? { ...prev, name: updated.name } : prev,
      );
      setRenameTarget(null);
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : "Не удалось переименовать");
    } finally {
      setRenaming(false);
    }
  }

  function openJoinFamily() {
    setJoinValue("");
    setJoinError("");
    setJoinOpen(true);
  }

  function extractInviteToken(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) return "";
    try {
      const url = new URL(trimmed);
      const fromQuery = url.searchParams.get("token");
      if (fromQuery) return fromQuery;
    } catch {}
    return trimmed;
  }

  async function submitJoinFamily(e: React.FormEvent) {
    e.preventDefault();
    const token = extractInviteToken(joinValue);
    if (!token) {
      setJoinError("Вставьте ссылку или токен приглашения");
      return;
    }
    setJoining(true);
    setJoinError("");
    try {
      const { family_id } = await joinFamilyByToken(token);
      setJoinOpen(false);
      await switchFamily(family_id);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Не удалось вступить");
    } finally {
      setJoining(false);
    }
  }

  async function handleCreateFamily(e: React.FormEvent) {
    e.preventDefault();
    if (!newFamilyName.trim()) {
      setCreateFamilyError("Введи название семьи");
      return;
    }

    setCreatingFamily(true);
    setCreateFamilyError("");
    try {
      const created = await createFamily(newFamilyName.trim());
      setShowCreateFamily(false);
      setNewFamilyName("");
      await loadApp(created.id);
    } catch (err: unknown) {
      if (isFamilyLimitError(err)) {
        setShowCreateFamily(false);
        setShowSubscriptionModal(true);
        return;
      }
      setCreateFamilyError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setCreatingFamily(false);
    }
  }

  if (loadError && !loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-page-card glossy p-8 w-full max-w-md text-center">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" strokeWidth={1.9} />
          <h2 className="font-display text-2xl text-ink-900">Не удалось открыть приложение</h2>
          <p className="text-sm text-ink-500 mt-2 font-body">{loadError}</p>
          <div className="mt-5 flex gap-2 justify-center">
            <button
              type="button"
              className="ui-btn ui-btn-primary inline-flex items-center gap-2"
              onClick={() => void loadApp()}
            >
              <RefreshCw className="w-4 h-4" strokeWidth={2.1} />
              Повторить
            </button>
            <button type="button" className="ui-btn ui-btn-subtle" onClick={handleOpenLogin}>
              На логин
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !me || !family) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="font-display text-2xl text-ink-300 animate-pulse">
          Lentik
        </div>
      </div>
    );
  }

  const initialMode = me.ui_mode === "advanced" ? "advanced" : "simple";

  return (
    <UserModeProvider initialMode={initialMode}>
    <PermissionsProvider familyId={family?.id ?? null}>
    <AppLayout
      me={me}
      family={family}
      myFamilies={myFamilies}
      isOwner={isOwner}
      section={section}
      onSection={(s) => setSection(s)}
      onFamilySwitch={(nextFamilyId) => {
        void switchFamily(nextFamilyId);
      }}
      onCreateFamily={openCreateFamily}
      onJoinFamily={openJoinFamily}
      onRenameFamily={openRenameFamily}
      onOpenFamilySettings={() => setFamilySettingsOpen(true)}
      onLogout={handleLogout}
      onMeUpdate={(m) => setMe(m)}
      onPresenceUpdate={handlePresenceUpdate}
      onFamilyDeleted={handleFamilyDeleted}
      onChatOpen={(chatId) => {
        setSection("chat");
        setActiveChatId(chatId);
      }}
      chats={chats}
      activeChatId={activeChatId}
      channels={channels}
      selectedChannelId={selectedChannelId}
      onChatSelect={(chatId) => {
        setSection("chat");
        setActiveChatId(chatId);
      }}
      onChannelSelect={(channelId) => {
        setSelectedChannelId(channelId);
        setSection("channels");
      }}
      onCreateChat={isOwner ? () => setShowNewChat(true) : undefined}
    >
      {section === "chat" && (
        <div className="h-full min-h-0 flex flex-col md:flex-row">
          <aside
            className="relative w-full md:shrink-0 md:w-[var(--lentik-sidebar-w)] md:min-w-[var(--lentik-sidebar-w)] border-b md:border-b-0 md:border-r p-3 md:p-4"
            style={{
              borderColor: "var(--border-warm-dim)",
              background: "var(--bg-surface-subtle)",
              ["--lentik-sidebar-w" as never]: `${chatSidebarResize.width}px`,
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-ink-400 font-body">Чаты</p>
                <p className="text-sm text-ink-600 font-body mt-0.5">Беседы семьи</p>
              </div>

              {isOwner && (
                <button
                  type="button"
                  className="ui-btn ui-btn-subtle !px-2.5 !py-1.5 inline-flex items-center gap-1.5"
                  onClick={() => setShowNewChat(true)}
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={2.2} />
                  Создать чат
                </button>
              )}
            </div>

            <div className="mt-3 md:mt-4 space-y-1.5 max-h-[220px] md:max-h-none md:h-[calc(100%-88px)] overflow-y-auto sidebar-scroll pr-1">
              {chats.length === 0 ? (
                <div
                  className="rounded-2xl border p-4 text-sm text-ink-400 font-body"
                  style={{ borderColor: "var(--border-glass)", background: "var(--bg-surface)" }}
                >
                  <p>Чатов пока нет</p>
                  {isOwner && (
                    <button
                      type="button"
                      className="ui-btn ui-btn-subtle mt-3"
                      onClick={() => setShowNewChat(true)}
                    >
                      Создать чат
                    </button>
                  )}
                </div>
              ) : (
                chats.map((chat) => {
                  const active = chat.id === activeChatId;
                  const subtitle = chat.description?.trim() || "Семейная беседа";
                  return (
                    <div
                      key={chat.id}
                      role="button"
                      tabIndex={0}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setActiveChatId(chat.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setActiveChatId(chat.id);
                        }
                      }}
                      className={`group relative w-full text-left rounded-xl border px-3 py-2.5 transition cursor-pointer ${
                        isOwner ? "pr-16" : ""
                      } ${active ? "shadow-sm" : "hover:translate-y-[-1px]"}`}
                      style={{
                        borderColor: active ? "var(--accent-border)" : "var(--border-glass)",
                        background: active ? "var(--accent-soft)" : "var(--bg-surface)",
                      }}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-sm font-semibold text-ink-800 truncate flex-1"># {chat.name}</p>
                        {chat.is_18plus && (
                          <span
                            className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold border border-red-300 bg-red-50 text-red-600"
                            title="Только для 18+"
                          >
                            18+
                          </span>
                        )}
                        {!!chat.slow_mode_seconds && chat.slow_mode_seconds > 0 && (
                          <Timer
                            className="w-3.5 h-3.5 text-amber-600 shrink-0"
                            strokeWidth={2.4}
                            aria-label="Включён медленный режим"
                          />
                        )}
                      </div>
                      <p className="text-xs text-ink-400 font-body mt-1 line-clamp-2">
                        {subtitle}
                      </p>

                      <ExpertIdRow
                        value={chat.id}
                        label={`чат # ${chat.name}`}
                        onClick={(e) => e.stopPropagation()}
                      />

                      {isOwner && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setChatSettingsTarget(chat);
                            }}
                            className="absolute top-2 right-9 w-7 h-7 rounded-lg grid place-items-center text-ink-400 hover:text-ink-700 hover:bg-white/70 transition opacity-0 group-hover:opacity-100 focus:opacity-100"
                            title="Настройки чата"
                            aria-label="Настройки чата"
                            data-testid={`chat-settings-${chat.id}`}
                          >
                            <Pencil className="w-3.5 h-3.5" strokeWidth={2.2} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDeleteChat(chat, e.shiftKey);
                            }}
                            className="absolute top-2 right-2 w-7 h-7 rounded-lg grid place-items-center text-ink-400 hover:text-red-600 hover:bg-red-50 transition opacity-0 group-hover:opacity-100 focus:opacity-100"
                            title="Удалить чат"
                            aria-label="Удалить чат"
                            data-testid={`chat-delete-${chat.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" strokeWidth={2.2} />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div
              {...chatSidebarResize.handleProps}
              className={`hidden md:block absolute top-0 right-0 h-full w-1.5 -mr-[3px] z-10 transition ${
                chatSidebarResize.ctrlReady || chatSidebarResize.dragging
                  ? "cursor-col-resize bg-warm-400/55"
                  : "cursor-default hover:bg-white/0"
              }`}
              aria-label="Изменить ширину сайдбара (Ctrl + перетащить)"
            />
          </aside>

          <section className="flex-1 min-h-0 min-w-0">
            {activeChat ? (
              <ChatView
                familyId={familyId}
                chat={activeChat}
                me={me}
                family={family}
                onLeave={() => setActiveChatId(null)}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 gap-4">
                <div className="chat-empty-badge">
                  <MessageCircle className="w-6 h-6 text-ink-500" strokeWidth={2.1} />
                </div>
                <div>
                  <p className="text-ink-900 font-semibold font-display text-lg">
                    Выберите чат
                  </p>
                  <p className="text-ink-400 text-sm font-body mt-1">
                    {isOwner
                      ? "Или создайте новый чат кнопкой «Создать чат»"
                      : "Чаты появятся здесь"}
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {section === "gallery" && (
        <GalleryView familyId={familyId} meId={me.id} />
      )}
      {section === "files" && (
        <FilesView familyId={familyId} meId={me.id} />
      )}
      {section === "calendar" && (
        <CalendarView
          familyId={familyId}
          meId={me.id}
          members={family.members ?? []}
        />
      )}
      {section === "channels" && (
        <ChannelsView
          familyId={familyId}
          isOwner={isOwner}
          externalChannelId={selectedChannelId}
          meBirthday={me.birthday}
        />
      )}
      {section === "notes" && (
        <NotesView familyId={familyId} meId={me.id} />
      )}
      {section === "budget" && (
        <BudgetView
          familyId={familyId}
          meId={me.id}
          members={family.members ?? []}
        />
      )}
      {section === "reminders" && (
        <RemindersView familyId={familyId} meId={me.id} />
      )}
      {section === "members" && (
        <MembersList family={family} me={me} onKick={handleKick} onRefresh={refreshFamily} />
      )}
      {section === "tree" && (
        <FamilyTreeView familyId={familyId} family={family} meId={me.id} />
      )}

      {/* Create chat modal */}
      {showNewChat && (
        <div
          className="fixed inset-0 z-[80] bg-black/35 backdrop-blur-sm p-4 flex items-center justify-center"
          onClick={() => !creatingChat && setShowNewChat(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Создать чат"
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-[color:var(--border-glass-strong)] bg-[color:var(--bg-elevated)] backdrop-blur-2xl p-6 shadow-[0_30px_90px_var(--scrim-4)]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs uppercase tracking-[0.16em] text-ink-400 font-body">
              Новый чат
            </p>
            <h2 className="font-display text-2xl text-ink-900 mt-1">Создать чат</h2>

            <form
              onSubmit={(e) => void handleCreateChat(e)}
              className="mt-5 space-y-3"
            >
              <input
                className="input-field"
                value={newChatName}
                onChange={(e) => setNewChatName(e.target.value)}
                placeholder="Название чата"
                autoFocus
                data-testid="new-chat-name-input"
              />

              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  className="ui-btn ui-btn-subtle"
                  onClick={() => {
                    setShowNewChat(false);
                    setNewChatName("");
                  }}
                  disabled={creatingChat}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="ui-btn ui-btn-primary"
                  disabled={creatingChat || !newChatName.trim()}
                  data-testid="create-chat-submit"
                >
                  {creatingChat ? "Создание…" : "Создать"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create family modal */}
      {showCreateFamily && (
        <div
          className="fixed inset-0 z-[80] bg-black/35 backdrop-blur-sm p-4 flex items-center justify-center"
          onClick={() => !creatingFamily && setShowCreateFamily(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Создать семью"
        >
          <div
            className="w-full max-w-md rounded-3xl border border-[color:var(--border-glass-strong)] bg-[color:var(--bg-elevated)] backdrop-blur-2xl p-6 shadow-[0_30px_90px_var(--scrim-4)]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs uppercase tracking-[0.16em] text-ink-400 font-body">
              Новая семья
            </p>
            <h2 className="font-display text-2xl text-ink-900 mt-1">
              Создать семейное пространство
            </h2>
            <p className="text-sm text-ink-500 mt-2 font-body">
              На бесплатном плане: {myFamilies.length}/{FREE_FAMILY_LIMIT} семей.
            </p>

            <form onSubmit={(e) => void handleCreateFamily(e)} className="mt-5 space-y-3">
              <input
                className="input-field"
                value={newFamilyName}
                onChange={(e) => setNewFamilyName(e.target.value)}
                placeholder="Например: Семья Смирновых"
                autoFocus
              />

              {createFamilyError && (
                <p className="text-sm text-red-500 font-body">{createFamilyError}</p>
              )}

              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  className="ui-btn ui-btn-subtle"
                  onClick={() => setShowCreateFamily(false)}
                  disabled={creatingFamily}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="ui-btn ui-btn-primary"
                  disabled={creatingFamily || !newFamilyName.trim()}
                >
                  {creatingFamily ? "Создание…" : "Создать"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <SubscriptionModal
        open={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
      />

      {chatSettingsTarget && (
        <ChatSettingsModal
          open={!!chatSettingsTarget}
          kind="chat"
          familyId={familyId}
          target={chatSettingsTarget}
          canEdit={isOwner}
          onClose={() => setChatSettingsTarget(null)}
          onUpdated={(updated) => {
            setChats((prev) => prev.map((c) => (c.id === updated.id ? (updated as Chat) : c)));
          }}
        />
      )}

      {renameTarget && (
        <div
          className="fixed inset-0 z-[80] bg-black/35 backdrop-blur-sm p-4 flex items-center justify-center"
          onClick={() => !renaming && setRenameTarget(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Переименовать семью"
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-[color:var(--border-glass-strong)] bg-[color:var(--bg-elevated)] backdrop-blur-2xl p-6 shadow-[0_30px_90px_var(--scrim-4)]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs uppercase tracking-[0.16em] text-ink-400 font-body">
              Семья
            </p>
            <h2 className="font-display text-2xl text-ink-900 mt-1">
              Переименовать
            </h2>
            <form onSubmit={(e) => void submitRenameFamily(e)} className="mt-5 space-y-3">
              <input
                className="input-field"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="Новое название"
                autoFocus
                maxLength={120}
              />
              {renameError && (
                <p className="text-sm text-red-500 font-body">{renameError}</p>
              )}
              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  className="ui-btn ui-btn-subtle"
                  onClick={() => setRenameTarget(null)}
                  disabled={renaming}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="ui-btn ui-btn-primary"
                  disabled={renaming || !renameValue.trim()}
                >
                  {renaming ? "Сохранение…" : "Сохранить"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {joinOpen && (
        <div
          className="fixed inset-0 z-[80] bg-black/35 backdrop-blur-sm p-4 flex items-center justify-center"
          onClick={() => !joining && setJoinOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Вступить в семью"
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-[color:var(--border-glass-strong)] bg-[color:var(--bg-elevated)] backdrop-blur-2xl p-6 shadow-[0_30px_90px_var(--scrim-4)]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs uppercase tracking-[0.16em] text-ink-400 font-body">
              Приглашение
            </p>
            <h2 className="font-display text-2xl text-ink-900 mt-1">
              Вступить в семью
            </h2>
            <p className="text-sm text-ink-500 mt-2 font-body">
              Вставьте ссылку приглашения или токен.
            </p>
            <form onSubmit={(e) => void submitJoinFamily(e)} className="mt-5 space-y-3">
              <input
                className="input-field"
                value={joinValue}
                onChange={(e) => setJoinValue(e.target.value)}
                placeholder="https://… или токен"
                autoFocus
              />
              {joinError && (
                <p className="text-sm text-red-500 font-body">{joinError}</p>
              )}
              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  className="ui-btn ui-btn-subtle"
                  onClick={() => setJoinOpen(false)}
                  disabled={joining}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="ui-btn ui-btn-primary"
                  disabled={joining || !joinValue.trim()}
                >
                  {joining ? "Вступление…" : "Вступить"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <FamilySettingsModal
        open={familySettingsOpen}
        family={family}
        me={me}
        isOwner={isOwner}
        chats={chats}
        channels={channels}
        onClose={() => setFamilySettingsOpen(false)}
        onRenamed={(updated) => {
          setMyFamilies((prev) =>
            prev.map((f) =>
              f.family_id === updated.id ? { ...f, family_name: updated.name } : f,
            ),
          );
          setFamily((prev) =>
            prev && prev.id === updated.id ? { ...prev, name: updated.name } : prev,
          );
        }}
        onLeft={() => {
          setFamilySettingsOpen(false);
          localStorage.removeItem("familyId");
          void loadApp();
        }}
        onDeleted={() => {
          resetActiveFamily();
        }}
      />
    </AppLayout>
    </PermissionsProvider>
    </UserModeProvider>
  );
}
