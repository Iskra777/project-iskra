// DESIGN_SYSTEM.md: "Dark by default, Light optional" — light theme isn't
// built out (web itself has no working toggle either, always dark). Мобільний
// застосунок свідомо не йде за системною темою, як зробив шаблон Expo, щоб
// не показувати недороблений light-варіант користувачам зі світлою темою ОС.
export const useColorScheme = () => "dark" as const;
