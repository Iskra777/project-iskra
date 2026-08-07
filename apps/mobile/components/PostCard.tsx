import { Image, StyleSheet, View as RNView } from "react-native";

import { Text, View } from "@/components/Themed";
import { Avatar } from "@/components/ui/Avatar";
import { BookmarkButton } from "@/components/ui/BookmarkButton";
import { Button } from "@/components/ui/Button";
import { ReactionButtons } from "@/components/ui/ReactionButtons";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import type { FeedPost, ReactionType } from "@/lib/api";

function formatTimestamp(createdAt: string) {
  const date = new Date(createdAt);
  const isToday = date.toDateString() === new Date().toDateString();
  return isToday
    ? date.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("uk-UA");
}

interface PostCardProps {
  post: FeedPost;
  isOwn: boolean;
  onToggleReaction: (type: ReactionType) => void;
  onToggleBookmark: () => void;
  onRequestDelete: () => void;
}

export function PostCard({
  post,
  isOwn,
  onToggleReaction,
  onToggleBookmark,
  onRequestDelete,
}: PostCardProps) {
  const colors = Colors[useColorScheme()];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <RNView style={styles.authorRow}>
          <Avatar
            uri={post.author.avatarUrl}
            fallback={post.author.displayName ?? post.author.username}
            size={36}
          />
          <View>
            <Text style={styles.authorName}>
              {post.author.displayName ?? post.author.username}
            </Text>
            <Text style={[styles.meta, { color: colors.tabIconDefault }]}>
              {post.community && `у ${post.community.name} · `}
              {formatTimestamp(post.createdAt)}
            </Text>
          </View>
        </RNView>
        {isOwn && (
          <Button
            title="Видалити"
            variant="secondary"
            onPress={onRequestDelete}
            style={styles.deleteButton}
          />
        )}
      </View>

      <Text style={styles.content}>{post.content}</Text>

      {post.mediaUrl && (
        <Image source={{ uri: post.mediaUrl }} style={styles.media} />
      )}

      <RNView style={styles.actions}>
        <RNView style={styles.reactions}>
          <ReactionButtons
            activeTypes={post.viewerReactions}
            onToggle={onToggleReaction}
          />
        </RNView>
        <BookmarkButton
          active={post.viewerHasBookmarked}
          onToggle={onToggleBookmark}
        />
      </RNView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 4 },
  header: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "transparent",
  },
  authorName: { fontSize: 14, fontWeight: "500" },
  meta: { fontSize: 12, marginTop: 2 },
  deleteButton: { height: 32, paddingHorizontal: 12 },
  content: { marginTop: 12, fontSize: 14 },
  media: {
    marginTop: 12,
    width: "100%",
    height: 220,
    borderRadius: 16,
  },
  actions: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  reactions: { flexDirection: "row", gap: 4, backgroundColor: "transparent" },
});
