"use client";

import { useState } from "react";
import { type Family, type Me } from "@/lib/api";

type Member = Family["members"][0];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru", { day: "numeric", month: "long", year: "numeric" });
}

function formatBirthday(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString("ru", { day: "numeric", month: "long" });
}

function isBirthdaySoon(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const now = new Date();
  const bday = new Date(iso);
  const next = new Date(now.getFullYear(), bday.getMonth(), bday.getDate());
  if (next < now) next.setFullYear(now.getFullYear() + 1);
  return (next.getTime() - now.getTime()) / 86400000 <= 7;
}

export default function MembersList({
  family,
  me,
  onKick,
}: {
  family: Family;
  me: Me;
  onKick?: (userId: string) => Promise<void>;
}) {
  const [kicking, setKicking] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const isOwner = family.members.find(m => m.user_id === me.id)?.role === "owner";
  const owners = family.members.filter(m => m.role === "owner");
  const members = family.members.filter(m => m.role !== "owner");

  const filtered = (list: Member[]) =>
    list.filter(m =>
      !search ||
      m.display_name.toLowerCase().includes(search.toLowerCase()) ||
      m.username.toLowerCase().includes(search.toLowerCase())
    );

  async function handleKick(userId: string, name: string) {
    if (!confirm(`Исключить ${name} из семьи?`)) return;
    setKicking(userId);
    try { await onKick?.(userId); }
    catch (e) { alert(e instanceof Error ? e.message : "Ошибка"); }
    finally { setKicking(null); }
  }

  function MemberCard({ member }: { member: Member }) {
    const isMe = member.user_id === me.id;
    const isExpanded = expanded === member.user_id;
    const birthday = isBirthdaySoon((member as any).birthday);

    return (
      <div
        className={`bg-white rounded-2xl border transition-all overflow-hidden
          ${isExpanded ? "border-warm-200 shadow-md" : "border-cream-200 hover:border-cream-300 hover:shadow-sm"}`}
      >
        <div
          className="flex items-center gap-4 p-4 cursor-pointer"
          onClick={() => setExpanded(isExpanded ? null : member.user_id)}
        >
          <div className="relative shrink-0">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg font-display overflow-hidden
              ${member.role === "owner" ? "bg-warm-400" : "bg-ink-600"}`}>
              {member.avatar_url
                ? <img src={member.avatar_url} alt="" className="w-full h-full object-cover" />
                : member.display_name[0].toUpperCase()}
            </div>
            {member.role === "owner" && (
              <div className="absolute -bottom-0.5 -right-0.5 bg-white rounded-full text-xs leading-none p-0.5">👑</div>
            )}
            {birthday && (
              <div className="absolute -top-0.5 -right-0.5 bg-white rounded-full text-xs leading-none p-0.5">🎂</div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-ink-900 font-body truncate">{member.display_name}</p>
              {isMe && <span className="text-xs text-ink-400 bg-cream-100 px-2 py-0.5 rounded-full font-body">Это ты</span>}
              {birthday && <span className="text-xs text-warm-500 font-body">🎂 Скоро ДР</span>}
            </div>
            <p className="text-xs text-ink-400 font-body mt-0.5">@{member.username}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-xs px-2.5 py-1 rounded-full font-body font-medium
              ${member.role === "owner" ? "bg-warm-100 text-warm-700" : "bg-cream-100 text-ink-500"}`}>
              {member.role === "owner" ? "Создатель" : "Участник"}
            </span>
            <svg className={`w-4 h-4 text-ink-300 transition-transform ${isExpanded ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {isExpanded && (
          <div className="border-t border-cream-100 px-4 pb-4 pt-3 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "В семье с", value: formatDate(member.joined_at) },
                { label: "День рождения", value: formatBirthday((member as any).birthday) ?? "Не указан" },
              ].map(({ label, value }) => (
                <div key={label} className="bg-cream-50 rounded-xl p-3">
                  <p className="text-xs text-ink-400 font-body mb-1">{label}</p>
                  <p className="text-sm text-ink-800 font-body font-medium">{value}</p>
                </div>
              ))}
            </div>

            {(member as any).bio && (
              <div className="bg-cream-50 rounded-xl p-3">
                <p className="text-xs text-ink-400 font-body mb-1">О себе</p>
                <p className="text-sm text-ink-700 font-body">{(member as any).bio}</p>
              </div>
            )}

            {isOwner && !isMe && onKick && (
              <button
                onClick={() => handleKick(member.user_id, member.display_name)}
                disabled={kicking === member.user_id}
                className="w-full py-2 text-sm text-red-500 border border-red-200 rounded-xl
                           hover:bg-red-50 transition-colors font-body disabled:opacity-50"
              >
                {kicking === member.user_id ? "Исключение…" : "Исключить из семьи"}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const filteredOwners = filtered(owners);
  const filteredMembers = filtered(members);

  return (
    <div className="flex flex-col h-full bg-cream-50">
      <header className="shrink-0 border-b border-cream-200 bg-white px-5 py-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-ink-900 text-lg">Участники</h2>
          <span className="text-xs font-medium text-ink-400 bg-cream-100 px-2.5 py-1 rounded-full font-body">
            {family.members.length}
          </span>
        </div>
        <div className="relative">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по имени или логину…"
            className="w-full pl-8 pr-3 py-2 text-sm bg-cream-50 border border-cream-200 rounded-xl
                       outline-none focus:border-warm-400 focus:bg-white transition-all font-body
                       text-ink-900 placeholder-ink-300"
          />
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-300"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
          </svg>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-2xl mx-auto space-y-6">
          {filteredOwners.length > 0 && (
            <section>
              <p className="text-xs font-semibold text-ink-300 uppercase tracking-wider mb-3 font-body">
                Создатель
              </p>
              <div className="space-y-2">
                {filteredOwners.map(m => <MemberCard key={m.user_id} member={m} />)}
              </div>
            </section>
          )}
          {filteredMembers.length > 0 && (
            <section>
              <p className="text-xs font-semibold text-ink-300 uppercase tracking-wider mb-3 font-body">
                Участники — {filteredMembers.length}
              </p>
              <div className="space-y-2">
                {filteredMembers.map(m => <MemberCard key={m.user_id} member={m} />)}
              </div>
            </section>
          )}
          {filteredOwners.length === 0 && filteredMembers.length === 0 && (
            <div className="text-center py-16 text-ink-400 font-body text-sm">
              Никого не найдено
            </div>
          )}
        </div>
      </div>
    </div>
  );
}