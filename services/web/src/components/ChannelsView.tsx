"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, SendHorizontal } from "lucide-react";
import {
  createChannel,
  createPost,
  getChannels,
  getFamily,
  getPosts,
  type Channel,
  type FamilyMember,
  type Post,
} from "@/lib/api";

const POSTS_PAGE_SIZE = 20;

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("ru", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);

  return parts
    .filter((part) => part.length > 0)
    .map((part, idx) => {
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        return <strong key={idx}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
        return <em key={idx}>{part.slice(1, -1)}</em>;
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
}

function renderPostText(text: string) {
  const lines = text.split("\n");
  return lines.map((line, idx) => (
    <React.Fragment key={idx}>
      {renderInlineMarkdown(line)}
      {idx < lines.length - 1 && <br />}
    </React.Fragment>
  ));
}

function PostSkeleton() {
  return (
    <div
      className="rounded-2xl border p-4 animate-pulse"
      style={{
        background: "var(--bg-surface-subtle)",
        borderColor: "var(--border-glass)",
      }}
    >
      <div className="h-3 w-32 rounded" style={{ background: "var(--color-extra-041)" }} />
      <div className="mt-3 h-3 w-full rounded" style={{ background: "var(--color-extra-041)" }} />
      <div className="mt-2 h-3 w-4/5 rounded" style={{ background: "var(--color-extra-041)" }} />
      <div className="mt-2 h-3 w-2/3 rounded" style={{ background: "var(--color-extra-041)" }} />
    </div>
  );
}

export default function ChannelsView({
  familyId,
  isOwner,
  externalChannelId,
}: {
  familyId: string;
  isOwner: boolean;
  externalChannelId?: string | null;
}) {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDescription, setNewChannelDescription] = useState("");
  const [creatingChannel, setCreatingChannel] = useState(false);

  useEffect(() => {
    if (externalChannelId) {
      setSelectedChannelId(externalChannelId);
    }
  }, [externalChannelId]);

  const [posts, setPosts] = useState<Post[]>([]);
  const [postsOffset, setPostsOffset] = useState(0);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsLoadingMore, setPostsLoadingMore] = useState(false);
  const [postsHasMore, setPostsHasMore] = useState(true);

  const [newPostText, setNewPostText] = useState("");
  const [creatingPost, setCreatingPost] = useState(false);

  const postsViewportRef = useRef<HTMLDivElement>(null);
  const suppressAutoScrollRef = useRef(false);
  const postsRequestIdRef = useRef(0);

  const selectedChannel = useMemo(
    () => channels.find((channel) => channel.id === selectedChannelId) ?? null,
    [channels, selectedChannelId],
  );

  const memberById = useMemo(
    () => new Map(members.map((member) => [member.user_id, member])),
    [members],
  );

  const resolveAuthorName = useCallback(
    (post: Post) => {
      if (!post.author_id) return "Участник";
      return memberById.get(post.author_id)?.display_name ?? "Участник";
    },
    [memberById],
  );

  const loadChannels = useCallback(async () => {
    setChannelsLoading(true);
    try {
      const [nextChannels, family] = await Promise.all([
        getChannels(familyId),
        getFamily(familyId),
      ]);

      setChannels(nextChannels);
      setMembers(family.members ?? []);
      setSelectedChannelId((prev) => {
        if (prev && nextChannels.some((channel) => channel.id === prev)) {
          return prev;
        }
        return nextChannels[0]?.id ?? null;
      });
    } catch (e) {
      console.error("loadChannels failed", e);
      setChannels([]);
      setMembers([]);
      setSelectedChannelId(null);
    } finally {
      setChannelsLoading(false);
    }
  }, [familyId]);

  const loadPosts = useCallback(
    async (channelId: string) => {
      const requestId = postsRequestIdRef.current + 1;
      postsRequestIdRef.current = requestId;

      setPostsLoading(true);
      setPostsLoadingMore(false);
      setPosts([]);
      setPostsOffset(0);
      setPostsHasMore(true);

      try {
        const chunk = await getPosts(familyId, channelId, POSTS_PAGE_SIZE, 0);
        if (postsRequestIdRef.current !== requestId) return;

        setPosts([...chunk].reverse());
        setPostsOffset(chunk.length);
        setPostsHasMore(chunk.length === POSTS_PAGE_SIZE);
      } catch (e) {
        if (postsRequestIdRef.current !== requestId) return;
        console.error("loadPosts failed", e);
        setPosts([]);
        setPostsOffset(0);
        setPostsHasMore(false);
      } finally {
        if (postsRequestIdRef.current === requestId) {
          setPostsLoading(false);
        }
      }
    },
    [familyId],
  );

  useEffect(() => {
    setShowCreateChannel(false);
    setNewChannelName("");
    setNewChannelDescription("");
    setNewPostText("");
    void loadChannels();
  }, [loadChannels]);

  useEffect(() => {
    if (!selectedChannelId) {
      setPosts([]);
      setPostsOffset(0);
      setPostsHasMore(false);
      setPostsLoading(false);
      return;
    }
    setNewPostText("");
    void loadPosts(selectedChannelId);
  }, [selectedChannelId, loadPosts]);

  useEffect(() => {
    if (suppressAutoScrollRef.current) {
      suppressAutoScrollRef.current = false;
      return;
    }

    const viewport = postsViewportRef.current;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [posts, selectedChannelId]);

  const loadMorePosts = useCallback(async () => {
    if (!selectedChannelId || postsLoadingMore || !postsHasMore) return;

    const viewport = postsViewportRef.current;
    const prevHeight = viewport?.scrollHeight ?? 0;
    const prevTop = viewport?.scrollTop ?? 0;

    setPostsLoadingMore(true);
    try {
      const chunk = await getPosts(
        familyId,
        selectedChannelId,
        POSTS_PAGE_SIZE,
        postsOffset,
      );
      const older = [...chunk].reverse();

      suppressAutoScrollRef.current = older.length > 0;

      setPosts((prev) => {
        if (older.length === 0) return prev;
        const knownIds = new Set(prev.map((post) => post.id));
        const uniqueOlder = older.filter((post) => !knownIds.has(post.id));
        return [...uniqueOlder, ...prev];
      });

      setPostsOffset((prev) => prev + chunk.length);
      if (chunk.length < POSTS_PAGE_SIZE) {
        setPostsHasMore(false);
      }

      requestAnimationFrame(() => {
        const node = postsViewportRef.current;
        if (!node || older.length === 0) return;
        const nextHeight = node.scrollHeight;
        node.scrollTop = Math.max(0, prevTop + (nextHeight - prevHeight));
      });
    } catch (e) {
      console.error("loadMorePosts failed", e);
    } finally {
      setPostsLoadingMore(false);
    }
  }, [familyId, postsHasMore, postsLoadingMore, postsOffset, selectedChannelId]);

  useEffect(() => {
    const viewport = postsViewportRef.current;
    if (!viewport) return;

    const onScroll = () => {
      if (viewport.scrollTop < 120 && postsHasMore && !postsLoadingMore && !postsLoading) {
        void loadMorePosts();
      }
    };

    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      viewport.removeEventListener("scroll", onScroll);
    };
  }, [loadMorePosts, postsHasMore, postsLoading, postsLoadingMore]);

  async function handleCreateChannel() {
    const name = newChannelName.trim();
    if (!name || creatingChannel) return;

    setCreatingChannel(true);
    try {
      const created = await createChannel(
        familyId,
        name,
        newChannelDescription.trim() || undefined,
      );

      setChannels((prev) => [...prev, created]);
      setSelectedChannelId(created.id);
      setShowCreateChannel(false);
      setNewChannelName("");
      setNewChannelDescription("");
    } catch (e) {
      console.error("createChannel failed", e);
    } finally {
      setCreatingChannel(false);
    }
  }

  async function handleCreatePost() {
    const value = newPostText.trim();
    if (!selectedChannelId || !value || creatingPost) return;

    setCreatingPost(true);
    try {
      const created = await createPost(familyId, selectedChannelId, value);
      setPosts((prev) => [...prev, created]);
      setPostsOffset((prev) => prev + 1);
      setNewPostText("");
    } catch (e) {
      console.error("createPost failed", e);
    } finally {
      setCreatingPost(false);
    }
  }

  return (
    <div className="h-full min-h-0 flex flex-col md:flex-row">
      <aside
        className="w-full md:w-72 md:min-w-72 border-b md:border-b-0 md:border-r p-3 md:p-4"
        style={{ borderColor: "var(--border-warm-dim)", background: "var(--bg-surface-subtle)" }}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-ink-400 font-body">Каналы</p>
            <p className="text-sm text-ink-600 font-body mt-0.5">Объявления семьи</p>
          </div>

          {isOwner && (
            <button
              type="button"
              className="ui-btn ui-btn-subtle !px-2.5 !py-1.5 inline-flex items-center gap-1.5"
              onClick={() => setShowCreateChannel((value) => !value)}
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.2} />
              Создать канал
            </button>
          )}
        </div>

        {isOwner && showCreateChannel && (
          <div
            className="mt-3 rounded-2xl border p-3 space-y-2.5"
            style={{ borderColor: "var(--border-glass)", background: "var(--bg-surface)" }}
          >
            <input
              className="ui-input"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              placeholder="Название канала"
              maxLength={120}
            />

            <textarea
              className="ui-input min-h-[70px] resize-none"
              value={newChannelDescription}
              onChange={(e) => setNewChannelDescription(e.target.value)}
              placeholder="Описание (необязательно)"
              maxLength={500}
            />

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="ui-btn ui-btn-subtle"
                onClick={() => {
                  setShowCreateChannel(false);
                  setNewChannelName("");
                  setNewChannelDescription("");
                }}
                disabled={creatingChannel}
              >
                Отмена
              </button>
              <button
                type="button"
                className="ui-btn ui-btn-primary"
                onClick={() => void handleCreateChannel()}
                disabled={creatingChannel || !newChannelName.trim()}
              >
                {creatingChannel ? "Создание…" : "Создать"}
              </button>
            </div>
          </div>
        )}

        <div className="mt-3 md:mt-4 space-y-1.5 max-h-[220px] md:max-h-none md:h-[calc(100%-88px)] overflow-y-auto sidebar-scroll pr-1">
          {channelsLoading ? (
            <div className="text-sm text-ink-400 font-body px-1">Загрузка каналов…</div>
          ) : channels.length === 0 ? (
            <div
              className="rounded-2xl border p-4 text-sm text-ink-400 font-body"
              style={{ borderColor: "var(--border-glass)", background: "var(--bg-surface)" }}
            >
              <p>Каналов пока нет</p>
              {isOwner && (
                <button
                  type="button"
                  className="ui-btn ui-btn-subtle mt-3"
                  onClick={() => setShowCreateChannel(true)}
                >
                  Создать канал
                </button>
              )}
            </div>
          ) : (
            channels.map((channel) => {
              const active = channel.id === selectedChannelId;
              return (
                <button
                  key={channel.id}
                  type="button"
                  className={`w-full text-left rounded-xl border px-3 py-2.5 transition ${
                    active ? "shadow-sm" : "hover:translate-y-[-1px]"
                  }`}
                  style={{
                    borderColor: active ? "var(--accent-border)" : "var(--border-glass)",
                    background: active ? "var(--accent-soft)" : "var(--bg-surface)",
                  }}
                  onClick={() => setSelectedChannelId(channel.id)}
                >
                  <p className="text-sm font-semibold text-ink-800 truncate"># {channel.name}</p>
                  {channel.description && (
                    <p className="text-xs text-ink-400 font-body mt-1 line-clamp-2">
                      {channel.description}
                    </p>
                  )}
                </button>
              );
            })
          )}
        </div>
      </aside>

      <section className="flex-1 min-h-0 flex flex-col">
        {!selectedChannel ? (
          <div className="h-full grid place-items-center px-6 text-center">
            <div>
              <p className="text-base font-semibold text-ink-800">Каналов пока нет</p>
              {isOwner ? (
                <button
                  type="button"
                  className="ui-btn ui-btn-subtle mt-3"
                  onClick={() => setShowCreateChannel(true)}
                >
                  Создать канал
                </button>
              ) : (
                <p className="text-sm text-ink-400 font-body mt-2">Попросите владельца создать канал</p>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border-warm-dim)" }}>
              <h2 className="text-[1rem] font-semibold text-ink-900"># {selectedChannel.name}</h2>
              <p className="text-[11px] text-ink-400 font-body mt-0.5">
                {selectedChannel.description || "Канал объявлений"}
              </p>
            </div>

            <div ref={postsViewportRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 sidebar-scroll">
              {postsLoadingMore && (
                <div className="flex justify-center py-2">
                  <Loader2 className="w-5 h-5 animate-spin text-ink-400" strokeWidth={2.2} />
                </div>
              )}

              {postsLoading ? (
                <div className="space-y-3">
                  <PostSkeleton />
                  <PostSkeleton />
                  <PostSkeleton />
                </div>
              ) : posts.length === 0 ? (
                <div className="text-sm text-ink-400 font-body px-1">Постов пока нет</div>
              ) : (
                <div className="space-y-3">
                  {posts.map((post) => (
                    <article
                      key={post.id}
                      className="rounded-2xl border p-4"
                      style={{
                        background: "var(--bg-surface)",
                        borderColor: "var(--border-glass)",
                        boxShadow: "var(--shadow-sm)",
                      }}
                    >
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <p className="text-[13px] font-semibold text-ink-700">
                          {resolveAuthorName(post)}
                        </p>
                        <p className="text-[11px] text-ink-400 font-body whitespace-nowrap">
                          {formatDateTime(post.created_at)}
                        </p>
                      </div>

                      <div className="text-[14px] leading-relaxed text-ink-800 whitespace-pre-wrap break-words">
                        {renderPostText(post.text)}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            {isOwner && (
              <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-warm-dim)" }}>
                <div
                  className="flex items-end gap-2 rounded-xl border px-2.5 py-2"
                  style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)" }}
                >
                  <textarea
                    value={newPostText}
                    onChange={(e) => setNewPostText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleCreatePost();
                      }
                    }}
                    className="flex-1 min-h-[40px] max-h-[150px] resize-none bg-transparent outline-none text-sm text-ink-900 placeholder:text-ink-300"
                    placeholder={`Написать пост в #${selectedChannel.name}`}
                    rows={1}
                  />

                  <button
                    type="button"
                    className="w-10 h-10 rounded-md grid place-items-center text-white bg-ink-900 hover:bg-ink-700 transition disabled:opacity-45"
                    onClick={() => void handleCreatePost()}
                    disabled={creatingPost || !newPostText.trim()}
                    aria-label="Опубликовать пост"
                  >
                    {creatingPost ? (
                      <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.2} />
                    ) : (
                      <SendHorizontal className="w-4 h-4" strokeWidth={2.2} />
                    )}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
