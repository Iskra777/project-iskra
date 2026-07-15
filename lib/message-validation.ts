import { z } from "zod";

export const sendMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Повідомлення не може бути порожнім")
    .max(5000),
});
