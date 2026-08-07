import { Stack } from "expo-router";

export default function MessagesLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Повідомлення" }} />
      <Stack.Screen name="[id]/index" options={{ title: "" }} />
      <Stack.Screen name="[id]/participants" options={{ title: "Учасники" }} />
      <Stack.Screen name="new-group" options={{ title: "Нова група" }} />
      <Stack.Screen name="new-direct" options={{ title: "Написати" }} />
    </Stack>
  );
}
