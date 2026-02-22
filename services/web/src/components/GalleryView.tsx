"use client";

import React, { useEffect, useState, useRef } from "react";
import { getGallery, type GalleryItem } from "@/lib/api";

export default function GalleryView({ familyId }: { familyId: string }) {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<GalleryItem | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getGallery(familyId).then(setItems).finally(() => setLoading(false));
  }, [familyId]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/families/${familyId}/gallery`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) throw new Error("Ошибка загрузки");
      const item: GalleryItem = await res.json();
      setItems((prev) => [item, ...prev]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-4 border-b border-cream-200 bg-white flex items-center justify-between">
        <h2 className="font-display text-lg text-ink-900">Галерея</h2>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="px-4 py-2 bg-ink-900 text-cream-50 rounded-xl text-sm font-body
                     hover:bg-ink-700 transition-all disabled:opacity-50"
        >
          {uploading ? "Загрузка…" : "+ Фото"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={handleUpload}
        />
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="flex justify-center pt-16">
            <span className="text-ink-300 animate-pulse text-sm">Загрузка…</span>
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-ink-300">
            <span className="text-4xl">🖼️</span>
            <p className="font-body text-sm">Галерея пуста — загрузи первое фото!</p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 lg:grid-cols-4">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelected(item)}
              className="aspect-square rounded-2xl overflow-hidden bg-cream-100
                         hover:opacity-90 transition-all active:scale-[0.97]"
            >
              {item.media_type === "image" ? (
                <img
                  src={item.url}
                  alt={item.caption ?? ""}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl">
                  🎬
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <div
          className="fixed inset-0 bg-ink-900/80 flex items-center justify-center z-50 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="max-w-2xl w-full bg-white rounded-3xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {selected.media_type === "image" ? (
              <img src={selected.url} alt="" className="w-full max-h-[70vh] object-contain" />
            ) : (
              <video src={selected.url} controls className="w-full max-h-[70vh]" />
            )}
            {selected.caption && (
              <p className="px-6 py-4 text-ink-700 font-body text-sm">{selected.caption}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}