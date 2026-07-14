import { beforeAll, describe, expect, it } from "vitest";
import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "./tokens";

beforeAll(() => {
  process.env.JWT_SECRET = "test-access-secret";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
});

describe("tokens", () => {
  it("signs and verifies an access token", async () => {
    const token = await signAccessToken("user-1");
    const payload = await verifyAccessToken(token);
    expect(payload.sub).toBe("user-1");
  });

  it("signs and verifies a refresh token", async () => {
    const token = await signRefreshToken("user-1", "token-id-1");
    const payload = await verifyRefreshToken(token);
    expect(payload.sub).toBe("user-1");
    expect(payload.jti).toBe("token-id-1");
  });

  it("rejects a refresh token verified with the access-token secret", async () => {
    const token = await signRefreshToken("user-1", "token-id-1");
    await expect(verifyAccessToken(token)).rejects.toThrow();
  });
});
