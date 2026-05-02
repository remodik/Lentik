"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ShieldAlert, ShieldX } from "lucide-react";

const ACK_KEY = "lentik_18plus_acks";

function readAcks(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(ACK_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function persistAcks(acks: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACK_KEY, JSON.stringify([...acks]));
  } catch {}
}

export function ageInYears(birthday: string | null | undefined): number | null {
  if (!birthday) return null;
  const bd = new Date(birthday);
  if (Number.isNaN(bd.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - bd.getFullYear();
  const monthDiff = now.getMonth() - bd.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < bd.getDate())) {
    age -= 1;
  }
  return Math.max(0, age);
}

export type Age18GateStatus = "ok" | "needs_consent" | "denied";

export function getAgeGateStatus(
  is18Plus: boolean,
  birthday: string | null | undefined,
  targetId: string,
): Age18GateStatus {
  if (!is18Plus) return "ok";
  const age = ageInYears(birthday);
  if (age === null || age < 18) return "denied";
  const acks = readAcks();
  if (acks.has(targetId)) return "ok";
  return "needs_consent";
}

type Props = {
  status: Age18GateStatus;
  targetId: string;
  targetName: string;
  reason: "no_birthday" | "underage" | "consent";
  onAccept: () => void;
  onCancel: () => void;
};

export default function Age18Gate({
  status,
  targetId,
  targetName,
  reason,
  onAccept,
  onCancel,
}: Props) {
  const [busy, setBusy] = useState(false);

  function handleAccept() {
    setBusy(true);
    const acks = readAcks();
    acks.add(targetId);
    persistAcks(acks);
    onAccept();
  }

  if (status === "denied") {
    const title =
      reason === "no_birthday"
        ? "Доступ ограничен"
        : "Доступ ограничен";
    const subtitle =
      reason === "no_birthday"
        ? "Чтобы зайти в этот раздел, заполните дату рождения в профиле — нам важно убедиться, что вам уже исполнилось 18 лет."
        : "В этом разделе содержится контент 18+. Возрастные ограничения не позволяют вам сюда заходить.";
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center p-6">
        <div
          className="max-w-md w-full text-center rounded-3xl border p-8"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)" }}
        >
          <div className="w-12 h-12 mx-auto rounded-full grid place-items-center mb-4 bg-red-50 text-red-600">
            <ShieldX className="w-6 h-6" strokeWidth={2.2} />
          </div>
          <h2 className="font-display text-lg text-ink-900">{title}</h2>
          <p className="mt-2 text-sm text-ink-500 font-body leading-relaxed">{subtitle}</p>
          <div className="mt-6 flex items-center justify-center gap-2">
            <button type="button" className="ui-btn ui-btn-ghost" onClick={onCancel}>
              Вернуться
            </button>
          </div>
        </div>
      </div>
    );
  }

  // needs_consent
  return (
    <div className="flex-1 min-h-0 flex items-center justify-center p-6">
      <div
        className="max-w-md w-full text-center rounded-3xl border p-8"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)" }}
      >
        <div className="w-12 h-12 mx-auto rounded-full grid place-items-center mb-4 bg-amber-50 text-amber-600">
          <ShieldAlert className="w-6 h-6" strokeWidth={2.2} />
        </div>
        <h2 className="font-display text-lg text-ink-900">
          Раздел с возрастным ограничением
        </h2>
        <p className="mt-2 text-sm text-ink-500 font-body leading-relaxed">
          В разделе <span className="font-semibold text-ink-700">«# {targetName}»</span> может
          содержаться контент для взрослых. Хотите продолжить?
        </p>
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            type="button"
            className="ui-btn ui-btn-ghost"
            onClick={onCancel}
            disabled={busy}
          >
            Вернуться
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-primary"
            onClick={handleAccept}
            disabled={busy}
            data-testid="age18-continue"
          >
            Продолжить
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Хук для использования в ChatView/ChannelsView.
 * Возвращает текущий статус и обновляется когда пользователь принимает.
 */
export function useAge18Gate(
  targetId: string,
  is18Plus: boolean,
  birthday: string | null | undefined,
) {
  const [acked, setAcked] = useState<boolean>(() => readAcks().has(targetId));

  useEffect(() => {
    setAcked(readAcks().has(targetId));
  }, [targetId]);

  const age = useMemo(() => ageInYears(birthday), [birthday]);

  const status: Age18GateStatus = useMemo(() => {
    if (!is18Plus) return "ok";
    if (age === null || age < 18) return "denied";
    return acked ? "ok" : "needs_consent";
  }, [is18Plus, age, acked]);

  const reason: "no_birthday" | "underage" | "consent" = useMemo(() => {
    if (!is18Plus) return "consent";
    if (age === null) return "no_birthday";
    if (age < 18) return "underage";
    return "consent";
  }, [is18Plus, age]);

  function accept() {
    const acks = readAcks();
    acks.add(targetId);
    persistAcks(acks);
    setAcked(true);
  }

  return { status, reason, accept };
}
