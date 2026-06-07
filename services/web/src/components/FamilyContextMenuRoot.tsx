"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Copy, ShieldCheck } from "lucide-react";
import { useContextMenu } from "@/lib/useContextMenu";
import type { ContextMenuEntry } from "@/components/ContextMenu";

/**
 * Корневой перехватчик ПКМ для всего интерфейса семьи (Discord-style):
 * родное меню браузера подавляется везде. Если конкретный элемент уже обработал
 * ПКМ (через openContextMenu со stopPropagation), сюда событие не доходит.
 * Иначе показываем мини-меню: «Копировать» (при выделении) и для разработчика
 * «Открыть админку».
 */
export default function FamilyContextMenuRoot({
  isDeveloper,
  children,
}: {
  isDeveloper: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { openContextMenu } = useContextMenu();

  function handleRootContextMenu(e: React.MouseEvent) {
    const selection =
      typeof window !== "undefined" ? window.getSelection?.()?.toString().trim() : "";

    const entries: ContextMenuEntry[] = [];
    if (selection) {
      entries.push({
        label: "Копировать",
        icon: Copy,
        onClick: () => void navigator.clipboard?.writeText(selection),
      });
    }
    if (isDeveloper) {
      entries.push({
        label: "Открыть админку",
        icon: ShieldCheck,
        onClick: () => router.push("/admin"),
      });
    }

    if (entries.length === 0) {
      // Нет пунктов — всё равно гасим родное меню (как в Discord).
      e.preventDefault();
      return;
    }
    openContextMenu(e, entries);
  }

  return (
    <div style={{ display: "contents" }} onContextMenu={handleRootContextMenu}>
      {children}
    </div>
  );
}
