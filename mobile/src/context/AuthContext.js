import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { TOKEN_KEY } from '../api/client';
import { getMe } from '../api/me';
import {
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
} from '../api/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
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

  const login = async (username, pin) => {
    const { data } = await apiLogin(username, pin);
    await SecureStore.setItemAsync(TOKEN_KEY, data.access_token);
    setToken(data.access_token);
    const me = await getMe();
    setUser(me.data);
  };

  const register = async (username, display_name, pin) => {
    const { data } = await apiRegister(username, display_name, pin);
    await SecureStore.setItemAsync(TOKEN_KEY, data.access_token);
    setToken(data.access_token);
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
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
