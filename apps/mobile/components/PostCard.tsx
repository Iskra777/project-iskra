import { Image, StyleSheet, View as RNView } from "react-native";

import { Text, View } from "@/components/Themed";
import { Avatar } from "@/components/ui/Avatar";
import { BookmarkButton } from "@/components/ui/BookmarkButton";
import { Button } from "@/components/ui/Button";
import { ReactionButtons } from "@/components/ui/ReactionButtons";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import Spacing from "@/constants/Spacing";
import Typography from "@/constants/Typography";
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
          <RNView style={styles.nameColumn}>
            <Text style={styles.authorName}>
              {post.author.displayName ?? post.author.username}
            </Text>
            <Text style={[styles.meta, { color: colors.tabIconDefault }]}>
              {post.community && `у ${post.community.name} · `}
              {formatTimestamp(post.createdAt)}
            </Text>
          </RNView>
        </RNView>
        {isOwn && (
          <Button title="Видалити" variant="ghost" onPress={onRequestDelete} />
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
  container: { gap: Spacing.xs, backgroundColor: "transparent" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.sm,
    backgroundColor: "transparent",
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm + Spacing.xs,
    backgroundColor: "transparent",
  },
  nameColumn: { backgroundColor: "transparent" },
  authorName: { ...Typography.small, fontWeight: "500" },
  meta: { ...Typography.small, marginTop: Spacing.xs / 2 },
  content: { marginTop: Spacing.sm + Spacing.xs, ...Typography.body },
  media: {
    marginTop: Spacing.sm + Spacing.xs,
    width: "100%",
    height: 220,
    borderRadius: 16,
  },
  actions: {
    marginTop: Spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  reactions: {
    flexDirection: "row",
    gap: Spacing.xs,
    backgroundColor: "transparent",
  },
});
