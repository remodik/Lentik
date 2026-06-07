"use client";

import { useState } from "react";
import { adminBanUser } from "@/lib/api";
import Modal from "@/components/Modal";

type DurationPreset = "1h" | "24h" | "7d" | "30d" | "permanent";

const PRESETS: { value: DurationPreset; label: string }[] = [
  { value: "1h", label: "1 час" },
  { value: "24h", label: "1 день" },
  { value: "7d", label: "7 дней" },
  { value: "30d", label: "30 дней" },
  { value: "permanent", label: "Навсегда" },
];

function computeExpiry(preset: DurationPreset): string | null {
  if (preset === "permanent") return null;
  const now = Date.now();
  const ms: Record<Exclude<DurationPreset, "permanent">, number> = {
    "1h": 3600_000,
    "24h": 86_400_000,
    "7d": 7 * 86_400_000,
    "30d": 30 * 86_400_000,
  };
  return new Date(now + ms[preset]).toISOString();
}

export default function BanUserModal({
  userId,
  displayName,
  onClose,
  onBanned,
}: {
  userId: string;
  displayName: string;
  onClose: () => void;
  onBanned?: () => void;
}) {
  const [reason, setReason] = useState("");
  const [preset, setPreset] = useState<DurationPreset>("24h");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleBan() {
    if (!reason.trim()) {
      setError("Укажите причину");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await adminBanUser(userId, {
        reason: reason.trim(),
        expires_at: computeExpiry(preset),
      });
      onBanned?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось забанить");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      eyebrow="Модерация"
      title={`Забанить ${displayName}`}
      ariaLabel="Бан пользователя"
      closeOnBackdrop={!loading}
    >
        <label className="text-xs text-ink-500 font-body block mb-1.5">Причина</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="За что блокируется аккаунт"
          className="w-full rounded-xl border border-[color:var(--border-glass)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-ink-700 font-body focus:outline-none focus:ring-2 focus:ring-warm-200 resize-none"
          autoFocus
        />

        <label className="text-xs text-ink-500 font-body block mt-4 mb-1.5">Срок</label>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPreset(p.value)}
              className={`px-3 py-1.5 rounded-xl text-sm font-body border transition ${
                preset === p.value
                  ? "bg-ink-900 text-cream-50 border-ink-900"
                  : "bg-[var(--bg-surface-subtle)] text-ink-600 border-[color:var(--border-glass)] hover:bg-[var(--bg-surface)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {error && <p className="text-[color:var(--danger-fg-strong)] text-sm font-body mt-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            className="ui-btn ui-btn-subtle"
            onClick={onClose}
            disabled={loading}
          >
            Отмена
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-danger"
            onClick={() => void handleBan()}
            disabled={loading}
          >
            {loading ? "Бан…" : "Забанить"}
          </button>
        </div>
    </Modal>
  );
}
