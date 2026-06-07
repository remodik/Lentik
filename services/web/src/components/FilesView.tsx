"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Archive,
  Check,
  Download,
  File as FileGenericIcon,
  FileAudio,
  FileSpreadsheet,
  FileText,
  FileType2,
  Music,
  Search,
  SearchX,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { getGallery, type GalleryItem } from "@/lib/api";
import { apiFetch, normalizeApiPayload } from "@/lib/api-base";
import { useConfirm } from "@/components/ConfirmDialog";
import { hasBit, PERM, usePermissions } from "@/lib/usePermissions";
import Select from "@/components/Select";
import { useContextMenu } from "@/lib/useContextMenu";
import type { ContextMenuEntry } from "@/components/ContextMenu";
import { Hash } from "lucide-react";

type SortMode = "newest" | "oldest" | "name" | "size";

type Category =
  | "document"
  | "spreadsheet"
  | "presentation"
  | "archive"
  | "audio"
  | "ebook"
  | "other";

const CATEGORY_BY_EXT: Record<string, Category> = {
  // Documents
  pdf: "document",
  doc: "document",
  docx: "document",
  odt: "document",
  rtf: "document",
  txt: "document",
  md: "document",
  // Spreadsheets
  xls: "spreadsheet",
  xlsx: "spreadsheet",
  ods: "spreadsheet",
  csv: "spreadsheet",
  // Presentations
  ppt: "presentation",
  pptx: "presentation",
  odp: "presentation",
  // Archives
  zip: "archive",
  rar: "archive",
  "7z": "archive",
  tar: "archive",
  gz: "archive",
  // Audio
  mp3: "audio",
  wav: "audio",
  ogg: "audio",
  m4a: "audio",
  flac: "audio",
  aac: "audio",
  // E-books
  epub: "ebook",
  fb2: "ebook",
  mobi: "ebook",
};

const CATEGORY_LABEL: Record<Category, string> = {
  document: "Документ",
  spreadsheet: "Таблица",
  presentation: "Презентация",
  archive: "Архив",
  audio: "Аудио",
  ebook: "Книга",
  other: "Файл",
};

function getExt(name: string | null): string {
  if (!name) return "";
  const idx = name.lastIndexOf(".");
  if (idx === -1) return "";
  return name.slice(idx + 1).toLowerCase();
}

function getCategory(name: string | null): Category {
  return CATEGORY_BY_EXT[getExt(name)] ?? "other";
}

function CategoryIcon({
  category,
  className = "w-7 h-7",
}: {
  category: Category;
  className?: string;
}) {
  const sw = 1.9;
  switch (category) {
    case "document":
      return <FileText className={className} strokeWidth={sw} />;
    case "spreadsheet":
      return <FileSpreadsheet className={className} strokeWidth={sw} />;
    case "presentation":
      return <FileType2 className={className} strokeWidth={sw} />;
    case "archive":
      return <Archive className={className} strokeWidth={sw} />;
    case "audio":
      return <FileAudio className={className} strokeWidth={sw} />;
    case "ebook":
      return <Music className={className} strokeWidth={sw} />;
    default:
      return <FileGenericIcon className={className} strokeWidth={sw} />;
  }
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("ru", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function triggerDownload(url: string, filename?: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? "file";
  a.click();
}

export default function FilesView({
  familyId,
  meId,
}: {
  familyId: string;
  meId: string;
}) {
  const { confirm } = useConfirm();
  const { perms } = usePermissions();
  const { openContextMenu } = useContextMenu();
  const canManageOthers =
    !!perms &&
    (perms.is_owner ||
      perms.is_administrator ||
      hasBit(perms.base, PERM.MANAGE_GALLERY));
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [sort, setSort] = useState<SortMode>("newest");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getGallery(familyId)
      .then(setItems)
      .finally(() => setLoading(false));
  }, [familyId]);

  const filtered = useMemo(() => {
    return items
      .filter((it) => it.media_type === "file")
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
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (sort === "oldest")
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        if (sort === "name") return (a.file_name ?? "").localeCompare(b.file_name ?? "");
        if (sort === "size") return (b.file_size ?? 0) - (a.file_size ?? 0);
        return 0;
      });
  }, [items, search, sort]);

  const uploadFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const arr = Array.from(fileList);
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
    },
    [familyId],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  const onDragLeave = useCallback(() => setIsDragging(false), []);
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files) void uploadFiles(e.dataTransfer.files);
    },
    [uploadFiles],
  );

  function toggleSelect(id: string) {
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function deleteItem(id: string) {
    await apiFetch(`/families/${familyId}/gallery/${id}`, { method: "DELETE" });
    setItems((p) => p.filter((i) => i.id !== id));
  }

  function openItemMenu(item: GalleryItem, e: React.MouseEvent) {
    const canDel = item.uploaded_by === meId || canManageOthers;
    const entries: ContextMenuEntry[] = [
      {
        label: "Скачать",
        icon: Download,
        onClick: () => triggerDownload(item.url, item.file_name ?? "file"),
      },
    ];
    if (perms?.is_developer) {
      entries.push({
        label: "Копировать ID",
        icon: Hash,
        onClick: () => void navigator.clipboard?.writeText(item.id),
      });
    }
    if (canDel) {
      entries.push({ type: "separator" });
      entries.push({
        label: "Удалить",
        icon: Trash2,
        danger: true,
        onClick: async () => {
          const ok = await confirm({ title: "Удалить файл?", confirmLabel: "Удалить", tone: "danger" });
          if (ok) await deleteItem(item.id);
        },
      });
    }
    openContextMenu(e, entries);
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
              📄
            </div>
            <p className="text-ink-700 font-semibold font-display text-lg">
              Отпусти для загрузки
            </p>
            <p className="text-ink-400 text-sm font-body mt-1">
              Документы, архивы, аудио и&nbsp;книги
            </p>
          </div>
        </div>
      )}

      <header className="gallery-head glass-topbar glossy">
        <div className="head-row">
          <div className="min-w-0">
            <h2 className="head-title">Файлы</h2>
            <p className="head-sub">
              {filtered.length}{" "}
              {filtered.length === 1
                ? "файл"
                : filtered.length >= 2 && filtered.length <= 4
                  ? "файла"
                  : "файлов"}
            </p>
          </div>

          <div className="head-actions">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="btn-primary"
              type="button"
            >
              <Upload className="w-4 h-4" strokeWidth={2.1} />
              {uploading ? `${uploadProgress}%` : "Загрузить"}
            </button>

            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.odt,.rtf,.txt,.md,.xls,.xlsx,.ods,.csv,.ppt,.pptx,.odp,.zip,.rar,.7z,.tar,.gz,.mp3,.wav,.ogg,.m4a,.flac,.aac,.epub,.fb2,.mobi"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void uploadFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        <div className="head-row secondary">
          <div className="search">
            <span className="search-ic" aria-hidden>
              <Search className="w-3.5 h-3.5" strokeWidth={2.1} />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по имени..."
              className="search-input"
            />
          </div>

          <Select<SortMode>
            value={sort}
            onChange={setSort}
            options={[
              { value: "newest", label: "Сначала новые" },
              { value: "oldest", label: "Сначала старые" },
              { value: "name", label: "По имени" },
              { value: "size", label: "По размеру" },
            ]}
          />

          {selected.size > 0 && (
            <div className="bulk">
              <span className="bulk-text">Выбрано: {selected.size}</span>
              <button onClick={deleteSelected} className="btn-danger" type="button">
                <Trash2 className="w-4 h-4" strokeWidth={2.1} /> Удалить
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
                <FileGenericIcon className="w-7 h-7 text-ink-300" strokeWidth={2} />
              )}
            </div>
            <div>
              <p className="empty-title">
                {search ? "Ничего не найдено" : "Файлов пока нет"}
              </p>
              <p className="empty-sub">
                {search
                  ? "Попробуйте другой запрос"
                  : "Загрузите первый документ, архив или аудио"}
              </p>
            </div>
            {!search && (
              <button
                onClick={() => fileRef.current?.click()}
                className="btn-primary"
                type="button"
              >
                Загрузить файл
              </button>
            )}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <ul className="files-list" role="list">
            {filtered.map((item) => {
              const category = getCategory(item.file_name);
              const ext = getExt(item.file_name).toUpperCase();
              const isSelected = selected.has(item.id);
              const canDel = item.uploaded_by === meId || canManageOthers;
              return (
                <li
                  key={item.id}
                  onContextMenu={(e) => openItemMenu(item, e)}
                  className={`files-row ${isSelected ? "selected" : ""}`}
                >
                  <button
                    type="button"
                    className={`files-row-check ${isSelected ? "on" : ""}`}
                    aria-label={isSelected ? "Снять выделение" : "Выбрать"}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(item.id);
                    }}
                  >
                    {isSelected && <Check className="w-3 h-3" strokeWidth={3} />}
                  </button>

                  <div
                    className={`files-row-icon files-row-icon--${category}`}
                    aria-hidden
                  >
                    <CategoryIcon category={category} />
                    {ext && <span className="files-row-ext">{ext}</span>}
                  </div>

                  <div className="files-row-main">
                    <p className="files-row-title" title={item.file_name ?? "Файл"}>
                      {item.file_name ?? "Файл"}
                    </p>
                    <p className="files-row-sub">
                      <span className="files-row-tag">{CATEGORY_LABEL[category]}</span>
                      <span aria-hidden>·</span>
                      <span>{formatSize(item.file_size)}</span>
                      <span aria-hidden>·</span>
                      <span>{formatDateShort(item.created_at)}</span>
                      {item.uploaded_by_name && (
                        <>
                          <span aria-hidden>·</span>
                          <span>{item.uploaded_by_name}</span>
                        </>
                      )}
                    </p>
                  </div>

                  <div className="files-row-actions">
                    <button
                      type="button"
                      className="files-row-action"
                      onClick={() => triggerDownload(item.url, item.file_name ?? "file")}
                      aria-label="Скачать"
                      title="Скачать"
                    >
                      <Download className="w-5 h-5" strokeWidth={2.1} />
                      <span className="files-row-action-label">Скачать</span>
                    </button>

                    {canDel && (
                      <button
                        type="button"
                        className="files-row-action danger"
                        onClick={async () => {
                          const ok = await confirm({
                            title: "Удалить файл?",
                            confirmLabel: "Удалить",
                            tone: "danger",
                          });
                          if (ok) await deleteItem(item.id);
                        }}
                        aria-label="Удалить"
                        title="Удалить"
                      >
                        <Trash2 className="w-5 h-5" strokeWidth={2.1} />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
