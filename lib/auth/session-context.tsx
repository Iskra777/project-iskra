"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export interface SessionUser {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  location: string | null;
  role: string;
  isEmailVerified: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface SessionContextValue {
  user: SessionUser | null;
  accessToken: string | null;
  isLoading: boolean;
  /** Приймає лише accessToken (напр. з відповіді POST /api/auth/login) і сам
   * підтягує повний профіль через GET /api/auth/me — так само, як і тиха
   * відновлення сесії при завантаженні, одна форма даних скрізь. */
  login: (accessToken: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Оновлює користувача в контексті без зайвого round-trip на /api/auth/me —
   * для випадків, коли повний оновлений об'єкт уже прийшов у відповіді
   * іншого ендпоінта (напр. PATCH /api/users/me). */
  updateUser: (user: SessionUser) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error(
      "useSession має використовуватись всередині SessionProvider",
    );
  }
  return context;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const login = useCallback(async (token: string) => {
    const meResponse = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!meResponse.ok) return;
    const { user: sessionUser } = await meResponse.json();
    setUser(sessionUser);
    setAccessToken(token);
  }, []);

  const updateUser = useCallback((updated: SessionUser) => {
    setUser(updated);
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    setAccessToken(null);
  }, []);

  useEffect(() => {
    // Тиха спроба відновити сесію: якщо в браузері є валідна refresh_token
    // cookie з попереднього візиту, отримуємо новий accessToken через неї.
    let cancelled = false;

    async function restoreSession() {
      try {
        const refreshResponse = await fetch("/api/auth/refresh", {
          method: "POST",
        });
        if (!refreshResponse.ok) return;
        const { accessToken: token } = await refreshResponse.json();
        if (!cancelled) await login(token);
      } catch {
        // Немає сесії — нормальний стан для анонімного відвідувача.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    restoreSession();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SessionContext.Provider
      value={{ user, accessToken, isLoading, login, logout, updateUser }}
    >
      {children}
    </SessionContext.Provider>
  );
}
