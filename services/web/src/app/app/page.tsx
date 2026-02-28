"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getMe, getFamily, getChats, getMyFamilies, logout,
  type Me, type Family, type Chat, type MyFamily,
} from "@/lib/api";
import ChatView from "@/components/ChatView";
import GalleryView from "@/components/GalleryView";
import MembersList from "@/components/MembersList";
import CalendarView from "@/components/CalendarView";
import ProfileMenu from "@/components/ProfileMenu";
import { useNotifications, ToastContainer } from "@/components/NotificationSystem";

type Section = "chats" | "gallery" | "members" | "calendar";

const NAV_ITEMS: { id: Section; icon: string; label: string; sub: string }[] = [
  { id: "chats", icon: "💬", label: "Чаты", sub: "Общение семьи" },
  { id: "gallery", icon: "🖼️", label: "Галерея", sub: "Фото и видео" },
  { id: "members", icon: "👥", label: "Участники", sub: "Члены семьи" },
  { id: "calendar", icon: "📅", label: "Календарь", sub: "События и даты" },
];

export default function AppPage() {
  const router = useRouter();

  const [me, setMe] = useState<Me | null>(null);
  const [myFamilies, setMyFamilies] = useState<MyFamily[]>([]);
  const [family, setFamily] = useState<Family | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [section, setSection] = useState<Section | null>(null);
  const [loading, setLoading] = useState(true);

  const familyId = family?.id ?? "";
  const { toasts, unread, dismiss, clearUnread } = useNotifications(
    familyId,
    me?.username ?? "",
  );

  useEffect(() => {
    const kicked = toasts.find(t => t.type === "member_kicked");
    if (kicked) {
      getMyFamilies().then(setMyFamilies).catch(() => {});
    }
  }, [toasts]);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatName, setNewChatName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => { loadApp(); }, []);

  async function loadApp(familyId?: string) {
    setLoading(true);
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
      const targetId = familyId ?? (stored && families.find(f => f.family_id === stored) ? stored : families[0].family_id);
      localStorage.setItem("familyId", targetId);

      const [familyData, chatsData] = await Promise.all([
        getFamily(targetId),
        getChats(targetId),
      ]);

      setFamily(familyData);
      setChats(chatsData);
      setActiveChat(chatsData[0] ?? null);
      setSection(chatsData.length > 0 ? "chats" : null);
    } catch {
      router.push("/login");
    } finally {
      setLoading(false);
    }
  }

  async function switchFamily(familyId: string) {
    setDropdownOpen(false);
    setSection(null);
    setActiveChat(null);
    await loadApp(familyId);
  }

  async function handleLogout() {
    try { await logout(); } catch {}
    localStorage.removeItem("familyId");
    router.push("/login");
  }

  async function handleCreateChat(e: React.FormEvent) {
    e.preventDefault();
    if (!newChatName.trim() || !family) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/families/${family.id}/chats`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newChatName.trim() }),
      });
      if (!res.ok) throw new Error();
      const chat: Chat = await res.json();
      setChats(p => [...p, chat]);
      setActiveChat(chat);
      setSection("chats");
      setNewChatName("");
      setShowNewChat(false);
    } catch { alert("Ошибка при создании чата"); }
    finally { setCreating(false); }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cream-50 flex items-center justify-center">
        <div className="font-display text-2xl text-ink-300 animate-pulse">Lentik</div>
      </div>
    );
  }

  const myRole = myFamilies.find(f => f.family_id === familyId)?.role;
  const isOwner = myRole === "owner";

  return (
    <div className="flex h-screen bg-cream-100 overflow-hidden">

      <aside className="w-72 flex flex-col bg-cream-50 border-r border-cream-200 shrink-0">

        <div className="px-3 pt-4 pb-3 border-b border-cream-200" ref={dropdownRef}>
          <p className="text-xs font-semibold text-ink-300 uppercase tracking-widest mb-1 px-2 font-body">Семья</p>
          <button
            onClick={() => setDropdownOpen(v => !v)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-2xl hover:bg-cream-100 transition-colors text-left"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-warm-200 flex items-center justify-center text-sm shrink-0">🏠</div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-900 truncate font-body leading-tight">{family?.name}</p>
                {myFamilies.length > 1 && (
                  <p className="text-xs text-ink-400 font-body">{myFamilies.length} семьи</p>
                )}
              </div>
            </div>
            <svg className={`w-4 h-4 text-ink-400 shrink-0 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {dropdownOpen && (
            <div className="mt-1 bg-white border border-cream-200 rounded-2xl shadow-lg overflow-hidden">
              <div className="py-1">
                {myFamilies.map(f => (
                  <button key={f.family_id} onClick={() => switchFamily(f.family_id)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                      f.family_id === familyId ? "bg-warm-50 text-ink-900 font-semibold" : "text-ink-700 hover:bg-cream-50"
                    }`}>
                    <div className="w-7 h-7 rounded-lg bg-cream-100 flex items-center justify-center text-xs shrink-0">🏠</div>
                    <span className="truncate font-body">{f.family_name}</span>
                    {f.family_id === familyId && (
                      <svg className="w-4 h-4 text-warm-400 ml-auto shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                      </svg>
                    )}
                  </button>
                ))}
              </div>
              <div className="border-t border-cream-100" />
              <div className="py-1">
                <button onClick={() => { setDropdownOpen(false); router.push("/onboarding"); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-ink-600 hover:bg-cream-50 transition-colors font-body">
                  <span className="text-base">＋</span> Создать семью
                </button>
                <button onClick={() => { setDropdownOpen(false); router.push("/onboarding?join=1"); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-ink-600 hover:bg-cream-50 transition-colors font-body">
                  <span className="text-base">🔗</span> Войти по инвайту
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="px-3 pt-3 space-y-1.5">
          {NAV_ITEMS.map(({ id, icon, label, sub }) => {
            const active = section === id;
            return (
              <button key={id} onClick={() => setSection(id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left transition-all ${
                  active ? "bg-warm-100 shadow-sm" : "hover:bg-cream-100"
                }`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 transition-all ${
                  active ? "bg-warm-400 shadow-md" : "bg-cream-200"
                }`}>{icon}</div>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold leading-tight font-body ${active ? "text-ink-900" : "text-ink-700"}`}>{label}</p>
                  <p className="text-xs text-ink-300 mt-0.5 truncate font-body">{sub}</p>
                </div>
                {id === "chats" && (
                  <div className="ml-auto flex items-center gap-1.5 shrink-0">
                    {unread > 0 && (
                      <span onClick={clearUnread} className="bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center font-body cursor-pointer">
                        {unread > 9 ? "9+" : unread}
                      </span>
                    )}
                    {chats.length > 0 && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full font-body ${
                        active ? "bg-warm-400 text-white" : "bg-cream-200 text-ink-400"
                      }`}>{chats.length}</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {section === "chats" && (
          <div className="mt-4 px-3 flex-1 overflow-y-auto flex flex-col min-h-0">
            <div className="flex items-center justify-between px-2 mb-2">
              <span className="text-xs font-semibold text-ink-300 uppercase tracking-wider font-body">Каналы</span>
              {isOwner && (
                <button onClick={() => setShowNewChat(v => !v)}
                  className="w-5 h-5 flex items-center justify-center text-ink-300 hover:text-ink-700 transition-colors text-xl leading-none"
                  title="Новый чат">+</button>
              )}
            </div>

            {showNewChat && (
              <form onSubmit={handleCreateChat} className="mb-3">
                <input autoFocus value={newChatName} onChange={e => setNewChatName(e.target.value)}
                  onKeyDown={e => e.key === "Escape" && setShowNewChat(false)}
                  placeholder="Название канала"
                  className="w-full bg-white text-ink-900 text-sm px-3 py-2 rounded-xl outline-none border-2 border-warm-400 placeholder-ink-300 font-body"
                />
                <div className="flex gap-1.5 mt-1.5">
                  <button type="submit" disabled={creating || !newChatName.trim()}
                    className="flex-1 py-1.5 bg-ink-900 text-cream-50 text-xs font-medium rounded-xl hover:bg-ink-700 transition-colors disabled:opacity-50 font-body">
                    {creating ? "…" : "Создать"}
                  </button>
                  <button type="button" onClick={() => { setShowNewChat(false); setNewChatName(""); }}
                    className="flex-1 py-1.5 bg-cream-200 text-ink-500 text-xs font-medium rounded-xl hover:bg-cream-300 transition-colors font-body">
                    Отмена
                  </button>
                </div>
              </form>
            )}

            <nav className="space-y-0.5 overflow-y-auto flex-1">
              {chats.length === 0 && (
                <p className="text-xs text-ink-300 px-2 py-2 font-body">
                  {isOwner ? "Нажми + чтобы создать чат" : "Нет чатов"}
                </p>
              )}
              {chats.map(chat => (
                <button key={chat.id} onClick={() => { setActiveChat(chat); setSection("chats"); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all font-body ${
                    activeChat?.id === chat.id
                      ? "bg-warm-100 text-ink-900 font-semibold"
                      : "text-ink-500 hover:bg-cream-100 hover:text-ink-800"
                  }`}>
                  <span className="text-ink-300 text-xs font-bold">#</span>
                  <span className="truncate">{chat.name}</span>
                </button>
              ))}
            </nav>
          </div>
        )}

        <div className="flex-1" />

        <ProfileMenu
          me={me!}
          isOwner={isOwner}
          onLogout={handleLogout}
          onUpdate={(updated) => setMe(updated)}
        />
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        {section === "chats" && activeChat && me && (
          <ChatView familyId={familyId} chat={activeChat} me={me} family={family ?? undefined} />
        )}
        {section === "chats" && !activeChat && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3 bg-cream-50">
            <div className="w-16 h-16 rounded-2xl bg-cream-200 flex items-center justify-center text-3xl">💬</div>
            <p className="text-ink-700 font-semibold font-display">Выбери чат слева</p>
            <p className="text-ink-400 text-sm font-body">{isOwner ? "Или создай новый через +" : "Чаты появятся здесь"}</p>
          </div>
        )}
        {section === "gallery" && me && <GalleryView familyId={familyId} meId={me.id} />}
        {section === "members" && family && me && (
          <MembersList family={family} me={me} onKick={async (userId) => {
            const { kickMember } = await import("@/lib/api");
            await kickMember(familyId, userId);
            const updated = await import("@/lib/api").then(m => m.getFamily(familyId));
            setFamily(updated);
          }} />
        )}
        {section === "calendar" && me && (
          <CalendarView
            familyId={familyId}
            meId={me.id}
            members={family?.members ?? []}
          />
        )}
        {section === null && (
          <div className="flex-1 flex items-center justify-center bg-cream-50">
            <p className="text-ink-300 text-sm font-body">Выбери раздел слева</p>
          </div>
        )}
      </main>

      <ToastContainer
        toasts={toasts}
        onDismiss={dismiss}
        onChatOpen={(chatId) => {
          const chat = chats.find(c => c.id === chatId);
          if (chat) { setActiveChat(chat); setSection("chats"); }
        }}
      />
    </div>
  );
}