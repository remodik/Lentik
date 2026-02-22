"use client";

import { type Family, type Me } from "@/lib/api";

export default function MembersList({ family, me }: { family: Family; me: Me }) {
  const isOwner = family.members.find((m) => m.user_id === me.id)?.role === "owner";

  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-4 border-b border-cream-200 bg-white">
        <h2 className="font-display text-lg text-ink-900">{family.name}</h2>
        <p className="text-xs text-ink-400 mt-0.5">{family.members.length} участников</p>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-md mx-auto space-y-2">
          {family.members.map((member) => (
            <div
              key={member.user_id}
              className="flex items-center gap-4 px-4 py-3 bg-white rounded-2xl border border-cream-200"
            >
              <div className="w-10 h-10 rounded-full bg-cream-100 flex items-center justify-center shrink-0 overflow-hidden">
                {member.avatar_url ? (
                  <img src={member.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="font-display text-ink-600 text-sm">
                    {member.username[0].toUpperCase()}
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-ink-900 text-sm truncate">
                  {member.username}
                  {member.user_id === me.id && (
                    <span className="text-ink-400 font-normal"> (ты)</span>
                  )}
                </p>
                <p className="text-xs text-ink-400">
                  {member.role === "owner" ? "👑 Создатель" : "Участник"}
                </p>
              </div>

              {isOwner && member.user_id !== me.id && (
                <button
                  className="text-xs text-ink-300 hover:text-red-400 transition-colors p-1"
                  title="Исключить"
                  onClick={() => alert("Скоро")}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}