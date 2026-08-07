import type { ComponentProps } from "react";
import { StyleSheet, type ViewProps } from "react-native";

import { Text, View } from "@/components/Themed";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";

export function Card({ style, ...props }: ViewProps) {
  const colors = Colors[useColorScheme()];
  return (
    <View
      style={[styles.card, { backgroundColor: colors.card }, style]}
      {...props}
    />
  );
}

export function CardTitle(props: ComponentProps<typeof Text>) {
  const { style, ...rest } = props;
  return <Text style={[styles.title, style]} {...rest} />;
}

export function CardDescription(props: ComponentProps<typeof Text>) {
  const colors = Colors[useColorScheme()];
  const { style, ...rest } = props;
  return (
    <Text
      style={[styles.description, { color: colors.tabIconDefault }, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 20 },
  title: { fontSize: 18, fontWeight: "600", marginBottom: 4 },
  description: { fontSize: 13 },
});
