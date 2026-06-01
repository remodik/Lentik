"use client";

import React, { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useUserMode } from "@/lib/useUserMode";
import { useConfirm } from "@/components/ConfirmDialog";

type Props = {
  /** UUID (или иной идентификатор) для копирования. */
  value: string;
  /** Человекочитаемая подпись объекта — для тултипа/уведомления. */
  label?: string;
  className?: string;
  /** Остановить всплытие клика (когда кнопка внутри кликабельной строки). */
  stopPropagation?: boolean;
};

/**
 * Кнопка «копировать UUID». Рендерится ТОЛЬКО в режиме «эксперт».
 * Чисто клиентская диагностика — не влияет на не-expert пользователей.
 */
export default function CopyIdButton({
  value,
  label,
  className,
  stopPropagation = true,
}: Props) {
  const { isExpert } = useUserMode();
  const { notify } = useConfirm();
  const [copied, setCopied] = useState(false);

  if (!isExpert || !value) return null;

  async function handleCopy(e: React.MouseEvent) {
    if (stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
      void notify({ title: "ID скопирован", description: label ? `${label}: ${value}` : value });
    } catch {
      void notify({ title: "Не удалось скопировать", tone: "danger" });
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={
        className ??
        "inline-flex items-center justify-center w-5 h-5 rounded-md text-ink-400 hover:text-ink-800 hover:bg-white/60 transition shrink-0"
      }
      title={`Скопировать ID${label ? ` (${label})` : ""}: ${value}`}
      aria-label="Скопировать ID"
      data-expert-copy-id
    >
      {copied ? (
        <Check className="w-3 h-3" strokeWidth={2.6} />
      ) : (
        <Copy className="w-3 h-3" strokeWidth={2.2} />
      )}
    </button>
  );
}

/**
 * Строка с моноширинным UUID и кнопкой копирования. Самогейтится по «эксперту».
 * Удобно использовать внутри инлайнового JSX, где нельзя вызвать useUserMode
 * напрямую (например, список чатов, который рендерится тем же компонентом, что
 * объявляет UserModeProvider).
 */
export function ExpertIdRow({
  value,
  label,
  className,
  onClick,
}: {
  value: string;
  label?: string;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const { isExpert } = useUserMode();
  if (!isExpert || !value) return null;
  return (
    <div
      className={
        className ??
        "mt-1 flex items-center gap-1 font-mono text-[10px] text-ink-400"
      }
      onClick={onClick}
    >
      <CopyIdButton value={value} label={label} />
      <span className="truncate">{value}</span>
    </div>
  );
}
