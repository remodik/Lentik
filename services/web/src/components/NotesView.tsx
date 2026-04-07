"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import {
  createNote,
  deleteNote,
  getNotes,
  updateNote,
  type Note,
} from "@/lib/api";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function NoteCard({
  note,
  meId,
  onEdit,
  onDelete,
}: {
  note: Note;
  meId: string;
  onEdit: (note: Note) => void;
  onDelete: (id: string) => void;
}) {
  const isAuthor = note.author_id === meId;
  const preview = note.content.length > 160
    ? `${note.content.slice(0, 160)}…`
    : note.content;

  return (
    <div
      className="group rounded-2xl border p-4 transition hover:shadow-md"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)" }}
      data-testid={`note-card-${note.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-ink-900 text-[0.97rem] leading-snug truncate flex-1">
          {note.title}
        </h3>
        {isAuthor && (
          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
            <button
              type="button"
              onClick={() => onEdit(note)}
              className="w-7 h-7 rounded-lg grid place-items-center text-ink-400 hover:text-ink-700 hover:bg-white/60 transition"
              title="Редактировать"
              data-testid={`note-edit-${note.id}`}
            >
              <Pencil className="w-3.5 h-3.5" strokeWidth={2.2} />
            </button>
            <button
              type="button"
              onClick={() => onDelete(note.id)}
              className="w-7 h-7 rounded-lg grid place-items-center text-ink-400 hover:text-red-500 hover:bg-red-50 transition"
              title="Удалить"
              data-testid={`note-delete-${note.id}`}
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={2.2} />
            </button>
          </div>
        )}
      </div>

      {preview && (
        <p className="mt-2 text-sm text-ink-600 font-body leading-relaxed whitespace-pre-wrap break-words line-clamp-4">
          {preview}
        </p>
      )}

      <p className="mt-3 text-[11px] text-ink-400 font-body">
        {formatDate(note.updated_at)}
      </p>
    </div>
  );
}

type ModalMode = "create" | "edit";

export default function NotesView({
  familyId,
  meId,
}: {
  familyId: string;
  meId: string;
}) {
  const [tab, setTab] = useState<"personal" | "family">("personal");
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formIsPersonal, setFormIsPersonal] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getNotes(familyId);
      setNotes(data);
    } catch (e) {
      console.error("getNotes failed", e);
    } finally {
      setLoading(false);
    }
  }, [familyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const personalNotes = notes.filter((n) => n.is_personal && n.author_id === meId);
  const familyNotes = notes.filter((n) => !n.is_personal);
  const displayed = tab === "personal" ? personalNotes : familyNotes;

  function openCreate() {
    setModalMode("create");
    setEditingNote(null);
    setFormTitle("");
    setFormContent("");
    setFormIsPersonal(tab === "personal");
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(note: Note) {
    setModalMode("edit");
    setEditingNote(note);
    setFormTitle(note.title);
    setFormContent(note.content);
    setFormIsPersonal(note.is_personal);
    setFormError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingNote(null);
  }

  async function handleSave() {
    if (!formTitle.trim()) {
      setFormError("Введите заголовок");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      if (modalMode === "create") {
        const created = await createNote(familyId, {
          title: formTitle.trim(),
          content: formContent.trim(),
          is_personal: formIsPersonal,
        });
        setNotes((prev) => [created, ...prev]);
      } else if (editingNote) {
        const updated = await updateNote(editingNote.id, {
          title: formTitle.trim(),
          content: formContent.trim(),
          is_personal: formIsPersonal,
        });
        setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      }
      closeModal();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (e) {
      console.error("deleteNote failed", e);
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 px-5 pt-5 pb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 rounded-xl border"
          style={{ background: "var(--bg-surface-subtle)", borderColor: "var(--border-warm-dim)" }}>
          <button
            type="button"
            onClick={() => setTab("personal")}
            className={`px-3.5 py-1.5 rounded-lg text-[13px] font-semibold font-body transition ${
              tab === "personal"
                ? "bg-white text-ink-900 shadow-sm"
                : "text-ink-500 hover:text-ink-700"
            }`}
            data-testid="notes-tab-personal"
          >
            Личные
          </button>
          <button
            type="button"
            onClick={() => setTab("family")}
            className={`px-3.5 py-1.5 rounded-lg text-[13px] font-semibold font-body transition ${
              tab === "family"
                ? "bg-white text-ink-900 shadow-sm"
                : "text-ink-500 hover:text-ink-700"
            }`}
            data-testid="notes-tab-family"
          >
            Семейные
          </button>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="ui-btn ui-btn-primary inline-flex items-center gap-1.5"
          data-testid="note-create-btn"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2.4} />
          Заметка
        </button>
      </div>

      <div className="flex-1 overflow-y-auto sidebar-scroll px-5 pb-5">
        {loading ? (
          <div className="text-sm text-ink-400 font-body py-6 text-center">Загрузка…</div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <p className="text-ink-800 font-semibold font-display text-base">
              {tab === "personal" ? "Личных заметок нет" : "Семейных заметок нет"}
            </p>
            <p className="text-ink-400 text-sm font-body">
              Нажмите «Заметка», чтобы создать первую
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-1">
            {displayed.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                meId={meId}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-[80] bg-black/35 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !saving && closeModal()}
          role="dialog"
          aria-modal="true"
          aria-label={modalMode === "create" ? "Создать заметку" : "Редактировать заметку"}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-white/70 bg-white/88 backdrop-blur-2xl p-6 shadow-[0_30px_90px_rgba(28,23,20,0.22)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-xl text-ink-900">
                {modalMode === "create" ? "Новая заметка" : "Редактировать"}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="w-8 h-8 rounded-lg grid place-items-center text-ink-400 hover:text-ink-700 hover:bg-white/60 transition"
                disabled={saving}
              >
                <X className="w-4 h-4" strokeWidth={2.3} />
              </button>
            </div>

            <div className="space-y-3">
              <input
                className="input-field"
                placeholder="Заголовок"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                maxLength={200}
                autoFocus
                data-testid="note-form-title"
              />

              <textarea
                className="input-field min-h-[160px] resize-none"
                placeholder="Содержание (поддерживается Markdown)"
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                maxLength={50000}
                data-testid="note-form-content"
              />

              <div className="flex items-center gap-3 p-3 rounded-xl border"
                style={{ background: "var(--bg-surface-subtle)", borderColor: "var(--border-warm-dim)" }}>
                <span className="text-sm text-ink-600 font-body flex-1">
                  {formIsPersonal ? "Личная заметка" : "Семейная заметка"}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!formIsPersonal}
                  onClick={() => setFormIsPersonal((v) => !v)}
                  className={`relative w-11 h-6 rounded-full border transition ${
                    !formIsPersonal
                      ? "bg-ink-900 border-ink-900"
                      : "bg-ink-200 border-ink-200"
                  }`}
                  data-testid="note-form-toggle"
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                      !formIsPersonal ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
                <span className="text-[11px] text-ink-400 font-body">
                  {formIsPersonal ? "Видна только вам" : "Видна всей семье"}
                </span>
              </div>

              {formError && (
                <p className="text-sm text-red-500 font-body">{formError}</p>
              )}

              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  className="ui-btn ui-btn-subtle"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  className="ui-btn ui-btn-primary"
                  onClick={() => void handleSave()}
                  disabled={saving || !formTitle.trim()}
                  data-testid="note-form-save"
                >
                  {saving ? "Сохранение…" : "Сохранить"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
