import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import * as api from "./api";
import type { SessionUser } from "./api";
import {
  clearStoredRefreshToken,
  getStoredRefreshToken,
  setStoredRefreshToken,
} from "./secure-store";

interface SessionContextValue {
  user: SessionUser | null;
  accessToken: string | null;
  isLoading: boolean;
  loginWithPassword: (
    email: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
  logout: () => Promise<void>;
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

  const applySession = useCallback(
    async (token: string, refreshToken: string) => {
      const meResult = await api.getMe(token);
      if (!meResult.ok) return false;
      await setStoredRefreshToken(refreshToken);
      setUser(meResult.data.user);
      setAccessToken(token);
      return true;
    },
    [],
  );

  const loginWithPassword = useCallback(
    async (email: string, password: string) => {
      const result = await api.login(email, password);
      if (!result.ok) {
        return { ok: false as const, message: result.error.message };
      }
      await applySession(result.data.accessToken, result.data.refreshToken);
      return { ok: true as const };
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    const refreshToken = await getStoredRefreshToken();
    if (refreshToken) {
      await api.logout(refreshToken).catch(() => {});
    }
    await clearStoredRefreshToken();
    setUser(null);
    setAccessToken(null);
  }, []);

  const updateUser = useCallback((updated: SessionUser) => {
    setUser(updated);
  }, []);

  useEffect(() => {
    // Тиха спроба відновити сесію: якщо в SecureStore є refresh-токен з
    // попереднього запуску, отримуємо нову пару токенів через нього — той
    // самий підхід, що й веб-SessionProvider через httpOnly cookie.
    let cancelled = false;

    async function restoreSession() {
      try {
        const storedToken = await getStoredRefreshToken();
        if (!storedToken) return;

        const result = await api.refresh(storedToken);
        if (!result.ok) {
          await clearStoredRefreshToken();
          return;
        }
        if (!cancelled) {
          await applySession(result.data.accessToken, result.data.refreshToken);
        }
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
      value={{
        user,
        accessToken,
        isLoading,
        loginWithPassword,
        logout,
        updateUser,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
