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
    background: "#0B0F19",
    card: "#151A26",
    border: "#252B3A",
    tint: primary,
    accent,
    danger,
    success,
    tabIconDefault: "#6B7280",
    tabIconSelected: primary,
  },
};
