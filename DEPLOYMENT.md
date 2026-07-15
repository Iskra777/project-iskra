# Deployment

Продовження [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) → Phase 0 → "Налаштувати CD на стейджинг-середовище".

**Стейджинг живий:** `https://project-iskra-production.up.railway.app` (Railway, підключено до `github.com/Iskra777/project-iskra`). `/api/health` повертає `{"status":"ok"}`.

## 1. GitHub

Зроблено. Репозиторій: `https://github.com/Iskra777/project-iskra.git`, гілка `master`.

## 2. Railway

Зроблено. Проєкт створено з "Deploy from GitHub repo", плагін **PostgreSQL** додано в тому ж проєкті.

Redis (для BullMQ) — додати плагін пізніше, коли з'явиться перша фонова задача; поки не потрібен.

## 3. Змінні середовища на Railway

Сервіс з кодом (не Postgres) → вкладка **Variables**:

| Змінна                  | Значення                                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | `${{Postgres.DATABASE_URL}}` — **посилання на сервіс Postgres**, не літеральний рядок. Додається через "+ New Variable" з таким значенням буквально             |
| `NODE_ENV`              | `production`                                                                                                                                                    |
| `JWT_SECRET`            | Згенерувати окремо для стейджингу: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` — не використовувати значення з локального `.env` |
| `JWT_REFRESH_SECRET`    | Так само, окремим викликом — має відрізнятись від `JWT_SECRET`                                                                                                  |
| `APP_URL`               | `https://project-iskra-production.up.railway.app` — використовується для посилань у транзакційних листах (верифікація email, скидання пароля)                   |
| `CLOUDINARY_CLOUD_NAME` | Значення з Cloudinary Dashboard → Home                                                                                                                          |
| `CLOUDINARY_API_KEY`    | Значення з Cloudinary Dashboard → Home                                                                                                                          |
| `CLOUDINARY_API_SECRET` | Значення з Cloudinary Dashboard → Home (той самий акаунт можна використовувати і для стейджингу, і для продакшену — окремих облікових записів не заводили)      |

## 4. Перший деплой

Зроблено. Кожен push у `master` тригерить новий деплой автоматично (CD). `railway.json` виконує `pnpm prisma migrate deploy` перед стартом — нові міграції застосовуються самі при кожному деплої.

## 5. Відомі проблеми з першого деплою (для довідки)

Дві реальні помилки трапились під час першого налаштування — обидві вже виправлені в коді, залишено тут як довідку, якщо щось схоже повториться на іншому середовищі:

1. **`pnpm i --frozen-lockfile` падав з `packages field missing or empty`.** Причина: `pnpm-workspace.yaml` (автоматично створений локальним `pnpm approve-builds` для дозволу build-скриптів `argon2`/`@prisma/engines`/`prisma`/`sharp`/`unrs-resolver`) не мав поля `packages:`. Сама наявність цього файлу вмикає workspace-режим pnpm, який без `packages:` не стартує. Виправлено додаванням `packages: ["."]`.
2. **Healthcheck падав з `P1001: Can't reach database server at localhost:5432`.** Причина: `DATABASE_URL` на Railway був вставлений як **літеральний текст-приклад** з `.env.example` (`postgresql://user:password@localhost:5432/iskra`), а не як посилання на реальний сервіс Postgres. Виправлено видаленням і повторним додаванням змінної через синтаксис `${{Postgres.DATABASE_URL}}`.

## 6. Ще не production-ready

- **Реєстрація зараз впаде на цьому стейджингу**, якщо нею реально скористатись — `lib/email.ts` навмисно кидає помилку в `NODE_ENV=production`, поки не обрано реальний email-провайдер (SMTP/Resend/Postmark/тощо, див. ARCHITECTURE.md → Свідомо відкладені рішення). Health-check і решта read-only перевірок працюють; усе, що відправляє листи (реєстрація, скидання пароля), — ні.
- Health-check зараз відповідає без звернення до БД. Можна розширити `app/api/health/route.ts` на перевірку з'єднання з базою.

## 7. Локальна розробка

Postgres для локальної розробки — окремий Docker-контейнер (`docker-compose.yml`, ізольований від будь-яких інших локальних проєктів):

```bash
docker compose up -d
pnpm prisma migrate dev
```

`DATABASE_URL` у `.env` уже вказує на `localhost:5433` (не 5432 — навмисно, щоб не конфліктувати з іншими локальними Postgres-інстанціями).
