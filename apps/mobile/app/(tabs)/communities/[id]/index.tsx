import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import Spacing from "@/constants/Spacing";
import Typography from "@/constants/Typography";
import * as api from "@/lib/api";
import type { CommunityDetail } from "@/lib/api";
import { useSession } from "@/lib/session-context";

type Status = "loading" | "success" | "not_found" | "error";

function roleLabel(role: string) {
  if (role === "admin") return "Адмін";
  if (role === "moderator") return "Модератор";
  return "Учасник";
}

export default function CommunityScreen() {
  const { id: communityId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, accessToken } = useSession();
  const colors = Colors[useColorScheme()];

  const [status, setStatus] = useState<Status>("loading");
  const [community, setCommunity] = useState<CommunityDetail | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
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

  async function handleJoin() {
    if (!accessToken) return;
    setIsJoining(true);
    try {
      const result = await api.joinCommunity(accessToken, communityId);
      if (!result.ok) return;
      await load();
    } finally {
      setIsJoining(false);
    }
  }

  async function handleLeave() {
    if (!accessToken) return;
    setIsLeaving(true);
    try {
      const result = await api.leaveCommunity(accessToken, communityId);
      if (!result.ok) return;
      await load();
    } finally {
      setIsLeaving(false);
    }
  }

  async function respondToRequest(
    targetUserId: string,
    action: "approve" | "reject",
  ) {
    if (!accessToken) return;
    setBusyUserId(targetUserId);
    try {
      const result = await api.respondCommunityJoinRequest(
        accessToken,
        communityId,
        targetUserId,
        action,
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

  const isOwner = user.id === community.ownerId;
  const isModerator =
    community.viewerMembership?.status === "approved" &&
    (community.viewerMembership.role === "admin" ||
      community.viewerMembership.role === "moderator");

  return (
    <>
      <Stack.Screen options={{ title: community.name }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{community.name}</Text>
        <Text style={[styles.meta, { color: colors.tabIconDefault }]}>
          {community.visibility === "public" ? "Публічна" : "Приватна"} ·{" "}
          {community.memberCount}{" "}
          {community.memberCount === 1 ? "учасник" : "учасників"}
        </Text>

        {community.description && (
          <Text style={styles.description}>{community.description}</Text>
        )}

        <View style={styles.membershipBlock}>
          {!community.viewerMembership && (
            <Button
              title={isJoining ? "Вступаємо..." : "Вступити"}
              onPress={handleJoin}
              disabled={isJoining}
            />
          )}
          {community.viewerMembership?.status === "pending" && (
            <Text style={styles.stateText}>
              Заявку подано, очікує розгляду.
            </Text>
          )}
          {community.viewerMembership?.status === "approved" && isOwner && (
            <Text style={styles.stateText}>Ви власник цієї спільноти.</Text>
          )}
          {community.viewerMembership?.status === "approved" && !isOwner && (
            <Button
              title={isLeaving ? "Виходимо..." : "Покинути спільноту"}
              variant="secondary"
              onPress={handleLeave}
              disabled={isLeaving}
            />
          )}
        </View>

        {isModerator &&
          community.pendingRequests &&
          community.pendingRequests.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Заявки на вступ</Text>
              {community.pendingRequests.map((applicant) => (
                <View key={applicant.id} style={styles.requestRow}>
                  <Avatar
                    uri={applicant.avatarUrl}
                    fallback={applicant.displayName ?? applicant.username}
                    size={36}
                  />
                  <Text style={styles.requestName} numberOfLines={1}>
                    {applicant.displayName ?? applicant.username}
                  </Text>
                  <View style={styles.requestActions}>
                    <Button
                      title="Схвалити"
                      disabled={busyUserId === applicant.id}
                      onPress={() => respondToRequest(applicant.id, "approve")}
                      style={styles.smallButton}
                    />
                    <Button
                      title="Відхилити"
                      variant="secondary"
                      disabled={busyUserId === applicant.id}
                      onPress={() => respondToRequest(applicant.id, "reject")}
                      style={styles.smallButton}
                    />
                  </View>
                </View>
              ))}
            </View>
          )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Учасники</Text>
            {isModerator && (
              <Button
                title="Керувати"
                variant="secondary"
                onPress={() =>
                  router.push(`/(tabs)/communities/${communityId}/members`)
                }
                style={styles.manageButton}
              />
            )}
          </View>
          {community.members === null && (
            <Text style={[styles.stateText, { color: colors.tabIconDefault }]}>
              Список учасників видно лише учасникам спільноти.
            </Text>
          )}
          {community.members?.map((member) => (
            <View key={member.id} style={styles.memberRow}>
              <Avatar
                uri={member.avatarUrl}
                fallback={member.displayName ?? member.username}
                size={36}
              />
              <View style={styles.memberInfo}>
                <Text style={styles.memberName} numberOfLines={1}>
                  {member.displayName ?? member.username}
                </Text>
                <Text
                  style={[styles.memberRole, { color: colors.tabIconDefault }]}
                >
                  {roleLabel(member.role)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
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
  container: { padding: Spacing.md, gap: Spacing.xs },
  title: Typography.h3,
  meta: Typography.small,
  description: { ...Typography.body, marginTop: Spacing.sm },
  membershipBlock: { marginTop: Spacing.md },
  stateText: { ...Typography.small, textAlign: "center" },
  section: { marginTop: Spacing.lg, gap: Spacing.sm },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { ...Typography.small, fontWeight: "500" },
  manageButton: { height: 32, paddingHorizontal: Spacing.sm + 2 },
  requestRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  requestName: { ...Typography.small, flex: 1, minWidth: 100 },
  requestActions: { flexDirection: "row", gap: Spacing.xs + 2 },
  smallButton: { height: 36, paddingHorizontal: Spacing.sm + Spacing.xs },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm + Spacing.xs,
    paddingVertical: Spacing.xs + 2,
  },
  memberInfo: { flex: 1 },
  memberName: { ...Typography.small, fontWeight: "500" },
  memberRole: { ...Typography.small, marginTop: Spacing.xs / 2 },
});
