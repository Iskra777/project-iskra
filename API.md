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
