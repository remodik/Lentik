import axios from "axios";

// Достаёт человекочитаемое сообщение об ошибке из ответа API (FastAPI кладёт
// его в `detail`). Принимает unknown (тип catch-переменной в strict TS).
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === "string") return detail;
  }
  return fallback;
}
