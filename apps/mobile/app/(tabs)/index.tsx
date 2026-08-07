import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
} from "react-native";

import { Text, View } from "@/components/Themed";
import { PostCard } from "@/components/PostCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import * as api from "@/lib/api";
import type { FeedPost, ReactionType } from "@/lib/api";
import { useSession } from "@/lib/session-context";

type Status = "loading" | "success" | "error";

export default function FeedScreen() {
  const { user, accessToken } = useSession();
  const colors = Colors[useColorScheme()];

  const [status, setStatus] = useState<Status>("loading");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const nextCursorRef = useRef<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [content, setContent] = useState("");
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isPosting, setIsPosting] = useState(false);

  const [postToDelete, setPostToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadFeed = useCallback(async () => {
    if (!accessToken) return;
    const result = await api.getFeed(accessToken);
    if (!result.ok) {
      setStatus("error");
      return;
    }
    setPosts(result.data.posts);
    nextCursorRef.current = result.data.nextCursor;
    setStatus("success");
  }, [accessToken]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      await loadFeed();
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleLoadMore() {
    if (!nextCursorRef.current || !accessToken || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const result = await api.getFeed(accessToken, nextCursorRef.current);
      if (!result.ok) return;
      setPosts((prev) => [...prev, ...result.data.posts]);
      nextCursorRef.current = result.data.nextCursor;
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function handlePickImage() {
    if (!accessToken) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    setIsUploadingImage(true);
    try {
      const uploadResult = await api.uploadPostImage(accessToken, {
        uri: asset.uri,
        name: asset.fileName ?? "photo.jpg",
        type: asset.mimeType ?? "image/jpeg",
      });
      if (uploadResult.ok) setMediaUrl(uploadResult.data.mediaUrl);
    } finally {
      setIsUploadingImage(false);
    }
  }

  async function handlePublish() {
    if (!accessToken || !user || content.trim().length === 0 || isPosting) {
      return;
    }
    setIsPosting(true);
    try {
      const result = await api.createPost(accessToken, {
        content: content.trim(),
        mediaUrl,
      });
      if (!result.ok) return;

      const now = new Date().toISOString();
      const newPost: FeedPost = {
        id: result.data.post.id,
        content: content.trim(),
        mediaUrl,
        createdAt: now,
        updatedAt: now,
        author: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
        },
        community: null,
        viewerReactions: [],
        viewerHasBookmarked: false,
      };
      setPosts((prev) => [newPost, ...prev]);
      setContent("");
      setMediaUrl(null);
    } finally {
      setIsPosting(false);
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

  async function handleToggleBookmark(postId: string) {
    if (!accessToken) return;
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    const wasBookmarked = post.viewerHasBookmarked;

    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, viewerHasBookmarked: !wasBookmarked } : p,
      ),
    );

    const result = wasBookmarked
      ? await api.removeBookmark(accessToken, postId)
      : await api.setBookmark(accessToken, postId);

    if (!result.ok) {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, viewerHasBookmarked: wasBookmarked } : p,
        ),
      );
    }
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
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
        onEndReachedThreshold={0.5}
        onEndReached={handleLoadMore}
        ListHeaderComponent={
          <Card style={styles.composer}>
            <Input
              placeholder="Що нового?"
              value={content}
              onChangeText={setContent}
              maxLength={5000}
              multiline
              numberOfLines={3}
              style={styles.composerInput}
            />

            {mediaUrl && (
              <View style={styles.previewWrapper}>
                <Image source={{ uri: mediaUrl }} style={styles.preview} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Прибрати зображення"
                  onPress={() => setMediaUrl(null)}
                  style={[
                    styles.removePreview,
                    { backgroundColor: colors.background },
                  ]}
                >
                  <Text>×</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.composerActions}>
              <Button
                title={isUploadingImage ? "Завантажуємо..." : "Додати фото"}
                variant="secondary"
                onPress={handlePickImage}
                disabled={isUploadingImage}
                style={styles.composerButton}
              />
              <Button
                title={isPosting ? "Публікуємо..." : "Опублікувати"}
                onPress={handlePublish}
                disabled={content.trim().length === 0 || isPosting}
                style={styles.composerButton}
              />
            </View>

            {status === "loading" && (
              <Text style={styles.stateText}>Завантажуємо...</Text>
            )}
            {status === "error" && (
              <Text style={[styles.stateText, { color: colors.danger }]}>
                Не вдалося завантажити стрічку. Спробуйте ще раз.
              </Text>
            )}
            {status === "success" && posts.length === 0 && (
              <Text style={styles.stateText}>
                Стрічка порожня. Додай друзів або вступи в спільноту.
              </Text>
            )}
          </Card>
        }
        renderItem={({ item }) => (
          <Card>
            <PostCard
              post={item}
              isOwn={item.author.id === user.id}
              onToggleReaction={(type) => handleToggleReaction(item.id, type)}
              onToggleBookmark={() => handleToggleBookmark(item.id)}
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
  container: { padding: 16, gap: 16 },
  composer: { gap: 4 },
  composerInput: { height: 80, textAlignVertical: "top", paddingTop: 10 },
  previewWrapper: { marginTop: 12 },
  preview: { width: "100%", height: 180, borderRadius: 16 },
  removePreview: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  composerActions: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  composerButton: { flex: 1 },
  stateText: { marginTop: 16, textAlign: "center", fontSize: 13, opacity: 0.6 },
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
  modalActions: { gap: 8 },
});
