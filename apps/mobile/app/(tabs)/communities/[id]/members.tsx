import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import Spacing from "@/constants/Spacing";
import Typography from "@/constants/Typography";
import * as api from "@/lib/api";
import type { CommunityDetail, CommunityMember } from "@/lib/api";
import { useSession } from "@/lib/session-context";

type Status = "loading" | "success" | "not_found" | "error";
type Role = "admin" | "moderator" | "member";

const ROLES: { value: Role; label: string }[] = [
  { value: "admin", label: "Адмін" },
  { value: "moderator", label: "Модератор" },
  { value: "member", label: "Учасник" },
];

export default function CommunityMembersScreen() {
  const { id: communityId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, accessToken } = useSession();
  const colors = Colors[useColorScheme()];

  const [status, setStatus] = useState<Status>("loading");
  const [community, setCommunity] = useState<CommunityDetail | null>(null);
  const [busyUserId, setBusyUserId] = useState<string>();

  const load = useCallback(async () => {
    if (!accessToken) return;
    const result = await api.getCommunity(accessToken, communityId);
    if (!result.ok) {
      setStatus(result.status === 404 ? "not_found" : "error");
      return;
    }
    setCommunity(result.data.community);
    setStatus("success");
  }, [accessToken, communityId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleChangeRole(targetUserId: string, role: Role) {
    if (!accessToken) return;
    setBusyUserId(targetUserId);
    try {
      const result = await api.changeCommunityMemberRole(
        accessToken,
        communityId,
        targetUserId,
        role,
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
      const result = await api.removeCommunityMember(
        accessToken,
        communityId,
        targetUserId,
      );
      if (!result.ok) return;
      await load();
    } finally {
      setBusyUserId(undefined);
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
        <Text>Спільноту не знайдено.</Text>
      </View>
    );
  }

  if (status === "error" || !community) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.danger }}>
          Не вдалося завантажити спільноту. Спробуйте ще раз.
        </Text>
      </View>
    );
  }

  const viewerRole =
    community.viewerMembership?.status === "approved"
      ? community.viewerMembership.role
      : undefined;
  const isAdmin = viewerRole === "admin";
  const isModerator = isAdmin || viewerRole === "moderator";

  if (!isModerator) {
    return (
      <View style={styles.center}>
        <Text style={styles.stateText}>
          Керувати учасниками можуть лише адміни й модератори.
        </Text>
        <Button
          title="Назад до спільноти"
          variant="secondary"
          onPress={() => router.replace(`/(tabs)/communities/${communityId}`)}
        />
      </View>
    );
  }

  const members: CommunityMember[] = community.members ?? [];

  return (
    <FlatList
      data={members}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.container}
      renderItem={({ item: member }) => {
        const isSelf = member.id === user.id;
        const isOwner = member.id === community.ownerId;
        const canChangeRole = isAdmin && !isSelf && !isOwner;
        const canRemove =
          !isSelf && !isOwner && (isAdmin || member.role === "member");
        const isBusy = busyUserId === member.id;

        return (
          <View
            style={[styles.memberRow, { borderBottomColor: colors.border }]}
          >
            <View style={styles.memberHeader}>
              <Avatar
                uri={member.avatarUrl}
                fallback={member.displayName ?? member.username}
                size={36}
              />
              <View style={styles.memberInfo}>
                <Text style={styles.memberName} numberOfLines={1}>
                  {member.displayName ?? member.username}
                  {isSelf && " (ти)"}
                </Text>
                <Text
                  style={[styles.memberRole, { color: colors.tabIconDefault }]}
                >
                  {isOwner
                    ? "Власник"
                    : ROLES.find((r) => r.value === member.role)?.label}
                </Text>
              </View>
            </View>

            {canChangeRole && (
              <View style={styles.roleRow}>
                {ROLES.map((role) => (
                  <Button
                    key={role.value}
                    title={role.label}
                    variant={
                      member.role === role.value ? "primary" : "secondary"
                    }
                    disabled={isBusy}
                    onPress={() => handleChangeRole(member.id, role.value)}
                    style={styles.smallButton}
                  />
                ))}
              </View>
            )}

            {canRemove && (
              <Button
                title="Видалити зі спільноти"
                variant="secondary"
                disabled={isBusy}
                onPress={() => handleRemove(member.id)}
                style={styles.removeButton}
              />
            )}
          </View>
        );
      }}
      ListEmptyComponent={
        <Text style={styles.stateText}>Немає учасників.</Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm + Spacing.xs,
    padding: Spacing.lg,
  },
  container: { padding: Spacing.md, gap: Spacing.sm },
  memberRow: {
    gap: Spacing.sm,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  memberHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm + Spacing.xs,
  },
  memberInfo: { flex: 1 },
  memberName: { ...Typography.small, fontWeight: "500" },
  memberRole: { ...Typography.small, marginTop: 1 },
  roleRow: { flexDirection: "row", gap: Spacing.xs + 2 },
  smallButton: { height: 32, paddingHorizontal: Spacing.sm + 2 },
  removeButton: { height: 36, alignSelf: "flex-start" },
  stateText: { ...Typography.small, textAlign: "center", opacity: 0.7 },
});
