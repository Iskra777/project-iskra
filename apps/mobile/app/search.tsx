import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
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

export default function SearchScreen() {
  const { user, accessToken } = useSession();
  const router = useRouter();
  const colors = Colors[useColorScheme()];

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [startingId, setStartingId] = useState<string>();
  const [sendingId, setSendingId] = useState<string>();
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
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

  async function handleMessage(candidate: UserSearchResult) {
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

  async function handleAddFriend(candidate: UserSearchResult) {
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
          {canSearch && !isSearching && filteredResults.length === 0 && (
            <Text style={styles.stateText}>Нічого не знайдено.</Text>
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
          <View style={styles.resultRow}>
            <Avatar
              uri={candidate.avatarUrl}
              fallback={candidate.displayName ?? candidate.username}
              size={36}
            />
            <View style={styles.resultInfo}>
              <Text style={styles.resultName} numberOfLines={1}>
                {candidate.displayName ?? candidate.username}
              </Text>
              <Text
                style={[
                  styles.resultUsername,
                  { color: colors.tabIconDefault },
                ]}
                numberOfLines={1}
              >
                @{candidate.username}
              </Text>
            </View>
            <View style={styles.resultActions}>
              <Button
                title="Написати"
                variant="secondary"
                disabled={startingId !== undefined}
                onPress={() => handleMessage(candidate)}
                style={styles.smallButton}
              />
              <Button
                title={alreadySent ? "Надіслано" : "Додати"}
                variant="secondary"
                disabled={sendingId !== undefined || alreadySent}
                onPress={() => handleAddFriend(candidate)}
                style={styles.smallButton}
              />
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.md, gap: Spacing.xs },
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
    flexWrap: "wrap",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm + 2,
  },
  resultInfo: { flex: 1, minWidth: 100 },
  resultName: { ...Typography.small, fontWeight: "500" },
  resultUsername: { ...Typography.small, marginTop: 1 },
  resultActions: { flexDirection: "row", gap: Spacing.xs + 2 },
  smallButton: { height: 32, paddingHorizontal: Spacing.sm + 2 },
});
