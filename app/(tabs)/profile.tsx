import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import Checkbox from 'expo-checkbox';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/src/components/AppButton';
import { AppTextField } from '@/src/components/AppTextField';
import { useRememberMe } from '@/src/hooks/useRememberMe';
import { useAuthStore } from '@/src/store/authStore';
import { usePreferencesStore } from '@/src/store/preferencesStore';
import { colors } from '@/src/theme/colors';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';

export default function ProfileScreen() {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const { rememberMe, setRememberMe } = useRememberMe(true);

  const error = useAuthStore((state) => state.error);
  const isSubmitting = useAuthStore((state) => state.isSubmitting);
  const signInWithEventor = useAuthStore((state) => state.signInWithEventor);
  const signOut = useAuthStore((state) => state.signOut);
  const user = useAuthStore((state) => state.user);

  const favoriteEvents = usePreferencesStore((state) => state.favoriteEvents);
  const notificationSettings = usePreferencesStore((state) => state.notificationSettings);
  const removeFavorite = usePreferencesStore((state) => state.removeFavorite);
  const setNotificationSetting = usePreferencesStore((state) => state.setNotificationSetting);

  const handleLogin = async () => {
    try {
      await signInWithEventor({ password, rememberMe, username });
      setPassword('');
    } catch {
      // Store state already exposes a clean error message.
    }
  };

  const handleLogout = async () => {
    await signOut();
    setPassword('');
    Alert.alert('Utloggad', 'Din lokala session är rensad.');
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.headerCard}>
          <Text style={styles.title}>Min sida</Text>
          <Text style={styles.subtitle}>
            Här hanterar du Eventor-inloggning, bevakning av favoritmarkerade tävlingar och vilka pushnotiser du vill ha.
          </Text>
        </View>

        {!user ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Logga in med Eventor</Text>

            <AppTextField
              autoCapitalize="none"
              autoCorrect={false}
              label="UserName"
              onChangeText={setUsername}
              placeholder="Ange ditt Eventor-användarnamn"
              value={username}
            />

            <AppTextField
              autoCapitalize="none"
              autoCorrect={false}
              label="Password"
              onChangeText={setPassword}
              placeholder="Ange ditt lösenord"
              secureTextEntry
              value={password}
            />

            <View style={styles.checkboxRow}>
              <Checkbox color={rememberMe ? colors.primary : undefined} style={styles.checkbox} value={rememberMe} onValueChange={setRememberMe} />
              <Text style={styles.checkboxLabel}>Kom ihåg mig</Text>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <AppButton
              disabled={!username.trim() || !password.trim()}
              label="Logga in"
              loading={isSubmitting}
              onPress={() => void handleLogin()}
            />

            <Text style={styles.helperText}>
              Inloggningen använder Eventors dokumenterade authenticatePerson-endpoint. Lyckad inloggning sparas lokalt om du markerar Kom ihåg mig.
            </Text>
          </View>
        ) : (
          <View style={styles.panel}>
            <View style={styles.loggedInHeader}>
              <View style={styles.loggedInCopy}>
                <Text style={styles.loggedInName}>{user.fullName ?? 'Inloggad användare'}</Text>
                <Text style={styles.loggedInMeta}>Accessnivå: {user.accessLevel}</Text>
              </View>
              <View style={styles.statusBadge}>
                <Text style={styles.statusBadgeText}>Eventor</Text>
              </View>
            </View>

            <View style={styles.infoGrid}>
              <ProfileRow label="PersonId" value={user.personId ?? 'Saknas i svaret'} />
              <ProfileRow label="Födelsedatum" value={user.birthDate ?? 'Ej tillgängligt'} />
              <ProfileRow label="E-post" value={user.email ?? 'Ej tillgängligt'} />
              <ProfileRow label="Klubb" value={user.organisationName ?? (user.organisationIds[0] ?? 'Ej tillgängligt')} />
              <ProfileRow label="Användarnamn" value={user.username} />
            </View>

            <AppButton label="Logga ut" onPress={() => void handleLogout()} variant="secondary" />
          </View>
        )}

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Inställningar</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingCopy}>
              <Text style={styles.settingTitle}>Push för startlistor</Text>
              <Text style={styles.settingDescription}>Få en push när en favoritmarkerad tävling får startlista publicerad.</Text>
            </View>
            <Checkbox
              color={notificationSettings.pushOnStartList ? colors.primary : undefined}
              style={styles.checkbox}
              value={notificationSettings.pushOnStartList}
              onValueChange={(value) => void setNotificationSetting('pushOnStartList', value)}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingCopy}>
              <Text style={styles.settingTitle}>Push för resultatlistor</Text>
              <Text style={styles.settingDescription}>Få en push när en favoritmarkerad tävling får resultatlista publicerad.</Text>
            </View>
            <Checkbox
              color={notificationSettings.pushOnResultList ? colors.primary : undefined}
              style={styles.checkbox}
              value={notificationSettings.pushOnResultList}
              onValueChange={(value) => void setNotificationSetting('pushOnResultList', value)}
            />
          </View>

          <Text style={styles.helperText}>
            Appen sparar nu dina val lokalt. För riktiga pushnotiser när appen är stängd krävs nästa steg: registrera enhetstoken och låta backend bevaka Eventors HashTableEntry för dina favoriter.
          </Text>
        </View>

        <View style={styles.panel}>
          <View style={styles.favoritesHeader}>
            <Text style={styles.panelTitle}>Favoriter</Text>
            <View style={styles.favoriteCountBadge}>
              <Text style={styles.favoriteCountText}>{favoriteEvents.length}</Text>
            </View>
          </View>

          {favoriteEvents.length === 0 ? (
            <Text style={styles.helperText}>Du har inte favoritmarkerat någon tävling ännu.</Text>
          ) : (
            <View style={styles.favoriteList}>
              {favoriteEvents.map((event) => (
                <View key={event.id} style={styles.favoriteRow}>
                  <Pressable
                    onPress={() => router.push({ params: { id: event.id }, pathname: '/event/[id]' })}
                    style={({ pressed }) => [styles.favoriteLink, pressed ? styles.favoriteLinkPressed : null]}
                  >
                    <Text numberOfLines={2} style={styles.favoriteName}>
                      {event.name}
                    </Text>
                    <Text style={styles.favoriteMeta}>
                      {[event.dateLabel, event.classificationLabel].filter(Boolean).join(' • ')}
                    </Text>
                  </Pressable>

                  <Pressable onPress={() => void removeFavorite(event.id)} style={styles.favoriteRemoveButton}>
                    <Ionicons color={colors.primaryDeep} name="star" size={16} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  container: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  headerCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  title: {
    ...typography.screenTitle,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  panelTitle: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
  },
  checkboxRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  checkbox: {
    borderRadius: 6,
  },
  checkboxLabel: {
    ...typography.body,
    color: colors.textPrimary,
  },
  helperText: {
    ...typography.caption,
    color: colors.textMuted,
    lineHeight: 20,
  },
  errorText: {
    ...typography.captionStrong,
    color: colors.error,
  },
  loggedInHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  loggedInCopy: {
    flex: 1,
    gap: 2,
  },
  loggedInName: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
  },
  loggedInMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
  statusBadge: {
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  statusBadgeText: {
    ...typography.captionStrong,
    color: colors.primaryDeep,
  },
  infoGrid: {
    gap: spacing.sm,
  },
  infoRow: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 18,
    gap: spacing.xs,
    padding: spacing.md,
  },
  infoLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  infoValue: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  settingRow: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 18,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  settingCopy: {
    flex: 1,
    gap: 4,
  },
  settingTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  settingDescription: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  favoritesHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  favoriteCountBadge: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    justifyContent: 'center',
    minWidth: 34,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  favoriteCountText: {
    ...typography.captionStrong,
    color: colors.primaryDeep,
  },
  favoriteList: {
    gap: spacing.sm,
  },
  favoriteRow: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  favoriteLink: {
    flex: 1,
    gap: 4,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  favoriteLinkPressed: {
    opacity: 0.85,
  },
  favoriteName: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  favoriteMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  favoriteRemoveButton: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
});
