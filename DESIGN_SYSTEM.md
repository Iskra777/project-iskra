# Design System

## Style

Minimal

Modern

Elegant

Friendly

---

## Theme

Dark by default

Light optional

---

## Colors

Background

#0B0F19

Cards

#141A27

Primary

Electric Blue — `#3B82F6`

Accent

Amber — `#F59E0B`

Danger

Red — `#EF4444`

Success

Green — `#22C55E`

`TODO`: hex обрані за конвенцією Tailwind CSS (крок 500) — узгоджено з обраним стек (ARCHITECTURE.md → Tech Stack), формально не пройшли WCAG-аудит контрасту, лише візуальну перевірку в наступній задачі (базові UI-компоненти).

---

## Radius

16px

---

## Animations

Fast

Smooth

Natural

No aggressive effects

---

## Typography

Readable

Large headings

Comfortable spacing

Шрифт — Geist (уже підключений через `next/font`).

Шкала:

| Рівень | Розмір          | Вага     |
| ------ | --------------- | -------- |
| h1     | 2.5rem (40px)   | bold     |
| h2     | 2rem (32px)     | semibold |
| h3     | 1.5rem (24px)   | semibold |
| body   | 1rem (16px)     | regular  |
| small  | 0.875rem (14px) | regular  |

---

## Spacing і брейкпоінти

Стандартна шкала Tailwind CSS (4px база; брейкпоінти sm/md/lg/xl/2xl) без кастомізації — свідоме рішення, не пропуск: власна шкала не потрібна, поки немає конкретної причини відхилятись від дефолту.

---

## Philosophy

Every screen should answer one question:

"What can I do next?"

Never overwhelm the user.

Never make the interface noisy.

Keep everything calm.

The interface should feel like a place where ideas are born.
