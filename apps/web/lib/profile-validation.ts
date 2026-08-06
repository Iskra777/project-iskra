import { z } from "zod";

// Ліміти довжини — розумні дефолти, ніде прямо не задокументовані в проєкті.
export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Мінімум 1 символ")
    .max(100, "Максимум 100 символів")
    .nullable()
    .optional(),
  bio: z
    .string()
    .trim()
    .max(500, "Максимум 500 символів")
    .nullable()
    .optional(),
  location: z
    .string()
    .trim()
    .max(100, "Максимум 100 символів")
    .nullable()
    .optional(),
});
