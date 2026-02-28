"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { getGallery, type GalleryItem } from "@/lib/api";

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
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("ru", {
    day: "numeric", month: "short", year: "numeric",
  });
}

const IconGrid = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);
const IconList = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);
const IconUpload = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 8l-4-4-4 4M12 4v12" />
  </svg>
);
const IconTrash = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0H7m2-3h6" />
  </svg>
);
const IconDownload = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
  </svg>
);
const IconClose = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);
const IconChevronLeft = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
);
const IconChevronRight = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);
const IconInfo = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <circle cx="12" cy="12" r="10" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01" />
  </svg>
);
const IconVideo = () => (
  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
  </svg>
);

function Lightbox({
  item, items, onClose, onDelete, meId,
  onPrev, onNext,
}: {
  item: GalleryItem;
  items: GalleryItem[];
  onClose: () => void;
  onDelete: (id: string) => void;
  meId: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const idx = items.findIndex(i => i.id === item.id);
  const canDelete = item.uploaded_by === meId;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/families/${item.family_id}/gallery/${item.id}`, {
        method: "DELETE", credentials: "include",
      });
      onDelete(item.id);
    } finally { setDeleting(false); }
  }

  function handleDownload() {
    const a = document.createElement("a");
    a.href = item.url;
    a.download = item.file_name ?? "file";
    a.click();
  }

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 shrink-0" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <button onClick={onClose}
            className="text-white/70 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10">
            <IconClose />
          </button>
          <div>
            <p className="text-white text-sm font-medium font-body truncate max-w-xs">
              {item.file_name ?? item.caption ?? "Файл"}
            </p>
            <p className="text-white/50 text-xs font-body">{idx + 1} из {items.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleDownload}
            className="text-white/70 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/10">
            <IconDownload />
          </button>
          {canDelete && (
            <button onClick={handleDelete} disabled={deleting}
              className="text-red-400 hover:text-red-300 transition-colors p-2 rounded-lg hover:bg-white/10 disabled:opacity-50">
              <IconTrash />
            </button>
          )}
          <button onClick={() => setShowInfo(v => !v)}
            className={`p-2 rounded-lg transition-colors ${showInfo ? "bg-white/20 text-white" : "text-white/70 hover:text-white hover:bg-white/10"}`}>
            <IconInfo />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden" onClick={e => e.stopPropagation()}>
        <button onClick={onPrev} disabled={idx === 0}
          className="shrink-0 px-4 flex items-center text-white/50 hover:text-white transition-colors disabled:opacity-0">
          <IconChevronLeft />
        </button>

        <div className="flex-1 flex items-center justify-center overflow-hidden p-4">
          {item.media_type === "image"
            ? <img src={item.url} alt={item.caption ?? ""} className="max-w-full max-h-full object-contain rounded-lg select-none" draggable={false} />
            : <video src={item.url} controls autoPlay className="max-w-full max-h-full rounded-lg" onClick={e => e.stopPropagation()} />
          }
        </div>

        <button onClick={onNext} disabled={idx === items.length - 1}
          className="shrink-0 px-4 flex items-center text-white/50 hover:text-white transition-colors disabled:opacity-0">
          <IconChevronRight />
        </button>

        {showInfo && (
          <aside className="w-64 bg-zinc-900 border-l border-white/10 shrink-0 overflow-y-auto p-5">
            <p className="text-white/50 text-xs uppercase tracking-widest font-body mb-4">Сведения о файле</p>
            <div className="space-y-4">
              {[
                { label: "Имя файла", value: item.file_name ?? "—" },
                { label: "Тип", value: item.media_type === "image" ? "Изображение" : "Видео" },
                { label: "Размер", value: formatSize(item.file_size) },
                { label: "Загружено", value: item.uploaded_by_name ?? "—" },
                { label: "Дата", value: formatDate(item.created_at) },
                ...(item.caption ? [{ label: "Описание", value: item.caption }] : []),
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-white/40 text-xs font-body mb-0.5">{label}</p>
                  <p className="text-white text-sm font-body break-all">{value}</p>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>

      <div className="shrink-0 flex gap-2 px-4 py-3 overflow-x-auto" onClick={e => e.stopPropagation()}>
        {items.map((it, i) => (
          <button key={it.id}
            className={`shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${it.id === item.id ? "border-white" : "border-transparent opacity-50 hover:opacity-80"}`}
            onClick={() => {
              const diff = i - idx;
              if (diff > 0) for (let j = 0; j < diff; j++) onNext();
              else for (let j = 0; j < -diff; j++) onPrev();
            }}>
            {it.media_type === "image"
              ? <img src={it.url} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-white/50"><IconVideo /></div>
            }
          </button>
        ))}
      </div>
    </div>
  );
}

export default function GalleryView({ familyId, meId }: { familyId: string; meId: string }) {
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
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getGallery(familyId).then(setItems).finally(() => setLoading(false));
  }, [familyId]);

  const filtered = items
    .filter(it => {
      if (!search) return true;
      return (it.file_name ?? "").toLowerCase().includes(search.toLowerCase())
        || (it.caption ?? "").toLowerCase().includes(search.toLowerCase());
    })
    .sort((a, b) => {
      if (sort === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sort === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sort === "name") return (a.file_name ?? "").localeCompare(b.file_name ?? "");
      if (sort === "size") return (b.file_size ?? 0) - (a.file_size ?? 0);
      return 0;
    });

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
        const res = await fetch(`/api/families/${familyId}/gallery`, {
          method: "POST", credentials: "include", body: form,
        });
        if (res.ok) results.push(await res.json());
      } catch {  }
      setUploadProgress(Math.round(((i + 1) / arr.length) * 100));
    }
    setItems(p => [...results, ...p]);
    setUploading(false);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) uploadFiles(e.target.files);
    e.target.value = "";
  }

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const onDragLeave = useCallback(() => setIsDragging(false), []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files) uploadFiles(e.dataTransfer.files);
  }, [familyId]);

  function toggleSelect(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelected(p => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function selectAll() {
    setSelected(filtered.length === selected.size ? new Set() : new Set(filtered.map(i => i.id)));
  }

  async function deleteSelected() {
    if (!selected.size) return;
    const ids = Array.from(selected);
    await fetch(`/api/families/${familyId}/gallery/bulk-delete`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setItems(p => p.filter(i => !ids.includes(i.id)));
    setSelected(new Set());
  }

  function downloadSelected() {
    filtered.filter(i => selected.has(i.id)).forEach(item => {
      const a = document.createElement("a");
      a.href = item.url;
      a.download = item.file_name ?? "file";
      a.click();
    });
  }

  function handleItemClick(item: GalleryItem) {
    if (selected.size > 0) {
      setSelected(p => {
        const n = new Set(p);
        n.has(item.id) ? n.delete(item.id) : n.add(item.id);
        return n;
      });
    } else {
      setLightbox(item.id);
    }
  }

  const lightboxItem = lightbox ? filtered.find(i => i.id === lightbox) ?? null : null;
  const lightboxIdx = lightboxItem ? filtered.indexOf(lightboxItem) : -1;

  return (
    <div
      ref={dropRef}
      className={`flex flex-col h-full relative transition-all ${isDragging ? "bg-warm-50" : "bg-cream-50"}`}
      onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-30 border-4 border-dashed border-warm-400 rounded-2xl m-2 flex items-center justify-center bg-warm-50/90">
          <div className="text-center">
            <div className="text-5xl mb-3">📁</div>
            <p className="text-ink-700 font-semibold font-display text-lg">Отпусти для загрузки</p>
          </div>
        </div>
      )}

      <header className="shrink-0 border-b border-cream-200 bg-white px-5 py-3 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-ink-900 text-lg mr-auto">Галерея</h2>

          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 bg-ink-900 text-cream-50 text-sm font-medium rounded-xl
                       hover:bg-ink-700 transition-colors disabled:opacity-50 font-body">
            <IconUpload />
            {uploading ? `${uploadProgress}%` : "Загрузить"}
          </button>
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFileInput} />

          <div className="flex border border-cream-200 rounded-xl overflow-hidden">
            {(["grid", "list"] as const).map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                className={`p-2 transition-colors ${viewMode === m ? "bg-ink-900 text-white" : "text-ink-400 hover:bg-cream-100"}`}>
                {m === "grid" ? <IconGrid /> : <IconList />}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Поиск по названию…"
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-cream-50 border border-cream-200 rounded-xl
                         outline-none focus:border-warm-400 focus:bg-white transition-all font-body text-ink-900 placeholder-ink-300" />
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-300"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
            </svg>
          </div>

          <select value={sort} onChange={e => setSort(e.target.value as SortMode)}
            className="text-sm border border-cream-200 rounded-xl px-3 py-1.5 bg-cream-50 text-ink-700
                       outline-none focus:border-warm-400 font-body cursor-pointer">
            <option value="newest">Сначала новые</option>
            <option value="oldest">Сначала старые</option>
            <option value="name">По имени</option>
            <option value="size">По размеру</option>
          </select>

          <span className="text-xs text-ink-400 font-body whitespace-nowrap">{filtered.length} файлов</span>

          {selected.size > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-sm text-ink-700 font-body">Выбрано: {selected.size}</span>
              <button onClick={downloadSelected}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-cream-200 rounded-xl
                           hover:bg-cream-100 transition-colors font-body text-ink-700">
                <IconDownload /> Скачать
              </button>
              <button onClick={deleteSelected}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-50 border border-red-200 rounded-xl
                           hover:bg-red-100 transition-colors font-body text-red-600">
                <IconTrash /> Удалить
              </button>
              <button onClick={() => setSelected(new Set())}
                className="text-ink-400 hover:text-ink-700 text-sm font-body transition-colors">
                Отмена
              </button>
            </div>
          )}
        </div>

        {filtered.length > 0 && (
          <div className="flex items-center gap-2">
            <input type="checkbox" id="selectAll"
              checked={selected.size === filtered.length && filtered.length > 0}
              onChange={selectAll}
              className="w-3.5 h-3.5 accent-ink-900 cursor-pointer" />
            <label htmlFor="selectAll" className="text-xs text-ink-400 font-body cursor-pointer select-none">
              Выбрать все
            </label>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-5">
        {loading && (
          <div className="flex justify-center pt-20">
            <div className="w-8 h-8 border-2 border-cream-300 border-t-warm-400 rounded-full animate-spin" />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="w-20 h-20 rounded-3xl bg-cream-200 flex items-center justify-center text-4xl">
              {search ? "🔍" : "🖼️"}
            </div>
            <div>
              <p className="text-ink-700 font-semibold font-display text-lg">
                {search ? "Ничего не найдено" : "Галерея пуста"}
              </p>
              <p className="text-ink-400 text-sm font-body mt-1">
                {search ? "Попробуй другой запрос" : "Загрузи первое фото или видео"}
              </p>
            </div>
            {!search && (
              <button onClick={() => fileRef.current?.click()}
                className="px-5 py-2.5 bg-ink-900 text-cream-50 text-sm font-medium rounded-xl hover:bg-ink-700 transition-colors font-body">
                Загрузить
              </button>
            )}
          </div>
        )}

        {!loading && viewMode === "grid" && filtered.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {filtered.map(item => {
              const isSelected = selected.has(item.id);
              return (
                <div key={item.id}
                  onClick={() => handleItemClick(item)}
                  className={`aspect-square rounded-xl overflow-hidden relative cursor-pointer group
                              transition-all border-2 ${isSelected ? "border-warm-400 scale-[0.97]" : "border-transparent hover:border-cream-300"}`}
                >
                  {item.media_type === "image"
                    ? <img src={item.url} alt={item.caption ?? ""} className="w-full h-full object-cover" loading="lazy" />
                    : (
                      <div className="w-full h-full bg-ink-800 flex flex-col items-center justify-center gap-1 text-white/70">
                        <IconVideo />
                        <span className="text-xs font-body">Видео</span>
                      </div>
                    )
                  }
                  <div className={`absolute inset-0 transition-opacity ${isSelected ? "bg-warm-400/30" : "bg-black/0 group-hover:bg-black/15"}`} />
                  <div
                    onClick={e => toggleSelect(item.id, e)}
                    className={`absolute top-1.5 left-1.5 w-5 h-5 rounded-md border-2 flex items-center justify-center
                                transition-all cursor-pointer
                                ${isSelected
                                  ? "bg-warm-400 border-warm-400"
                                  : "bg-white/80 border-cream-300 opacity-0 group-hover:opacity-100"}`}
                  >
                    {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  {item.media_type === "video" && (
                    <div className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-xs font-body px-1.5 py-0.5 rounded">
                      Видео
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!loading && viewMode === "list" && filtered.length > 0 && (
          <div className="space-y-1">
            {filtered.map(item => {
              const isSelected = selected.has(item.id);
              return (
                <div key={item.id}
                  onClick={() => handleItemClick(item)}
                  className={`flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all border
                              ${isSelected ? "bg-warm-50 border-warm-200" : "bg-white border-cream-100 hover:bg-cream-50 hover:border-cream-200"}`}
                >
                  <div onClick={e => toggleSelect(item.id, e)}
                    className={`shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all cursor-pointer
                                ${isSelected ? "bg-warm-400 border-warm-400" : "border-cream-300 hover:border-warm-300"}`}>
                    {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </div>

                  <div className="shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-cream-200">
                    {item.media_type === "image"
                      ? <img src={item.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      : <div className="w-full h-full bg-ink-800 flex items-center justify-center text-white/60"><IconVideo /></div>
                    }
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-900 font-body truncate">
                      {item.file_name ?? item.caption ?? "Файл"}
                    </p>
                    <p className="text-xs text-ink-400 font-body mt-0.5">
                      {item.uploaded_by_name} · {formatDateShort(item.created_at)}
                    </p>
                  </div>

                  <div className="shrink-0 text-sm text-ink-400 font-body">
                    {formatSize(item.file_size)}
                  </div>

                  <div className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-body
                    ${item.media_type === "image" ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600"}`}>
                    {item.media_type === "image" ? "Фото" : "Видео"}
                  </div>

                  <button onClick={e => { e.stopPropagation(); const a = document.createElement("a"); a.href = item.url; a.download = item.file_name ?? "file"; a.click(); }}
                    className="shrink-0 p-1.5 text-ink-300 hover:text-ink-700 transition-colors rounded-lg hover:bg-cream-100">
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
          onDelete={id => {
            setItems(p => p.filter(i => i.id !== id));
            const next = filtered[lightboxIdx + 1] ?? filtered[lightboxIdx - 1];
            setLightbox(next?.id ?? null);
          }}
          onPrev={() => lightboxIdx > 0 && setLightbox(filtered[lightboxIdx - 1].id)}
          onNext={() => lightboxIdx < filtered.length - 1 && setLightbox(filtered[lightboxIdx + 1].id)}
        />
      )}
    </div>
  );
}