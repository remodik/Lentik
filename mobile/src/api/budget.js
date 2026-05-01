import client from './client';

// GET /families/:id/budget/transactions — список транзакций (можно фильтровать по году/месяцу/типу)
export const listTransactions = (familyId, { year, month, type } = {}) => {
  const params = {};
  if (year) params.year = year;
  if (month) params.month = month;
  if (type) params.type = type;
  return client.get(`/families/${familyId}/budget/transactions`, { params });
};

// POST /families/:id/budget/transactions — создать транзакцию (опционально со splits)
export const createTransaction = (familyId, payload) =>
  client.post(`/families/${familyId}/budget/transactions`, payload);

// GET /families/:id/budget/summary?year=&month= — сводка за месяц
export const getMonthSummary = (familyId, year, month) =>
  client.get(`/families/${familyId}/budget/summary`, { params: { year, month } });

// GET /families/:id/budget/categories — список категорий
export const getCategories = (familyId) =>
  client.get(`/families/${familyId}/budget/categories`);

// GET /families/:id/budget/balances — балансы участников по общим тратам
export const getBalances = (familyId) =>
  client.get(`/families/${familyId}/budget/balances`);

// GET /budget/transactions/:txId — одна транзакция
export const getTransaction = (txId) =>
  client.get(`/budget/transactions/${txId}`);

// PATCH /budget/transactions/:txId — обновить транзакцию
export const updateTransaction = (txId, payload) =>
  client.patch(`/budget/transactions/${txId}`, payload);

// DELETE /budget/transactions/:txId — удалить транзакцию
export const deleteTransaction = (txId) =>
  client.delete(`/budget/transactions/${txId}`);
