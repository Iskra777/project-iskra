interface Bucket {
  count: number;
  resetAt: number;
}

// In-memory: скидається при рестарті процесу, не шариться між інстансами.
// Прийнятно для одного Railway-інстансу зараз; апгрейд на Redis — коли
// зʼявиться реальна потреба (BullMQ вже передбачає Redis у Tech Stack).
const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 0, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= max) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/** Збільшує лічильник для ключа. Коли саме викликати — вирішує сам
 * ендпоінт: логін рахує лише невдалі спроби (успішний вхід не штрафується),
 * а запит на скидання пароля рахує кожну валідну спробу (успіх/невдача тут
 * не розрізняються навмисно — див. lib/auth/password-reset.ts). */
export function recordAttempt(key: string, windowMs: number): void {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  bucket.count += 1;
}
