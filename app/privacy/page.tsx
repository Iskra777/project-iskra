import { Card, CardTitle, CardDescription } from "@/components/ui/card";

export default function PrivacyPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16 lg:max-w-3xl">
      <div>
        <h1 className="mb-2">Приватність</h1>
        <p className="text-sm text-foreground/60">
          Це не юридично перевірений документ — добросовісний опис того, як
          Iskra ставиться до даних користувачів, узгоджений із{" "}
          <code>PRINCIPLES.md</code> проєкту. Перед комерційним запуском цей
          текст потребує перевірки юристом.
        </p>
      </div>

      <Card>
        <CardTitle>Що ми збираємо</CardTitle>
        <CardDescription>
          Лише необхідне для роботи сервісу: email, ім&apos;я користувача, хеш
          пароля (не сам пароль), і те, що ви самі додаєте у профіль чи
          публікуєте.
        </CardDescription>
      </Card>

      <Card>
        <CardTitle>Навіщо</CardTitle>
        <CardDescription>
          Щоб ви могли увійти, відновити доступ до акаунта та користуватись
          функціями Iskra. Ми не продаємо й не передаємо ваші дані третім
          сторонам для реклами.
        </CardDescription>
      </Card>

      <Card>
        <CardTitle>Як видалити</CardTitle>
        <CardDescription>
          Ви можете видалити акаунт у будь-який момент. Приватні дані (цілі,
          прогрес, щоденник) видаляються остаточно; публічні пости й коментарі
          анонімізуються, щоб не ламати обговорення інших користувачів.
        </CardDescription>
      </Card>
    </div>
  );
}
