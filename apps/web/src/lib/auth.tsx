'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { io, type Socket } from 'socket.io-client';
import { api, getToken, setToken, type ApiError } from './api';
import type { SafeUser } from '@nexora/types';

export interface AuthState {
  user: SafeUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  socket: Socket | null;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SafeUser | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);

  const connectSocket = useCallback((t: string) => {
    if (typeof window === 'undefined') return;
    const s = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:4000', {
      path: '/socket.io',
      auth: { token: t },
      transports: ['websocket', 'polling'],
    });
    s.on('connect', () => console.info('[ws] connected'));
    s.on('disconnect', () => console.info('[ws] disconnected'));
    setSocket(s);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api<{ token: string; user: SafeUser }>('/api/auth/login', {
        method: 'POST',
        json: { email, password },
      });
      setToken(res.token);
      setTokenState(res.token);
      setUser(res.user);
      connectSocket(res.token);
    },
    [connectSocket],
  );

  const register = useCallback(
    async (email: string, password: string, name?: string) => {
      const res = await api<{ token: string; user: SafeUser }>('/api/auth/register', {
        method: 'POST',
        json: { email, password, name },
      });
      setToken(res.token);
      setTokenState(res.token);
      setUser(res.user);
      connectSocket(res.token);
    },
    [connectSocket],
  );

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    setToken(null);
    setTokenState(null);
    setUser(null);
    socket?.disconnect();
    router.replace('/login');
  }, [socket, router]);

  const refreshUser = useCallback(async () => {
    let t = getToken();
    if (!t) {
      // Auto-login seamlessly as default admin for single-user local setup
      try {
        await login('admin@nexora.local', 'NexoraDev123!');
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
      return;
    }

    setTokenState(t);
    try {
      const { user: u } = await api<{ user: SafeUser }>('/api/auth/me');
      setUser(u);
      if (socket?.connected) return;
      connectSocket(t);
    } catch (err) {
      const e = err as ApiError;
      if (e.status === 401) {
        // Re-authenticate seamlessly
        try {
          await login('admin@nexora.local', 'NexoraDev123!');
        } catch {
          setToken(null);
          setUser(null);
          router.replace('/login');
        }
      }
    } finally {
      setLoading(false);
    }
  }, [socket, connectSocket, login, router]);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const value = useMemo<AuthState & { socket: Socket | null }>(
    () => ({ user, token, loading, login, register, logout, refreshUser, socket }),
    [user, token, loading, login, register, logout, refreshUser, socket],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Raw socket for pages that want realtime events. */
export function useSocket(): Socket | null {
  const ctx = useContext(AuthContext);
  return ctx?.socket ?? null;
}
