"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { getMessages, sendMessage, deleteMessage, editMessage, type Chat, type Me, type Message } from "@/lib/api";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
}

export default function ChatView({ familyId, chat, me }: { familyId: string; chat: Chat; me: Me }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const msgs = await getMessages(familyId, chat.id);
      setMessages(msgs);
    } finally {
      setLoading(false);
    }
  }, [familyId, chat.id]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(
      `${protocol}://${window.location.hostname}:8000/families/${familyId}/chats/${chat.id}/ws`
    );
    wsRef.current = ws;

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "new_message") {
        setMessages((prev) => [...prev, data.message]);
      } else if (data.type === "message_edited") {
        setMessages((prev) =>
          prev.map((m) => (m.id === data.message.id ? { ...m, text: data.message.text, edited: true } : m))
        );
      } else if (data.type === "message_deleted") {
        setMessages((prev) => prev.filter((m) => m.id !== data.message_id));
      }
    };

    const ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send("ping"), 30000);

    return () => {
      clearInterval(ping);
      ws.close();
    };
  }, [familyId, chat.id]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const t = text.trim();
    setText("");
    await sendMessage(familyId, chat.id, t);
  }

  async function handleEdit(id: string) {
    if (!editText.trim()) return;
    await editMessage(familyId, chat.id, id, editText.trim());
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить сообщение?")) return;
    await deleteMessage(familyId, chat.id, id);
  }

  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-4 border-b border-cream-200 bg-white flex items-center gap-3">
        <span className="text-ink-400 font-body">#</span>
        <h2 className="font-display text-lg text-ink-900">{chat.name}</h2>
      </header>

      <div className="flex-1 overflow-y-auto chat-scroll px-6 py-4 space-y-2">
        {loading && (
          <div className="flex justify-center pt-10">
            <span className="text-ink-300 text-sm animate-pulse">Загрузка…</span>
          </div>
        )}

        {messages.map((msg, i) => {
          const isMe = msg.author_id === me.id;
          const showName = !isMe && (i === 0 || messages[i - 1].author_id !== msg.author_id);

          return (
            <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[70%] group ${isMe ? "items-end" : "items-start"} flex flex-col`}>
                {showName && (
                  <span className="text-xs text-ink-400 ml-3 mb-0.5">
                    {msg.author_id?.slice(0, 8)}
                  </span>
                )}

                {editingId === msg.id ? (
                  /* Режим редактирования */
                  <div className="flex gap-2 items-center">
                    <input
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleEdit(msg.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="px-3 py-2 rounded-xl border-2 border-warm-400 outline-none text-sm font-body"
                    />
                    <button onClick={() => handleEdit(msg.id)} className="text-xs text-warm-500">✓</button>
                    <button onClick={() => setEditingId(null)} className="text-xs text-ink-400">✕</button>
                  </div>
                ) : (
                  <div className="relative">
                    <div
                      className={`px-4 py-2.5 rounded-2xl text-sm font-body leading-relaxed ${
                        isMe
                          ? "bg-ink-900 text-cream-50 rounded-br-sm"
                          : "bg-white border border-cream-200 text-ink-900 rounded-bl-sm"
                      }`}
                    >
                      {msg.text}
                      {msg.edited && (
                        <span className="text-xs opacity-50 ml-2">ред.</span>
                      )}
                    </div>

                    {isMe && (
                      <div className="absolute -left-16 top-1/2 -translate-y-1/2 hidden group-hover:flex gap-1">
                        <button
                          onClick={() => { setEditingId(msg.id); setEditText(msg.text); }}
                          className="text-ink-300 hover:text-ink-600 text-xs p-1"
                          title="Редактировать"
                        >✏️</button>
                        <button
                          onClick={() => handleDelete(msg.id)}
                          className="text-ink-300 hover:text-red-500 text-xs p-1"
                          title="Удалить"
                        >🗑️</button>
                      </div>
                    )}
                  </div>
                )}

                <span className="text-[10px] text-ink-300 mt-0.5 px-1">
                  {formatTime(msg.created_at)}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSend}
        className="px-4 py-3 border-t border-cream-200 bg-white flex gap-3 items-end"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend(e);
            }
          }}
          placeholder="Написать сообщение…"
          rows={1}
          className="flex-1 resize-none px-4 py-3 rounded-2xl border-2 border-cream-200
                     bg-cream-50 text-ink-900 font-body text-sm placeholder-ink-300 outline-none
                     focus:border-warm-400 focus:bg-white transition-all max-h-32"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="px-5 py-3 bg-ink-900 text-cream-50 rounded-2xl font-body text-sm
                     transition-all hover:bg-ink-700 active:scale-95
                     disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
        >
          →
        </button>
      </form>
    </div>
  );
}