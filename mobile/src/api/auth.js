import client from './client';

// POST /auth/pin — вход по логину и PIN-коду
export const login = (username, pin) =>
  client.post('/auth/pin', { username, pin });

// POST /auth/register — регистрация
export const register = (username, display_name, pin) =>
  client.post('/auth/register', { username, display_name, pin });

// POST /auth/logout
export const logout = () => client.post('/auth/logout');
