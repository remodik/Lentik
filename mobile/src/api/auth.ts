import client from "./client";
import type { AuthResponse } from "./types";

// POST /auth/pin — вход по логину и PIN-коду
export const login = (username: string, pin: string) =>
  client.post<AuthResponse>("/auth/pin", { username, pin });

// POST /auth/register — регистрация
export const register = (username: string, display_name: string, pin: string) =>
  client.post<AuthResponse>("/auth/register", { username, display_name, pin });

// POST /auth/logout
export const logout = () => client.post("/auth/logout");

// POST /auth/ws-ticket — одноразовый короткоживущий тикет для WebSocket-handshake.
// Бэкенд для WS принимает cookie или ?ticket=, но НЕ ?token=, поэтому нативный
// клиент сначала берёт тикет (по Bearer), затем подключает WS с ?ticket=.
export async function getWsTicket(): Promise<string | null> {
  try {
    const { data } = await client.post<{ ticket: string; expires_in: number }>(
      "/auth/ws-ticket",
    );
    return data.ticket ?? null;
  } catch {
    return null;
  }
}
