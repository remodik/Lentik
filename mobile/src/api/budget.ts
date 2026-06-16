import client from "./client";
import type {
  BudgetCategories,
  BudgetMemberBalance,
  BudgetSummary,
  BudgetTransaction,
  BudgetTransactionCreateInput,
  BudgetTransactionUpdateInput,
  ListTransactionsFilter,
} from "./types";

// GET /families/:id/budget/transactions — список (фильтры год/месяц/тип)
export const listTransactions = (
  familyId: string,
  { year, month, type }: ListTransactionsFilter = {},
) => {
  const params: Record<string, string | number> = {};
  if (year) params.year = year;
  if (month) params.month = month;
  if (type) params.type = type;
  return client.get<BudgetTransaction[]>(
    `/families/${familyId}/budget/transactions`,
    { params },
  );
};

// POST /families/:id/budget/transactions — создать (опционально со splits)
export const createTransaction = (
  familyId: string,
  payload: BudgetTransactionCreateInput,
) =>
  client.post<BudgetTransaction>(
    `/families/${familyId}/budget/transactions`,
    payload,
  );

// GET /families/:id/budget/summary?year=&month= — сводка за месяц
export const getMonthSummary = (familyId: string, year: number, month: number) =>
  client.get<BudgetSummary>(`/families/${familyId}/budget/summary`, {
    params: { year, month },
  });

// GET /families/:id/budget/categories — список категорий
export const getCategories = (familyId: string) =>
  client.get<BudgetCategories>(`/families/${familyId}/budget/categories`);

// GET /families/:id/budget/balances — балансы участников по общим тратам
export const getBalances = (familyId: string) =>
  client.get<BudgetMemberBalance[]>(`/families/${familyId}/budget/balances`);

// GET /budget/transactions/:txId — одна транзакция
export const getTransaction = (txId: string) =>
  client.get<BudgetTransaction>(`/budget/transactions/${txId}`);

// PATCH /budget/transactions/:txId — обновить
export const updateTransaction = (
  txId: string,
  payload: BudgetTransactionUpdateInput,
) => client.patch<BudgetTransaction>(`/budget/transactions/${txId}`, payload);

// DELETE /budget/transactions/:txId — удалить
export const deleteTransaction = (txId: string) =>
  client.delete(`/budget/transactions/${txId}`);
