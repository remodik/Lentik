"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, MessageCircle, Plus, RefreshCw } from "lucide-react";
import {
  createFamily,
  getMe,
  getFamily,
  getChats,
  getChannels,
  getMyFamilies,
  kickMember,
  logout,
  type Chat,
  type Channel,
  type Family,
  type Me,
  type MyFamily,
} from "@/lib/api";

import AppLayout, { type AppSection } from "@/components/AppLayout";
import ChatView from "@/components/ChatView";
import GalleryView from "@/components/GalleryView";
import MembersList from "@/components/MembersList";
import CalendarView from "@/components/CalendarView";
import ChannelsView from "@/components/ChannelsView";
import NotesView from "@/components/NotesView";
import BudgetView from "@/components/BudgetView";
import SubscriptionModal from "@/components/SubscriptionModal";
import { FREE_FAMILY_LIMIT, isFamilyLimitError } from "@/lib/families";
import { apiFetch, clearAuthToken } from "@/lib/api-base";
import type { PresenceUpdateEvent } from "@/components/NotificationSystem";

export default function AppPage() {
  const router = useRouter();

  const [me, setMe] = useState<Me | null>(null);
  const [myFamilies, setMyFamilies] = useState<MyFamily[]>([]);
  const [family, setFamily] = useState<Family | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [section, setSection] = useState<AppSection>("chat");
  const [loading, setLoading] = useState(true);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showCreateFamily, setShowCreateFamily] = useState(false);
  const [newFamilyName, setNewFamilyName] = useState("");
  const [creatingFamily, setCreatingFamily] = useState(false);
  const [createFamilyError, setCreateFamilyError] = useState("");
  const [loadError, setLoadError] = useState("");

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
      setSection("chat");
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 401) {
        clearAuthToken();
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

  async function handleLogout() {
    try {
      await logout();
    } catch {}
    localStorage.removeItem("familyId");
    router.push("/login");
  }

  function handleOpenLogin() {
    clearAuthToken();
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
      alert("Ошибка при создании чата");
    } finally {
      setCreatingChat(false);
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

  return (
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
      onLogout={handleLogout}
      onMeUpdate={(m) => setMe(m)}
      onPresenceUpdate={handlePresenceUpdate}
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
            className="w-full md:w-72 md:min-w-72 border-b md:border-b-0 md:border-r p-3 md:p-4"
            style={{ borderColor: "var(--border-warm-dim)", background: "var(--bg-surface-subtle)" }}
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
                  return (
                    <button
                      key={chat.id}
                      type="button"
                      className={`w-full text-left rounded-xl border px-3 py-2.5 transition ${
                        active ? "shadow-sm" : "hover:translate-y-[-1px]"
                      }`}
                      style={{
                        borderColor: active ? "var(--accent-border)" : "var(--border-glass)",
                        background: active ? "var(--accent-soft)" : "var(--bg-surface)",
                      }}
                      onClick={() => setActiveChatId(chat.id)}
                      aria-current={active ? "page" : undefined}
                    >
                      <p className="text-sm font-semibold text-ink-800 truncate"># {chat.name}</p>
                      <p className="text-xs text-ink-400 font-body mt-1 line-clamp-2">
                        Семейная беседа
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section className="flex-1 min-h-0">
            {activeChat ? (
              <ChatView
                familyId={familyId}
                chat={activeChat}
                me={me}
                family={family}
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
      {section === "members" && (
        <MembersList family={family} me={me} onKick={handleKick} onRefresh={refreshFamily} />
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
            className="w-full max-w-sm rounded-3xl border border-white/70 bg-white/85 backdrop-blur-2xl p-6 shadow-[0_30px_90px_rgba(28,23,20,0.25)]"
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
            className="w-full max-w-md rounded-3xl border border-white/70 bg-white/85 backdrop-blur-2xl p-6 shadow-[0_30px_90px_rgba(28,23,20,0.25)]"
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
    </AppLayout>
  );
}
