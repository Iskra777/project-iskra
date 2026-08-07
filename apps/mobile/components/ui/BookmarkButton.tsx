import { Pressable, StyleSheet, Text } from "react-native";

interface BookmarkButtonProps {
  active: boolean;
  onToggle: () => void;
}

export function BookmarkButton({ active, onToggle }: BookmarkButtonProps) {
  const label = active ? "Прибрати із закладок" : "Зберегти";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onToggle}
      style={[styles.button, active && styles.active]}
    >
      <Text style={styles.emoji}>🔖</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  active: { backgroundColor: "#F9731633" },
  emoji: { fontSize: 14 },
});
