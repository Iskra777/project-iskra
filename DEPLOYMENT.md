# Deployment

Продовження [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) → Phase 0 → "Налаштувати CD на стейджинг-середовище".

Це покрокова інструкція для ручних дій — GitHub-репозиторію і Railway-акаунта ще немає, підключення й перший деплой виконуються вручну одноразово. Код-сторону (`railway.json`, health-check) вже підготовлено.

## 1. GitHub

1. Створити приватний репозиторій на GitHub.
2. `git remote add origin <URL>`
3. `git push -u origin master`

## 2. Railway

1. Зареєструватись/увійти на [railway.app](https://railway.app).
2. Створити новий проєкт → "Deploy from GitHub repo" → обрати щойно створений репозиторій Iskra.
3. Додати плагін **PostgreSQL** у тому ж проєкті (Railway сам згенерує `DATABASE_URL` — використати саме його, не значення з `.env.example`).
4. Redis (для BullMQ) — додати плагін пізніше, коли з'явиться перша фонова задача (Phase 1, email verification); поки не потрібен.

## 3. Змінні середовища на Railway

| Змінна               | Джерело                                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`       | Автоматично від плагіна PostgreSQL — Railway підставляє сам, вручну не копіювати з `.env.example`                                                               |
| `NODE_ENV`           | `production`                                                                                                                                                    |
| `JWT_SECRET`         | Згенерувати окремо для стейджингу: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` — не використовувати значення з локального `.env` |
| `JWT_REFRESH_SECRET` | Так само, окремим викликом — має відрізнятись від `JWT_SECRET`                                                                                                  |

## 4. Перший деплой

Railway задеплоїть автоматично при підключенні репозиторію (`build`/`start` команди й healthcheck-шлях уже описані в [railway.json](railway.json)). Перевірити результат: `https://<railway-домен>/api/health` має повернути `{"status":"ok"}`.

## 5. Далі

- Кожен push у `master` після цього тригерить новий деплой автоматично (CD).
- `railway.json` вже виконує `pnpm prisma migrate deploy` перед стартом — нові міграції застосовуються самі при кожному деплої.
- Health-check зараз відповідає без звернення до БД. Коли з'явиться перша Prisma-модель — розширити `app/api/health/route.ts` на перевірку з'єднання з базою.

## 6. Локальна розробка

Postgres для локальної розробки — окремий Docker-контейнер (`docker-compose.yml`, ізольований від будь-яких інших локальних проєктів):

```bash
docker compose up -d
pnpm prisma migrate dev
```

`DATABASE_URL` у `.env` уже вказує на `localhost:5433` (не 5432 — навмисно, щоб не конфліктувати з іншими локальними Postgres-інстанціями).
