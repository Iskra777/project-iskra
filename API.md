# API

Контракти ендпоінтів. Кожен розділ — окремий ендпоінт, описаний перед реалізацією (продовження [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md)).

## Умовності

- Формат помилок єдиний для всіх ендпоінтів: `{ "error": { "code": string, "message": string } }`.
- Access-токен передається в тілі відповіді, клієнт тримає його в пам'яті й шле як `Authorization: Bearer <token>`. Refresh-токен — лише httpOnly cookie, ніколи в тілі відповіді й ніколи не читається з JS.
- Коди помилок — стабільний контракт для клієнта (не змінювати без потреби); текст `message` — для показу користувачу, може змінюватись вільно.

---

## POST /api/auth/login

Логін лише за email (не за username).

### Request

```json
{
  "email": "string",
  "password": "string"
}
```

### Response 200

```json
{
  "user": {
    "id": "uuid",
    "email": "string",
    "username": "string",
    "displayName": "string | null",
    "avatarUrl": "string | null",
    "role": "user | moderator | admin"
  },
  "accessToken": "string"
}
```

Додатково `Set-Cookie: refresh_token=<jwt>; HttpOnly; Secure (лише production); SameSite=Lax; Path=/api/auth; Max-Age=2592000` (30 днів, збігається з `REFRESH_TOKEN_TTL_SECONDS` у [lib/auth/tokens.ts](lib/auth/tokens.ts)).

### Помилки

| code                  | HTTP | Коли                                                                                                         |
| --------------------- | ---- | ------------------------------------------------------------------------------------------------------------ |
| `validation_error`    | 400  | Невалідне тіло запиту (відсутній email/password, невалідний формат)                                          |
| `invalid_credentials` | 401  | Email не знайдено АБО пароль невірний — **навмисно однакова відповідь**, щоб не давати email-enumeration     |
| `email_not_verified`  | 403  | `User.is_email_verified = false`                                                                             |
| `account_deactivated` | 403  | `User.is_active = false` або `User.deleted_at` заповнено                                                     |
| `rate_limited`        | 429  | Перевищено ліміт спроб — 5/15хв на email, 20/15хв на IP. Відповідь містить заголовок `Retry-After` (секунди) |

`TODO`: `account_deactivated`/`email_not_verified` навмисно отримують окремі коди, а не змішані з `invalid_credentials` — UI-вимога з DEVELOPMENT_PLAN.md ("невірний пароль, заблокований акаунт, непідтверджений email" — різні стани). Це невеликий компроміс проти enumeration-стійкості; реєстрація однаково розкриває зайнятість email через перевірку дублікатів, тож повна стійкість тут недосяжна в принципі.

Лічильник rate limit — in-memory ([lib/rate-limit.ts](lib/rate-limit.ts)), рахує лише невдалі спроби (успішний логін не штрафується). Відомий ризик: скидається при рестарті процесу, не шариться між інстансами — див. ARCHITECTURE.md.

---

## POST /api/auth/refresh

Оновлює access-токен, використовуючи `refresh_token` cookie. Ротація: старий refresh-токен відкликається, видається нова пара.

### Request

Без тіла — токен береться з cookie `refresh_token` (виставляється при логіні, `Path=/api/auth`).

### Response 200

```json
{
  "accessToken": "string"
}
```

Додатково новий `Set-Cookie: refresh_token=<jwt>; ...` (та сама конфігурація, що й у login).

### Помилки

| code            | HTTP | Коли                                                                                               |
| --------------- | ---- | -------------------------------------------------------------------------------------------------- |
| `invalid_token` | 401  | Cookie відсутня, JWT невалідний/протермінований, або відповідний RefreshToken відкликаний/не існує |

`TODO`: повторне використання вже відкликаного refresh-токена (можлива ознака крадіжки) поки що просто повертає `invalid_token`, без додаткових дій (напр. масового відкликання всіх сесій користувача). Досить для MVP; розширити, якщо зʼявиться потреба.

---

## POST /api/auth/logout

Інвалідує сесію. **Ідемпотентний** — завжди повертає 200 і чистить cookie, незалежно від того, чи була сесія валідною (виклик без активної сесії — не помилка).

### Request

Без тіла — токен береться з cookie `refresh_token`.

### Response 200

```json
{
  "success": true
}
```

`Set-Cookie: refresh_token=; Max-Age=0` (очищення).

### Помилки

Немає — ендпоінт завжди повертає 200.

`TODO`: access-токен окремо не інвалідується — короткоживий (15 хв) і stateless за дизайном; після логауту просто перестає поновлюватись через `/refresh`. Свідомий компроміс, не оверсайт.

---

## POST /api/auth/register

### Request

```json
{
  "email": "string",
  "username": "string",
  "password": "string",
  "displayName": "string | null",
  "consent": true
}
```

`consent` — обов'язково `true`. Успішна реєстрація створює запис `ConsentRecord` ([DATABASE.md](DATABASE.md#consentrecord)) — фіксує, що й коли користувач прийняв.

### Response 201

```json
{
  "user": {
    "id": "uuid",
    "email": "string",
    "username": "string",
    "displayName": "string | null",
    "avatarUrl": "string | null",
    "role": "user | moderator | admin"
  }
}
```

Без токенів — реєстрація не логінить одразу. `is_email_verified = false` за замовчуванням, а `POST /api/auth/login` уже блокує неверифікований email (`email_not_verified`) — узгоджено з наявною поведінкою, окремого рішення тут не було.

### Помилки

| code               | HTTP | Коли                                                                                                                      |
| ------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------- |
| `validation_error` | 400  | Невалідне тіло, відсутній/`false` `consent`, невалідний email                                                             |
| `weak_password`    | 400  | Пароль не відповідає складності — правила визначаються в задачі "Реалізувати правила валідації email і складності пароля" |
| `email_taken`      | 409  | Email вже зареєстровано                                                                                                   |
| `username_taken`   | 409  | Username вже зайнятий                                                                                                     |

`TODO`: `email_taken`/`username_taken` — окремі коди, на відміну від `invalid_credentials` у login. Тут злиття кодів не додало б anti-enumeration захисту (перебором однаково визначити зайнятість), лише погіршило б UX — стандартна поведінка при реєстрації показувати, яке саме поле зайняте.

`TODO`: правила формату username (довжина, дозволені символи) не мають окремої задачі в DEVELOPMENT_PLAN.md — приєднані до задачі валідації email/пароля як природний сусід.

---

## POST /api/auth/verify-email

Посилання з листа веде на фронтенд-сторінку `/verify-email?token=...` (окрема майбутня UI-задача), яка викликає цей ендпоінт.

### Request

```json
{
  "token": "string"
}
```

### Response 200

```json
{
  "success": true
}
```

Виставляє `User.isEmailVerified = true`, позначає `EmailVerificationToken.used_at`. **Без авто-логіну** — свідомо, це виходить за межі задачі; вхід лишається окремим кроком користувача.

### Помилки

| code               | HTTP | Коли                                                                                             |
| ------------------ | ---- | ------------------------------------------------------------------------------------------------ |
| `validation_error` | 400  | Відсутній `token`                                                                                |
| `invalid_token`    | 400  | Токен не знайдено, протермінований, або вже використаний — **однакова відповідь для всіх трьох** |

`TODO`: "вже використаний" токен свідомо не відрізняється від "невалідного" — той самий підхід, що й з reuse відкликаного refresh-токена (POST /api/auth/refresh).

---

## POST /api/auth/request-password-reset

### Request

```json
{
  "email": "string"
}
```

### Response 200

```json
{
  "success": true
}
```

**Завжди однакова відповідь**, незалежно від того, чи існує акаунт з таким email — цей ендпоінт не повинен дозволяти перевіряти, які email зареєстровані. Якщо email не знайдено, нічого не відбувається (лист не шлеться), але клієнту про це не повідомляється.

Rate limit — 3/год на email, 10/год на IP. Перевірка ліміту йде **до** перевірки існування користувача, тому сам факт `rate_limited` теж не видає, чи є акаунт.

### Помилки

| code               | HTTP | Коли                                       |
| ------------------ | ---- | ------------------------------------------ |
| `validation_error` | 400  | Невалідний email                           |
| `rate_limited`     | 429  | Перевищено ліміт — заголовок `Retry-After` |

`TODO`: повна anti-enumeration стійкість тут все одно недосяжна — реєстрація (`POST /api/auth/register`) вже свідомо розкриває зайнятість email через `email_taken`. Однакова відповідь тут — усе ще стандартна практика, але не єдиний спосіб дізнатись про існування акаунта в цьому проєкті.

---

## POST /api/auth/reset-password

### Request

```json
{
  "token": "string",
  "password": "string"
}
```

### Response 200

```json
{
  "success": true
}
```

Оновлює `User.passwordHash`, позначає `PasswordResetToken.used_at`. **Відкликає всі активні RefreshToken користувача** — скидання пароля часто трапляється через підозру компрометації, тож усі існуючі сесії завершуються (доведеться увійти заново на кожному пристрої).

### Помилки

| code               | HTTP | Коли                                                                                         |
| ------------------ | ---- | -------------------------------------------------------------------------------------------- |
| `validation_error` | 400  | Відсутній `token`                                                                            |
| `weak_password`    | 400  | Пароль не відповідає складності ([passwordSchema](lib/auth/validation.ts))                   |
| `invalid_token`    | 400  | Токен не знайдено, протермінований, або вже використаний — однакова відповідь для всіх трьох |

---

## GET /api/users/:username

Публічний ендпоінт — `Authorization` опційний. Якщо переданий і належить власнику профілю, повертається розширений набір полів; інакше — лише публічний.

### Request

Без тіла. Опційно `Authorization: Bearer <accessToken>`.

### Response 200 (чужий профіль або анонімний запит)

```json
{
  "user": {
    "id": "uuid",
    "username": "string",
    "displayName": "string | null",
    "avatarUrl": "string | null",
    "bio": "string | null",
    "location": "string | null",
    "createdAt": "timestamp",
    "friendshipStatus": "none | pending_sent | pending_received | accepted | blocked_by_viewer | blocked_by_other | undefined"
  }
}
```

`friendshipStatus` — лише коли переглядач авторизований (`undefined` для анонімного запиту чи власного профілю). Керує кнопкою додати/видалити друга в UI. `blocked_by_other` **не** ховає профіль і не блокує звичайний перегляд — свідома, задокументована прогалина анти-enumeration (див. `TODO` у `POST .../friend-request` вище).

### Response 200 (власний профіль — `Authorization` належить цьому користувачу)

Те саме, плюс `email`, `role`, `isEmailVerified`, `isActive`, `updatedAt` — повний список і обґрунтування публічності кожного поля в [DATABASE.md](DATABASE.md#публічність-полів-profile-phase-1).

### Помилки

| code        | HTTP | Коли                                                                                                                        |
| ----------- | ---- | --------------------------------------------------------------------------------------------------------------------------- |
| `not_found` | 404  | Username не існує, АБО акаунт деактивований/видалений — **однакова відповідь для всіх трьох випадків, включно з власником** |

`TODO`: деактивований/видалений акаунт повертає `not_found` навіть власнику. Це узгоджено з тим, що такий акаунт однаково не може отримати свіжий access-токен (логін блокує `account_deactivated`) — сценарій "власник переглядає свій деактивований профіль" на практиці недосяжний, тож окремого коду для нього не роблю.

---

## GET /api/users/search

Пошук користувачів за підрядком `username`/`displayName`, регістронезалежно. Публічний ендпоінт — авторизація не потрібна (той самий рівень доступу, що й `GET /api/users/:username`).

### Request

Query-параметр `q` (обов'язковий, 2-100 символів).

### Response 200

```json
{
  "users": [
    {
      "id": "uuid",
      "username": "string",
      "displayName": "string | null",
      "avatarUrl": "string | null"
    }
  ]
}
```

Максимум 20 результатів, без пагінації — Phase 1, датасет малий. Деактивовані/видалені акаунти виключено. Прискорено GIN trigram-індексами (`pg_trgm`) на `username`/`display_name` — [migration.sql](prisma/migrations/20260715071425_add_user_search_indexes/migration.sql).

### Помилки

| code               | HTTP | Коли                                    |
| ------------------ | ---- | --------------------------------------- |
| `validation_error` | 400  | `q` відсутній або коротший за 2 символи |

`TODO`: без авторизації і без rate-limit — прийнятно для MVP (як і `GET /api/users/:username`), але потенційний вектор для scraping усієї бази користувачів при масштабуванні; задокументовано як відомий ризик в ARCHITECTURE.md.

---

## GET /api/auth/me

"Хто я" — використовується клієнтським `SessionProvider` ([lib/auth/session-context.tsx](lib/auth/session-context.tsx)) для відновлення сесії при завантаженні застосунку (після `POST /api/auth/refresh`, коли є accessToken, але ще невідомо, кому він належить).

### Request

Без тіла. **`Authorization` обов'язковий** (на відміну від `GET /api/users/:username`, де він опційний).

### Response 200

Той самий повний набір полів, що й у власному перегляді профілю (`GET /api/users/:username` — Response 200 для власника).

### Помилки

| code            | HTTP | Коли                                                                                                            |
| --------------- | ---- | --------------------------------------------------------------------------------------------------------------- |
| `invalid_token` | 401  | `Authorization` відсутній/невалідний, АБО акаунт деактивований/видалений — однакова відповідь для обох випадків |

---

## PATCH /api/users/me

Редагування власного профілю. `/me`, не `/api/users/:username` — редагувати можна лише себе.

### Request

Усі поля опційні (частковий апдейт). `null` очищає поле, відсутнє поле лишає без змін.

```json
{
  "displayName": "string | null",
  "bio": "string | null",
  "location": "string | null"
}
```

**Не редагується тут:** `email`, `username` (зміна пошти вимагала б повторної верифікації, зміна username зачіпає унікальність/URL — жодне не запитувалось), `avatarUrl` (окремий ендпоінт — `POST /api/users/me/avatar`).

Ліміти: `displayName` 1-100 символів, `bio` до 500, `location` до 100.

### Response 200

Той самий повний набір полів, що й у `GET /api/auth/me`.

### Помилки

| code               | HTTP | Коли                                                   |
| ------------------ | ---- | ------------------------------------------------------ |
| `invalid_token`    | 401  | `Authorization` відсутній/невалідний/акаунт неактивний |
| `validation_error` | 400  | Порушено ліміти довжини полів                          |

---

## POST /api/users/me/avatar

Завантаження/заміна аватара. Зберігається в Cloudinary; повторна заливка перезаписує попередній аватар (той самий `public_id` = id користувача), сирітські файли не накопичуються.

### Request

`multipart/form-data`, одне поле `avatar` — файл PNG/JPEG/WEBP, до 5MB.

Реальний тип файлу перевіряється по сигнатурі байтів на сервері (заголовок `Content-Type` від клієнта не є джерелом правди). Зображення приводиться до 512×512 (crop `fill`, gravity `face`) і перекодовується у webp — це заразом прибирає EXIF-метадані оригіналу (Principle 5).

### Response 200

Той самий повний набір полів, що й у `GET /api/auth/me`, з оновленим `avatarUrl`.

### Помилки

| code                    | HTTP | Коли                                                   |
| ----------------------- | ---- | ------------------------------------------------------ |
| `invalid_token`         | 401  | `Authorization` відсутній/невалідний/акаунт неактивний |
| `validation_error`      | 400  | Поле `avatar` відсутнє в тілі запиту                   |
| `unsupported_file_type` | 400  | Байти файлу не відповідають PNG/JPEG/WEBP              |
| `file_too_large`        | 413  | Файл більший за 5MB                                    |
| `upload_failed`         | 502  | Cloudinary недоступний/відхилив заливку                |

---

## DELETE /api/users/me

Видалення власного акаунта — Principle 5. Soft-delete (`User.deleted_at`), не hard-delete: `TODO` остаточне видалення через N днів не реалізовано, чекає на окреме продуктове/юридичне рішення ([ARCHITECTURE.md](ARCHITECTURE.md#свідомо-відкладені-рішення)).

### Request

```json
{
  "password": "string"
}
```

Пароль — повторна автентифікація перед деструктивною дією; самого access-токена недостатньо (той самий принцип, що й у `POST /api/auth/reset-password`).

### Response 200

```json
{
  "success": true
}
```

При успіху: `User.deletedAt` виставляється, усі активні `RefreshToken` користувача відкликаються, `Set-Cookie` чистить `refresh_token`, у `AuditLog` пишеться запис `account_deletion_requested`.

### Помилки

| code                  | HTTP | Коли                                                   |
| --------------------- | ---- | ------------------------------------------------------ |
| `invalid_token`       | 401  | `Authorization` відсутній/невалідний/акаунт неактивний |
| `validation_error`    | 400  | Поле `password` відсутнє/порожнє                       |
| `invalid_credentials` | 401  | Невірний пароль                                        |

---

## GET /api/users/me/export

Експорт власних даних — Principle 5. Повертає структурований JSON-дамп усіх даних, де користувач є власником.

**Скоуп Phase 1:** лише профіль (`User`) — інші сутності з повного списку в [ARCHITECTURE.md](ARCHITECTURE.md#приватність-і-прозорість-даних) (Goal, Post, Message тощо) ще не реалізовані в застосунку. Формат відповіді (`{ user: {...} }`) розрахований на розширення додатковими ключами, коли ці сутності зʼявляться.

### Request

Без тіла — токен через `Authorization`.

### Response 200

```json
{
  "exportedAt": "string (ISO 8601)",
  "user": {/* той самий повний набір полів, що й у GET /api/auth/me */}
}
```

`Content-Disposition: attachment; filename="iskra-data-export.json"` — браузер сам пропонує зберегти файл. У `AuditLog` пишеться запис `data_export_requested`.

### Помилки

| code            | HTTP | Коли                                                   |
| --------------- | ---- | ------------------------------------------------------ |
| `invalid_token` | 401  | `Authorization` відсутній/невалідний/акаунт неактивний |

---

## POST /api/users/:username/friend-request

Надсилання запиту дружби. Ціль — у URL (типовий контекст: зі сторінки чужого профілю).

### Request

Без тіла. Вимагає `Authorization`.

### Response 201

```json
{
  "success": true
}
```

Створює `Friendship` зі статусом `pending`. Повна семантика переходів станів — [DATABASE.md](DATABASE.md#friendship).

### Помилки

| code                      | HTTP | Коли                                                              |
| ------------------------- | ---- | ----------------------------------------------------------------- |
| `invalid_token`           | 401  | `Authorization` відсутній/невалідний                              |
| `not_found`               | 404  | Username не існує, або акаунт деактивований/видалений             |
| `cannot_friend_self`      | 400  | Запит самому собі                                                 |
| `blocked`                 | 403  | Між користувачами існує `blocked`-звʼязок (в будь-якому напрямку) |
| `request_already_pending` | 409  | Запит уже надіслано (в будь-якому напрямку)                       |
| `already_friends`         | 409  | Уже друзі (`accepted`)                                            |

`TODO`: `blocked` тут відкриває сам факт блокування — той, кого заблокували, дізнається про це через код помилки. Повна анти-enumeration вимагала б, щоб `GET /api/users/:username` і пошук теж ховали профіль заблокованого — цього ще нема (Phase 1 ендпоінти вже здані без цієї логіки). Часткова, свідома прогалина, не помилка.

---

## PATCH /api/users/:username/friend-request

Прийняття/відхилення запиту дружби. Той самий ресурс, що й `POST` вище, інший метод. **`:username` тут — той, хто надіслав запит**, не ціль — відповідаєш на його запит.

### Request

```json
{
  "action": "accept | reject"
}
```

### Response 200

```json
{
  "success": true
}
```

`accept` → `Friendship.status = accepted`. `reject` → рядок видаляється (за DATABASE.md `pending` не має окремого статусу "rejected").

### Помилки

| code                       | HTTP | Коли                                                                                                                                          |
| -------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid_token`            | 401  | `Authorization` відсутній/невалідний                                                                                                          |
| `validation_error`         | 400  | `action` відсутній або не `accept`/`reject`                                                                                                   |
| `not_found`                | 404  | Username відправника не існує, або акаунт деактивований/видалений                                                                             |
| `friend_request_not_found` | 404  | Немає `pending`-запиту саме від цього користувача до тебе — включно з випадком, коли хтось намагається відповісти на чужий запит (не адресат) |

---

## DELETE /api/users/:username/friendship

Прибирає стосунок із цим користувачем, яким би він не був — скасування власного `pending`-запиту, unfriend (`accepted`), або unblock (`blocked`, лише якщо ти блокувальник).

### Request

Без тіла. Вимагає `Authorization`.

### Response 200

```json
{
  "success": true
}
```

### Помилки

| code                   | HTTP | Коли                                                                   |
| ---------------------- | ---- | ---------------------------------------------------------------------- |
| `invalid_token`        | 401  | `Authorization` відсутній/невалідний                                   |
| `not_found`            | 404  | Username не існує, або акаунт деактивований/видалений                  |
| `friendship_not_found` | 404  | Між вами взагалі немає рядка `Friendship`                              |
| `cannot_unblock`       | 403  | Стосунок `blocked`, але саме ти — заблокована сторона, не блокувальник |

---

## POST /api/users/:username/block

Блокує користувача незалежно від поточного стану (немає стосунку/`pending`/`accepted`). `requesterId`/`addresseeId` перезаписуються так, щоб блокувальник завжди був `requesterId` — семантика в [DATABASE.md](DATABASE.md#friendship).

### Request

Без тіла. Вимагає `Authorization`.

### Response 200

```json
{
  "success": true
}
```

### Помилки

| code                | HTTP | Коли                                                  |
| ------------------- | ---- | ----------------------------------------------------- |
| `invalid_token`     | 401  | `Authorization` відсутній/невалідний                  |
| `not_found`         | 404  | Username не існує, або акаунт деактивований/видалений |
| `cannot_block_self` | 400  | Спроба заблокувати самого себе                        |
| `already_blocked`   | 409  | Стосунок уже `blocked` (в обидва боки)                |

---

## GET /api/users/me/friend-requests

Вхідні (не вихідні) запити дружби зі статусом `pending`. Запити від деактивованих/видалених акаунтів виключено.

### Request

Без тіла — токен через `Authorization`.

### Response 200

```json
{
  "requests": [
    {
      "id": "uuid (Friendship.id)",
      "createdAt": "timestamp",
      "requester": {
        "id": "uuid",
        "username": "string",
        "displayName": "string | null",
        "avatarUrl": "string | null"
      }
    }
  ]
}
```

### Помилки

| code            | HTTP | Коли                                 |
| --------------- | ---- | ------------------------------------ |
| `invalid_token` | 401  | `Authorization` відсутній/невалідний |

---

## GET /api/users/me/friends

Список прийнятих (`accepted`) друзів. Напрямок requester/addressee не має значення після accept — повертається завжди "інший" учасник пари. Деактивовані/видалені друзі виключено.

### Request

Без тіла — токен через `Authorization`.

### Response 200

```json
{
  "friends": [
    {
      "id": "uuid",
      "username": "string",
      "displayName": "string | null",
      "avatarUrl": "string | null"
    }
  ]
}
```

### Помилки

| code            | HTTP | Коли                                 |
| --------------- | ---- | ------------------------------------ |
| `invalid_token` | 401  | `Authorization` відсутній/невалідний |

---

## POST /api/conversations

Створює `direct`-розмову з іншим користувачем, або повертає вже наявну (не дублює).

### Request

```json
{
  "username": "string"
}
```

### Response 201 (нова розмова) / 200 (уже існувала)

```json
{
  "conversation": {
    "id": "uuid",
    "otherParticipant": {
      "id": "uuid",
      "username": "string",
      "displayName": "string | null",
      "avatarUrl": "string | null"
    }
  }
}
```

### Помилки

| code                  | HTTP | Коли                                                                                                                                                    |
| --------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid_token`       | 401  | `Authorization` відсутній/невалідний                                                                                                                    |
| `validation_error`    | 400  | `username` відсутній                                                                                                                                    |
| `not_found`           | 404  | Username не існує, або акаунт деактивований/видалений                                                                                                   |
| `cannot_message_self` | 400  | Спроба написати самому собі                                                                                                                             |
| `blocked`             | 403  | Між користувачами є `blocked`-звʼязок (в обидва боки) — перевірка не входила прямо в задачу, додана свідомо, щоб не обходити вже реалізоване блокування |

---

## POST /api/conversations/:id/messages

Надсилання повідомлення в розмову.

### Request

```json
{
  "content": "string"
}
```

Ліміт 1-5000 символів (після `trim()`).

### Response 201

```json
{
  "message": {
    "id": "uuid",
    "conversationId": "uuid",
    "senderId": "uuid",
    "content": "string",
    "sentAt": "timestamp"
  }
}
```

При успіху також оновлюються `Conversation.updatedAt` (для майбутнього сортування списку розмов за активністю) і власний `ConversationParticipant.lastReadAt` відправника (щойно надіслане повідомлення не може бути "непрочитаним" для автора).

### Помилки

| code               | HTTP | Коли                                                                                                                                  |
| ------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid_token`    | 401  | `Authorization` відсутній/невалідний                                                                                                  |
| `validation_error` | 400  | `content` порожній (після trim) або довший за 5000 символів                                                                           |
| `not_found`        | 404  | Розмова не існує, АБО ти не її учасник — **однакова відповідь для обох випадків**, не підтверджуємо існування чужої розмови стороннім |

---

## GET /api/conversations/:id/messages

Історія повідомлень з курсорною пагінацією. Найновіші першими (типово для чату — довантаження старіших при скролі вгору).

### Request

Query-параметри (обидва опційні): `before` (uuid повідомлення — ексклюзивно, старіші за нього), `limit` (1-100, за замовчуванням 30).

### Response 200

```json
{
  "messages": [
    {
      "id": "uuid",
      "conversationId": "uuid",
      "senderId": "uuid",
      "content": "string",
      "sentAt": "timestamp",
      "editedAt": "timestamp | null"
    }
  ],
  "nextCursor": "uuid | null"
}
```

`nextCursor` — id найстарішого повідомлення сторінки; передати як `before` для наступної сторінки. `null`, якщо сторінка не заповнена повністю (більше нема що довантажувати). М'яко видалені повідомлення (`deletedAt`) виключено.

### Помилки

| code               | HTTP | Коли                                                                       |
| ------------------ | ---- | -------------------------------------------------------------------------- |
| `invalid_token`    | 401  | `Authorization` відсутній/невалідний                                       |
| `validation_error` | 400  | `before` не uuid, `before` з іншої розмови, або `limit` поза межами 1-100  |
| `not_found`        | 404  | Розмова не існує, АБО ти не її учасник — та сама угода, що й у `POST` вище |
