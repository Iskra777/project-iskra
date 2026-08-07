// DESIGN_SYSTEM.md — Iskra токени. Застосунок dark-first (light — "опційний",
// не побудований навіть у веб-версії), тож `light` тут лише розумний
// мінімальний варіант, не повний паралельний дизайн.

const primary = "#F97316"; // Fire Orange
const accent = "#F59E0B"; // Amber
const danger = "#EF4444";
const success = "#22C55E";

export default {
  light: {
    text: "#0B0F19",
    background: "#FFFFFF",
    card: "#F3F4F6",
    border: "#E5E7EB",
    tint: primary,
    accent,
    danger,
    success,
    tabIconDefault: "#9CA3AF",
    tabIconSelected: primary,
  },
  dark: {
    text: "#F9FAFB",
    // DESIGN_SYSTEM.md вказує #0B0F19/#141A27 (Colors → Background/Cards),
    // але на мобільних екранах обидва відтінки читаються помітно синіми
    // (B-канал найвищий) — і, на відміну від вебу (де незаданий фон CSS
    // прозорий), `View` з components/Themed.tsx завжди малює color.background
    // непрозоро за замовчуванням, тож будь-який вкладений View без явного
    // transparent лягає синім шаром поверх картки. За проханням власника
    // продукту нейтралізовано обидва кольори, лише для apps/mobile.
    background: "#0A0A0C",
    card: "#1A1A1F",
    border: "#2A2A30",
    tint: primary,
    accent,
    danger,
    success,
    tabIconDefault: "#6B7280",
    tabIconSelected: primary,
  },
};
