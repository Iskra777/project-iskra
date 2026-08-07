import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import { Avatar } from "@/components/ui/Avatar";
import { Input } from "@/components/ui/Input";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import * as api from "@/lib/api";
import type { UserSearchResult } from "@/lib/api";
import { useSession } from "@/lib/session-context";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

export default function NewDirectMessageScreen() {
  const { user, accessToken } = useSession();
  const router = useRouter();
  const colors = Colors[useColorScheme()];

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [startingId, setStartingId] = useState<string>();
  const [error, setError] = useState<string>();

  const trimmedQuery = query.trim();
  const canSearch = trimmedQuery.length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    if (!canSearch) return;
    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      const result = await api.searchUsers(trimmedQuery);
      if (!cancelled && result.ok) setResults(result.data.users);
      if (!cancelled) setIsSearching(false);
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [trimmedQuery, canSearch]);

  async function handleStart(candidate: UserSearchResult) {
    if (!accessToken || startingId) return;
    setError(undefined);
    setStartingId(candidate.id);
    try {
      const result = await api.createDirectConversation(
        accessToken,
        candidate.username,
      );
      if (!result.ok) {
        setError("Не вдалося почати розмову.");
        return;
      }
      router.replace(`/(tabs)/messages/${result.data.conversation.id}`);
    } finally {
      setStartingId(undefined);
    }
  }

  if (!user) return null;

  const filteredResults = results.filter((r) => r.id !== user.id);

  return (
    <FlatList
      data={canSearch ? filteredResults : []}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.headerBlock}>
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="Знайти людей за іменем або username..."
            autoFocus
          />
          {!canSearch && (
            <Text style={styles.stateText}>
              Введіть щонайменше {MIN_QUERY_LENGTH} символи, щоб шукати.
            </Text>
          )}
          {canSearch && isSearching && (
            <Text style={styles.stateText}>Шукаємо...</Text>
          )}
          {error && (
            <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text>
          )}
        </View>
      }
      renderItem={({ item: candidate }) => (
        <Pressable
          accessibilityRole="button"
          disabled={startingId !== undefined}
          onPress={() => handleStart(candidate)}
          style={styles.resultRow}
        >
          <Avatar
            uri={candidate.avatarUrl}
            fallback={candidate.displayName ?? candidate.username}
            size={36}
          />
          <Text style={styles.resultName}>
            {candidate.displayName ?? candidate.username}
          </Text>
          {startingId === candidate.id && (
            <Text style={{ fontSize: 13, opacity: 0.6 }}>...</Text>
          )}
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  headerBlock: { gap: 8, marginBottom: 8 },
  stateText: {
    textAlign: "center",
    fontSize: 13,
    opacity: 0.6,
    paddingVertical: 8,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  resultName: { fontSize: 14, flex: 1 },
});
