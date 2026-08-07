import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, ScrollView, StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import Spacing from "@/constants/Spacing";
import Typography from "@/constants/Typography";
import * as api from "@/lib/api";
import type { Goal, ProgressEntry } from "@/lib/api";
import { useSession } from "@/lib/session-context";

type Status = "loading" | "success" | "not_found" | "error";

const STATUSES: { value: Goal["status"]; label: string }[] = [
  { value: "active", label: "Активна" },
  { value: "completed", label: "Завершена" },
  { value: "abandoned", label: "Покинута" },
];

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("uk-UA");
}

export default function GoalScreen() {
  const { id: goalId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, accessToken } = useSession();
  const colors = Colors[useColorScheme()];

  const [status, setStatus] = useState<Status>("loading");
  const [goal, setGoal] = useState<Goal | null>(null);
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const nextCursorRef = useRef<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string>();

  const [isAddingProgress, setIsAddingProgress] = useState(false);
  const [progressValue, setProgressValue] = useState("");
  const [progressNote, setProgressNote] = useState("");
  const [isSubmittingProgress, setIsSubmittingProgress] = useState(false);

  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const [goalResult, progressResult] = await Promise.all([
      api.getGoal(accessToken, goalId),
      api.getProgress(accessToken, goalId),
    ]);
    if (!goalResult.ok) {
      setStatus(goalResult.status === 404 ? "not_found" : "error");
      return;
    }
    setGoal(goalResult.data.goal);
    if (progressResult.ok) {
      setProgress(progressResult.data.progress);
      nextCursorRef.current = progressResult.data.nextCursor;
    }
    setStatus("success");
  }, [accessToken, goalId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleLoadMoreProgress() {
    if (!nextCursorRef.current || !accessToken || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const result = await api.getProgress(
        accessToken,
        goalId,
        nextCursorRef.current,
      );
      if (!result.ok) return;
      setProgress((prev) => [...prev, ...result.data.progress]);
      nextCursorRef.current = result.data.nextCursor;
    } finally {
      setIsLoadingMore(false);
    }
  }

  function openEdit() {
    if (!goal) return;
    setEditTitle(goal.title);
    setEditDescription(goal.description ?? "");
    setEditDeadline(goal.deadline ? goal.deadline.slice(0, 10) : "");
    setEditError(undefined);
    setIsEditing(true);
  }

  async function handleSaveEdit() {
    if (!accessToken || editTitle.trim().length === 0) return;
    setIsSaving(true);
    setEditError(undefined);
    try {
      const trimmedDeadline = editDeadline.trim();
      const result = await api.updateGoal(accessToken, goalId, {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        deadline: trimmedDeadline
          ? new Date(trimmedDeadline).toISOString()
          : null,
      });
      if (!result.ok) {
        setEditError("Не вдалося зберегти зміни.");
        return;
      }
      setGoal(result.data.goal);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleChangeStatus(nextStatus: Goal["status"]) {
    if (!accessToken) return;
    const result = await api.updateGoal(accessToken, goalId, {
      status: nextStatus,
    });
    if (result.ok) setGoal(result.data.goal);
  }

  async function handleAddProgress() {
    if (!accessToken || isSubmittingProgress) return;
    setIsSubmittingProgress(true);
    try {
      const trimmedValue = progressValue.trim();
      const result = await api.addProgress(accessToken, goalId, {
        value: trimmedValue ? Number(trimmedValue) : null,
        note: progressNote.trim() || null,
      });
      if (!result.ok) return;
      setProgress((prev) => [result.data.progress, ...prev]);
      setProgressValue("");
      setProgressNote("");
      setIsAddingProgress(false);
    } finally {
      setIsSubmittingProgress(false);
    }
  }

  async function handleDelete() {
    if (!accessToken || isDeleting) return;
    setIsDeleting(true);
    try {
      const result = await api.deleteGoal(accessToken, goalId);
      if (!result.ok) return;
      router.replace("/(tabs)/profile/goals");
    } finally {
      setIsDeleting(false);
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
        <Text>Ціль не знайдено.</Text>
      </View>
    );
  }

  if (status === "error" || !goal) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.danger }}>
          Не вдалося завантажити ціль. Спробуйте ще раз.
        </Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: goal.title }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{goal.title}</Text>
        {goal.deadline && (
          <Text style={[styles.meta, { color: colors.tabIconDefault }]}>
            до {formatDate(goal.deadline)}
          </Text>
        )}
        {goal.description && (
          <Text style={styles.description}>{goal.description}</Text>
        )}

        <View style={styles.statusRow}>
          {STATUSES.map((s) => (
            <Button
              key={s.value}
              title={s.label}
              variant={goal.status === s.value ? "primary" : "secondary"}
              onPress={() => handleChangeStatus(s.value)}
              style={styles.statusButton}
            />
          ))}
        </View>

        <View style={styles.actionsRow}>
          <Button title="Редагувати" variant="secondary" onPress={openEdit} />
          <Button
            title="Видалити"
            variant="ghost"
            onPress={() => setConfirmDelete(true)}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Прогрес</Text>
            <Button
              title="Відмітити"
              variant="secondary"
              onPress={() => setIsAddingProgress(true)}
              style={styles.manageButton}
            />
          </View>

          {progress.length === 0 && (
            <Text style={[styles.stateText, { color: colors.tabIconDefault }]}>
              Ще немає жодного запису.
            </Text>
          )}

          {progress.map((entry) => (
            <View
              key={entry.id}
              style={[styles.progressRow, { borderTopColor: colors.border }]}
            >
              <View style={styles.progressHeader}>
                {entry.value !== null && (
                  <Text style={styles.progressValue}>{entry.value}</Text>
                )}
                <Text
                  style={[
                    styles.progressDate,
                    { color: colors.tabIconDefault },
                  ]}
                >
                  {formatDate(entry.recordedAt)}
                </Text>
              </View>
              {entry.note && (
                <Text
                  style={[
                    styles.progressNote,
                    { color: colors.tabIconDefault },
                  ]}
                >
                  {entry.note}
                </Text>
              )}
            </View>
          ))}

          {nextCursorRef.current && (
            <Button
              title={isLoadingMore ? "Завантажуємо..." : "Завантажити ще"}
              variant="secondary"
              disabled={isLoadingMore}
              onPress={handleLoadMoreProgress}
            />
          )}
        </View>
      </ScrollView>

      <Modal
        visible={isEditing}
        transparent
        animationType="fade"
        onRequestClose={() => setIsEditing(false)}
      >
        <View style={styles.modalBackdrop}>
          <Card style={styles.modalCard}>
            <Text style={styles.modalTitle}>Редагувати ціль</Text>
            <Input
              label="Назва"
              value={editTitle}
              onChangeText={setEditTitle}
            />
            <Input
              label="Опис"
              value={editDescription}
              onChangeText={setEditDescription}
              multiline
              numberOfLines={3}
              style={styles.textarea}
            />
            <Input
              label="Дедлайн (РРРР-ММ-ДД)"
              value={editDeadline}
              onChangeText={setEditDeadline}
            />
            {editError && (
              <Text style={[styles.errorText, { color: colors.danger }]}>
                {editError}
              </Text>
            )}
            <View style={styles.modalActions}>
              <Button
                title={isSaving ? "Зберігаємо..." : "Зберегти"}
                disabled={isSaving || editTitle.trim().length === 0}
                onPress={handleSaveEdit}
              />
              <Button
                title="Скасувати"
                variant="secondary"
                onPress={() => setIsEditing(false)}
              />
            </View>
          </Card>
        </View>
      </Modal>

      <Modal
        visible={isAddingProgress}
        transparent
        animationType="fade"
        onRequestClose={() => setIsAddingProgress(false)}
      >
        <View style={styles.modalBackdrop}>
          <Card style={styles.modalCard}>
            <Text style={styles.modalTitle}>Відмітити прогрес</Text>
            <Input
              label="Значення (необов'язково)"
              value={progressValue}
              onChangeText={setProgressValue}
              keyboardType="numeric"
            />
            <Input
              label="Нотатка (необов'язково)"
              value={progressNote}
              onChangeText={setProgressNote}
              multiline
              numberOfLines={3}
              style={styles.textarea}
            />
            <View style={styles.modalActions}>
              <Button
                title={isSubmittingProgress ? "Зберігаємо..." : "Зберегти"}
                disabled={isSubmittingProgress}
                onPress={handleAddProgress}
              />
              <Button
                title="Скасувати"
                variant="secondary"
                onPress={() => setIsAddingProgress(false)}
              />
            </View>
          </Card>
        </View>
      </Modal>

      <Modal
        visible={confirmDelete}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmDelete(false)}
      >
        <View style={styles.modalBackdrop}>
          <Card style={styles.modalCard}>
            <Text style={styles.modalTitle}>Видалити ціль?</Text>
            <Text style={[styles.modalHint, { color: colors.tabIconDefault }]}>
              Цю дію не можна скасувати. Всі записи прогресу теж буде видалено.
            </Text>
            <View style={styles.modalActions}>
              <Button
                title={isDeleting ? "Видаляємо..." : "Видалити"}
                variant="secondary"
                onPress={handleDelete}
                disabled={isDeleting}
              />
              <Button
                title="Скасувати"
                variant="secondary"
                onPress={() => setConfirmDelete(false)}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  container: { padding: Spacing.md, gap: Spacing.sm },
  title: Typography.h3,
  meta: Typography.small,
  description: { ...Typography.body, marginTop: Spacing.sm },
  statusRow: {
    flexDirection: "row",
    gap: Spacing.xs + 2,
    marginTop: Spacing.md,
  },
  statusButton: { flex: 1 },
  actionsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  section: { marginTop: Spacing.lg, gap: Spacing.sm },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { ...Typography.small, fontWeight: "500" },
  manageButton: { height: 32, paddingHorizontal: Spacing.sm + 2 },
  stateText: { ...Typography.small, textAlign: "center" },
  progressRow: {
    paddingVertical: Spacing.sm + 2,
    borderTopWidth: 1,
    gap: Spacing.xs / 2,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "transparent",
  },
  progressValue: { ...Typography.small, fontWeight: "500" },
  progressDate: Typography.small,
  progressNote: Typography.small,
  textarea: { height: 80, textAlignVertical: "top", paddingTop: Spacing.sm },
  errorText: Typography.small,
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
