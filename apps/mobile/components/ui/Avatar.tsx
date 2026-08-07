import { Image, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";

interface AvatarProps {
  uri?: string | null;
  fallback: string;
  size?: number;
}

export function Avatar({ uri, fallback, size = 80 }: AvatarProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme];
  const style = { width: size, height: size, borderRadius: size / 2 };

  if (uri) {
    return <Image source={{ uri }} style={style} />;
  }

  return (
    <View
      style={[style, styles.fallback, { backgroundColor: `${colors.tint}33` }]}
    >
      <Text
        style={{ fontSize: size * 0.4, fontWeight: "600", color: colors.tint }}
      >
        {fallback.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
