import type { ComponentProps } from "react";
import { StyleSheet, type ViewProps } from "react-native";

import { Text, View } from "@/components/Themed";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import Spacing from "@/constants/Spacing";
import Typography from "@/constants/Typography";

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
  card: { borderRadius: 16, padding: Spacing.lg },
  title: { ...Typography.h3, marginBottom: Spacing.xs },
  description: { ...Typography.small },
});
