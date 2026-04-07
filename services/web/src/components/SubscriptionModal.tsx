"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";

type Plan = {
  id: string;
  name: string;
  price: string;
  period: string;
  note: string;
  perks: string[];
  accent?: boolean;
};

const PLANS: Plan[] = [
  {
    id: "plus-monthly",
    name: "Plus",
    price: "399 ₽",
    period: "/ месяц",
    note: "Для одной семьи",
    perks: [
      "До 20 семей",
      "Приоритетная поддержка",
      "Расширенные настройки ролей",
    ],
  },
  {
    id: "plus-yearly",
    name: "Plus Yearly",
    price: "3 990 ₽",
    period: "/ год",
    note: "Экономия ~17%",
    perks: [
      "Все возможности Plus",
      "Ранний доступ к новым функциям",
      "Годовая цена ниже месячной",
    ],
    accent: true,
  },
  {
    id: "team",
    name: "Team",
    price: "1 290 ₽",
    period: "/ месяц",
    note: "Для активных сообществ",
    perks: [
      "Безлимит по семьям",
      "Отдельные рабочие пространства",
      "Совместное управление доступами",
    ],
  },
];

const COMMON_BENEFITS = [
  "Создание больше 5 семей",
  "Гибкое управление доступом",
  "Приоритетные обновления и поддержка",
];

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function SubscriptionModal({ open, onClose }: Props) {
  const [selectedPlanId, setSelectedPlanId] = useState<string>(PLANS[1].id);

  const selectedPlan = useMemo(
    () => PLANS.find((p) => p.id === selectedPlanId) ?? PLANS[0],
    [selectedPlanId],
  );

  function handleSubscribe() {
    alert(
      `Оплата пока не подключена.\nЗаглушка: выбран тариф «${selectedPlan.name}».`,
    );
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[85] bg-black/40 backdrop-blur-sm p-4 flex items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Покупка подписки"
    >
      <div
        className="w-full max-w-4xl rounded-[28px] border border-white/65 bg-white/85 backdrop-blur-2xl shadow-[0_30px_90px_rgba(28,23,20,0.24)] p-5 sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-ink-400 font-body">
              Family plans
            </p>
            <h2 className="font-display text-3xl text-ink-900 leading-tight mt-1">
              Выбери подписку
            </h2>
            <p className="text-sm text-ink-500 mt-2 font-body max-w-xl">
              На бесплатном плане можно создать до 5 семей. Для большего
              количества нужен платный тариф.
            </p>
          </div>

          <button
            type="button"
            className="ui-btn ui-btn-icon shrink-0"
            onClick={onClose}
            aria-label="Закрыть"
            title="Закрыть"
          >
            <X className="w-4 h-4" strokeWidth={2.3} />
          </button>
        </div>

        <div className="grid md:grid-cols-3 gap-3.5">
          {PLANS.map((plan) => {
            const active = plan.id === selectedPlanId;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlanId(plan.id)}
                className={`text-left rounded-3xl border p-4 transition-all ${
                  active
                    ? "border-ink-900 bg-ink-900 text-cream-50 shadow-[0_20px_50px_rgba(17,24,39,0.3)]"
                    : "border-white/70 bg-white/55 text-ink-800 hover:bg-white/75"
                }`}
              >
                <p
                  className={`text-xs font-semibold tracking-[0.14em] uppercase ${
                    active ? "text-cream-200" : "text-ink-400"
                  }`}
                >
                  {plan.name}
                </p>
                <div className="mt-2 flex items-end gap-1.5">
                  <p className="font-display text-3xl leading-none">{plan.price}</p>
                  <p
                    className={`text-sm pb-1 ${active ? "text-cream-200" : "text-ink-400"}`}
                  >
                    {plan.period}
                  </p>
                </div>
                <p
                  className={`mt-2 text-xs ${active ? "text-cream-200" : "text-ink-500"}`}
                >
                  {plan.note}
                </p>

                <ul className="mt-4 space-y-1.5">
                  {plan.perks.map((perk) => (
                    <li
                      key={perk}
                      className={`text-xs font-body ${
                        active ? "text-cream-100" : "text-ink-600"
                      }`}
                    >
                      • {perk}
                    </li>
                  ))}
                </ul>

                {plan.accent && !active && (
                  <p className="mt-4 text-xs font-semibold text-warm-700">
                    Популярный выбор
                  </p>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-5 rounded-2xl border border-white/65 bg-white/60 p-4">
          <p className="text-sm font-semibold text-ink-900 font-body">
            Преимущества подписки
          </p>
          <ul className="mt-2 grid sm:grid-cols-3 gap-2">
            {COMMON_BENEFITS.map((item) => (
              <li
                key={item}
                className="text-xs text-ink-600 font-body rounded-xl border border-white/60 bg-white/60 px-3 py-2"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 flex flex-col sm:flex-row gap-2.5 sm:items-center sm:justify-between">
          <p className="text-xs text-ink-400 font-body">
            Оплата пока как заглушка. После нажатия покажем выбранный тариф.
          </p>
          <div className="flex gap-2">
            <button type="button" className="ui-btn ui-btn-subtle" onClick={onClose}>
              Пока нет
            </button>
            <button
              type="button"
              className="ui-btn ui-btn-primary"
              onClick={handleSubscribe}
            >
              Оформить {selectedPlan.name}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
