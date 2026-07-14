# Iskra

One Spark Can Change Everything.

Проєктну документацію дивись у: [VISION.md](VISION.md), [PRINCIPLES.md](PRINCIPLES.md), [PHILOSOPHY.md](PHILOSOPHY.md), [ROADMAP.md](ROADMAP.md), [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md), [ARCHITECTURE.md](ARCHITECTURE.md), [DATABASE.md](DATABASE.md), [API.md](API.md), [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md), [DEPLOYMENT.md](DEPLOYMENT.md).

## Стек

Next.js (App Router) + TypeScript + Tailwind CSS + Prisma + PostgreSQL. Деталі й обґрунтування — в [ARCHITECTURE.md](ARCHITECTURE.md#tech-stack).

## Запуск локально

```bash
pnpm install
cp .env.example .env   # заповнити JWT-секрети реальними значеннями
docker compose up -d   # локальний Postgres, порт 5433
pnpm prisma migrate dev
pnpm dev
```

Відкрити [http://localhost:3000](http://localhost:3000). Деталі — [DEPLOYMENT.md](DEPLOYMENT.md).
