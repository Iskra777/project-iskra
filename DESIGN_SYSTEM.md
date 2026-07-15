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

Fire Orange — `#F97316` (було Electric Blue `#3B82F6` — свідомо замінено на прохання власника продукту: "вогняна" гама, пов'язана з мотивом іскри/блискавки)

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

Картки (`Card` на кожній сторінці) масштабуються по брейкпоінтах — `max-w-sm` → `md:max-w-md lg:max-w-lg xl:max-w-xl` (і `max-w-md` → `md:max-w-lg lg:max-w-xl xl:max-w-2xl`), той самий патерн у всіх ~17 сторінок. Мобільний вигляд (`base`) не змінюється — лише десктоп/планшет/дуже широкі монітори отримують пропорційно ширшу картку замість тієї самої вузької, розтягнутої в порожньому чорному полі. Екран чату — єдиний виняток без картки: обмежений `md:max-w-2xl lg:max-w-3xl xl:max-w-4xl` напряму на кореневому контейнері, бо там немає центрованої картки, а повнокраяний список повідомлень.

`TODO`: щабель `xl` (1280px+) підібраний під конкретний звіт власника продукту (монітор ~2138px CSS-пікселів) — на ще ширших/2xl екранах картка все одно лишиться на `xl`-значенні (немає окремого `2xl:` кроку), це свідомий компроміс "комфортна ширина читання" проти "заповнити весь екран".

---

## Навігація

Плаваюча нижня панель з іконками (`components/bottom-nav.tsx`) замість текстових посилань у шапці — з'явилась як явне побажання: іконки, не написи. Верхня шапка (`components/nav.tsx`) звужена до бренду й виходу; весь основний рух — знизу, `fixed`, з активним табом підсвіченим `text-primary`.

Пункти зараз відповідають готовим сторінкам (Головна, Друзі, Повідомлення, Пошук, Профіль) — нових пунктів не додавали заздалегідь під нереалізовані фази (Спільноти, Цілі тощо), кожен зайде своєю чергою, коли зʼявиться відповідна сторінка.

`ToastPrimitive.Viewport` підняли до `bottom-24`, щоб тости не перекривали плаваючу панель знизу.

Активний таб має ефект світіння: іконка в заокругленому квадраті (`rounded-[12px]`) з `border-primary/40`, `bg-primary/10` і `shadow-primary/50` — м'яке підсвічування кольором Primary, а не просто зміна кольору іконки/тексту.

---

## Philosophy

Every screen should answer one question:

"What can I do next?"

Never overwhelm the user.

Never make the interface noisy.

Keep everything calm.

The interface should feel like a place where ideas are born.
