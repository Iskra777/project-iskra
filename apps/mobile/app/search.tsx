import { StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import Spacing from "@/constants/Spacing";
import Typography from "@/constants/Typography";

export default function SearchScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Пошук</Text>
      <Text style={styles.subtitle}>Незабаром.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    padding: Spacing.md,
  },
  title: Typography.h2,
  subtitle: { ...Typography.body, opacity: 0.6 },
});
