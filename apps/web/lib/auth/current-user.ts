import { verifyAccessToken } from "./tokens";

/** Повертає id користувача з `Authorization: Bearer <token>`, або `null`,
 * якщо заголовок відсутній, невалідний чи протермінований. Не кидає помилку —
 * анонімний запит без токена є нормальним випадком для публічних ендпоінтів. */
export async function getUserIdFromRequest(
  request: Request,
): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice("Bearer ".length);
  try {
    const payload = await verifyAccessToken(token);
    return payload.sub;
  } catch {
    return null;
  }
}
