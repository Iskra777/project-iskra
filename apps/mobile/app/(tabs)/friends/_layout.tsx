import { Stack } from "expo-router";

import { TopBar } from "@/components/TopBar";

export default function FriendsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ header: () => <TopBar /> }} />
      <Stack.Screen name="requests" options={{ title: "Запити дружби" }} />
      <Stack.Screen name="add" options={{ title: "Додати друга" }} />
    </Stack>
  );
}
