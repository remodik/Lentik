"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Grid3X3,
  Image as ImageIcon,
  List,
  Play,
  Search,
  SearchX,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { getGallery, type GalleryItem } from "@/lib/api";
import { apiFetch, normalizeApiPayload } from "@/lib/api-base";

type ViewMode = "grid" | "list";
type SortMode = "newest" | "oldest" | "name" | "size";

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ru", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("ru", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return null;
}

function parsePositiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function formatVideoDuration(totalSeconds: number): string {
  const rounded = Math.max(1, Math.round(totalSeconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getVideoPoster(item: GalleryItem): string | null {
  const raw = item as GalleryItem & Record<string, unknown>;
  const metadata = isRecord(raw.metadata) ? raw.metadata : null;

  return firstNonEmptyString(
    raw.thumbnail_url,
    raw.poster_url,
    raw.preview_url,
    raw.thumb_url,
    metadata?.thumbnail_url,
    metadata?.poster_url,
    metadata?.preview_url,
    metadata?.thumb_url,
  );
}

function getVideoDuration(item: GalleryItem): string | null {
  const raw = item as GalleryItem & Record<string, unknown>;
  const metadata = isRecord(raw.metadata) ? raw.metadata : null;

  const durationText = firstNonEmptyString(raw.duration, metadata?.duration);
  if (durationText) return durationText;

  const durationSeconds =
    parsePositiveNumber(raw.duration_seconds) ??
    parsePositiveNumber(metadata?.duration_seconds);
  if (durationSeconds) return formatVideoDuration(durationSeconds);

  const durationMs =
    parsePositiveNumber(raw.duration_ms) ??
    parsePositiveNumber(metadata?.duration_ms);
  if (durationMs) return formatVideoDuration(durationMs / 1000);

  return null;
}

function isControlTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('[data-gallery-control="true"]') !== null
  );
}

const IconGrid = () => <Grid3X3 className="w-[15px] h-[15px]" strokeWidth={2.1} />;
const IconList = () => <List className="w-[15px] h-[15px]" strokeWidth={2.1} />;
const IconUpload = () => <Upload className="w-4 h-4" strokeWidth={2.1} />;
const IconTrash = () => <Trash2 className="w-4 h-4" strokeWidth={2.1} />;
const IconDownload = () => <Download className="w-4 h-4" strokeWidth={2.1} />;
const IconClose = () => <X className="w-5 h-5" strokeWidth={2.3} />;
const IconChevronLeft = () => <ChevronLeft className="w-6 h-6" strokeWidth={2.1} />;
const IconChevronRight = () => <ChevronRight className="w-6 h-6" strokeWidth={2.1} />;
const IconPlay = ({ className = "w-4 h-4" }: { className?: string }) => (
  <Play className={className} strokeWidth={2.4} fill="currentColor" aria-hidden />
);
const IconSearch = () => <Search className="w-3.5 h-3.5" strokeWidth={2.1} />;
const IconCheck = () => <Check className="w-3 h-3" strokeWidth={3} />;

function triggerDownload(url: string, filename?: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? "file";
  a.click();
}

const videoFrameCache = new Map<string, string | null>();
const videoFramePending = new Map<string, Promise<string | null>>();

function getVideoFirstFrame(url: string): Promise<string | null> {
  const cached = videoFrameCache.get(url);
  if (cached !== undefined) return Promise.resolve(cached);

  const pending = videoFramePending.get(url);
  if (pending) return pending;

  const task = new Promise<string | null>((resolve) => {
    const video = document.createElement("video");
    let done = false;
    let fallbackTimer: number | null = null;
    let timeoutId: number | null = null;

    function cleanup() {
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      video.pause();
      video.removeAttribute("src");
      video.load();
    }

    function finish(frame: string | null) {
      if (done) return;
      done = true;
      videoFrameCache.set(url, frame);
      videoFramePending.delete(url);
      cleanup();
      resolve(frame);
    }

    function captureFrame() {
      if (done) return;
      if (!video.videoWidth || !video.videoHeight) {
        finish(null);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        finish(null);
        return;
      }
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL("image/jpeg", 0.86));
      } catch {
        finish(null);
      }
    }

    function onLoadedData() {
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        captureFrame();
        return;
      }
      try {
        video.currentTime = Math.min(0.08, video.duration * 0.01);
        fallbackTimer = window.setTimeout(captureFrame, 180);
      } catch {
        captureFrame();
      }
    }

    function onSeeked() {
      captureFrame();
    }

    function onError() {
      finish(null);
    }

    timeoutId = window.setTimeout(() => finish(null), 6000);
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.addEventListener("loadeddata", onLoadedData);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.src = url;
  });

  videoFramePending.set(url, task);
  return task;
}

function VideoPreviewSurface({
  src,
  poster,
  duration,
  compact = false,
  showLabel = true,
}: {
  src: string;
  poster: string | null;
  duration: string | null;
  compact?: boolean;
  showLabel?: boolean;
}) {
  const [framePoster, setFramePoster] = useState<string | null>(poster);
  const playWrap = compact ? "h-7 w-7" : "h-9 w-9";
  const playIcon = compact ? "w-3.5 h-3.5" : "w-4 h-4";
  const labelSize = compact ? "text-[9px]" : "text-[11px]";
  const durationSize = compact
    ? "text-[9px] px-1 py-0.5"
    : "text-[10px] px-1.5 py-0.5";
  const effectivePoster = poster ?? framePoster;

  useEffect(() => {
    setFramePoster(poster);
  }, [poster, src]);

  useEffect(() => {
    if (poster || !src) return;
    let alive = true;
    getVideoFirstFrame(src).then((frame) => {
      if (!alive || !frame) return;
      setFramePoster(frame);
    });
    return () => {
      alive = false;
    };
  }, [src, poster]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
      {effectivePoster ? (
        <>
          <img
            src={effectivePoster}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-black/30" />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-white/5" />
      )}

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-white">
        <span
          className={`${playWrap} grid place-items-center rounded-full border border-white/35 bg-black/45 shadow-xl`}
        >
          <IconPlay className={`${playIcon} ml-[1px]`} />
        </span>
        {showLabel && (
          <span
            className={`${labelSize} font-body font-semibold uppercase tracking-[0.03em] text-white/90`}
          >
          </span>
        )}
      </div>

      {duration && (
        <span
          className={`absolute bottom-1 right-1 rounded-md bg-black/60 ${durationSize} font-body leading-none text-white`}
        >
          {duration}
        </span>
      )}
    </div>
  );
}

function Lightbox({
  item,
  items,
  onClose,
  onDelete,
  meId,
  onPrev,
  onNext,
  onSelect,
}: {
  item: GalleryItem;
  items: GalleryItem[];
  onClose: () => void;
  onDelete: (id: string) => void;
  meId: string;
  onPrev: () => void;
  onNext: () => void;
  onSelect: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const idx = items.findIndex((i) => i.id === item.id);
  const canDelete = item.uploaded_by === meId;
  const itemPoster = item.media_type === "video" ? getVideoPoster(item) : null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, []);

  async function handleDelete() {
    setDeleting(true);
    try {
      await apiFetch(`/families/${item.family_id}/gallery/${item.id}`, {
        method: "DELETE",
      });
      onDelete(item.id);
    } finally {
      setDeleting(false);
    }
  }

  if (!portalRoot) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-[2px] animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex h-[100dvh] w-screen flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/28 px-3 py-2 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              onClick={onClose}
              className="lb-icon-btn !h-9 !w-9 !rounded-xl"
              aria-label="Закрыть"
            >
              <IconClose />
            </button>
            <div className="min-w-0">
              <p
                className="truncate text-sm font-semibold text-white/92"
                title={item.file_name ?? item.caption ?? "Файл"}
              >
                {item.file_name ?? item.caption ?? "Файл"}
              </p>
              <p className="mt-0.5 text-[11px] text-white/60">
                {idx + 1} из {items.length} ·{" "}
                <span className="opacity-80">
                  {formatDate(item.created_at)}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                triggerDownload(item.url, item.file_name ?? "file")
              }
              className="lb-icon-btn !h-9 !w-9 !rounded-xl"
              aria-label="Скачать"
              title="Скачать"
            >
              <IconDownload />
            </button>
            {canDelete && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="lb-icon-btn danger !h-9 !w-9 !rounded-xl"
                aria-label="Удалить"
                title="Удалить"
              >
                <IconTrash />
              </button>
            )}
          </div>
        </div>

        <div className="relative flex-1 min-h-0">
          <div className="flex h-full w-full items-center justify-center px-0 py-0 sm:px-1 sm:py-1">
            {item.media_type === "image" ? (
              <img
                src={item.url}
                alt=""
                className="h-full w-full select-none object-contain rounded-xl shadow-2xl"
                draggable={false}
              />
            ) : (
              <video
                src={item.url}
                controls
                autoPlay
                className="h-full w-full object-contain rounded-xl shadow-2xl"
                poster={itemPoster ?? undefined}
                playsInline
              />
            )}
          </div>

          <button
            onClick={onPrev}
            disabled={idx === 0}
            className="absolute left-2 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-black/45 text-white/75 transition hover:bg-black/60 hover:text-white disabled:pointer-events-none disabled:opacity-35 sm:h-11 sm:w-11"
            aria-label="Предыдущее"
          >
            <IconChevronLeft />
          </button>

          <button
            onClick={onNext}
            disabled={idx === items.length - 1}
            className="absolute right-2 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-black/45 text-white/75 transition hover:bg-black/60 hover:text-white disabled:pointer-events-none disabled:opacity-35 sm:h-11 sm:w-11"
            aria-label="Следующее"
          >
            <IconChevronRight />
          </button>
        </div>

        <div className="shrink-0 border-t border-white/10 bg-black/30 px-2.5 pt-1.5 pb-2 sm:px-3">
          <div
            className="flex gap-2 overflow-x-auto overflow-y-hidden"
            aria-label="Превью"
          >
            {items.map((it) => {
              const thumbPoster =
                it.media_type === "video" ? getVideoPoster(it) : null;
              const thumbDuration =
                it.media_type === "video" ? getVideoDuration(it) : null;

              return (
                <button
                  key={it.id}
                  className={`h-14 w-14 flex-none overflow-hidden rounded-xl border-2 transition sm:h-[58px] sm:w-[58px] ${
                    it.id === item.id
                      ? "scale-105 border-white/95 opacity-100"
                      : "border-transparent opacity-65 hover:opacity-90"
                  }`}
                  onClick={() => onSelect(it.id)}
                  aria-label={`Открыть ${it.file_name ?? it.caption ?? "файл"}`}
                >
                  {it.media_type === "image" ? (
                    <img
                      src={it.url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <VideoPreviewSurface
                      src={it.url}
                      poster={thumbPoster}
                      duration={thumbDuration}
                      compact
                      showLabel={!thumbPoster}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    portalRoot,
  );
}

export default function GalleryView({
  familyId,
  meId,
}: {
  familyId: string;
  meId: string;
}) {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sort, setSort] = useState<SortMode>("newest");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getGallery(familyId)
      .then(setItems)
      .finally(() => setLoading(false));
  }, [familyId]);

  const filtered = useMemo(() => {
    return items
      .filter((it) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          (it.file_name ?? "").toLowerCase().includes(q) ||
          (it.caption ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sort === "newest")
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        if (sort === "oldest")
          return (
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        if (sort === "name")
          return (a.file_name ?? "").localeCompare(b.file_name ?? "");
        if (sort === "size") return (b.file_size ?? 0) - (a.file_size ?? 0);
        return 0;
      });
  }, [items, search, sort]);

  async function uploadFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    if (!arr.length) return;

    setUploading(true);
    setUploadProgress(0);

    const results: GalleryItem[] = [];
    for (let i = 0; i < arr.length; i++) {
      const form = new FormData();
      form.append("file", arr[i]);
      try {
        const res = await apiFetch(`/families/${familyId}/gallery`, {
          method: "POST",
          body: form,
        });
        if (res.ok) {
          results.push(normalizeApiPayload<GalleryItem>(await res.json()));
        }
      } catch {}
      setUploadProgress(Math.round(((i + 1) / arr.length) * 100));
    }
    setItems((p) => [...results, ...p]);
    setUploading(false);
  }

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  const onDragLeave = useCallback(() => setIsDragging(false), []);
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files) uploadFiles(e.dataTransfer.files);
    },
    [uploadFiles],
  );

  function stopControlPropagation(e: React.SyntheticEvent) {
    e.stopPropagation();
  }

  function toggleSelect(id: string) {
    setSelected((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function handleSelectControlClick(
    id: string,
    e: React.MouseEvent<HTMLButtonElement>,
  ) {
    e.preventDefault();
    e.stopPropagation();
    toggleSelect(id);
  }

  function handleItemClick(
    item: GalleryItem,
    e: React.MouseEvent<HTMLElement>,
  ) {
    if (e.defaultPrevented || isControlTarget(e.target)) return;

    if (selected.size > 0) {
      setSelected((p) => {
        const n = new Set(p);
        n.has(item.id) ? n.delete(item.id) : n.add(item.id);
        return n;
      });
    } else {
      setLightbox(item.id);
    }
  }

  async function deleteItem(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    await apiFetch(`/families/${familyId}/gallery/${id}`, {
      method: "DELETE",
    });
    setItems((p) => p.filter((i) => i.id !== id));
  }

  async function deleteSelected() {
    if (!selected.size) return;
    const ids = Array.from(selected);
    await apiFetch(`/families/${familyId}/gallery/bulk-delete`, {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    setItems((p) => p.filter((i) => !ids.includes(i.id)));
    setSelected(new Set());
  }

  const lightboxItem = lightbox
    ? (filtered.find((i) => i.id === lightbox) ?? null)
    : null;
  const lightboxIdx = lightboxItem ? filtered.indexOf(lightboxItem) : -1;

  return (
    <div
      className={`gallery-shell ${isDragging ? "dragging" : ""}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-card">
            <div className="text-5xl mb-3" aria-hidden>
              📁
            </div>
            <p className="text-ink-700 font-semibold font-display text-lg">
              Отпусти для загрузки
            </p>
            <p className="text-ink-400 text-sm font-body mt-1">
              Можно загружать фото и видео
            </p>
          </div>
        </div>
      )}

      <header className="gallery-head glass-topbar glossy">
        <div className="head-row">
          <div className="min-w-0">
            <h2 className="head-title">Галерея</h2>
            <p className="head-sub">
              {filtered.length} файлов ·{" "}
              <span className="opacity-80">
                {sort === "newest"
                  ? "Сначала новые"
                  : sort === "oldest"
                    ? "Сначала старые"
                    : sort === "name"
                      ? "По имени"
                      : "По размеру"}
              </span>
            </p>
          </div>

          <div className="head-actions">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="btn-primary"
              type="button"
            >
              <IconUpload />
              {uploading ? `${uploadProgress}%` : "Загрузить"}
            </button>

            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) uploadFiles(e.target.files);
                e.target.value = "";
              }}
            />

            <div className="segmented" role="tablist" aria-label="Вид">
              {(["grid", "list"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setViewMode(m)}
                  className={`seg-btn ${viewMode === m ? "active" : ""}`}
                  type="button"
                  role="tab"
                  aria-selected={viewMode === m}
                >
                  {m === "grid" ? <IconGrid /> : <IconList />}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="head-row secondary">
          <div className="search">
            <span className="search-ic" aria-hidden>
              <IconSearch />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск…"
              className="search-input"
            />
          </div>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            className="select"
          >
            <option value="newest">Сначала новые</option>
            <option value="oldest">Сначала старые</option>
            <option value="name">По имени</option>
            <option value="size">По размеру</option>
          </select>

          {selected.size > 0 && (
            <div className="bulk">
              <span className="bulk-text">Выбрано: {selected.size}</span>
              <button
                onClick={deleteSelected}
                className="btn-danger"
                type="button"
              >
                <IconTrash /> Удалить
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="btn-ghost"
                type="button"
              >
                Отмена
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="gallery-body">
        {loading && (
          <div className="flex justify-center pt-20">
            <div className="w-8 h-8 border-2 border-cream-300 border-t-warm-400 rounded-full animate-spin" />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="empty">
            <div className="empty-badge" aria-hidden>
              {search ? (
                <SearchX className="w-7 h-7 text-ink-300" strokeWidth={2} />
              ) : (
                <ImageIcon className="w-7 h-7 text-ink-300" strokeWidth={2} />
              )}
            </div>
            <div>
              <p className="empty-title">
                {search ? "Ничего не найдено" : "Галерея пуста"}
              </p>
              <p className="empty-sub">
                {search
                  ? "Попробуй другой запрос"
                  : "Загрузи первое фото или видео"}
              </p>
            </div>
            {!search && (
              <button
                onClick={() => fileRef.current?.click()}
                className="btn-primary"
                type="button"
              >
                Загрузить
              </button>
            )}
          </div>
        )}

        {!loading && viewMode === "grid" && filtered.length > 0 && (
          <div className="grid-wrap">
            {filtered.map((item) => {
              const isSelected = selected.has(item.id);
              const canDel = item.uploaded_by === meId;
              const videoPoster =
                item.media_type === "video" ? getVideoPoster(item) : null;
              const videoDuration =
                item.media_type === "video" ? getVideoDuration(item) : null;

              return (
                <div
                  key={item.id}
                  onClick={(e) => handleItemClick(item, e)}
                  className={`tile group ${isSelected ? "selected" : ""}`}
                >
                  {item.media_type === "image" ? (
                    <img
                      src={item.url}
                      alt=""
                      className="tile-media"
                      loading="lazy"
                    />
                  ) : (
                    <VideoPreviewSurface
                      src={item.url}
                      poster={videoPoster}
                      duration={videoDuration}
                    />
                  )}

                  <button
                    data-gallery-control="true"
                    onPointerDown={stopControlPropagation}
                    onMouseDown={stopControlPropagation}
                    onClick={(e) => handleSelectControlClick(item.id, e)}
                    className={`tile-check ${isSelected ? "on" : ""} !opacity-100 !translate-y-0 !scale-100 z-10`}
                    aria-label={isSelected ? "Снять выделение" : "Выбрать"}
                    type="button"
                  >
                    {isSelected && <IconCheck />}
                  </button>

                  <div className="tile-overlay" aria-hidden>
                    <div className="tile-actions">
                      <button
                        data-gallery-control="true"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerDownload(item.url, item.file_name ?? "file");
                        }}
                        className="tile-btn"
                        title="Скачать"
                        type="button"
                      >
                        <IconDownload />
                      </button>

                      {canDel && (
                        <button
                          data-gallery-control="true"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (confirm("Удалить?")) await deleteItem(item.id);
                          }}
                          className="tile-btn danger"
                          title="Удалить"
                          type="button"
                        >
                          <IconTrash />
                        </button>
                      )}
                    </div>

                    <div className="tile-meta">
                      <p className="tile-name">
                        {item.file_name ?? item.caption ?? "Файл"}
                      </p>
                      <p className="tile-sub">
                        {item.uploaded_by_name} ·{" "}
                        {formatDateShort(item.created_at)} ·{" "}
                        {formatSize(item.file_size)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && viewMode === "list" && filtered.length > 0 && (
          <div className="list-wrap">
            {filtered.map((item) => {
              const isSelected = selected.has(item.id);
              const videoPoster =
                item.media_type === "video" ? getVideoPoster(item) : null;
              const videoDuration =
                item.media_type === "video" ? getVideoDuration(item) : null;
              return (
                <div
                  key={item.id}
                  onClick={(e) => handleItemClick(item, e)}
                  className={`row group ${isSelected ? "selected" : ""}`}
                >
                  <div
                    data-gallery-control="true"
                    className="flex items-center self-stretch"
                    onPointerDown={stopControlPropagation}
                    onMouseDown={stopControlPropagation}
                  >
                    <button
                      data-gallery-control="true"
                      onPointerDown={stopControlPropagation}
                      onMouseDown={stopControlPropagation}
                      onClick={(e) => handleSelectControlClick(item.id, e)}
                      className={`row-check ${isSelected ? "on" : ""}
                                  opacity-0 group-hover:opacity-100 transition-opacity
                                  ${isSelected ? "opacity-100" : ""}`}
                      type="button"
                      aria-label={isSelected ? "Снять выделение" : "Выбрать"}
                    >
                      {isSelected && <IconCheck />}
                    </button>
                  </div>

                  <div className="row-thumb">
                    {item.media_type === "image" ? (
                      <img
                        src={item.url}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <VideoPreviewSurface
                        src={item.url}
                        poster={videoPoster}
                        duration={videoDuration}
                        compact
                      />
                    )}
                  </div>

                  <div className="row-main">
                    <p
                      className="row-title"
                      title={item.file_name ?? item.caption ?? "Файл"}
                    >
                      {item.file_name ?? item.caption ?? "Файл"}
                    </p>
                    <p className="row-sub">
                      {item.uploaded_by_name} ·{" "}
                      {formatDateShort(item.created_at)}
                    </p>
                  </div>

                  <div className="row-size">{formatSize(item.file_size)}</div>

                  <div
                    className={`row-tag ${item.media_type === "image" ? "img" : "vid"}`}
                  >
                    {item.media_type === "image" ? "Фото" : "Видео"}
                  </div>

                  <button
                    data-gallery-control="true"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerDownload(item.url, item.file_name ?? "file");
                    }}
                    className="row-btn"
                    type="button"
                    aria-label="Скачать"
                    title="Скачать"
                  >
                    <IconDownload />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {lightboxItem && (
        <Lightbox
          item={lightboxItem}
          items={filtered}
          meId={meId}
          onClose={() => setLightbox(null)}
          onDelete={(id) => {
            setItems((p) => p.filter((i) => i.id !== id));
            const next = filtered[lightboxIdx + 1] ?? filtered[lightboxIdx - 1];
            setLightbox(next?.id ?? null);
          }}
          onPrev={() =>
            lightboxIdx > 0 && setLightbox(filtered[lightboxIdx - 1].id)
          }
          onNext={() =>
            lightboxIdx < filtered.length - 1 &&
            setLightbox(filtered[lightboxIdx + 1].id)
          }
          onSelect={(id) => setLightbox(id)}
        />
      )}
    </div>
  );
}
