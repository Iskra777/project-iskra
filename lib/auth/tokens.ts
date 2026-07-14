import { SignJWT, jwtVerify } from "jose";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "30d";

function getSecret(name: "JWT_SECRET" | "JWT_REFRESH_SECRET") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} не задано в середовищі`);
  }
  return new TextEncoder().encode(value);
}

export interface AccessTokenPayload {
  sub: string;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
}

export function signAccessToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(getSecret("JWT_SECRET"));
}

export async function verifyAccessToken(
  token: string,
): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret("JWT_SECRET"));
  return { sub: payload.sub as string };
}

/** `tokenId` — id відповідного запису RefreshToken (DATABASE.md), для перевірки відкликання. */
export function signRefreshToken(
  userId: string,
  tokenId: string,
): Promise<string> {
  return new SignJWT({ sub: userId, jti: tokenId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_TTL)
    .sign(getSecret("JWT_REFRESH_SECRET"));
}

export async function verifyRefreshToken(
  token: string,
): Promise<RefreshTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret("JWT_REFRESH_SECRET"));
  return { sub: payload.sub as string, jti: payload.jti as string };
}
