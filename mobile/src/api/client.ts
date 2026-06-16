import axios, { type InternalAxiosRequestConfig } from "axios";
import * as SecureStore from "expo-secure-store";
import { API_BASE_URL } from "../config";

export const TOKEN_KEY = "lentik_access_token";

// Просим бэкенд вернуть JWT в теле ответа на /auth/* — мобильный хранит его в
// SecureStore (Keychain/Keystore) и шлёт как Bearer. Веб этот заголовок не шлёт
// и остаётся cookie-only (см. services/api/app/routers/auth.py).
const RETURN_TOKEN_HEADER = "X-Auth-Return-Token";

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

client.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  config.headers.set(RETURN_TOKEN_HEADER, "1");
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
});

export default client;
