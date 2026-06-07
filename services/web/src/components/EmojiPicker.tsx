"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Clock, Search, X } from "lucide-react";
import {
  EMOJI_CATEGORIES,
  type EmojiCategoryId,
  emojiName,
  getRecentEmojis,
  pushRecentEmoji,
  searchEmojis,
} from "@/lib/emojiData";

type NavItem = { id: EmojiCategoryId; label: string; icon: string };

const NAV_ITEMS: readonly NavItem[] = [
  { id: "recent", label: "Недавние", icon: "🕘" },
  ...EMOJI_CATEGORIES.map((c) => ({ id: c.id, label: c.label, icon: c.icon })),
];

export type EmojiPickerProps = {
  /** Called with the chosen emoji. Recents are updated automatically. */
  onPick: (emoji: string) => void;
  /** Optional close affordance in the header. */
  onClose?: () => void;
};

/**
 * Discord-style emoji picker panel (content only — no portal/positioning).
 * Search across categories (RU + EN keywords), category navigation that
 * scroll-syncs with the body, a "recently used" section backed by localStorage,
 * and a hover/focus preview.
 */
export function EmojiPicker({ onPick, onClose }: EmojiPickerProps) {
  const [query, setQuery] = useState("");
  // Lazy init from localStorage (client-only; popover mounts on interaction).
  const [recents, setRecents] = useState<string[]>(() => getRecentEmojis());
  const [activeCat, setActiveCat] = useState<EmojiCategoryId>("recent");
  const [preview, setPreview] = useState<string | null>(null);

  const bodyRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const sectionRefs = useRef<Map<EmojiCategoryId, HTMLDivElement>>(new Map());
  const scrollSyncRaf = useRef<number | null>(null);
  // While we programmatically scroll (nav click) we suppress scroll-spy so the
  // active tab doesn't flicker through intermediate sections.
  const programmaticScroll = useRef(false);

  useEffect(() => {
    // Autofocus the search box when the picker mounts.
    const id = window.setTimeout(() => searchRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, []);

  const searchResults = useMemo(() => searchEmojis(query), [query]);
  const isSearching = query.trim().length > 0;

  const handlePick = useCallback(
    (emoji: string) => {
      setRecents(pushRecentEmoji(emoji));
      onPick(emoji);
    },
    [onPick],
  );

  const registerSection = useCallback(
    (id: EmojiCategoryId) => (el: HTMLDivElement | null) => {
      if (el) sectionRefs.current.set(id, el);
      else sectionRefs.current.delete(id);
    },
    [],
  );

  const scrollToCategory = useCallback((id: EmojiCategoryId) => {
    const body = bodyRef.current;
    const section = sectionRefs.current.get(id);
    if (!body || !section) return;
    programmaticScroll.current = true;
    body.scrollTo({ top: section.offsetTop - 4, behavior: "smooth" });
    setActiveCat(id);
    window.setTimeout(() => {
      programmaticScroll.current = false;
    }, 350);
  }, []);

  const handleBodyScroll = useCallback(() => {
    if (isSearching || programmaticScroll.current) return;
    if (scrollSyncRaf.current != null) return;
    scrollSyncRaf.current = window.requestAnimationFrame(() => {
      scrollSyncRaf.current = null;
      const body = bodyRef.current;
      if (!body) return;
      const probe = body.scrollTop + 8;
      let current: EmojiCategoryId = "recent";
      for (const item of NAV_ITEMS) {
        const section = sectionRefs.current.get(item.id);
        if (section && section.offsetTop <= probe) current = item.id;
      }
      setActiveCat((prev) => (prev === current ? prev : current));
    });
  }, [isSearching]);

  useEffect(
    () => () => {
      if (scrollSyncRaf.current != null) {
        window.cancelAnimationFrame(scrollSyncRaf.current);
      }
    },
    [],
  );

  const recentSection =
    recents.length > 0
      ? { id: "recent" as const, label: "Недавние", entries: recents }
      : null;

  const previewName = preview ? emojiName(preview) : null;

  return (
    <div className="emoji-picker" role="dialog" aria-label="Выбор эмодзи">
      <div className="emoji-picker__search">
        <Search className="emoji-picker__search-icon" aria-hidden />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && searchResults.length > 0) {
              e.preventDefault();
              handlePick(searchResults[0]);
            } else if (e.key === "Escape") {
              if (query) {
                e.preventDefault();
                setQuery("");
              } else {
                onClose?.();
              }
            }
          }}
          className="emoji-picker__search-input"
          placeholder="Поиск эмодзи"
          aria-label="Поиск эмодзи"
          type="text"
          autoComplete="off"
          spellCheck={false}
        />
        {query && (
          <button
            type="button"
            className="emoji-picker__search-clear"
            onClick={() => {
              setQuery("");
              searchRef.current?.focus();
            }}
            aria-label="Очистить поиск"
          >
            <X className="w-3.5 h-3.5" strokeWidth={2.4} />
          </button>
        )}
        {onClose && (
          <button
            type="button"
            className="emoji-picker__close"
            onClick={onClose}
            aria-label="Закрыть"
            title="Закрыть"
          >
            <X className="w-4 h-4" strokeWidth={2.3} />
          </button>
        )}
      </div>

      <div className="emoji-picker__nav" role="tablist" aria-label="Категории">
        {NAV_ITEMS.map((item) => {
          if (item.id === "recent" && !recentSection) return null;
          const active = !isSearching && activeCat === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`emoji-picker__nav-btn ${active ? "is-active" : ""}`}
              onClick={() => {
                if (isSearching) {
                  // Clear search first, then scroll once category sections re-render.
                  setQuery("");
                  window.requestAnimationFrame(() => scrollToCategory(item.id));
                } else {
                  scrollToCategory(item.id);
                }
              }}
              title={item.label}
              aria-label={item.label}
            >
              {item.id === "recent" ? (
                <Clock className="w-4 h-4" strokeWidth={2.2} aria-hidden />
              ) : (
                <span className="emoji-picker__nav-emoji" aria-hidden>
                  {item.icon}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        ref={bodyRef}
        className="emoji-picker__body sidebar-scroll"
        onScroll={handleBodyScroll}
      >
        {isSearching ? (
          searchResults.length > 0 ? (
            <section className="emoji-picker__section">
              <h3 className="emoji-picker__section-title">
                Результаты · {searchResults.length}
              </h3>
              <div className="emoji-picker__grid">
                {searchResults.map((emoji, i) => (
                  <EmojiButton
                    key={`${emoji}-${i}`}
                    emoji={emoji}
                    onPick={handlePick}
                    onPreview={setPreview}
                  />
                ))}
              </div>
            </section>
          ) : (
            <div className="emoji-picker__empty">
              <span className="emoji-picker__empty-emoji" aria-hidden>
                🔍
              </span>
              <p className="emoji-picker__empty-title">Ничего не найдено</p>
              <p className="emoji-picker__empty-hint">
                Попробуйте другое слово — поиск понимает русский и английский.
              </p>
            </div>
          )
        ) : (
          <>
            {recentSection && (
              <section
                className="emoji-picker__section"
                ref={registerSection("recent")}
              >
                <h3 className="emoji-picker__section-title">
                  {recentSection.label}
                </h3>
                <div className="emoji-picker__grid">
                  {recentSection.entries.map((emoji, i) => (
                    <EmojiButton
                      key={`recent-${emoji}-${i}`}
                      emoji={emoji}
                      onPick={handlePick}
                      onPreview={setPreview}
                    />
                  ))}
                </div>
              </section>
            )}

            {EMOJI_CATEGORIES.map((cat) => (
              <section
                key={cat.id}
                className="emoji-picker__section"
                ref={registerSection(cat.id)}
              >
                <h3 className="emoji-picker__section-title">{cat.label}</h3>
                <div className="emoji-picker__grid">
                  {cat.entries.map(([emoji], i) => (
                    <EmojiButton
                      key={`${cat.id}-${emoji}-${i}`}
                      emoji={emoji}
                      onPick={handlePick}
                      onPreview={setPreview}
                    />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>

      <div className="emoji-picker__preview" aria-hidden={!preview}>
        {preview ? (
          <>
            <span className="emoji-picker__preview-emoji">{preview}</span>
            <span className="emoji-picker__preview-name">{previewName}</span>
          </>
        ) : (
          <span className="emoji-picker__preview-hint">
            Выберите эмодзи
          </span>
        )}
      </div>
    </div>
  );
}

function EmojiButton({
  emoji,
  onPick,
  onPreview,
}: {
  emoji: string;
  onPick: (emoji: string) => void;
  onPreview: (emoji: string | null) => void;
}) {
  return (
    <button
      type="button"
      className="emoji-picker__emoji"
      onClick={() => onPick(emoji)}
      onMouseEnter={() => onPreview(emoji)}
      onFocus={() => onPreview(emoji)}
      title={emojiName(emoji)}
      aria-label={emojiName(emoji)}
      tabIndex={-1}
    >
      {emoji}
    </button>
  );
}

const PANEL_W = 352;
const PANEL_H = 428;
const GAP = 8;
const MARGIN = 8;

export type EmojiPickerPopoverProps = {
  anchorRect: DOMRect | null;
  onPick: (emoji: string) => void;
  onClose: () => void;
  /** Close the popover after a pick (reactions); keep open otherwise (composer). */
  closeOnPick?: boolean;
  /**
   * Trigger element to exclude from outside-click handling (prevents re-toggle).
   * Structural `{ readonly current }` so any element ref (button, generic) fits.
   */
  triggerRef?: { readonly current: Element | null };
};

/**
 * Portal + viewport-aware positioning wrapper around {@link EmojiPicker}.
 * Anchors to `anchorRect`, flips above the anchor when there isn't room below,
 * closes on outside-click / Escape.
 */
export function EmojiPickerPopover({
  anchorRect,
  onPick,
  onClose,
  closeOnPick,
  triggerRef,
}: EmojiPickerPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchorRect) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Prefer right-aligning the panel to the anchor's right edge.
    let left = anchorRect.right - PANEL_W;
    left = Math.min(Math.max(MARGIN, left), vw - PANEL_W - MARGIN);

    const spaceBelow = vh - anchorRect.bottom;
    const openUp = spaceBelow < PANEL_H + GAP && anchorRect.top > spaceBelow;
    const top = openUp
      ? Math.max(MARGIN, anchorRect.top - PANEL_H - GAP)
      : Math.min(anchorRect.bottom + GAP, vh - PANEL_H - MARGIN);

    setPos({ left, top: Math.max(MARGIN, top) });
  }, [anchorRect]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef?.current?.contains(target)) return;
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    // Capture phase so we beat React's onClick re-toggle on the trigger.
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [onClose, triggerRef]);

  if (!anchorRect) return null;

  return createPortal(
    <div
      ref={panelRef}
      className="emoji-picker-popover"
      style={{
        position: "fixed",
        zIndex: 220,
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      <EmojiPicker
        onPick={(emoji) => {
          onPick(emoji);
          if (closeOnPick) onClose();
        }}
        onClose={onClose}
      />
    </div>,
    document.body,
  );
}

export default EmojiPicker;
