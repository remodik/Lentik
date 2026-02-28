"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { getMessages, sendMessage, deleteMessage, editMessage, type Chat, type Me, type Message, type Family } from "@/lib/api";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
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

function renderText(text: string, meUsername: string) {
  const parts = text.split(/(@[\w_]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      const uname = part.slice(1);
      const isMe = uname === meUsername;
      return (
        <span key={i} className={`inline rounded px-0.5 font-medium ${isMe ? "bg-warm-100 text-warm-700" : "bg-cream-200 text-ink-600"}`}>
          {part}
        </span>
      );
    }
    return part;
  });
}

export default function ChatView({
  familyId, chat, me, family,
}: {
  familyId: string;
  chat: Chat;
  me: Me;
  family?: Family;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const members = family?.members ?? [];

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try { const msgs = await getMessages(familyId, chat.id); setMessages(msgs); }
    finally { setLoading(false); }
  }, [familyId, chat.id]);

  useEffect(() => { loadMessages(); }, [loadMessages]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.hostname}:8000/families/${familyId}/chats/${chat.id}/ws`);
    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.type === "new_message")
        setMessages((p) => p.some(m => m.id === d.message.id) ? p : [...p, d.message]);
      else if (d.type === "message_edited")
        setMessages((p) => p.map((m) => m.id === d.message.id ? { ...m, text: d.message.text, edited: true } : m));
      else if (d.type === "message_deleted")
        setMessages((p) => p.filter((m) => m.id !== d.message_id));
    };
    const ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send("ping"), 30000);
    return () => { clearInterval(ping); ws.close(); };
  }, [familyId, chat.id]);

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setText(val);

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

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionSuggestions.length > 0 && (e.key === "Escape")) {
      e.preventDefault();
      setMentionQuery(null);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  }

  function insertMention(username: string) {
    const before = text.slice(0, mentionStart);
    const after = text.slice(mentionStart + 1 + (mentionQuery?.length ?? 0));
    const newText = `${before}@${username} ${after}`;
    setText(newText);
    setMentionQuery(null);
    textareaRef.current?.focus();
  }

  const mentionSuggestions = mentionQuery !== null
    ? members.filter(m =>
        m.username.toLowerCase().startsWith(mentionQuery.toLowerCase()) ||
        m.display_name.toLowerCase().startsWith(mentionQuery.toLowerCase())
      ).slice(0, 5)
    : [];

  async function handleSend(e: React.FormEvent | React.KeyboardEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const t = text.trim();
    setText("");
    setMentionQuery(null);
    textareaRef.current?.focus();
    const msg = await sendMessage(familyId, chat.id, t);
    setMessages((p) => [...p, msg]);
  }

  const groups: { date: string; messages: Message[] }[] = [];
  for (const msg of messages) {
    const date = formatDate(msg.created_at);
    const last = groups[groups.length - 1];
    if (last?.date === date) last.messages.push(msg);
    else groups.push({ date, messages: [msg] });
  }

  return (
    <div className="flex flex-col h-full bg-cream-50">
      <header className="h-14 px-5 flex items-center gap-2 border-b border-cream-200 shrink-0">
        <span className="text-ink-300 font-bold text-lg">#</span>
        <h2 className="text-ink-900 font-semibold font-body">{chat.name}</h2>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4 chat-scroll">
        {loading && (
          <div className="flex justify-center pt-16">
            <div className="w-8 h-8 border-2 border-cream-300 border-t-warm-400 rounded-full animate-spin" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2">
            <div className="w-14 h-14 rounded-2xl bg-cream-200 flex items-center justify-center text-2xl">💬</div>
            <p className="text-ink-700 font-semibold font-display mt-2">Начало канала #{chat.name}</p>
            <p className="text-ink-400 text-sm font-body">Напиши первое сообщение!</p>
          </div>
        )}

        {groups.map(({ date, messages: dayMsgs }) => (
          <div key={date}>
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-cream-200" />
              <span className="text-xs text-ink-300 font-medium font-body">{date}</span>
              <div className="flex-1 h-px bg-cream-200" />
            </div>

            {dayMsgs.map((msg, i) => {
              const isMe = msg.author_id === me.id;
              const isGrouped = dayMsgs[i - 1]?.author_id === msg.author_id;
              const displayName = isMe
                ? me.display_name
                : (msg.author_display_name ?? msg.author_username ?? "Участник");

              return (
                <div
                  key={msg.id}
                  className={`group relative flex gap-3 px-3 py-1 rounded-2xl hover:bg-cream-100 transition-colors ${!isGrouped ? "mt-4" : ""}`}
                  onMouseEnter={() => setHoveredId(msg.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <div className="w-9 shrink-0 pt-0.5">
                    {!isGrouped ? (
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white font-display overflow-hidden ${isMe ? "bg-warm-400" : "bg-ink-600"}`}>
                        {msg.author_id && members.find(m => m.user_id === msg.author_id)?.avatar_url
                          ? <img src={members.find(m => m.user_id === msg.author_id)!.avatar_url!} alt="" className="w-full h-full object-cover" />
                          : displayName[0]?.toUpperCase() ?? "?"
                        }
                      </div>
                    ) : (
                      <span className="text-[10px] text-ink-300 block text-center mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {formatTime(msg.created_at)}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    {!isGrouped && (
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className={`text-sm font-semibold font-body ${isMe ? "text-warm-500" : "text-ink-700"}`}>
                          {displayName}
                        </span>
                        <span className="text-[11px] text-ink-300 font-body">{formatTime(msg.created_at)}</span>
                      </div>
                    )}

                    {editingId === msg.id ? (
                      <div>
                        <input autoFocus value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { editMessage(familyId, chat.id, msg.id, editText.trim()); setEditingId(null); }
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="w-full bg-white border-2 border-warm-400 text-ink-900 text-sm px-3 py-2 rounded-xl outline-none font-body"
                        />
                        <p className="text-xs text-ink-300 mt-1 font-body">Enter — сохранить · Esc — отмена</p>
                      </div>
                    ) : (
                      <p className="text-ink-800 text-sm leading-relaxed break-words font-body">
                        {renderText(msg.text, me.username)}
                        {msg.edited && <span className="text-[10px] text-ink-300 ml-1">(изм.)</span>}
                      </p>
                    )}
                  </div>

                  {isMe && hoveredId === msg.id && editingId !== msg.id && (
                    <div className="absolute right-3 -top-3 flex items-center gap-0.5 bg-white border border-cream-200 rounded-xl px-1 py-0.5 shadow-sm">
                      <button onClick={() => { setEditingId(msg.id); setEditText(msg.text); }} className="p-1 text-ink-300 hover:text-ink-700 transition-colors text-xs">✏️</button>
                      <button onClick={async () => { if (confirm("Удалить?")) await deleteMessage(familyId, chat.id, msg.id); }} className="p-1 text-ink-300 hover:text-red-400 transition-colors text-xs">🗑️</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="px-5 pb-5 pt-2 shrink-0 relative">
        {mentionSuggestions.length > 0 && (
          <div className="absolute bottom-full left-5 right-5 mb-2 bg-white border border-cream-200 rounded-2xl shadow-lg overflow-hidden z-10">
            {mentionSuggestions.map(m => (
              <button
                key={m.user_id}
                onMouseDown={(e) => { e.preventDefault(); insertMention(m.username); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-cream-50 transition-colors text-left"
              >
                <div className="w-7 h-7 rounded-full bg-ink-600 flex items-center justify-center text-white text-xs font-bold overflow-hidden shrink-0">
                  {m.avatar_url
                    ? <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
                    : m.display_name[0].toUpperCase()
                  }
                </div>
                <div>
                  <p className="text-sm font-medium text-ink-900 font-body">{m.display_name}</p>
                  <p className="text-xs text-ink-400 font-body">@{m.username}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSend} className="flex items-end gap-3 bg-cream-100 rounded-2xl px-4 py-3 border-2 border-cream-200 focus-within:border-warm-400 transition-colors">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder={`Написать в #${chat.name}… (@ для упоминания)`}
            rows={1}
            className="flex-1 bg-transparent text-ink-900 text-sm placeholder-ink-300 outline-none resize-none max-h-32 leading-relaxed font-body"
          />
          <button type="submit" disabled={!text.trim()}
            className="w-8 h-8 flex items-center justify-center bg-ink-900 text-cream-50 rounded-xl shrink-0
                       hover:bg-ink-700 disabled:opacity-30 transition-all active:scale-95">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
          </button>
        </form>
      </div>
    </div>
  );
}