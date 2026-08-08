import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Modal, StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import Spacing from "@/constants/Spacing";
import Typography from "@/constants/Typography";
import * as api from "@/lib/api";
import type { DiaryEntry } from "@/lib/api";
import { useSession } from "@/lib/session-context";

type Status = "loading" | "success" | "error";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function DiaryScreen() {
  const { user, accessToken } = useSession();
  const router = useRouter();
  const colors = Colors[useColorScheme()];

  const [status, setStatus] = useState<Status>("loading");
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const nextCursorRef = useRef<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [entryToDelete, setEntryToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const result = await api.getDiaryEntries(accessToken);
    if (!result.ok) {
      setStatus("error");
      return;
    }
    setEntries(result.data.entries);
    nextCursorRef.current = result.data.nextCursor;
    setStatus("success");
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleLoadMore() {
    if (!nextCursorRef.current || !accessToken || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const result = await api.getDiaryEntries(
        accessToken,
        nextCursorRef.current,
      );
      if (!result.ok) return;
      setEntries((prev) => [...prev, ...result.data.entries]);
      nextCursorRef.current = result.data.nextCursor;
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function confirmDelete() {
    if (!entryToDelete || !accessToken) return;
    setIsDeleting(true);
    try {
      const result = await api.deleteDiaryEntry(accessToken, entryToDelete);
      if (!result.ok) return;
      setEntries((prev) => prev.filter((e) => e.id !== entryToDelete));
      setEntryToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  }

  if (!user) return null;

  return (
    <>
      <FlatList
        data={entries}
        keyExtractor={(entry) => entry.id}
        contentContainerStyle={styles.container}
        onEndReachedThreshold={0.5}
        onEndReached={handleLoadMore}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <Button
              title="Новий запис"
              variant="secondary"
              onPress={() => router.push("/(tabs)/profile/diary/new")}
            />
            {status === "loading" && (
              <Text style={styles.stateText}>Завантажуємо...</Text>
            )}
            {status === "error" && (
              <Text style={[styles.stateText, { color: colors.danger }]}>
                Не вдалося завантажити щоденник. Спробуйте ще раз.
              </Text>
            )}
            {status === "success" && entries.length === 0 && (
              <Text style={styles.stateText}>Ще немає жодного запису.</Text>
            )}
          </View>
        }
        renderItem={({ item: entry }) => (
          <Card style={styles.entryCard}>
            <View style={styles.entryHeader}>
              {entry.title && (
                <Text style={styles.entryTitle}>{entry.title}</Text>
              )}
              <Text
                style={[styles.entryDate, { color: colors.tabIconDefault }]}
              >
                {formatDate(entry.createdAt)}
              </Text>
            </View>
            <Text style={styles.entryContent} numberOfLines={4}>
              {entry.content}
            </Text>
            <View style={styles.entryActions}>
              <Button
                title="Редагувати"
                variant="secondary"
                onPress={() => router.push(`/(tabs)/profile/diary/${entry.id}`)}
                style={styles.smallButton}
              />
              <Button
                title="Видалити"
                variant="ghost"
                onPress={() => setEntryToDelete(entry.id)}
              />
            </View>
          </Card>
        )}
      />

      <Modal
        visible={entryToDelete !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEntryToDelete(null)}
      >
        <View style={styles.modalBackdrop}>
          <Card style={styles.modalCard}>
            <Text style={styles.modalTitle}>Видалити запис?</Text>
            <Text style={[styles.modalHint, { color: colors.tabIconDefault }]}>
              Цю дію не можна скасувати.
            </Text>
            <View style={styles.modalActions}>
              <Button
                title={isDeleting ? "Видаляємо..." : "Видалити"}
                variant="secondary"
                onPress={confirmDelete}
                disabled={isDeleting}
              />
              <Button
                title="Скасувати"
                variant="secondary"
                onPress={() => setEntryToDelete(null)}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.md, gap: Spacing.md },
  headerBlock: { gap: Spacing.sm },
  stateText: {
    ...Typography.small,
    textAlign: "center",
    opacity: 0.6,
    paddingVertical: Spacing.sm,
  },
  entryCard: { gap: Spacing.xs },
  entryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.sm,
    backgroundColor: "transparent",
  },
  entryTitle: { ...Typography.small, fontWeight: "500", flex: 1 },
  entryDate: Typography.small,
  entryContent: { ...Typography.body, marginTop: Spacing.xs },
  entryActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.sm,
    backgroundColor: "transparent",
  },
  smallButton: { height: 36, paddingHorizontal: Spacing.sm + Spacing.xs },
  modalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: Spacing.lg,
  },
  modalCard: { width: "100%", maxWidth: 400, gap: Spacing.sm + Spacing.xs },
  modalTitle: Typography.h3,
  modalHint: Typography.small,
  modalActions: { gap: Spacing.sm, backgroundColor: "transparent" },
});
