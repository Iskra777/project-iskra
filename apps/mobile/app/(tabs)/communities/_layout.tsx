import { Stack } from "expo-router";

import { TopBar } from "@/components/TopBar";

export default function CommunitiesLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ header: () => <TopBar /> }} />
      <Stack.Screen name="new" options={{ title: "Нова спільнота" }} />
      <Stack.Screen name="[id]/index" options={{ title: "" }} />
      <Stack.Screen name="[id]/members" options={{ title: "Учасники" }} />
    </Stack>
  );
}
