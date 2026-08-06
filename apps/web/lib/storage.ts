import { randomUUID } from "node:crypto";

import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const AVATAR_FOLDER = "avatars";
const POST_IMAGE_FOLDER = "post-images";

const SIGNATURES: { type: string; bytes: number[] }[] = [
  {
    type: "image/png",
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  { type: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
];

// Перевірка реальних байтів файлу — заголовок Content-Type від клієнта клієнт може підробити.
export function detectImageType(buffer: Buffer): string | null {
  for (const { type, bytes } of SIGNATURES) {
    if (
      buffer.length >= bytes.length &&
      bytes.every((byte, i) => buffer[i] === byte)
    ) {
      return type;
    }
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

// public_id = userId у фіксованій теці — повторна заливка сама перезаписує попередній аватар,
// без потреби окремо видаляти старий об'єкт і без ризику накопичення сиріт.
export function uploadAvatar(userId: string, buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: AVATAR_FOLDER,
        public_id: userId,
        overwrite: true,
        resource_type: "image",
        format: "webp",
        transformation: [
          { width: 512, height: 512, crop: "fill", gravity: "face" },
        ],
      },
      (error: unknown, result?: UploadApiResponse) => {
        if (error || !result) {
          reject(
            error instanceof Error
              ? error
              : new Error("Cloudinary upload failed"),
          );
          return;
        }
        resolve(result.secure_url);
      },
    );
    stream.end(buffer);
  });
}

export async function deleteAvatar(userId: string): Promise<void> {
  await cloudinary.uploader.destroy(`${AVATAR_FOLDER}/${userId}`, {
    resource_type: "image",
  });
}

// public_id — випадковий на кожне завантаження (не userId, не postId):
// одна людина може прикріпити різні зображення до різних постів, тож тут
// нема "фіксованого слоту" для перезапису, як в аватара. Заміна/видалення
// зображення поста не прибирає старий об'єкт з Cloudinary (відомий
// компроміс MVP, не сирітське накопичення критичне за обсягом).
export function uploadPostImage(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: POST_IMAGE_FOLDER,
        public_id: randomUUID(),
        resource_type: "image",
        format: "webp",
        transformation: [{ width: 1600, height: 1600, crop: "limit" }],
      },
      (error: unknown, result?: UploadApiResponse) => {
        if (error || !result) {
          reject(
            error instanceof Error
              ? error
              : new Error("Cloudinary upload failed"),
          );
          return;
        }
        resolve(result.secure_url);
      },
    );
    stream.end(buffer);
  });
}
