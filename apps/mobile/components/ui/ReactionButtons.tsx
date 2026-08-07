import { Pressable, StyleSheet, Text } from "react-native";

import type { ReactionType } from "@/lib/api";

const REACTIONS: { type: ReactionType; emoji: string; label: string }[] = [
  { type: "fire", emoji: "🔥", label: "Надихнуло" },
  { type: "bulb", emoji: "💡", label: "Корисно" },
  { type: "clap", emoji: "🙌", label: "Підтримую" },
];

interface ReactionButtonsProps {
  activeTypes: ReactionType[];
  onToggle: (type: ReactionType) => void;
}

/** Лише перемикачі "я відреагував" — без лічильника (PRINCIPLES.md,
 * принцип 7: "Не лайки. Не перегляди."). */
export function ReactionButtons({
  activeTypes,
  onToggle,
}: ReactionButtonsProps) {
  return (
    <>
      {REACTIONS.map(({ type, emoji, label }) => {
        const isActive = activeTypes.includes(type);
        return (
          <Pressable
            key={type}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: isActive }}
            onPress={() => onToggle(type)}
            style={[styles.button, isActive && styles.active]}
          >
            <Text style={styles.emoji}>{emoji}</Text>
          </Pressable>
        );
      })}
    </>
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
