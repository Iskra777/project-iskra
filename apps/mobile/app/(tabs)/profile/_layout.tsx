import { Stack } from "expo-router";

export default function ProfileLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Профіль" }} />
      <Stack.Screen name="edit" options={{ title: "Редагувати профіль" }} />
    </Stack>
  );
}
