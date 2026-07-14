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

| Поле | Тип | Опис |
|---|---|---|
| id | uuid (PK) | |
| email | string, unique, not null | |
| password_hash | string, not null | |
| username | string, unique, not null | |
| display_name | string, nullable | |
| avatar_url | string, nullable | |
| bio | text, nullable | |
| is_email_verified | boolean, default false | |
| is_active | boolean, default true | false — акаунт деактивовано користувачем |
| created_at | timestamp | |
| updated_at | timestamp | |
| deleted_at | timestamp, nullable | soft delete, Principle 5 — право на видалення |

Звʼязки: 1:N до Goal, Project (через ProjectMember), Community (через CommunityMember), Message, Conversation (через ConversationParticipant), Post, Comment, Reaction, Notification, Event (через EventAttendee), Achievement (через UserAchievement), Badge (через UserBadge), Friendship, Progress, LearningPath.

---

## Goal

| Поле | Тип | Опис |
|---|---|---|
| id | uuid (PK) | |
| user_id | uuid (FK → User) | |
| title | string, not null | |
| description | text, nullable | |
| deadline | timestamp, nullable | |
| status | enum(active, completed, abandoned), default active | |
| is_private | boolean, default true | |
| created_at | timestamp | |
| updated_at | timestamp | |

Звʼязки: N:1 User; 1:N Progress.

---

## Project

| Поле | Тип | Опис |
|---|---|---|
| id | uuid (PK) | |
| owner_id | uuid (FK → User) | |
| title | string, not null | |
| description | text, nullable | |
| status | enum(planning, active, completed, archived) | |
| created_at | timestamp | |
| updated_at | timestamp | |

Звʼязки: N:1 User (owner); N:N User через ProjectMember.

### ProjectMember (нова)

| Поле | Тип | Опис |
|---|---|---|
| id | uuid (PK) | |
| project_id | uuid (FK → Project) | |
| user_id | uuid (FK → User) | |
| role | enum(admin, member) | |
| joined_at | timestamp | |

---

## Community

| Поле | Тип | Опис |
|---|---|---|
| id | uuid (PK) | |
| owner_id | uuid (FK → User) | |
| name | string, unique, not null | |
| description | text, nullable | |
| visibility | enum(public, private) | |
| created_at | timestamp | |
| updated_at | timestamp | |

Звʼязки: N:1 User (owner); N:N User через CommunityMember; 1:N Post.

### CommunityMember (нова)

| Поле | Тип | Опис |
|---|---|---|
| id | uuid (PK) | |
| community_id | uuid (FK → Community) | |
| user_id | uuid (FK → User) | |
| role | enum(admin, moderator, member) | |
| status | enum(pending, approved) | pending — заявка на вступ до приватної спільноти |
| joined_at | timestamp | |

---

## Conversation

| Поле | Тип | Опис |
|---|---|---|
| id | uuid (PK) | |
| type | enum(direct, group) | |
| title | string, nullable | тільки для type = group |
| created_at | timestamp | |
| updated_at | timestamp | |

Звʼязки: N:N User через ConversationParticipant; 1:N Message.

### ConversationParticipant (нова)

| Поле | Тип | Опис |
|---|---|---|
| id | uuid (PK) | |
| conversation_id | uuid (FK → Conversation) | |
| user_id | uuid (FK → User) | |
| role | enum(admin, member), default member | значуще лише для group |
| joined_at | timestamp | |
| last_read_at | timestamp, nullable | |

---

## Message

| Поле | Тип | Опис |
|---|---|---|
| id | uuid (PK) | |
| conversation_id | uuid (FK → Conversation) | |
| sender_id | uuid (FK → User) | |
| content | text, not null | |
| sent_at | timestamp | |
| edited_at | timestamp, nullable | |
| deleted_at | timestamp, nullable | |

Звʼязки: N:1 Conversation; N:1 User (sender).

---

## Post

| Поле | Тип | Опис |
|---|---|---|
| id | uuid (PK) | |
| author_id | uuid (FK → User) | |
| community_id | uuid (FK → Community), nullable | null = пост на профілі автора |
| content | text, not null | |
| media_url | string, nullable | |
| created_at | timestamp | |
| updated_at | timestamp | |
| deleted_at | timestamp, nullable | |

Звʼязки: N:1 User (author); N:1 Community (optional); 1:N Comment; 1:N Reaction (через target_type = post).

---

## Comment

| Поле | Тип | Опис |
|---|---|---|
| id | uuid (PK) | |
| post_id | uuid (FK → Post) | |
| author_id | uuid (FK → User) | |
| parent_comment_id | uuid (FK → Comment), nullable | null = коментар верхнього рівня |
| content | text, not null | |
| created_at | timestamp | |
| updated_at | timestamp | |
| deleted_at | timestamp, nullable | |

`TODO`: припускаю треди (self-reference через `parent_comment_id`), а не пласку структуру — не було зафіксовано в жодному документі.

Звʼязки: N:1 Post; N:1 User (author); N:1 Comment (self, parent); 1:N Reaction (через target_type = comment).

---

## Reaction

| Поле | Тип | Опис |
|---|---|---|
| id | uuid (PK) | |
| user_id | uuid (FK → User) | |
| target_type | enum(post, comment) | |
| target_id | uuid | id Post або Comment залежно від target_type |
| type | string | тип реакції |
| created_at | timestamp | |

`TODO`: поліморфний звʼязок (`target_type` + `target_id`) — припущення архітектора; альтернатива — окремі таблиці `PostReaction`/`CommentReaction`. Набір значень `type` (лайк/інші) продуктом не визначено.

Обмеження: unique(user_id, target_type, target_id, type) — одна реакція одного типу від користувача на обʼєкт.

---

## Notification

| Поле | Тип | Опис |
|---|---|---|
| id | uuid (PK) | |
| user_id | uuid (FK → User) | отримувач |
| actor_id | uuid (FK → User), nullable | хто спричинив подію |
| type | string | напр. friend_request, message, comment, reaction, achievement, event |
| target_type | string, nullable | тип обʼєкта, на який веде сповіщення |
| target_id | uuid, nullable | |
| is_read | boolean, default false | |
| created_at | timestamp | |

`TODO`: `target_type`/`target_id` — поліморфне посилання, той самий підхід, що й у Reaction; повний список `type` не зафіксовано продуктом.

---

## Event

| Поле | Тип | Опис |
|---|---|---|
| id | uuid (PK) | |
| organizer_id | uuid (FK → User) | |
| title | string, not null | |
| description | text, nullable | |
| format | enum(online, offline) | |
| location_or_link | string, nullable | |
| starts_at | timestamp, not null | |
| ends_at | timestamp, nullable | |
| created_at | timestamp | |
| updated_at | timestamp | |

Звʼязки: N:1 User (organizer); N:N User через EventAttendee.

### EventAttendee (нова)

| Поле | Тип | Опис |
|---|---|---|
| id | uuid (PK) | |
| event_id | uuid (FK → Event) | |
| user_id | uuid (FK → User) | |
| status | enum(going, interested, declined) | |
| registered_at | timestamp | |

---

## Achievement

| Поле | Тип | Опис |
|---|---|---|
| id | uuid (PK) | |
| code | string, unique, not null | напр. "first_goal_completed" |
| title | string, not null | |
| description | text, nullable | |
| icon_url | string, nullable | |
| created_at | timestamp | |

Звʼязки: N:N User через UserAchievement.

### UserAchievement (нова)

| Поле | Тип | Опис |
|---|---|---|
| id | uuid (PK) | |
| user_id | uuid (FK → User) | |
| achievement_id | uuid (FK → Achievement) | |
| earned_at | timestamp | |

---

## Badge

| Поле | Тип | Опис |
|---|---|---|
| id | uuid (PK) | |
| code | string, unique, not null | |
| title | string, not null | |
| description | text, nullable | |
| icon_url | string, nullable | |
| level | enum(bronze, silver, gold), nullable | |
| created_at | timestamp | |

Звʼязки: N:N User через UserBadge.

`TODO`: різниця Achievement vs Badge не була зафіксована в жодному документі. Припущення архітектора: **Achievement** — разова подія-віха (напр. "завершив першу ціль"), фіксується один раз; **Badge** — статус-символ із рівнями (bronze/silver/gold), може оновлюватись з часом (той самий `code`, зростає `level`). Потребує підтвердження продуктом.

### UserBadge (нова)

| Поле | Тип | Опис |
|---|---|---|
| id | uuid (PK) | |
| user_id | uuid (FK → User) | |
| badge_id | uuid (FK → Badge) | |
| earned_at | timestamp | |

---

## Friendship

| Поле | Тип | Опис |
|---|---|---|
| id | uuid (PK) | |
| requester_id | uuid (FK → User) | |
| addressee_id | uuid (FK → User) | |
| status | enum(pending, accepted, blocked) | |
| created_at | timestamp | |
| updated_at | timestamp | |

`TODO`: припущення — напрямлена модель (requester/addressee) для підтримки статусу pending; після accepted звʼязок трактується як симетричний в обидва боки. Обмеження: unique(requester_id, addressee_id).

---

## LearningPath

| Поле | Тип | Опис |
|---|---|---|
| id | uuid (PK) | |
| created_by | uuid (FK → User), nullable | null = створено платформою |
| title | string, not null | |
| description | text, nullable | |
| created_at | timestamp | |
| updated_at | timestamp | |

`TODO`: внутрішня структура (лінійний список кроків/уроків чи щось складніше) не визначена — залишаю поза цим документом, щоб не змішувати з задачею "Навчальні кімнати" (Phase 5), яка теж не спроєктована. Розширення цієї таблиці — окрема задача, коли буде продуктове рішення.

Звʼязки: N:1 User (created_by, optional); 1:N Progress.

---

## Progress

| Поле | Тип | Опис |
|---|---|---|
| id | uuid (PK) | |
| user_id | uuid (FK → User) | |
| goal_id | uuid (FK → Goal), nullable | |
| learning_path_id | uuid (FK → LearningPath), nullable | |
| value | integer, nullable | напр. відсоток виконання |
| note | text, nullable | |
| recorded_at | timestamp | |

`TODO`: припущення — один запис Progress стосується або Goal, або LearningPath, ніколи обох одночасно; обмеження "рівно одне заповнене" контролюється на рівні бізнес-логіки, не схемою.

Звʼязки: N:1 User; N:1 Goal (optional); N:1 LearningPath (optional).

---

## Підсумок доданого понад оригінальний список

Нові таблиці, потрібні лише для коректного моделювання N:N звʼязків: `ProjectMember`, `CommunityMember`, `ConversationParticipant`, `EventAttendee`, `UserAchievement`, `UserBadge`. Останні дві (`UserAchievement`, `UserBadge`) не були заплановані в попередньому обговоренні — без них Achievement/Badge неможливо звʼязати з конкретним User, оскільки Achievement/Badge тепер моделюються як каталог типів, а не як записи про конкретне нагородження.

Сутності, яких досі бракує (Bookmark, DiaryEntry, Listing/Transaction, Role/Permission) — окрема задача в [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md), не включена в цю правку.
