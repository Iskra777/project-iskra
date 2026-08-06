// DESIGN_SYSTEM.md: "Dark by default, Light optional" — той самий вибір, що
// й у native-варіанті (components/useColorScheme.ts).
export function useColorScheme() {
  return "dark" as const;
}
