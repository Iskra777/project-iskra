export interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
}

/**
 * Реальний email-провайдер (SMTP/Resend/Postmark тощо) — свідомо відкладене
 * рішення, див. ARCHITECTURE.md → Tech Stack → Свідомо відкладені рішення.
 * Немає акаунта, який можна було б завести самостійно (та сама ситуація,
 * що з GitHub/Railway).
 *
 * У non-production — виводить лист у консоль замість реальної відправки,
 * щоб весь flow (реєстрація, верифікація, скидання пароля) можна було
 * зібрати й перевірити локально вже зараз, не чекаючи на провайдера.
 */
export async function sendEmail(params: SendEmailParams): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[email:dev] To: ${params.to}\nSubject: ${params.subject}\n\n${params.text}`,
    );
    return;
  }

  throw new Error(
    "Email-провайдер для production не налаштовано — див. ARCHITECTURE.md → Свідомо відкладені рішення.",
  );
}
