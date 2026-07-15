import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { deleteAvatar } from "@/lib/storage";
import { POST } from "./route";

const EMAIL = "upload-avatar-check@example.com";

// Мінімальний валідний 1x1 PNG.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function uploadAvatarRequest(
  fields: { avatar?: { data: Buffer; name: string; type: string } },
  accessToken?: string,
) {
  const formData = new FormData();
  if (fields.avatar) {
    formData.set(
      "avatar",
      new File([new Uint8Array(fields.avatar.data)], fields.avatar.name, {
        type: fields.avatar.type,
      }),
    );
  }
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return POST(
    new Request("http://localhost/api/users/me/avatar", {
      method: "POST",
      headers,
      body: formData,
    }),
  );
}

let userId: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      username: "upload_avatar_check",
      passwordHash: await hashPassword("correct horse battery staple"),
    },
  });
  userId = user.id;
});

afterEach(async () => {
  await deleteAvatar(userId);
  await prisma.user.deleteMany({ where: { id: userId } });
});

describe("POST /api/users/me/avatar", () => {
  it("uploads a valid PNG and updates avatarUrl", async () => {
    const token = await signAccessToken(userId);
    const response = await uploadAvatarRequest(
      {
        avatar: {
          data: Buffer.from(PNG_BASE64, "base64"),
          name: "avatar.png",
          type: "image/png",
        },
      },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.avatarUrl).toContain("res.cloudinary.com");
    expect(body.user.avatarUrl).toContain(`avatars/${userId}`);
  }, 20000);

  it("returns 401 without a token", async () => {
    const response = await uploadAvatarRequest({
      avatar: {
        data: Buffer.from(PNG_BASE64, "base64"),
        name: "avatar.png",
        type: "image/png",
      },
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });

  it("returns 400 validation_error when no file is provided", async () => {
    const token = await signAccessToken(userId);
    const response = await uploadAvatarRequest({}, token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 400 unsupported_file_type for a non-image file", async () => {
    const token = await signAccessToken(userId);
    const response = await uploadAvatarRequest(
      {
        avatar: {
          data: Buffer.from("not an image"),
          name: "avatar.png",
          type: "image/png",
        },
      },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("unsupported_file_type");
  });

  it("returns 413 file_too_large when the file exceeds the size limit", async () => {
    const token = await signAccessToken(userId);
    const response = await uploadAvatarRequest(
      {
        avatar: {
          data: Buffer.alloc(5 * 1024 * 1024 + 1),
          name: "avatar.png",
          type: "image/png",
        },
      },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error.code).toBe("file_too_large");
  });
});
