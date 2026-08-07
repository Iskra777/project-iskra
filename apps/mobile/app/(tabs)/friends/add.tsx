import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import { Avatar } from "@/components/ui/Avatar";
import { Input } from "@/components/ui/Input";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import Spacing from "@/constants/Spacing";
import Typography from "@/constants/Typography";
import * as api from "@/lib/api";
import type { UserSearchResult } from "@/lib/api";
import { useSession } from "@/lib/session-context";

const ERROR_MESSAGES: Record<string, string> = {
  cannot_friend_self: "Не можна надіслати запит дружби самому собі.",
  blocked: "Неможливо надіслати запит.",
  request_already_pending: "Запит дружби вже надіслано.",
  already_friends: "Ви вже друзі.",
};

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

export default function AddFriendScreen() {
  const { user, accessToken } = useSession();
  const colors = Colors[useColorScheme()];

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [sendingId, setSendingId] = useState<string>();
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

  async function handleSend(candidate: UserSearchResult) {
    if (!accessToken || sendingId) return;
    setError(undefined);
    setSendingId(candidate.id);
    try {
      const result = await api.sendFriendRequest(
        accessToken,
        candidate.username,
      );
      if (!result.ok) {
        setError(
          ERROR_MESSAGES[result.error.code] ?? "Не вдалося надіслати запит.",
        );
        return;
      }
      setSentTo((prev) => new Set(prev).add(candidate.id));
    } finally {
      setSendingId(undefined);
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
            <Text style={[styles.errorText, { color: colors.danger }]}>
              {error}
            </Text>
          )}
        </View>
      }
      renderItem={({ item: candidate }) => {
        const alreadySent = sentTo.has(candidate.id);
        return (
          <Pressable
            accessibilityRole="button"
            disabled={sendingId !== undefined || alreadySent}
            onPress={() => handleSend(candidate)}
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
            <Text style={[styles.status, { color: colors.tabIconDefault }]}>
              {alreadySent
                ? "Надіслано"
                : sendingId === candidate.id
                  ? "..."
                  : "Додати"}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.md },
  headerBlock: { gap: Spacing.sm, marginBottom: Spacing.sm },
  stateText: {
    ...Typography.small,
    textAlign: "center",
    opacity: 0.6,
    paddingVertical: Spacing.sm,
  },
  errorText: Typography.small,
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm + Spacing.xs,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.sm,
  },
  resultName: { ...Typography.small, flex: 1 },
  status: Typography.small,
});
