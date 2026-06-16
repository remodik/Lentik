import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import * as SecureStore from "expo-secure-store";
import { TOKEN_KEY } from "../api/client";
import { getMe } from "../api/me";
import {
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
} from "../api/auth";
import type { Me } from "../api/types";

interface AuthContextValue {
  user: Me | null;
  token: string | null;
  loading: boolean;
  login: (username: string, pin: string) => Promise<void>;
  register: (username: string, display_name: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<Me | null>>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Сохраняет токен в защищённый стор, если бэкенд его вернул. Если access_token
// пустой (старый/cookie-режим) — не падаем. Раньше тут был баг:
// SecureStore.setItemAsync(KEY, null) кидал исключение и валил вход.
async function persistToken(accessToken: string | null | undefined): Promise<string | null> {
  if (typeof accessToken === "string" && accessToken.length > 0) {
    await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
    return accessToken;
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const stored = await SecureStore.getItemAsync(TOKEN_KEY);
      if (stored) {
        setToken(stored);
        const { data } = await getMe();
        setUser(data);
      }
    } catch {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    } finally {
      setLoading(false);
    }
  };

  const login = async (username: string, pin: string) => {
    const { data } = await apiLogin(username, pin);
    setToken(await persistToken(data.access_token));
    const me = await getMe();
    setUser(me.data);
  };

  const register = async (username: string, display_name: string, pin: string) => {
    const { data } = await apiRegister(username, display_name, pin);
    setToken(await persistToken(data.access_token));
    const me = await getMe();
    setUser(me.data);
  };

  const logout = async () => {
    try {
      await apiLogout();
    } catch {}
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, token, loading, login, register, logout, setUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
