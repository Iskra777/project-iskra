import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Modal, StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import { PostCard } from "@/components/PostCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import Spacing from "@/constants/Spacing";
import Typography from "@/constants/Typography";
import * as api from "@/lib/api";
import type { FeedPost, ReactionType } from "@/lib/api";
import { useSession } from "@/lib/session-context";

type Status = "loading" | "success" | "error";

export default function BookmarksScreen() {
  const { user, accessToken } = useSession();
  const colors = Colors[useColorScheme()];

  const [status, setStatus] = useState<Status>("loading");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const nextCursorRef = useRef<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [postToDelete, setPostToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const result = await api.getBookmarks(accessToken);
    if (!result.ok) {
      setStatus("error");
      return;
    }
    setPosts(result.data.posts);
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
      const result = await api.getBookmarks(accessToken, nextCursorRef.current);
      if (!result.ok) return;
      setPosts((prev) => [...prev, ...result.data.posts]);
      nextCursorRef.current = result.data.nextCursor;
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function handleToggleReaction(postId: string, type: ReactionType) {
    if (!accessToken) return;
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    const isActive = post.viewerReactions.includes(type);

    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              viewerReactions: isActive
                ? p.viewerReactions.filter((t) => t !== type)
                : [...p.viewerReactions, type],
            }
          : p,
      ),
    );

    const result = isActive
      ? await api.removeReaction(accessToken, postId, type)
      : await api.setReaction(accessToken, postId, type);

    if (!result.ok) {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                viewerReactions: isActive
                  ? [...p.viewerReactions, type]
                  : p.viewerReactions.filter((t) => t !== type),
              }
            : p,
        ),
      );
    }
  }

  // На відміну від стрічки: зняття закладки прибирає пост зі списку одразу.
  async function handleRemoveBookmark(postId: string) {
    if (!accessToken) return;
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    const result = await api.removeBookmark(accessToken, postId);
    if (!result.ok) await load();
  }

  async function confirmDelete() {
    if (!postToDelete || !accessToken) return;
    setIsDeleting(true);
    try {
      const result = await api.deletePost(accessToken, postToDelete);
      if (!result.ok) return;
      setPosts((prev) => prev.filter((post) => post.id !== postToDelete));
      setPostToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  }

  if (!user) return null;

  return (
    <>
      <FlatList
        data={posts}
        keyExtractor={(post) => post.id}
        contentContainerStyle={styles.container}
        onEndReachedThreshold={0.5}
        onEndReached={handleLoadMore}
        ListHeaderComponent={
          <>
            {status === "loading" && (
              <Text style={styles.stateText}>Завантажуємо...</Text>
            )}
            {status === "error" && (
              <Text style={[styles.stateText, { color: colors.danger }]}>
                Не вдалося завантажити закладки. Спробуйте ще раз.
              </Text>
            )}
            {status === "success" && posts.length === 0 && (
              <Text style={styles.stateText}>Ще немає збережених постів.</Text>
            )}
          </>
        }
        renderItem={({ item }) => (
          <Card>
            <PostCard
              post={item}
              isOwn={item.author.id === user.id}
              onToggleReaction={(type) => handleToggleReaction(item.id, type)}
              onToggleBookmark={() => handleRemoveBookmark(item.id)}
              onRequestDelete={() => setPostToDelete(item.id)}
            />
          </Card>
        )}
      />

      <Modal
        visible={postToDelete !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPostToDelete(null)}
      >
        <View style={styles.modalBackdrop}>
          <Card style={styles.modalCard}>
            <Text style={styles.modalTitle}>Видалити пост?</Text>
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
                onPress={() => setPostToDelete(null)}
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
  stateText: {
    ...Typography.small,
    marginBottom: Spacing.md,
    textAlign: "center",
    opacity: 0.6,
  },
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
