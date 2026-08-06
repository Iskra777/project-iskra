import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// Мобільний аналог httpOnly cookie для refresh-токена — iOS Keychain /
// Android Keystore замість браузерного cookie jar, якого в React Native
// fetch немає. `expo-secure-store` не має веб-реалізації (немає еквівалента
// Keychain/Keystore в браузері) — на вебі свідомо падаємо назад на
// `localStorage`. Це слабший захист (доступний JS на сторінці), але той
// самий рівень, що вже прийнятний для access-токена в пам'яті веб-клієнта;
// повноцінний httpOnly-кукі шлях лишається для самого веб-застосунку
// (apps/web), не для веб-збірки мобільного.
const REFRESH_TOKEN_KEY = "iskra_refresh_token";

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return globalThis.localStorage?.getItem(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    globalThis.localStorage?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export function getStoredRefreshToken(): Promise<string | null> {
  return getItem(REFRESH_TOKEN_KEY);
}

export function setStoredRefreshToken(token: string): Promise<void> {
  return setItem(REFRESH_TOKEN_KEY, token);
}

export function clearStoredRefreshToken(): Promise<void> {
  return deleteItem(REFRESH_TOKEN_KEY);
}
