import { z } from "zod";

// Мінімум 2 символи — щоб короткий/порожній запит не дампив усю таблицю.
export const searchQuerySchema = z.object({
  q: z.string().trim().min(2, "Мінімум 2 символи").max(100),
});
