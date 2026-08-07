import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import * as api from "@/lib/api";
import type { ConversationParticipant, UserSearchResult } from "@/lib/api";
import { useSession } from "@/lib/session-context";

type Status = "loading" | "success" | "not_found" | "error";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

export default function GroupParticipantsScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, accessToken } = useSession();
  const colors = Colors[useColorScheme()];

  const [status, setStatus] = useState<Status>("loading");
  const [title, setTitle] = useState<string | null>(null);
  const [participants, setParticipants] = useState<ConversationParticipant[]>(
    [],
  );
  const [busyUserId, setBusyUserId] = useState<string>();
  const [isLeaving, setIsLeaving] = useState(false);
  const [successorPicker, setSuccessorPicker] = useState(false);
  const [chosenSuccessor, setChosenSuccessor] = useState<string>();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [toAdd, setToAdd] = useState<Map<string, UserSearchResult>>(new Map());
  const [isAdding, setIsAdding] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const result = await api.getConversation(accessToken, conversationId);
    if (!result.ok) {
      setStatus(result.status === 404 ? "not_found" : "error");
      return;
    }
    if (result.data.conversation.type !== "group") {
      setStatus("not_found");
      return;
    }
    setTitle(result.data.conversation.title);
    setParticipants(result.data.conversation.participants);
    setStatus("success");
  }, [accessToken, conversationId]);

  useEffect(() => {
    load();
  }, [load]);

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

  const isAdmin = participants.find((p) => p.id === user?.id)?.role === "admin";
  const existingIds = new Set(participants.map((p) => p.id));

  function toggleToAdd(candidate: UserSearchResult) {
    setToAdd((prev) => {
      const next = new Map(prev);
      if (next.has(candidate.id)) next.delete(candidate.id);
      else next.set(candidate.id, candidate);
      return next;
    });
  }

  async function handleAdd() {
    if (toAdd.size === 0 || !accessToken) return;
    setIsAdding(true);
    try {
      const result = await api.addParticipants(
        accessToken,
        conversationId,
        [...toAdd.values()].map((u) => u.username),
      );
      if (!result.ok) return;
      setToAdd(new Map());
      setQuery("");
      await load();
    } finally {
      setIsAdding(false);
    }
  }

  async function handlePromote(targetUserId: string) {
    if (!accessToken) return;
    setBusyUserId(targetUserId);
    try {
      const result = await api.promoteParticipant(
        accessToken,
        conversationId,
        targetUserId,
      );
      if (!result.ok) return;
      await load();
    } finally {
      setBusyUserId(undefined);
    }
  }

  async function handleRemove(targetUserId: string) {
    if (!accessToken) return;
    setBusyUserId(targetUserId);
    try {
      const result = await api.removeParticipant(
        accessToken,
        conversationId,
        targetUserId,
      );
      if (!result.ok) return;
      await load();
    } finally {
      setBusyUserId(undefined);
    }
  }

  async function attemptLeave(newAdminUserId?: string) {
    if (!accessToken) return;
    setIsLeaving(true);
    try {
      const result = await api.leaveConversation(
        accessToken,
        conversationId,
        newAdminUserId,
      );
      if (result.ok) {
        router.replace("/(tabs)/messages");
        return;
      }
      if (result.error.code === "admin_required") {
        setSuccessorPicker(true);
      }
    } finally {
      setIsLeaving(false);
    }
  }

  if (!user) return null;

  if (status === "loading") {
    return (
      <View style={styles.center}>
        <Text>Завантажуємо...</Text>
      </View>
    );
  }

  if (status === "not_found") {
    return (
      <View style={styles.center}>
        <Text>Групу не знайдено.</Text>
        <Button
          title="До списку розмов"
          variant="secondary"
          onPress={() => router.replace("/(tabs)/messages")}
        />
      </View>
    );
  }

  if (status === "error") {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.danger }}>
          Не вдалося завантажити групу. Спробуйте ще раз.
        </Text>
      </View>
    );
  }

  const otherParticipants = participants.filter((p) => p.id !== user.id);
  const filteredResults = results.filter(
    (r) => r.id !== user.id && !existingIds.has(r.id),
  );

  return (
    <>
      <FlatList
        data={participants}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          title ? <Text style={styles.title}>{title}</Text> : null
        }
        renderItem={({ item: participant }) => {
          const isSelf = participant.id === user.id;
          return (
            <View style={styles.participantRow}>
              <Avatar
                uri={participant.avatarUrl}
                fallback={participant.displayName ?? participant.username}
                size={36}
              />
              <View style={styles.participantInfo}>
                <Text style={styles.participantName} numberOfLines={1}>
                  {participant.displayName ?? participant.username}
                  {isSelf && " (ти)"}
                </Text>
                <Text
                  style={[
                    styles.participantRole,
                    { color: colors.tabIconDefault },
                  ]}
                >
                  {participant.role === "admin" ? "Адмін" : "Учасник"}
                </Text>
              </View>
              {isAdmin && !isSelf && (
                <View style={styles.rowActions}>
                  {participant.role !== "admin" && (
                    <Button
                      title="Адміном"
                      variant="secondary"
                      disabled={busyUserId === participant.id}
                      onPress={() => handlePromote(participant.id)}
                      style={styles.smallButton}
                    />
                  )}
                  <Button
                    title="Видалити"
                    variant="secondary"
                    disabled={busyUserId === participant.id}
                    onPress={() => handleRemove(participant.id)}
                    style={styles.smallButton}
                  />
                </View>
              )}
            </View>
          );
        }}
        ListFooterComponent={
          <View style={styles.footer}>
            {isAdmin && (
              <View style={styles.addBlock}>
                <Text style={styles.addTitle}>Додати учасників</Text>
                {toAdd.size > 0 && (
                  <View style={styles.chips}>
                    {[...toAdd.values()].map((person) => (
                      <Pressable
                        key={person.id}
                        accessibilityRole="button"
                        onPress={() => toggleToAdd(person)}
                        style={[
                          styles.chip,
                          { backgroundColor: `${colors.tint}26` },
                        ]}
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
                {canSearch && isSearching && (
                  <Text style={styles.stateText}>Шукаємо...</Text>
                )}
                {canSearch &&
                  !isSearching &&
                  filteredResults.map((candidate) => {
                    const isSelected = toAdd.has(candidate.id);
                    return (
                      <Pressable
                        key={candidate.id}
                        accessibilityRole="button"
                        onPress={() => toggleToAdd(candidate)}
                        style={[
                          styles.resultRow,
                          isSelected && {
                            backgroundColor: `${colors.tint}1A`,
                          },
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
                        {isSelected && (
                          <Text style={{ color: colors.tint }}>✓</Text>
                        )}
                      </Pressable>
                    );
                  })}
                {toAdd.size > 0 && (
                  <Button
                    title={isAdding ? "Додаємо..." : "Додати"}
                    onPress={handleAdd}
                    disabled={isAdding}
                  />
                )}
              </View>
            )}

            <Button
              title={isLeaving ? "Виходимо..." : "Вийти з групи"}
              variant="secondary"
              disabled={isLeaving}
              onPress={() => attemptLeave()}
              style={styles.leaveButton}
            />
          </View>
        }
      />

      <Modal
        visible={successorPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setSuccessorPicker(false)}
      >
        <View style={styles.modalBackdrop}>
          <Card style={styles.modalCard}>
            <Text style={styles.modalTitle}>Передай права адміна</Text>
            <Text style={[styles.modalHint, { color: colors.tabIconDefault }]}>
              Ти єдиний адмін групи. Перш ніж вийти, оберіть, кому передати
              права.
            </Text>
            <View style={styles.successorList}>
              {otherParticipants.map((participant) => {
                const isChosen = chosenSuccessor === participant.id;
                return (
                  <Pressable
                    key={participant.id}
                    accessibilityRole="button"
                    onPress={() => setChosenSuccessor(participant.id)}
                    style={[
                      styles.resultRow,
                      isChosen && { backgroundColor: `${colors.tint}1A` },
                    ]}
                  >
                    <Avatar
                      uri={participant.avatarUrl}
                      fallback={participant.displayName ?? participant.username}
                      size={32}
                    />
                    <Text style={styles.resultName}>
                      {participant.displayName ?? participant.username}
                    </Text>
                    {isChosen && <Text style={{ color: colors.tint }}>✓</Text>}
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.modalActions}>
              <Button
                title="Передати й вийти"
                disabled={!chosenSuccessor || isLeaving}
                onPress={() => {
                  const successor = chosenSuccessor;
                  setSuccessorPicker(false);
                  if (successor) attemptLeave(successor);
                }}
              />
              <Button
                title="Скасувати"
                variant="secondary"
                onPress={() => setSuccessorPicker(false)}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  container: { padding: 16, gap: 4 },
  title: { fontSize: 13, opacity: 0.6, marginBottom: 8 },
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  participantInfo: { flex: 1 },
  participantName: { fontSize: 14, fontWeight: "500" },
  participantRole: { fontSize: 12, marginTop: 1 },
  rowActions: { flexDirection: "row", gap: 6 },
  smallButton: { height: 32, paddingHorizontal: 10 },
  footer: { marginTop: 16, gap: 24 },
  addBlock: { gap: 8 },
  addTitle: { fontSize: 14, fontWeight: "500" },
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
  leaveButton: {},
  modalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 24,
  },
  modalCard: { width: "100%", maxWidth: 400, gap: 12 },
  modalTitle: { fontSize: 18, fontWeight: "600" },
  modalHint: { fontSize: 13 },
  successorList: { gap: 2 },
  modalActions: { gap: 8 },
});
