import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import Checkbox from 'expo-checkbox';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/src/components/AppButton';
import { AppTextField } from '@/src/components/AppTextField';
import { useAuthStore } from '@/src/store/authStore';
import { usePreferencesStore } from '@/src/store/preferencesStore';
import { colors } from '@/src/theme/colors';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';

export default function SettingsScreen() {
  const [className, setClassName] = React.useState('');
  const [isNotificationsExpanded, setIsNotificationsExpanded] = React.useState(true);
  const [isFavoriteClassesExpanded, setIsFavoriteClassesExpanded] = React.useState(false);
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const favoriteEvents = usePreferencesStore((state) => state.favoriteEvents);
  const clearLogoutSensitivePreferences = usePreferencesStore((state) => state.clearLogoutSensitivePreferences);
  const clearAllFavorites = usePreferencesStore((state) => state.clearAllFavorites);
  const favoriteClasses = usePreferencesStore((state) => state.favoriteClasses);
  const notificationSettings = usePreferencesStore((state) => state.notificationSettings);
  const addFavoriteClass = usePreferencesStore((state) => state.addFavoriteClass);
  const moveFavoriteClass = usePreferencesStore((state) => state.moveFavoriteClass);
  const removeFavoriteClass = usePreferencesStore((state) => state.removeFavoriteClass);
  const setNotificationSetting = usePreferencesStore((state) => state.setNotificationSetting);

  const handleAddFavoriteClass = async () => {
    const result = await addFavoriteClass(className);

    if (!result.ok) {
      if (result.reason === 'duplicate') {
        Alert.alert('Klassen finns redan', 'Den här favoritklassen finns redan i listan.');
      } else {
        Alert.alert('Ingen klass angiven', 'Skriv in ett klassnamn innan du lägger till det.');
      }

      return;
    }

    setClassName('');
  };

  const confirmLogout = () => {
    Alert.alert(
      'Logga ut?',
      'Om du loggar ut raderas alla favoriter och alla favoritklasser från appen. Vill du gå vidare?',
      [
        {
          style: 'cancel',
          text: 'Avbryt',
        },
        {
          style: 'destructive',
          text: 'Logga ut',
          onPress: () => {
            void handleLogout();
          },
        },
      ],
    );
  };

  const handleLogout = async () => {
    await clearLogoutSensitivePreferences();
    await signOut();
    Alert.alert('Utloggad', 'Din lokala session är rensad och favoriter/favoritklasser har tagits bort.');
  };

  const confirmClearFavorites = () => {
    Alert.alert(
      'Rensa alla favorittävlingar?',
      user
        ? 'Alla favorittävlingar tas bort från appen och motsvarande bevakningar rensas från Supabase vid nästa synk.'
        : 'Alla favorittävlingar tas bort från appen.',
      [
        {
          style: 'cancel',
          text: 'Avbryt',
        },
        {
          style: 'destructive',
          text: 'Rensa',
          onPress: () => {
            void handleClearFavorites();
          },
        },
      ],
    );
  };

  const handleClearFavorites = async () => {
    await clearAllFavorites();
    Alert.alert('Favoriter rensade', 'Alla favorittävlingar har tagits bort.');
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.headerCard}>
          <Text style={styles.title}>Inställningar</Text>
          <Text style={styles.subtitle}>Notiser och favoritklasser.</Text>
        </View>

        <ExpandableCard
          expanded={isNotificationsExpanded}
          onPress={() => setIsNotificationsExpanded((current) => !current)}
          title="Notiser"
        >
          <View style={styles.sectionContent}>
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
          </View>
        </ExpandableCard>

        <ExpandableCard
          expanded={isFavoriteClassesExpanded}
          onPress={() => setIsFavoriteClassesExpanded((current) => !current)}
          title={`Favoritklasser (${favoriteClasses.length})`}
        >
          <View style={styles.sectionContent}>
            <Text style={styles.helperText}>
              Lägg in klassnamn exakt som du vill prioritera dem. Matchande klasser flyttas överst i klassväljaren i den ordning du sätter här.
            </Text>

            <AppTextField
              autoCapitalize="characters"
              autoCorrect={false}
              label="Ny favoritklass"
              onChangeText={setClassName}
              placeholder="Till exempel H21, D18 eller Inskolning"
              value={className}
            />

            <AppButton label="Lägg till favoritklass" onPress={() => void handleAddFavoriteClass()} />

            {favoriteClasses.length === 0 ? (
              <Text style={styles.helperText}>Du har inte lagt till några favoritklasser ännu.</Text>
            ) : (
              <View style={styles.favoriteClassList}>
                {favoriteClasses.map((favoriteClass, index) => (
                  <View key={favoriteClass} style={styles.favoriteClassRow}>
                    <View style={styles.favoriteClassCopy}>
                      <Text style={styles.favoriteClassOrder}>{index + 1}.</Text>
                      <Text numberOfLines={1} style={styles.favoriteClassName}>
                        {favoriteClass}
                      </Text>
                    </View>

                    <View style={styles.favoriteClassActions}>
                      <Pressable
                        disabled={index === 0}
                        onPress={() => void moveFavoriteClass(favoriteClass, 'up')}
                        style={[styles.iconButton, index === 0 ? styles.iconButtonDisabled : null]}
                      >
                        <Ionicons color={index === 0 ? colors.textMuted : colors.primaryDeep} name="chevron-up" size={18} />
                      </Pressable>
                      <Pressable
                        disabled={index === favoriteClasses.length - 1}
                        onPress={() => void moveFavoriteClass(favoriteClass, 'down')}
                        style={[styles.iconButton, index === favoriteClasses.length - 1 ? styles.iconButtonDisabled : null]}
                      >
                        <Ionicons color={index === favoriteClasses.length - 1 ? colors.textMuted : colors.primaryDeep} name="chevron-down" size={18} />
                      </Pressable>
                      <Pressable onPress={() => void removeFavoriteClass(favoriteClass)} style={styles.iconButton}>
                        <Ionicons color={colors.primaryDeep} name="close" size={18} />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ExpandableCard>

        {favoriteEvents.length > 0 ? <AppButton label="Rensa alla favorittävlingar" onPress={confirmClearFavorites} variant="secondary" /> : null}

        {user ? <AppButton label="Logga ut" onPress={confirmLogout} variant="secondary" /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function ExpandableCard({
  children,
  expanded,
  onPress,
  title,
}: {
  children: React.ReactNode;
  expanded: boolean;
  onPress: () => void;
  title: string;
}) {
  return (
    <View style={styles.panel}>
      <Pressable onPress={onPress} style={styles.panelHeader}>
        <Text style={styles.panelTitle}>{title}</Text>
        <Ionicons color={colors.primaryDeep} name={expanded ? 'chevron-up' : 'chevron-down'} size={20} />
      </Pressable>
      {expanded ? children : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  container: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  headerCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: 2,
    padding: spacing.lg,
  },
  title: {
    ...typography.screenTitle,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  panelTitle: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
  },
  sectionContent: {
    gap: spacing.md,
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
  checkbox: {
    borderRadius: 6,
  },
  helperText: {
    ...typography.caption,
    color: colors.textMuted,
    lineHeight: 20,
  },
  favoriteClassList: {
    gap: spacing.sm,
  },
  favoriteClassRow: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  favoriteClassCopy: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minWidth: 0,
  },
  favoriteClassOrder: {
    ...typography.captionStrong,
    color: colors.primaryDeep,
    width: 20,
  },
  favoriteClassName: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flex: 1,
  },
  favoriteClassActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  iconButtonDisabled: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
});
