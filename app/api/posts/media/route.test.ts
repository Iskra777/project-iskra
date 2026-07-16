import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { POST } from "./route";

const EMAIL = "upload-post-media-check@example.com";

// Мінімальний валідний 1x1 PNG.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function uploadImageRequest(
  fields: { image?: { data: Buffer; name: string; type: string } },
  accessToken?: string,
) {
  const formData = new FormData();
  if (fields.image) {
    formData.set(
      "image",
      new File([new Uint8Array(fields.image.data)], fields.image.name, {
        type: fields.image.type,
      }),
    );
  }
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return POST(
    new Request("http://localhost/api/posts/media", {
      method: "POST",
      headers,
      body: formData,
    }),
  );
}

let userId: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";

  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      username: "upload_post_media_check",
      passwordHash: await hashPassword("correct horse battery staple"),
    },
  });
  userId = user.id;
});

afterEach(async () => {
  await prisma.user.deleteMany({ where: { id: userId } });
});

describe("POST /api/posts/media", () => {
  // Не приберає завантажений об'єкт з Cloudinary — той самий узгоджений
  // компроміс MVP, що й lib/storage.ts#uploadPostImage (немає cleanup для
  // заміни/видалення); один тестовий 1x1 PNG на прогін несуттєвий.
  it("uploads a valid PNG and returns a Cloudinary URL", async () => {
    const token = await signAccessToken(userId);
    const response = await uploadImageRequest(
      {
        image: {
          data: Buffer.from(PNG_BASE64, "base64"),
          name: "photo.png",
          type: "image/png",
        },
      },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mediaUrl).toContain("res.cloudinary.com");
    expect(body.mediaUrl).toContain("post-images/");
  }, 20000);

  it("returns 401 without a token", async () => {
    const response = await uploadImageRequest({
      image: {
        data: Buffer.from(PNG_BASE64, "base64"),
        name: "photo.png",
        type: "image/png",
      },
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });

  it("returns 400 validation_error when no file is provided", async () => {
    const token = await signAccessToken(userId);
    const response = await uploadImageRequest({}, token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 400 unsupported_file_type for a non-image file", async () => {
    const token = await signAccessToken(userId);
    const response = await uploadImageRequest(
      {
        image: {
          data: Buffer.from("not an image"),
          name: "photo.png",
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
    const response = await uploadImageRequest(
      {
        image: {
          data: Buffer.alloc(5 * 1024 * 1024 + 1),
          name: "photo.png",
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
