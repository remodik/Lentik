"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Plus, Users, Wallet, X } from "lucide-react";
import {
  createExpense,
  getBalances,
  getExpenses,
  type Balance,
  type Expense,
  type FamilyMember,
} from "@/lib/api";
import { getAuthToken, wsUrl } from "@/lib/api-base";

function parseNumber(value: number | string): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatExpenseAmount(value: number | string, currency = "RUB"): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseNumber(value));
}

function formatSignedRub(value: number): string {
  const abs = Math.abs(value);
  const amount = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  if (value > 0) return `+${amount} ₽`;
  if (value < 0) return `-${amount} ₽`;
  return `0.00 ₽`;
}

function splitEvenly(totalAmount: number, userIds: string[]): Record<string, string> {
  if (!userIds.length || totalAmount <= 0) return {};

  const totalCents = Math.round(totalAmount * 100);
  const base = Math.floor(totalCents / userIds.length);
  const remainder = totalCents % userIds.length;

  const result: Record<string, string> = {};
  userIds.forEach((userId, index) => {
    const cents = base + (index < remainder ? 1 : 0);
    result[userId] = (cents / 100).toFixed(2);
  });
  return result;
}

type Props = {
  familyId: string;
  meId: string;
  members: FamilyMember[];
};

export default function BudgetView({ familyId, meId, members }: Props) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState("");
  const [participants, setParticipants] = useState<string[]>([]);
  const [shares, setShares] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    setLoadingError("");
    try {
      const [expensesData, balancesData] = await Promise.all([
        getExpenses(familyId),
        getBalances(familyId),
      ]);
      setExpenses(expensesData);
      setBalances(balancesData);
    } catch (error) {
      setLoadingError(error instanceof Error ? error.message : "Не удалось загрузить бюджет");
    } finally {
      setLoading(false);
    }
  }, [familyId]);

  useEffect(() => {
    setLoading(true);
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!familyId) return;

    let alive = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;

    const stopPing = () => {
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = null;
    };

    const connect = () => {
      if (!alive) return;

      const token = getAuthToken();
      const query = token ? `?token=${encodeURIComponent(token)}` : "";
      const ws = new WebSocket(wsUrl(`/families/${familyId}/ws${query}`));

      ws.onopen = () => {
        stopPing();
        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send("ping");
        }, 30000);
      };

      ws.onmessage = (event) => {
        if (!alive || typeof event.data !== "string") return;

        try {
          const payload = JSON.parse(event.data) as {
            type?: string;
            family_id?: string;
          };

          if (
            payload.type === "expense_created" &&
            payload.family_id === familyId
          ) {
            void loadData();
          }
        } catch {}
      };

      ws.onclose = () => {
        stopPing();
        if (!alive) return;
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        try { ws.close(); } catch {}
      };

      return ws;
    };

    let ws = connect();

    return () => {
      alive = false;
      stopPing();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.close(); } catch {}
      }
      ws = undefined;
    };
  }, [familyId, loadData]);

  function resetForm() {
    const defaultPayer =
      members.find((member) => member.user_id === meId)?.user_id
      ?? members[0]?.user_id
      ?? "";
    const allParticipants = members.map((member) => member.user_id);

    setTitle("");
    setAmount("");
    setPaidBy(defaultPayer);
    setParticipants(allParticipants);
    setShares({});
    setFormError("");
  }

  function openModal() {
    resetForm();
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
  }

  function toggleParticipant(userId: string) {
    setParticipants((prev) => {
      const hasUser = prev.includes(userId);
      if (hasUser) return prev.filter((id) => id !== userId);
      return [...prev, userId];
    });

    setShares((prev) => {
      const next = { ...prev };
      if (userId in next) {
        delete next[userId];
      } else {
        next[userId] = "0.00";
      }
      return next;
    });
  }

  function applyEvenSplit() {
    const numericAmount = Number(amount.replace(",", "."));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setFormError("Введите корректную сумму");
      return;
    }
    if (participants.length === 0) {
      setFormError("Выберите участников");
      return;
    }

    setShares(splitEvenly(numericAmount, participants));
    setFormError("");
  }

  async function submitExpense(e: React.FormEvent) {
    e.preventDefault();
    const numericAmount = Number(amount.replace(",", "."));

    if (!title.trim()) {
      setFormError("Введите название");
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setFormError("Введите корректную сумму");
      return;
    }
    if (!paidBy) {
      setFormError("Выберите, кто оплатил");
      return;
    }
    if (participants.length === 0) {
      setFormError("Выберите участников");
      return;
    }

    const splitRows = participants.map((userId) => {
      const share = Number((shares[userId] ?? "").replace(",", "."));
      return { user_id: userId, share };
    });

    if (splitRows.some((split) => !Number.isFinite(split.share) || split.share <= 0)) {
      setFormError("Все доли должны быть больше 0");
      return;
    }

    const amountCents = Math.round(numericAmount * 100);
    const sumCents = splitRows.reduce((acc, split) => acc + Math.round(split.share * 100), 0);
    if (amountCents !== sumCents) {
      setFormError("Сумма долей должна быть равна общей сумме");
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      await createExpense(familyId, {
        title: title.trim(),
        amount: Number((amountCents / 100).toFixed(2)),
        currency: "RUB",
        paid_by: paidBy,
        splits: splitRows.map((split) => ({
          user_id: split.user_id,
          share: Number((Math.round(split.share * 100) / 100).toFixed(2)),
        })),
      });
      setModalOpen(false);
      await loadData();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Не удалось создать расход");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full min-h-0 grid grid-cols-1 xl:grid-cols-[1.65fr_1fr] gap-4 p-5 overflow-hidden">
      <section
        className="rounded-3xl border h-full min-h-0 flex flex-col"
        style={{ borderColor: "var(--border-glass)", background: "var(--bg-surface)" }}
      >
        <header
          className="shrink-0 px-5 py-4 border-b flex items-center justify-between gap-3"
          style={{ borderColor: "var(--border-warm-dim)" }}
        >
          <div className="min-w-0">
            <h2 className="font-display text-xl text-ink-900 truncate">Расходы</h2>
            <p className="text-xs text-ink-500 font-body mt-0.5">
              Общие траты семьи
            </p>
          </div>
          <button
            type="button"
            className="ui-btn ui-btn-primary inline-flex items-center gap-1.5"
            onClick={openModal}
            data-testid="budget-add-expense"
          >
            <Plus className="w-4 h-4" strokeWidth={2.4} />
            Расход
          </button>
        </header>

        <div className="flex-1 overflow-y-auto sidebar-scroll px-5 py-4">
          {loading ? (
            <p className="text-sm text-ink-400 font-body text-center py-8">Загрузка…</p>
          ) : loadingError ? (
            <p className="text-sm text-red-500 font-body text-center py-8">{loadingError}</p>
          ) : expenses.length === 0 ? (
            <div className="h-full grid place-items-center py-10 text-center">
              <div>
                <Wallet className="w-8 h-8 text-ink-300 mx-auto mb-3" strokeWidth={1.8} />
                <p className="font-display text-lg text-ink-800">Расходов пока нет</p>
                <p className="text-sm text-ink-400 font-body mt-1">
                  Добавьте первый расход
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {expenses.map((expense) => (
                <div
                  key={expense.id}
                  className="rounded-2xl border px-4 py-3"
                  style={{ borderColor: "var(--border-glass)", background: "var(--bg-surface-subtle)" }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink-900 truncate">{expense.title}</p>
                      <p className="text-xs text-ink-500 font-body mt-1 truncate">
                        Оплатил: {expense.paid_by_name ?? "Участник"}
                      </p>
                    </div>
                    <p className="font-semibold text-ink-900 whitespace-nowrap">
                      {formatExpenseAmount(expense.amount, expense.currency)}
                    </p>
                  </div>
                  <p className="text-[11px] text-ink-400 font-body mt-2">
                    {new Date(expense.created_at).toLocaleString("ru", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section
        className="rounded-3xl border h-full min-h-0 flex flex-col"
        style={{ borderColor: "var(--border-glass)", background: "var(--bg-surface)" }}
      >
        <header
          className="shrink-0 px-5 py-4 border-b flex items-center gap-2"
          style={{ borderColor: "var(--border-warm-dim)" }}
        >
          <Users className="w-4 h-4 text-ink-500" strokeWidth={2.2} />
          <h2 className="font-display text-lg text-ink-900">Баланс</h2>
        </header>

        <div className="flex-1 overflow-y-auto sidebar-scroll px-5 py-4">
          {loading ? (
            <p className="text-sm text-ink-400 font-body text-center py-8">Загрузка…</p>
          ) : balances.length === 0 ? (
            <p className="text-sm text-ink-400 font-body text-center py-8">Нет данных</p>
          ) : (
            <div className="space-y-2.5">
              {balances.map((row) => {
                const value = parseNumber(row.balance);
                const colorClass =
                  value > 0
                    ? "text-green-600"
                    : value < 0
                      ? "text-red-500"
                      : "text-ink-500";

                return (
                  <div
                    key={row.user_id}
                    className="rounded-2xl border px-4 py-3 flex items-center justify-between gap-3"
                    style={{ borderColor: "var(--border-glass)", background: "var(--bg-surface-subtle)" }}
                  >
                    <p className="text-sm font-semibold text-ink-900 truncate">
                      {row.display_name}
                    </p>
                    <p className={`text-sm font-semibold whitespace-nowrap ${colorClass}`}>
                      {formatSignedRub(value)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {modalOpen && (
        <div
          className="fixed inset-0 z-[80] bg-black/35 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
          aria-label="Добавить расход"
        >
          <div
            className="w-full max-w-2xl rounded-3xl border border-white/70 bg-white/88 backdrop-blur-2xl p-6 shadow-[0_30px_90px_rgba(28,23,20,0.22)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 mb-5">
              <h3 className="font-display text-xl text-ink-900">Новый расход</h3>
              <button
                type="button"
                className="w-8 h-8 rounded-lg grid place-items-center text-ink-400 hover:text-ink-700 hover:bg-white/60 transition"
                onClick={closeModal}
                disabled={saving}
              >
                <X className="w-4 h-4" strokeWidth={2.3} />
              </button>
            </div>

            <form onSubmit={(event) => void submitExpense(event)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-ink-400 uppercase tracking-widest font-body mb-1.5 block">
                    Название
                  </label>
                  <input
                    className="input-field"
                    placeholder="Например, Продукты"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={255}
                    autoFocus
                    data-testid="budget-title-input"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-ink-400 uppercase tracking-widest font-body mb-1.5 block">
                    Сумма
                  </label>
                  <input
                    type="number"
                    className="input-field"
                    placeholder="0.00"
                    min={0.01}
                    step={0.01}
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    data-testid="budget-amount-input"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-ink-400 uppercase tracking-widest font-body mb-1.5 block">
                  Кто оплатил
                </label>
                <select
                  className="input-field"
                  value={paidBy}
                  onChange={(event) => setPaidBy(event.target.value)}
                  data-testid="budget-paid-by-select"
                >
                  {members.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.display_name}
                    </option>
                  ))}
                </select>
              </div>

              <div
                className="rounded-2xl border px-4 py-3"
                style={{ borderColor: "var(--border-warm-dim)", background: "var(--bg-surface-subtle)" }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <p className="text-sm font-semibold text-ink-800">Участники и доли</p>
                  <button
                    type="button"
                    className="ui-btn ui-btn-subtle !py-1.5 !px-3"
                    onClick={applyEvenSplit}
                    data-testid="budget-split-evenly"
                  >
                    Разделить поровну
                  </button>
                </div>

                <div className="space-y-2">
                  {members.map((member) => {
                    const selected = participants.includes(member.user_id);
                    return (
                      <div
                        key={member.user_id}
                        className="grid grid-cols-[auto_1fr_110px] items-center gap-3"
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleParticipant(member.user_id)}
                          className="w-4 h-4 accent-ink-900"
                        />
                        <span className="text-sm text-ink-700 font-body truncate">
                          {member.display_name}
                        </span>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          className="input-field !py-2 !px-2.5 text-sm"
                          value={shares[member.user_id] ?? ""}
                          onChange={(event) =>
                            setShares((prev) => ({ ...prev, [member.user_id]: event.target.value }))
                          }
                          disabled={!selected}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {formError && (
                <p className="text-sm text-red-500 font-body">{formError}</p>
              )}

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  className="ui-btn ui-btn-subtle"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="ui-btn ui-btn-primary"
                  disabled={saving}
                  data-testid="budget-submit-expense"
                >
                  {saving ? "Сохранение…" : "Сохранить"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
