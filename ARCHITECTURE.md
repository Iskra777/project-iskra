# Architecture

## Modules

Core
├── Authentication
├── User Profile
├── Goals
├── Projects
├── Learning
├── Communities
├── Feed
├── Messaging
├── Notifications
├── Search
├── AI Assistant
├── Events
├── Settings
├── Admin Panel

---

## Tech Stack

Ухвалено в Phase 0. Продовження [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) → Phase 0 → "Ухвалити технологічний стек".

| Шар | Вибір | Чому |
|---|---|---|
| Frontend + Backend | Next.js (App Router) + TypeScript | Один проєкт для фронтенду і бекенду — мінімум операційного навантаження на старті. Можна виділити бекенд окремо пізніше, якщо з'явиться потреба (команда, навантаження) |
| База даних | PostgreSQL | [DATABASE.md](DATABASE.md) — реляційна схема з FK, enum, unique-обмеженнями |
| ORM | Prisma | Типобезпека наскрізь з TypeScript, вбудовані міграції |
| Стилі/UI | Tailwind CSS + Radix UI (shadcn/ui) | Прямо реалізує токени з [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) (16px radius, dark-first), доступні базові компоненти |
| Auth | Власна реалізація: email + пароль, Argon2id, JWT access+refresh | Повний контроль над даними користувача — узгоджено з Principle 4/5 (прозорість, що зберігається і навіщо), без обов'язкової залежності від стороннього identity-провайдера |
| Real-time (Messaging, Notifications, згодом Voice/Video) | Окремий легкий WS-сервіс (ws/Socket.io), той самий Postgres | Next.js на serverless PaaS не тримає довгоживі WebSocket-з'єднання — потрібен один постійний процес поруч |
| Файлове сховище | S3-сумісне (Cloudflare R2 або AWS S3) | Аватари, медіа в постах |
| Фонові задачі | BullMQ + Redis | Знадобиться вже в Phase 1 для email verification |
| Пакетний менеджер | pnpm | Без Turborepo поки один застосунок — зайва складність не потрібна |
| Хостинг | Railway (Render/Fly.io як рівноцінна альтернатива) | Нативний Postgres + Redis + persistent-сервіси в одному місці, git-деплой |

### Свідомо відкладені рішення

Не вирішуються зараз, кожне — окрема задача відповідної фази з DEVELOPMENT_PLAN.md:

- SFU для голосових/відео кімнат (Phase 5-6)
- LLM-провайдер для AI Помічника (Phase 6)
- Платіжний провайдер для Marketplace знань (Phase 6)
- Фреймворк мобільного застосунку (Phase 6)

### Відомі ризики

- WebSocket-сервіс — виняток з "один проєкт": Messaging (Phase 2) вимагає окремого процесу поруч із Next.js.
- Схема Prisma напряму кодує DATABASE.md, включно з позначеними там TODO-припущеннями (Achievement/Badge, поліморфні Reaction/Notification) — їх варто звірити з продуктовим баченням до першої міграції.
- Власна автентифікація — більше контролю й відповідності Principle 4/5, але вся відповідальність за безпеку (password reset, ротація токенів, захист від brute-force) на нас.
- Найдешевші тарифи Railway/Render мають обмеження ресурсів і можуть "засинати" — прийнятно для Phase 1-2, Phase 5-6 (відео, голос, AI) майже напевно вимагатимуть апгрейду плану.