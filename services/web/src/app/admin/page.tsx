"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Ban,
  ShieldOff,
  Users,
  Home as HomeIcon,
  BarChart3,
  ScrollText,
  ArrowLeft,
  Search,
  ChevronDown,
} from "lucide-react";
import {
  adminGetUsers,
  adminGetUser,
  adminGetFamilies,
  adminGetFamily,
  adminGetStats,
  adminGetAudit,
  adminUnbanUser,
  type AdminUserRow,
  type AdminUserDetail,
  type AdminFamilyRow,
  type AdminFamilyDetail,
  type AdminStats,
  type AdminAuditRow,
  type ApiError,
} from "@/lib/api";
import BanUserModal from "@/components/BanUserModal";

type Tab = "stats" | "users" | "families" | "audit";
const PAGE = 50;

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: "stats", label: "Статистика", icon: BarChart3 },
  { id: "users", label: "Пользователи", icon: Users },
  { id: "families", label: "Семьи", icon: HomeIcon },
  { id: "audit", label: "Аудит", icon: ScrollText },
];

function fmtBytes(n: number): string {
  if (n < 0) return "—";
  if (n < 1024) return `${n} Б`;
  const units = ["КБ", "МБ", "ГБ", "ТБ"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("ru-RU");
}

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("stats");
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [banTarget, setBanTarget] = useState<{ id: string; name: string } | null>(null);

  // Гард: stats → 403 ⇒ не разработчик ⇒ в /app.
  useEffect(() => {
    let alive = true;
    adminGetStats()
      .then((s) => {
        if (!alive) return;
        setAuthorized(true);
        setStats(s);
      })
      .catch((e: ApiError) => {
        if (!alive) return;
        if (e?.status === 403 || e?.status === 401) {
          setAuthorized(false);
          router.replace("/app");
        } else {
          setAuthorized(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [router]);

  // Deep-link ?user=<id> → открыть вкладку пользователей.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const u = new URLSearchParams(window.location.search).get("user");
    if (u) setTab("users");
  }, []);

  if (authorized === null) {
    return (
      <main className="min-h-screen grid place-items-center">
        <span className="w-6 h-6 border-2 border-ink-300 border-t-ink-700 rounded-full animate-spin" />
      </main>
    );
  }
  if (authorized === false) return null;

  return (
    <main className="min-h-screen max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <header className="mb-8">
        <Link
          href="/app"
          className="inline-flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink-700 font-body mb-2 transition"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={2.1} />В приложение
        </Link>
        <h1 className="font-display text-3xl text-ink-900 tracking-tight">Админ-панель</h1>
      </header>

      <div className="flex flex-wrap gap-2 mb-6">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-body border transition ${
              tab === id
                ? "bg-ink-900 text-cream-50 border-ink-900"
                : "bg-[var(--bg-surface)] text-ink-600 border-[color:var(--border-glass)] hover:bg-[var(--bg-surface)]"
            }`}
          >
            <Icon className="w-4 h-4" strokeWidth={2.1} />
            {label}
          </button>
        ))}
      </div>

      {tab === "stats" && <StatsTab stats={stats} />}
      {tab === "users" && <UsersTab onBan={(id, name) => setBanTarget({ id, name })} />}
      {tab === "families" && <FamiliesTab onBan={(id, name) => setBanTarget({ id, name })} />}
      {tab === "audit" && <AuditTab />}

      {banTarget && (
        <BanUserModal
          userId={banTarget.id}
          displayName={banTarget.name}
          onClose={() => setBanTarget(null)}
        />
      )}
    </main>
  );
}

/* ─── Статистика ─────────────────────────────────────────────────────────── */

function StatsTab({ stats }: { stats: AdminStats | null }) {
  if (!stats) return <p className="text-sm text-ink-400 font-body">Загрузка…</p>;
  const cards = [
    { label: "Пользователи", value: stats.users },
    { label: "Семьи", value: stats.families },
    { label: "Сообщения", value: stats.messages },
    { label: "Забанено", value: stats.banned_users },
    { label: "Загрузки", value: fmtBytes(stats.uploads_bytes) },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="rounded-2xl border border-[color:var(--border-glass)] bg-[var(--bg-surface)] p-4 backdrop-blur">
          <p className="text-xs uppercase tracking-wider text-ink-400 font-body">{c.label}</p>
          <p className="font-display text-2xl text-ink-900 mt-1">{c.value}</p>
        </div>
      ))}
    </div>
  );
}

/* ─── Поиск (debounce) ───────────────────────────────────────────────────── */

function useDebounced(value: string, delay = 350): string {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (s: string) => void; placeholder: string }) {
  return (
    <div className="relative mb-4 max-w-sm">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" strokeWidth={2.1} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-3 py-2 rounded-xl border border-[color:var(--border-glass)] bg-[var(--bg-surface)] text-sm text-ink-700 font-body focus:outline-none focus:ring-2 focus:ring-warm-200"
      />
    </div>
  );
}

/* ─── Пользователи ───────────────────────────────────────────────────────── */

function UsersTab({ onBan }: { onBan: (id: string, name: string) => void }) {
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);

  const load = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      try {
        const off = reset ? 0 : offset;
        const data = await adminGetUsers({ q: q || undefined, limit: PAGE, offset: off });
        setHasMore(data.length === PAGE);
        setOffset(off + data.length);
        setRows((prev) => (reset ? data : [...prev, ...data]));
      } finally {
        setLoading(false);
      }
    },
    [q, offset],
  );

  // Перезагрузка при изменении поиска.
  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Deep-link ?user=<id> → раскрыть карточку.
  const didDeepLink = useRef(false);
  useEffect(() => {
    if (didDeepLink.current || typeof window === "undefined") return;
    const u = new URLSearchParams(window.location.search).get("user");
    if (u) {
      didDeepLink.current = true;
      void toggleExpand(u);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleExpand(userId: string) {
    if (expanded === userId) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    setExpanded(userId);
    setDetail(null);
    try {
      setDetail(await adminGetUser(userId));
    } catch {
      /* ignore */
    }
  }

  async function handleUnban(id: string) {
    try {
      await adminUnbanUser(id);
      await load(true);
      if (expanded === id) setDetail(await adminGetUser(id));
    } catch {
      /* ignore */
    }
  }

  return (
    <div>
      <SearchBox value={search} onChange={setSearch} placeholder="Поиск по логину или имени…" />
      <div className="rounded-2xl border border-[color:var(--border-glass)] bg-[var(--bg-surface-subtle)] divide-y divide-[color:var(--border-glass)]">
        {rows.map((u) => (
          <div key={u.id}>
            <div className="flex items-center gap-3 px-4 py-3 text-sm font-body">
              <button
                type="button"
                onClick={() => void toggleExpand(u.id)}
                className="flex items-center gap-2 flex-1 min-w-0 text-left"
              >
                <ChevronDown
                  className={`w-4 h-4 text-ink-400 transition ${expanded === u.id ? "rotate-180" : ""}`}
                  strokeWidth={2.1}
                />
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${u.is_online ? "bg-[var(--success-fg)]" : "bg-ink-300"}`}
                  title={u.is_online ? "Онлайн" : "Офлайн"}
                />
                <span className="text-ink-800 truncate">{u.display_name}</span>
                <span className="text-ink-400 truncate">@{u.username}</span>
                {u.is_developer && <span className="text-[color:var(--special-fg)] text-xs">dev</span>}
              </button>
              <span className="text-ink-400 hidden sm:block">{fmtDate(u.created_at)}</span>
              {u.is_banned ? (
                <button
                  type="button"
                  onClick={() => void handleUnban(u.id)}
                  className="inline-flex items-center gap-1.5 text-ink-600 hover:text-ink-900 shrink-0"
                >
                  <ShieldOff className="w-4 h-4" strokeWidth={2.1} />
                  Разбан
                </button>
              ) : (
                !u.is_developer && (
                  <button
                    type="button"
                    onClick={() => onBan(u.id, u.display_name)}
                    className="inline-flex items-center gap-1.5 text-[color:var(--danger-fg-bold)] hover:text-[color:var(--danger-fg-strong)] shrink-0"
                  >
                    <Ban className="w-4 h-4" strokeWidth={2.1} />
                    Бан
                  </button>
                )
              )}
            </div>

            {expanded === u.id && (
              <div className="px-4 pb-4 pt-1 bg-[var(--bg-surface-subtle)]">
                <p className="text-xs font-mono text-ink-400 mb-2 break-all">ID: {u.id}</p>
                {u.is_banned && (
                  <p className="text-xs text-[color:var(--danger-fg-bold)] mb-2">
                    Бан: {u.ban_reason ?? "—"}
                    {u.ban_expires_at ? ` (до ${fmtDate(u.ban_expires_at)})` : " (навсегда)"}
                  </p>
                )}
                <p className="text-xs uppercase tracking-wider text-ink-400 mb-1.5">Семьи</p>
                {!detail ? (
                  <p className="text-xs text-ink-400">Загрузка…</p>
                ) : detail.families.length === 0 ? (
                  <p className="text-xs text-ink-400">Не состоит в семьях</p>
                ) : (
                  <ul className="space-y-1">
                    {detail.families.map((f) => (
                      <li key={f.family_id} className="text-sm text-ink-700 flex items-center gap-2">
                        <span>{f.family_name}</span>
                        <span className="text-xs text-ink-400">{f.role}</span>
                        <span className="text-[10px] font-mono text-ink-300">{f.family_id}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <LoadMore loading={loading} hasMore={hasMore} onClick={() => void load(false)} />
    </div>
  );
}

/* ─── Семьи ──────────────────────────────────────────────────────────────── */

function FamiliesTab({ onBan }: { onBan: (id: string, name: string) => void }) {
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const [rows, setRows] = useState<AdminFamilyRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminFamilyDetail | null>(null);

  const load = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      try {
        const off = reset ? 0 : offset;
        const data = await adminGetFamilies({ q: q || undefined, limit: PAGE, offset: off });
        setHasMore(data.length === PAGE);
        setOffset(off + data.length);
        setRows((prev) => (reset ? data : [...prev, ...data]));
      } finally {
        setLoading(false);
      }
    },
    [q, offset],
  );

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function toggleExpand(familyId: string) {
    if (expanded === familyId) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    setExpanded(familyId);
    setDetail(null);
    try {
      setDetail(await adminGetFamily(familyId));
    } catch {
      /* ignore */
    }
  }

  return (
    <div>
      <SearchBox value={search} onChange={setSearch} placeholder="Поиск по названию семьи…" />
      <div className="rounded-2xl border border-[color:var(--border-glass)] bg-[var(--bg-surface-subtle)] divide-y divide-[color:var(--border-glass)]">
        {rows.map((f) => (
          <div key={f.id}>
            <button
              type="button"
              onClick={() => void toggleExpand(f.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm font-body text-left"
            >
              <ChevronDown
                className={`w-4 h-4 text-ink-400 transition ${expanded === f.id ? "rotate-180" : ""}`}
                strokeWidth={2.1}
              />
              <span className="text-ink-800 flex-1 truncate">{f.name}</span>
              <span className="text-ink-500">{f.member_count} уч.</span>
              <span className="text-ink-400 hidden sm:block">{fmtDate(f.created_at)}</span>
            </button>

            {expanded === f.id && (
              <div className="px-4 pb-4 pt-1 bg-[var(--bg-surface-subtle)]">
                <p className="text-xs font-mono text-ink-400 mb-2 break-all">ID: {f.id}</p>
                <p className="text-xs uppercase tracking-wider text-ink-400 mb-1.5">Участники</p>
                {!detail ? (
                  <p className="text-xs text-ink-400">Загрузка…</p>
                ) : (
                  <ul className="space-y-1.5">
                    {detail.members.map((m) => (
                      <li key={m.user_id} className="flex items-center gap-2 text-sm">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${m.is_online ? "bg-[var(--success-fg)]" : "bg-ink-300"}`}
                        />
                        <span className="text-ink-800">{m.display_name}</span>
                        <span className="text-ink-400">@{m.username}</span>
                        <span className="text-xs text-ink-400">{m.role}</span>
                        {m.is_developer && <span className="text-[color:var(--special-fg)] text-xs">dev</span>}
                        {m.is_banned && <span className="text-[color:var(--danger-fg-bold)] text-xs">бан</span>}
                        <span className="flex-1" />
                        {!m.is_developer && !m.is_banned && (
                          <button
                            type="button"
                            onClick={() => onBan(m.user_id, m.display_name)}
                            className="text-[color:var(--danger-fg-bold)] hover:text-[color:var(--danger-fg-strong)] text-xs inline-flex items-center gap-1"
                          >
                            <Ban className="w-3.5 h-3.5" strokeWidth={2.1} />
                            Бан
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <LoadMore loading={loading} hasMore={hasMore} onClick={() => void load(false)} />
    </div>
  );
}

/* ─── Аудит ──────────────────────────────────────────────────────────────── */

function AuditTab() {
  const [rows, setRows] = useState<AdminAuditRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      try {
        const off = reset ? 0 : offset;
        const data = await adminGetAudit({ limit: PAGE, offset: off });
        setHasMore(data.length === PAGE);
        setOffset(off + data.length);
        setRows((prev) => (reset ? data : [...prev, ...data]));
      } finally {
        setLoading(false);
      }
    },
    [offset],
  );

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      {rows.map((a) => (
        <div key={a.id} className="rounded-xl border border-[color:var(--border-glass)] bg-[var(--bg-surface-subtle)] px-4 py-3 text-sm font-body">
          <div className="flex items-center justify-between gap-3">
            <span className="text-ink-800 font-medium">{a.action}</span>
            <span className="text-ink-400 text-xs">{fmtDate(a.created_at)}</span>
          </div>
          <p className="text-ink-500 text-xs mt-1">
            {a.actor_display_name ? (
              <>
                <span className="text-ink-600">{a.actor_display_name}</span>
                {a.actor_username ? ` (@${a.actor_username})` : ""} ·{" "}
              </>
            ) : null}
            <span className="font-mono break-all">
              {a.target_type}:{a.target_id}
              {a.metadata ? ` · ${JSON.stringify(a.metadata)}` : ""}
            </span>
          </p>
        </div>
      ))}
      {rows.length === 0 && !loading && <p className="text-ink-400 text-sm font-body">Записей пока нет</p>}
      <LoadMore loading={loading} hasMore={hasMore} onClick={() => void load(false)} />
    </div>
  );
}

/* ─── Кнопка «Загрузить ещё» ─────────────────────────────────────────────── */

function LoadMore({ loading, hasMore, onClick }: { loading: boolean; hasMore: boolean; onClick: () => void }) {
  if (loading) return <p className="text-sm text-ink-400 font-body mt-4 text-center">Загрузка…</p>;
  if (!hasMore) return null;
  return (
    <div className="mt-4 text-center">
      <button
        type="button"
        onClick={onClick}
        className="px-5 py-2 rounded-xl text-sm font-body border border-[color:var(--border-glass)] bg-[var(--bg-surface)] text-ink-600 hover:bg-[var(--bg-surface)] transition"
      >
        Загрузить ещё
      </button>
    </div>
  );
}
