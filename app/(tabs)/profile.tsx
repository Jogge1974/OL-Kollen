import * as React from 'react';

import Checkbox from 'expo-checkbox';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/src/components/AppButton';
import { AppTextField } from '@/src/components/AppTextField';
import { useRememberMe } from '@/src/hooks/useRememberMe';
import { useAuthStore } from '@/src/store/authStore';
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
            Eventor-inloggning förberedd för lokal sessionslagring och framtida accessnivåer.
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
              Inloggningen använder Eventors dokumenterade `authenticatePerson`-endpoint. Lyckad inloggning sparas lokalt om du markerar “Kom ihåg mig”.
            </Text>
          </View>
        ) : (
          <View style={styles.panel}>
            <View style={styles.loggedInHeader}>
              <View>
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
              <ProfileRow
                label="Organisationer"
                value={user.organisationIds.length > 0 ? user.organisationIds.join(', ') : 'Ej tillgängligt'}
              />
              <ProfileRow label="Användarnamn" value={user.username} />
            </View>

            <AppButton label="Logga ut" onPress={() => void handleLogout()} variant="secondary" />
          </View>
        )}
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
});
