import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Modal, ScrollView, Share, StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import * as api from "@/lib/api";
import { useSession } from "@/lib/session-context";

const ERROR_MESSAGES: Record<string, string> = {
  validation_error: "Перевірте правильність введених даних.",
  invalid_token: "Сесія недійсна. Увійдіть знову.",
};

const DELETE_ERROR_MESSAGES: Record<string, string> = {
  invalid_token: "Сесія недійсна. Увійдіть знову.",
  validation_error: "Введіть пароль.",
  invalid_credentials: "Невірний пароль.",
};

const AVATAR_ERROR_MESSAGES: Record<string, string> = {
  unsupported_file_type: "Підтримуються лише PNG, JPEG, WEBP.",
  file_too_large: "Файл завеликий (максимум 5MB).",
  upload_failed: "Не вдалося завантажити файл. Спробуйте ще раз.",
  invalid_token: "Сесія недійсна. Увійдіть знову.",
};

// Порожнє поле означає "очистити" — бекенд очікує явний null, не порожній рядок.
function toNullableValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export default function EditProfileScreen() {
  const { user, accessToken, updateUser, logout } = useSession();
  const router = useRouter();
  const colors = Colors[useColorScheme()];

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [location, setLocation] = useState(user?.location ?? "");
  const [formError, setFormError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string>();

  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string>();

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string>();
  const [isDeleting, setIsDeleting] = useState(false);

  if (!user || !accessToken) return null;

  async function handlePickAvatar() {
    setAvatarError(undefined);

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setAvatarError("Потрібен дозвіл на доступ до фото.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    setIsUploadingAvatar(true);
    try {
      const uploadResult = await api.uploadAvatar(accessToken!, {
        uri: asset.uri,
        name: asset.fileName ?? "avatar.jpg",
        type: asset.mimeType ?? "image/jpeg",
      });
      if (!uploadResult.ok) {
        setAvatarError(
          AVATAR_ERROR_MESSAGES[uploadResult.error.code] ??
            "Щось пішло не так. Спробуйте ще раз.",
        );
        return;
      }
      updateUser(uploadResult.data.user);
    } catch {
      setAvatarError("Немає з'єднання із сервером. Спробуйте ще раз.");
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  async function handleSave() {
    setFormError(undefined);

    if (
      displayName.trim().length > 100 ||
      bio.trim().length > 500 ||
      location.trim().length > 100
    ) {
      setFormError("Перевірте довжину полів.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await api.updateProfile(accessToken!, {
        displayName: toNullableValue(displayName),
        bio: toNullableValue(bio),
        location: toNullableValue(location),
      });
      if (!result.ok) {
        setFormError(
          ERROR_MESSAGES[result.error.code] ??
            "Щось пішло не так. Спробуйте ще раз.",
        );
        return;
      }
      updateUser(result.data.user);
      router.back();
    } catch {
      setFormError("Немає з'єднання із сервером. Спробуйте ще раз.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleExportData() {
    setExportError(undefined);
    setIsExporting(true);
    try {
      const result = await api.exportData(accessToken!);
      if (!result.ok) {
        setExportError("Не вдалося завантажити дані.");
        return;
      }
      await Share.share({ message: JSON.stringify(result.data, null, 2) });
    } catch {
      setExportError("Не вдалося поділитися даними.");
    } finally {
      setIsExporting(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleteError(undefined);
    setIsDeleting(true);
    try {
      const result = await api.deleteAccount(accessToken!, deletePassword);
      if (!result.ok) {
        setDeleteError(
          DELETE_ERROR_MESSAGES[result.error.code] ??
            "Щось пішло не так. Спробуйте ще раз.",
        );
        return;
      }
      setIsDeleteOpen(false);
      await logout();
      router.replace("/(auth)/login");
    } catch {
      setDeleteError("Немає з'єднання із сервером. Спробуйте ще раз.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card style={styles.card}>
        <View style={styles.avatarRow}>
          <Avatar
            uri={user.avatarUrl}
            fallback={user.displayName ?? user.username}
            size={80}
          />
          <Button
            title={isUploadingAvatar ? "Завантажуємо..." : "Змінити фото"}
            variant="secondary"
            onPress={handlePickAvatar}
            disabled={isUploadingAvatar}
          />
        </View>
        {avatarError && (
          <Text style={{ color: colors.danger, fontSize: 13 }}>
            {avatarError}
          </Text>
        )}

        <View style={styles.form}>
          <Input
            label="Ім'я"
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={100}
          />
          <Input
            label="Про себе"
            value={bio}
            onChangeText={setBio}
            maxLength={500}
            multiline
            numberOfLines={4}
            style={styles.textarea}
          />
          <Input
            label="Локація"
            value={location}
            onChangeText={setLocation}
            maxLength={100}
          />
          {formError && (
            <Text style={{ color: colors.danger, fontSize: 13 }}>
              {formError}
            </Text>
          )}
          <View style={styles.actions}>
            <Button
              title={isSubmitting ? "Зберігаємо..." : "Зберегти"}
              onPress={handleSave}
              disabled={isSubmitting}
            />
            <Button
              title="Скасувати"
              variant="secondary"
              onPress={() => router.back()}
            />
          </View>
        </View>
      </Card>

      <Card style={styles.card}>
        <CardTitle>Мої дані</CardTitle>
        <CardDescription style={styles.exportHint}>
          Завантажте копію даних, які Iskra зберігає про вас.
        </CardDescription>
        <Button
          title={isExporting ? "Готуємо файл..." : "Поділитися моїми даними"}
          variant="secondary"
          onPress={handleExportData}
          disabled={isExporting}
        />
        {exportError && (
          <Text style={{ color: colors.danger, fontSize: 13 }}>
            {exportError}
          </Text>
        )}
      </Card>

      <Card
        style={[styles.card, { borderColor: colors.danger, borderWidth: 1 }]}
      >
        <CardTitle style={{ color: colors.danger }}>Небезпечна зона</CardTitle>
        <CardDescription style={styles.exportHint}>
          Видалення акаунта деактивує його одразу і завершує всі активні сесії.
          Відновлення — лише через звернення в підтримку.
        </CardDescription>
        <Button
          title="Видалити акаунт"
          variant="secondary"
          onPress={() => setIsDeleteOpen(true)}
        />
      </Card>

      <Modal
        visible={isDeleteOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsDeleteOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Card style={[styles.card, styles.modalCard]}>
            <CardTitle>Видалити акаунт?</CardTitle>
            <CardDescription style={styles.exportHint}>
              Введіть пароль, щоб підтвердити. Цю дію не можна скасувати
              самостійно.
            </CardDescription>
            <Input
              label="Пароль"
              value={deletePassword}
              onChangeText={setDeletePassword}
              secureTextEntry
              error={deleteError}
            />
            <View style={styles.actions}>
              <Button
                title={isDeleting ? "Видаляємо..." : "Так, видалити назавжди"}
                variant="secondary"
                onPress={handleDeleteAccount}
                disabled={isDeleting}
              />
              <Button
                title="Скасувати"
                variant="secondary"
                onPress={() => {
                  setIsDeleteOpen(false);
                  setDeletePassword("");
                  setDeleteError(undefined);
                }}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16 },
  card: { gap: 12 },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  form: { gap: 12 },
  textarea: { height: 96, textAlignVertical: "top", paddingTop: 10 },
  actions: { gap: 8 },
  exportHint: { marginBottom: 4 },
  modalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 24,
  },
  modalCard: { width: "100%", maxWidth: 400 },
});
