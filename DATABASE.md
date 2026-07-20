# Database

Деталізація сутностей: поля, типи, звʼязки. Продовження [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) → Phase 0 → "Деталізувати DATABASE.md".

## Умовності

- Типи — узагальнені (`uuid`, `string`, `text`, `integer`, `boolean`, `timestamp`, `enum`), не привʼязані до конкретної СУБД, бо технологічний стек ще не обрано.
- Назви таблиць — PascalCase, назви полів — snake_case.
- Кожна таблиця має `id: uuid (PK)`, більшість — `created_at` і, де застосовно, `updated_at`.
- `TODO` — місце, де я зробив явне припущення замість продуктового рішення. Позначки варто звірити окремо.
- Таблиці з приміткою **(нова)** не було в оригінальному списку з 16 назв — додані, бо без них неможливо коректно змоделювати N:N звʼязки, які випливають із ROADMAP.md (наприклад, учасники спільноти чи проєкту).

---

## User

| Поле              | Тип                                        | Опис                                                             |
| ----------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| id                | uuid (PK)                                  |                                                                  |
| email             | string, unique, not null                   |                                                                  |
| password_hash     | string, not null                           |                                                                  |
| username          | string, unique, not null                   |                                                                  |
| display_name      | string, nullable                           |                                                                  |
| avatar_url        | string, nullable                           |                                                                  |
| bio               | text, nullable                             |                                                                  |
| location          | string, nullable                           |                                                                  |
| is_email_verified | boolean, default false                     |                                                                  |
| is_active         | boolean, default true                      | false — акаунт деактивовано користувачем                         |
| role              | enum(user, moderator, admin), default user | спрощення замість окремих Role/Permission таблиць — `TODO` нижче |
| created_at        | timestamp                                  |                                                                  |
| updated_at        | timestamp                                  |                                                                  |
| deleted_at        | timestamp, nullable                        | soft delete, Principle 5 — право на видалення                    |

Звʼязки: 1:N до Goal, Project (через ProjectMember), Community (через CommunityMember), Message, Conversation (через ConversationParticipant), Post, Comment, Reaction, Notification, Event (через EventAttendee), Achievement (через UserAchievement), Badge (через UserBadge), Friendship, Progress, LearningPath, Bookmark, DiaryEntry, Listing (як seller), Transaction (як buyer).

`TODO`: `role` — свідоме спрощення замість окремих таблиць Role/Permission для Admin Panel (ARCHITECTURE.md). Ніде в документах немає вимоги до гранульованих прав доступу; якщо вона зʼявиться, `role` доведеться мігрувати на повноцінний RBAC.

`deleted_at` — при видаленні акаунта каскадна поведінка різна залежно від типу даних; повна семантика в [ARCHITECTURE.md](ARCHITECTURE.md#приватність-і-прозорість-даних).

GIN trigram-індекси (`pg_trgm`) на `username` і `display_name` — швидкий substring-пошук, `GET /api/users/search` (API.md).

### Публічність полів (Profile, Phase 1)

| Публічно (чужий профіль)                                          | Лише власнику                                                     |
| ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| id, username, display_name, avatar_url, bio, location, created_at | email, role, is_email_verified, is_active, updated_at, deleted_at |

`TODO`: `email` навмисно приховано з чужого профілю, хоч і повертається в тілі відповіді логіну/реєстрації — там контекст інший ("це твої власні дані одразу після дії"), а не перегляд профілю сторонньою особою. `role` теж приховано з публічного профілю — не було вимоги показувати його публічно.

---

## Goal

| Поле        | Тип                                                | Опис |
| ----------- | -------------------------------------------------- | ---- |
| id          | uuid (PK)                                          |      |
| user_id     | uuid (FK → User)                                   |      |
| title       | string, not null                                   |      |
| description | text, nullable                                     |      |
| deadline    | timestamp, nullable                                |      |
| status      | enum(active, completed, abandoned), default active |      |
| is_private  | boolean, default true                              |      |
| created_at  | timestamp                                          |      |
| updated_at  | timestamp                                          |      |

Звʼязки: N:1 User; 1:N Progress.

---

## Project

| Поле        | Тип                                         | Опис |
| ----------- | ------------------------------------------- | ---- |
| id          | uuid (PK)                                   |      |
| owner_id    | uuid (FK → User)                            |      |
| title       | string, not null                            |      |
| description | text, nullable                              |      |
| status      | enum(planning, active, completed, archived) |      |
| created_at  | timestamp                                   |      |
| updated_at  | timestamp                                   |      |

Звʼязки: N:1 User (owner); N:N User через ProjectMember.

### ProjectMember (нова)

| Поле       | Тип                 | Опис |
| ---------- | ------------------- | ---- |
| id         | uuid (PK)           |      |
| project_id | uuid (FK → Project) |      |
| user_id    | uuid (FK → User)    |      |
| role       | enum(admin, member) |      |
| joined_at  | timestamp           |      |

---

## Community

| Поле        | Тип                      | Опис |
| ----------- | ------------------------ | ---- |
| id          | uuid (PK)                |      |
| owner_id    | uuid (FK → User)         |      |
| name        | string, unique, not null |      |
| description | text, nullable           |      |
| visibility  | enum(public, private)    |      |
| created_at  | timestamp                |      |
| updated_at  | timestamp                |      |

Звʼязки: N:1 User (owner); N:N User через CommunityMember; 1:N Post.

### CommunityMember (нова)

| Поле         | Тип                            | Опис                                             |
| ------------ | ------------------------------ | ------------------------------------------------ |
| id           | uuid (PK)                      |                                                  |
| community_id | uuid (FK → Community)          |                                                  |
| user_id      | uuid (FK → User)               |                                                  |
| role         | enum(admin, moderator, member) |                                                  |
| status       | enum(pending, approved)        | pending — заявка на вступ до приватної спільноти |
| joined_at    | timestamp                      |                                                  |

### Рішення дизайну

Продовження DEVELOPMENT_PLAN.md → Phase 2 → "Спроектувати схему Community". Ендпоінти/UI — окремі наступні задачі; тут лише модель й ухвалені правила.

- **Власник vs `admin`** — `owner_id` окреме поле, одна людина: єдина, хто може видалити спільноту або передати власність. `role: admin` (`CommunityMember`) — може бути в декількох одночасно, керує повсякденням (ролі, схвалення заявок, видалення учасників, редагування опису), але не видаляє спільноту й не передає власність. Той самий поділ "власник vs адміни", що дозволяє множинних адмінів у групових чатах (DATABASE.md#груповий-формат-type--group), плюс окремий власник зверху.
- **Створення** — творець одразу отримує `CommunityMember(role=admin, status=approved)`.
- **Вступ** — `public`: одразу `status=approved`. `private`: створюється `status=pending`, потрібне схвалення `admin`/`moderator` (реалізація — наступна задача "вступ/вихід... включно з модерацією").
- **Ролі**: `admin` — повне керування, крім видалення спільноти/передачі власності. `moderator` — схвалює/відхиляє заявки, видаляє звичайних `member`, не може діяти проти `admin`/інших `moderator`. `member` — без прав керування.
- **Вихід власника** — власник не може вийти без попередньої передачі `owner_id` іншому учаснику, той самий підхід, що й у виході з групового чату (`admin_required`, DATABASE.md#груповий-формат-type--group) — реалізація в наступній задачі, тут лише зафіксовано правило.
- **Зміна `visibility` після створення** — `TODO`: чи можна `public`→`private` і навпаки після створення, не вирішено цією задачею; відкладено до задачі редагування спільноти.

---

## Conversation

| Поле       | Тип                 | Опис                    |
| ---------- | ------------------- | ----------------------- |
| id         | uuid (PK)           |                         |
| type       | enum(direct, group) |                         |
| title      | string, nullable    | тільки для type = group |
| created_at | timestamp           |                         |
| updated_at | timestamp           |                         |

Звʼязки: N:N User через ConversationParticipant; 1:N Message.

`TODO`: уникнення дублікатів `direct`-розмов — перед створенням нової `type=direct` розмови між двома людьми шукати серед існуючих `Conversation(type=direct)`, де обидва вже `ConversationParticipant` (перетин по `conversation_id`). Перевірка на рівні застосунку, не unique-обмеження в БД — так само, як і унікальність пари в Friendship (DATABASE.md#friendship): "рівно ці двоє учасників" важко виразити прямим constraint на junction-таблиці.

### Груповий формат (`type = group`)

Схема (`title`, `ConversationParticipant.role`) спроєктована під групи від самого початку — розширення не потребувало міграції, лише рішень і "read-side" шару в API (DEVELOPMENT_PLAN.md → Phase 2 → "Групові чати"):

- **Адмін** — творець групи стає першим `admin`; `role` — per-participant поле, тож адмінів може бути декілька одночасно.
- **Мінімум учасників** — не обмеження БД. Продуктове питання задачі створення групи (наступний пункт плану), не цієї.
- **Блокування не впливає на групи** — на відміну від `direct` (де `blocked` Friendship забороняє почати/продовжити розмову, `lib/conversations.ts`), у групі заблокована пара учасників **не** виключається одне для одного і не блокує повідомлення. Свідоме рішення: групи багатосторонні, "я заблокував X" не повинно ламати спільний чат для решти учасників.
- Створення групи, додавання/видалення учасників, вихід/передача прав адміна — усе ще окремі незакриті пункти плану; наразі є лише формат даних і read-side API (`GET /api/conversations`, `GET /api/conversations/:id` повертають `title` і повний `participants[]` з `role`).

### ConversationParticipant (нова)

| Поле            | Тип                                 | Опис                   |
| --------------- | ----------------------------------- | ---------------------- |
| id              | uuid (PK)                           |                        |
| conversation_id | uuid (FK → Conversation)            |                        |
| user_id         | uuid (FK → User)                    |                        |
| role            | enum(admin, member), default member | значуще лише для group |
| joined_at       | timestamp                           |                        |
| last_read_at    | timestamp, nullable                 |                        |

`last_read_at` — механізм статусу прочитання. Непрочитані повідомлення для учасника = `Message.sent_at > last_read_at` (виключаючи повідомлення від самого учасника). "Позначити прочитаним" = оновити `last_read_at = now()` при відкритті розмови.

---

## Message

| Поле            | Тип                      | Опис |
| --------------- | ------------------------ | ---- |
| id              | uuid (PK)                |      |
| conversation_id | uuid (FK → Conversation) |      |
| sender_id       | uuid (FK → User)         |      |
| content         | text, not null           |      |
| sent_at         | timestamp                |      |
| edited_at       | timestamp, nullable      |      |
| deleted_at      | timestamp, nullable      |      |

Звʼязки: N:1 Conversation; N:1 User (sender).

`edited_at` — лише прапорець "востаннє редаговано" для UI; `content` завжди містить актуальний текст, окремої історії версій немає (MVP-спрощення, не помилка). `deleted_at` — soft-delete, ховає повідомлення для всіх учасників розмови (не лише відправника).

`TODO`: індикатор "набирає текст" свідомо **не** частина цієї схеми — ефемерний real-time стан (WebSocket/SSE), не персистентні дані. Належить до задачі "Ухвалити рішення щодо технології доставки в реальному часі".

---

## Post

| Поле         | Тип                             | Опис                          |
| ------------ | ------------------------------- | ----------------------------- |
| id           | uuid (PK)                       |                               |
| author_id    | uuid (FK → User)                |                               |
| community_id | uuid (FK → Community), nullable | null = пост на профілі автора |
| content      | text, not null                  |                               |
| media_url    | string, nullable                |                               |
| created_at   | timestamp                       |                               |
| updated_at   | timestamp                       |                               |
| deleted_at   | timestamp, nullable             |                               |

Звʼязки: N:1 User (author); N:1 Community (optional); 1:N Comment; 1:N Reaction (через target_type = post).

---

## Comment

| Поле              | Тип                           | Опис                            |
| ----------------- | ----------------------------- | ------------------------------- |
| id                | uuid (PK)                     |                                 |
| post_id           | uuid (FK → Post)              |                                 |
| author_id         | uuid (FK → User)              |                                 |
| parent_comment_id | uuid (FK → Comment), nullable | null = коментар верхнього рівня |
| content           | text, not null                |                                 |
| created_at        | timestamp                     |                                 |
| updated_at        | timestamp                     |                                 |
| deleted_at        | timestamp, nullable           |                                 |

**Рішення дизайну:** дворівневі треди (топ-коментарі + пласкі відповіді), той самий підхід, що й в Instagram/YouTube. Схема залишає `parent_comment_id` self-reference-гнучким (на випадок глибших тредів пізніше, без нової міграції), але на рівні застосунку (`lib/comments.ts`) відповідь дозволена лише на коментар верхнього рівня (`parent_comment_id = null`) — відповідь-на-відповідь відхиляється, а не мовчазно сплющується до верхнього рівня. Сортування — хронологічно, найстаріші перші (природний порядок розмови, на відміну від стрічки постів).

Звʼязки: N:1 Post; N:1 User (author); N:1 Comment (self, parent); 1:N Reaction (через target_type = comment).

---

## Reaction

| Поле        | Тип                    | Опис                                        |
| ----------- | ---------------------- | ------------------------------------------- |
| id          | uuid (PK)              |                                             |
| user_id     | uuid (FK → User)       |                                             |
| target_type | enum(post, comment)    |                                             |
| target_id   | uuid                   | id Post або Comment залежно від target_type |
| type        | enum(fire, bulb, clap) | тип реакції                                 |
| created_at  | timestamp              |                                             |

`TODO`: поліморфний звʼязок (`target_type` + `target_id`) — припущення архітектора; альтернатива — окремі таблиці `PostReaction`/`CommentReaction`.

**Рішення дизайну:** три типи — 🔥 `fire` ("Надихнуло"), 💡 `bulb` ("Корисно"), 🙌 `clap` ("Підтримую") — узгоджено з принципом 6 PRINCIPLES.md ("як ця функція допомагає людям розвиватися?"), а не типовий емоційний набір (👍❤️😂😮😢😡). Навмисно без ❤️/👍 — найбільш "лайк-подібні" варіанти, найлегше перетворюються на змагання за числом. **Без публічного лічильника** — узгоджено з принципом 7 PRINCIPLES.md ("Не лайки. Не перегляди."): UI показує лише стан "я відреагував" для самого користувача, без числа поруч із кнопкою. Реакції не взаємовиключні — користувач може поставити кілька різних типів на один об'єкт.

Обмеження: unique(user_id, target_type, target_id, type) — одна реакція одного типу від користувача на обʼєкт.

---

## Bookmark

| Поле       | Тип              | Опис |
| ---------- | ---------------- | ---- |
| id         | uuid (PK)        |      |
| user_id    | uuid (FK → User) |      |
| post_id    | uuid (FK → Post) |      |
| created_at | timestamp        |      |

Обмеження: unique(user_id, post_id).

Звʼязки: N:1 User; N:1 Post.

---

## Notification

| Поле        | Тип                        | Опис                                                                 |
| ----------- | -------------------------- | -------------------------------------------------------------------- |
| id          | uuid (PK)                  |                                                                      |
| user_id     | uuid (FK → User)           | отримувач                                                            |
| actor_id    | uuid (FK → User), nullable | хто спричинив подію                                                  |
| type        | string                     | напр. friend_request, message, comment, reaction, achievement, event |
| target_type | string, nullable           | тип обʼєкта, на який веде сповіщення                                 |
| target_id   | uuid, nullable             |                                                                      |
| is_read     | boolean, default false     |                                                                      |
| created_at  | timestamp                  |                                                                      |

`TODO`: `target_type`/`target_id` — поліморфне посилання, той самий підхід, що й у Reaction; повний список `type` не зафіксовано продуктом.

---

## Event

| Поле             | Тип                   | Опис |
| ---------------- | --------------------- | ---- |
| id               | uuid (PK)             |      |
| organizer_id     | uuid (FK → User)      |      |
| title            | string, not null      |      |
| description      | text, nullable        |      |
| format           | enum(online, offline) |      |
| location_or_link | string, nullable      |      |
| starts_at        | timestamp, not null   |      |
| ends_at          | timestamp, nullable   |      |
| created_at       | timestamp             |      |
| updated_at       | timestamp             |      |

Звʼязки: N:1 User (organizer); N:N User через EventAttendee.

### EventAttendee (нова)

| Поле          | Тип                               | Опис |
| ------------- | --------------------------------- | ---- |
| id            | uuid (PK)                         |      |
| event_id      | uuid (FK → Event)                 |      |
| user_id       | uuid (FK → User)                  |      |
| status        | enum(going, interested, declined) |      |
| registered_at | timestamp                         |      |

---

## Achievement

| Поле        | Тип                      | Опис                         |
| ----------- | ------------------------ | ---------------------------- |
| id          | uuid (PK)                |                              |
| code        | string, unique, not null | напр. "first_goal_completed" |
| title       | string, not null         |                              |
| description | text, nullable           |                              |
| icon_url    | string, nullable         |                              |
| created_at  | timestamp                |                              |

Звʼязки: N:N User через UserAchievement.

### UserAchievement (нова)

| Поле           | Тип                     | Опис |
| -------------- | ----------------------- | ---- |
| id             | uuid (PK)               |      |
| user_id        | uuid (FK → User)        |      |
| achievement_id | uuid (FK → Achievement) |      |
| earned_at      | timestamp               |      |

### Правила й тригери нарахування (Phase 4)

Обсяг цієї фази — лише домен Goal/Progress (Досягнення йде відразу після Цілей/Прогресу в DEVELOPMENT_PLAN.md; ретроактивних тригерів для друзів/постів/спільнот із попередніх фаз немає — там не закладалося гачків, і план цього не просить).

Загальні правила для кожного тригера:

- Кожен `code` нараховується **рівно один раз** на користувача — ідемпотентно, перевірка існуючого `UserAchievement` перед вставкою.
- **Без streak-механік** (щоденні серії, штраф за пропуск) — класичний токсичний патерн, суперечить Principle 2.
- **Без порогів за кількістю low-effort дій** (пости, коментарі, реакції) — Principle 3 "якість > кількість".
- Приватно — бачить лише власник (Principle 7, той самий підхід, що й реакції/закладки — без публічної вітрини чужих досягнень).

Тригери (перша версія):

| code                      | Умова                                                                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first_goal_created`      | Створено першу ціль (`Goal`)                                                                                                                              |
| `first_progress_recorded` | Додано перший запис прогресу (`Progress`)                                                                                                                 |
| `first_goal_completed`    | Уперше ціль отримала статус `completed`                                                                                                                   |
| `five_goals_completed`    | П'ять завершених цілей — єдиний кількісний тригер: завершення цілі вимагає реального зусилля, на відміну від постів/лайків, тож не суперечить Principle 3 |

---

## Badge

| Поле        | Тип                                  | Опис |
| ----------- | ------------------------------------ | ---- |
| id          | uuid (PK)                            |      |
| code        | string, unique, not null             |      |
| title       | string, not null                     |      |
| description | text, nullable                       |      |
| icon_url    | string, nullable                     |      |
| level       | enum(bronze, silver, gold), nullable |      |
| created_at  | timestamp                            |      |

Звʼязки: N:N User через UserBadge.

Рішення дизайну (підтверджено продуктом): **Achievement** — разова подія-віха (напр. "завершив першу ціль"), фіксується один раз (`UserAchievement`, без повторного нарахування того самого `code`); **Badge** — статус-символ із рівнями (bronze/silver/gold), той самий `code` може оновлюватись до вищого `level` з часом (не новий рядок `UserBadge` на кожен рівень).

`TODO`: DEVELOPMENT_PLAN.md у блоці "Досягнення" (Phase 4) описує тільки Achievement (тригери нарахування, ендпоінт списку, вітрина на профілі, сповіщення) — жодного окремого пункту для Badge немає. `Badge`/`UserBadge` лишаються задокументованою, але нереалізованою сутністю: без Prisma-моделі, ендпоінтів чи UI, поки не з'явиться окрема задача.

### UserBadge (нова)

| Поле      | Тип               | Опис |
| --------- | ----------------- | ---- |
| id        | uuid (PK)         |      |
| user_id   | uuid (FK → User)  |      |
| badge_id  | uuid (FK → Badge) |      |
| earned_at | timestamp         |      |

---

## Friendship

| Поле         | Тип                              | Опис |
| ------------ | -------------------------------- | ---- |
| id           | uuid (PK)                        |      |
| requester_id | uuid (FK → User)                 |      |
| addressee_id | uuid (FK → User)                 |      |
| status       | enum(pending, accepted, blocked) |      |
| created_at   | timestamp                        |      |
| updated_at   | timestamp                        |      |

Напрямлена модель (requester/addressee) — для `pending` це напрямок запиту; для `accepted` звʼязок симетричний в обидва боки (не має значення, хто був requester). Для `blocked` напрямок — **хто заблокував**: `requester_id` = блокувальник, `addressee_id` = заблокований, незалежно від того, хто ініціював дружбу спочатку. Тобто дія блокування може перезаписати `requester_id`/`addressee_id` існуючого рядка.

### Переходи станів (Phase 2)

| З                    | До              | Хто ініціює                                                                                   |
| -------------------- | --------------- | --------------------------------------------------------------------------------------------- |
| (немає рядка)        | `pending`       | requester (надсилає запит)                                                                    |
| `pending`            | `accepted`      | addressee (приймає)                                                                           |
| `pending`            | видалення рядка | addressee (відхиляє) АБО requester (скасовує)                                                 |
| `accepted`           | видалення рядка | будь-хто з двох (розірвання дружби)                                                           |
| `accepted`/`pending` | `blocked`       | будь-хто з двох (`requester_id`/`addressee_id` перезаписуються — блокувальник стає requester) |
| `blocked`            | видалення рядка | лише той, хто заблокував (перевірка на рівні ендпоінта, не БД-обмеження)                      |

`TODO`: унікальність пари користувачів (A, B) без урахування напрямку перевіряється на рівні застосунку (шукати рядок в обидва боки — `(A,B)` і `(B,A)` — перед створенням нового запиту), не через канонічне впорядкування UUID у БД чи `unique`-обмеження на рівні схеми. Вузьке вікно гонки при одночасних запитах в обидва боки — прийнятний компроміс для MVP, той самий дух, що й у [lib/rate-limit.ts](lib/rate-limit.ts).

---

## LearningPath

| Поле        | Тип                        | Опис                       |
| ----------- | -------------------------- | -------------------------- |
| id          | uuid (PK)                  |                            |
| created_by  | uuid (FK → User), nullable | null = створено платформою |
| title       | string, not null           |                            |
| description | text, nullable             |                            |
| created_at  | timestamp                  |                            |
| updated_at  | timestamp                  |                            |

`TODO`: внутрішня структура (лінійний список кроків/уроків чи щось складніше) не визначена — залишаю поза цим документом, щоб не змішувати з задачею "Навчальні кімнати" (Phase 5), яка теж не спроєктована. Розширення цієї таблиці — окрема задача, коли буде продуктове рішення.

Звʼязки: N:1 User (created_by, optional); 1:N Progress.

---

## Progress

| Поле             | Тип                                | Опис                     |
| ---------------- | ---------------------------------- | ------------------------ |
| id               | uuid (PK)                          |                          |
| user_id          | uuid (FK → User)                   |                          |
| goal_id          | uuid (FK → Goal), nullable         |                          |
| learning_path_id | uuid (FK → LearningPath), nullable |                          |
| value            | integer, nullable                  | напр. відсоток виконання |
| note             | text, nullable                     |                          |
| recorded_at      | timestamp                          |                          |

`TODO`: припущення — один запис Progress стосується або Goal, або LearningPath, ніколи обох одночасно; обмеження "рівно одне заповнене" контролюється на рівні бізнес-логіки, не схемою.

Звʼязки: N:1 User; N:1 Goal (optional); N:1 LearningPath (optional).

---

## DiaryEntry

| Поле       | Тип              | Опис |
| ---------- | ---------------- | ---- |
| id         | uuid (PK)        |      |
| user_id    | uuid (FK → User) |      |
| title      | string, nullable |      |
| content    | text, not null   |      |
| created_at | timestamp        |      |
| updated_at | timestamp        |      |

Рішення дизайну (підтверджено продуктом): без поля приватності — на відміну від Goal, щоденник **завжди приватний**, бачить лише власник. Жоден документ (ARCHITECTURE.md, PRINCIPLES.md, DEVELOPMENT_PLAN.md) не передбачає публічної версії чи можливості поділитися записом — сама природа "особистого щоденника" це виключає. Спрощує CRUD-ендпоінти: єдина перевірка видимості — `userId === viewer`, без anti-enumeration нюансів, які є в Goal.

Звʼязки: N:1 User.

---

## Listing

| Поле        | Тип                              | Опис                                                                        |
| ----------- | -------------------------------- | --------------------------------------------------------------------------- |
| id          | uuid (PK)                        |                                                                             |
| seller_id   | uuid (FK → User)                 |                                                                             |
| title       | string, not null                 |                                                                             |
| description | text, nullable                   |                                                                             |
| price_cents | integer, not null                | ціна в мінімальних одиницях валюти, не float — уникнення похибок округлення |
| currency    | string, default "USD"            | `TODO`: валюта за замовчуванням не визначена продуктом                      |
| status      | enum(draft, published, archived) |                                                                             |
| created_at  | timestamp                        |                                                                             |
| updated_at  | timestamp                        |                                                                             |

`TODO`: платіжний провайдер не обрано (ARCHITECTURE.md → Tech Stack → відкладені рішення) — поля можуть зазнати змін під конкретне API.

Звʼязки: N:1 User (seller); 1:N Transaction.

---

## Transaction

| Поле               | Тип                                        | Опис                                   |
| ------------------ | ------------------------------------------ | -------------------------------------- |
| id                 | uuid (PK)                                  |                                        |
| listing_id         | uuid (FK → Listing)                        |                                        |
| buyer_id           | uuid (FK → User)                           |                                        |
| amount_cents       | integer, not null                          |                                        |
| currency           | string, not null                           |                                        |
| status             | enum(pending, completed, refunded, failed) |                                        |
| provider_reference | string, nullable                           | зовнішній ID від платіжного провайдера |
| created_at         | timestamp                                  |                                        |

Звʼязки: N:1 Listing; N:1 User (buyer).

---

## ConsentRecord

| Поле         | Тип                 | Опис                                          |
| ------------ | ------------------- | --------------------------------------------- |
| id           | uuid (PK)           |                                               |
| user_id      | uuid (FK → User)    |                                               |
| consent_type | string              | напр. "terms_of_service", "privacy_policy"    |
| version      | string              | версія документа, на яку погодився користувач |
| granted_at   | timestamp           |                                               |
| revoked_at   | timestamp, nullable |                                               |

Частина механізму приватності/прозорості (Principle 4/5) — [ARCHITECTURE.md](ARCHITECTURE.md#приватність-і-прозорість-даних). Фіксує, на що саме й коли погодився користувач.

Звʼязки: N:1 User.

---

## EmailVerificationToken

| Поле       | Тип                 | Опис                                                |
| ---------- | ------------------- | --------------------------------------------------- |
| id         | uuid (PK)           |                                                     |
| user_id    | uuid (FK → User)    |                                                     |
| token_hash | string, unique      | хеш токена (SHA-256), не сирий токен                |
| expires_at | timestamp           | 24 години від видачі                                |
| used_at    | timestamp, nullable | заповнюється при успішній верифікації — одноразовий |
| created_at | timestamp           |                                                     |

`TODO`: додано під час реалізації задачі "генерація токена підтвердження email" (Phase 1, Реєстрація) — не було передбачено на етапі первинного проєктування DATABASE.md, як і RefreshToken свого часу.

Звʼязки: N:1 User.

---

## PasswordResetToken

| Поле       | Тип                 | Опис                                                                               |
| ---------- | ------------------- | ---------------------------------------------------------------------------------- |
| id         | uuid (PK)           |                                                                                    |
| user_id    | uuid (FK → User)    |                                                                                    |
| token_hash | string, unique      | хеш токена (SHA-256), не сирий токен                                               |
| expires_at | timestamp           | 1 година від видачі — коротше за EmailVerificationToken, скидання пароля чутливіше |
| used_at    | timestamp, nullable | одноразовий                                                                        |
| created_at | timestamp           |                                                                                    |

`TODO`: та сама форма, що й EmailVerificationToken, додано під час задачі "запит на скидання пароля" (Phase 1, Реєстрація).

Звʼязки: N:1 User.

---

## AuditLog

| Поле       | Тип                        | Опис                                                                            |
| ---------- | -------------------------- | ------------------------------------------------------------------------------- |
| id         | uuid (PK)                  |                                                                                 |
| user_id    | uuid (FK → User)           | чиїх даних стосується дія                                                       |
| actor_id   | uuid (FK → User), nullable | хто виконав дію; null = система                                                 |
| action     | string                     | напр. "data_export_requested", "account_deletion_requested", "password_changed" |
| created_at | timestamp                  |                                                                                 |

`TODO`: скоуп свідомо мінімальний — лише чутливі дії навколо персональних даних, не повний audit trail кожного read/write (щоб не перетворити на over-engineering для MVP).

Звʼязки: N:1 User; N:1 User (actor, optional).

---

## RefreshToken

| Поле       | Тип                 | Опис                                                    |
| ---------- | ------------------- | ------------------------------------------------------- |
| id         | uuid (PK)           | те саме значення, що `jti` у JWT-корисному навантаженні |
| user_id    | uuid (FK → User)    |                                                         |
| token_hash | string              | хеш самого refresh-токена, не сирий токен               |
| expires_at | timestamp           |                                                         |
| revoked_at | timestamp, nullable | заповнюється при логауті/зміні пароля                   |
| created_at | timestamp           |                                                         |

`TODO`: JWT access-токен — stateless, тут не зберігається. Refresh-токен навпаки вимагає збереження, інакше логаут (Phase 1: "інвалідація сесії/токена") нічим не можна інвалідувати. Виявлено під час підготовки auth-інфраструктури (Phase 0), не було зафіксовано на етапі первинного проєктування DATABASE.md.

Звʼязки: N:1 User.

---

## Підсумок доданого понад оригінальний список

Нові таблиці, потрібні лише для коректного моделювання N:N звʼязків: `ProjectMember`, `CommunityMember`, `ConversationParticipant`, `EventAttendee`, `UserAchievement`, `UserBadge`. Останні дві (`UserAchievement`, `UserBadge`) не були заплановані в попередньому обговоренні — без них Achievement/Badge неможливо звʼязати з конкретним User, оскільки Achievement/Badge тепер моделюються як каталог типів, а не як записи про конкретне нагородження.

Раніше відсутні сутності Bookmark, DiaryEntry, Listing, Transaction — додано. Замість окремих таблиць Role/Permission додано поле `role` прямо в User (див. `TODO` в секції User) — свідоме спрощення, не повний RBAC.

`ConsentRecord` і `AuditLog` додано для механізму приватності/прозорості даних (Principle 4/5) — див. [ARCHITECTURE.md](ARCHITECTURE.md#приватність-і-прозорість-даних) для семантики видалення акаунта та скоупу експорту даних.

`RefreshToken` додано під час підготовки auth-інфраструктури — без нього логаут і відкликання сесій нереалізовні.
