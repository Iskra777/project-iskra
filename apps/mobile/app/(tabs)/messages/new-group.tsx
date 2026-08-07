import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import * as api from "@/lib/api";
import type { UserSearchResult } from "@/lib/api";
import { useSession } from "@/lib/session-context";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;
const MIN_INVITEES = 2;

export default function NewGroupScreen() {
  const { user, accessToken } = useSession();
  const router = useRouter();
  const colors = Colors[useColorScheme()];

  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selected, setSelected] = useState<Map<string, UserSearchResult>>(
    new Map(),
  );
  const [isCreating, setIsCreating] = useState(false);
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

  function toggleSelected(candidate: UserSearchResult) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(candidate.id)) next.delete(candidate.id);
      else next.set(candidate.id, candidate);
      return next;
    });
  }

  const canSubmit =
    title.trim().length > 0 && selected.size >= MIN_INVITEES && !isCreating;

  async function handleCreate() {
    if (!canSubmit || !accessToken) return;
    setError(undefined);
    setIsCreating(true);
    try {
      const result = await api.createGroupConversation(
        accessToken,
        title.trim(),
        [...selected.values()].map((u) => u.username),
      );
      if (!result.ok) {
        setError("Не вдалося створити групу.");
        return;
      }
      router.replace(`/(tabs)/messages/${result.data.conversation.id}`);
    } finally {
      setIsCreating(false);
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
          <Text style={styles.hint}>
            Назва й мінімум {MIN_INVITEES} учасники.
          </Text>
          <Input
            value={title}
            onChangeText={setTitle}
            placeholder="Назва групи"
            maxLength={100}
          />

          {selected.size > 0 && (
            <View style={styles.chips}>
              {[...selected.values()].map((person) => (
                <Pressable
                  key={person.id}
                  accessibilityRole="button"
                  onPress={() => toggleSelected(person)}
                  style={[styles.chip, { backgroundColor: `${colors.tint}26` }]}
                >
                  <Text style={{ color: colors.tint, fontSize: 13 }}>
                    {person.displayName ?? person.username} ×
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="Знайти людей за іменем або username..."
          />

          {!canSearch && (
            <Text style={styles.stateText}>
              Введіть щонайменше {MIN_QUERY_LENGTH} символи, щоб шукати.
            </Text>
          )}
          {canSearch && isSearching && (
            <Text style={styles.stateText}>Шукаємо...</Text>
          )}
        </View>
      }
      renderItem={({ item: candidate }) => {
        const isSelected = selected.has(candidate.id);
        return (
          <Pressable
            accessibilityRole="button"
            onPress={() => toggleSelected(candidate)}
            style={[
              styles.resultRow,
              isSelected && { backgroundColor: `${colors.tint}1A` },
            ]}
          >
            <Avatar
              uri={candidate.avatarUrl}
              fallback={candidate.displayName ?? candidate.username}
              size={32}
            />
            <Text style={styles.resultName}>
              {candidate.displayName ?? candidate.username}
            </Text>
            {isSelected && <Text style={{ color: colors.tint }}>✓</Text>}
          </Pressable>
        );
      }}
      ListFooterComponent={
        <View style={styles.footer}>
          {error && (
            <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text>
          )}
          <Button
            title={isCreating ? "Створюємо..." : "Створити групу"}
            onPress={handleCreate}
            disabled={!canSubmit}
          />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  headerBlock: { gap: 12 },
  hint: { fontSize: 13, opacity: 0.6, marginBottom: -4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
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
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  resultName: { fontSize: 14, flex: 1 },
  footer: { marginTop: 16, gap: 8 },
});
