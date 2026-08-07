import { Stack } from "expo-router";

export default function ProfileLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Профіль" }} />
      <Stack.Screen name="edit" options={{ title: "Редагувати профіль" }} />
      <Stack.Screen name="bookmarks" options={{ title: "Закладки" }} />
      <Stack.Screen name="goals/index" options={{ title: "Цілі" }} />
      <Stack.Screen name="goals/new" options={{ title: "Нова ціль" }} />
      <Stack.Screen name="goals/[id]" options={{ title: "" }} />
    </Stack>
  );
}
