import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import Checkbox from 'expo-checkbox';
import { router } from 'expo-router';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/src/components/AppButton';
import { AppTextField } from '@/src/components/AppTextField';
import { CalendarFilterTemplateEditor } from '@/src/components/CalendarFilterTemplateEditor';
import { ScreenHeroHeader } from '@/src/components/ScreenHeroHeader';
import { createDefaultCalendarFilterTemplate, describeCalendarFilterTemplate } from '@/src/features/calendar/calendarFilters';
import { useEventorDistricts } from '@/src/hooks/useEventorDistricts';
import { useAuthStore } from '@/src/store/authStore';
import { usePreferencesStore } from '@/src/store/preferencesStore';
import { ColorPalette, useColors } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';

export default function SettingsScreen() {
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [className, setClassName] = React.useState('');
  const [presetName, setPresetName] = React.useState('');
  const [calendarDefaultDraft, setCalendarDefaultDraft] = React.useState(createDefaultCalendarFilterTemplate());
  const [isCalendarFiltersExpanded, setIsCalendarFiltersExpanded] = React.useState(false);
  const [isNotificationsExpanded, setIsNotificationsExpanded] = React.useState(false);
  const [isFavoriteClassesExpanded, setIsFavoriteClassesExpanded] = React.useState(false);
  const [isThemeExpanded, setIsThemeExpanded] = React.useState(false);
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const clearLogoutSensitivePreferences = usePreferencesStore((state) => state.clearLogoutSensitivePreferences);
  const calendarDefaultFilterTemplate = usePreferencesStore((state) => state.calendarDefaultFilterTemplate);
  const calendarFilterPresets = usePreferencesStore((state) => state.calendarFilterPresets);
  const addCalendarFilterPreset = usePreferencesStore((state) => state.addCalendarFilterPreset);
  const moveCalendarFilterPreset = usePreferencesStore((state) => state.moveCalendarFilterPreset);
  const removeCalendarFilterPreset = usePreferencesStore((state) => state.removeCalendarFilterPreset);
  const setCalendarDefaultFilterTemplate = usePreferencesStore((state) => state.setCalendarDefaultFilterTemplate);
  const favoriteClasses = usePreferencesStore((state) => state.favoriteClasses);
  const notificationSettings = usePreferencesStore((state) => state.notificationSettings);
  const addFavoriteClass = usePreferencesStore((state) => state.addFavoriteClass);
  const moveFavoriteClass = usePreferencesStore((state) => state.moveFavoriteClass);
  const removeFavoriteClass = usePreferencesStore((state) => state.removeFavoriteClass);
  const setNotificationSetting = usePreferencesStore((state) => state.setNotificationSetting);
  const themeName = usePreferencesStore((state) => state.themeName);
  const setThemeName = usePreferencesStore((state) => state.setThemeName);
  const { districtOptions, error: districtError, organisationToDistrictId } = useEventorDistricts(isCalendarFiltersExpanded);

  React.useEffect(() => {
    setCalendarDefaultDraft(calendarDefaultFilterTemplate);
  }, [calendarDefaultFilterTemplate]);

  const myDistrictId = React.useMemo(() => {
    const organisationId = user?.organisationIds[0];
    return organisationId ? organisationToDistrictId[organisationId] ?? null : null;
  }, [organisationToDistrictId, user?.organisationIds]);

  const myDistrictOption = React.useMemo(() => {
    if (!myDistrictId) {
      return null;
    }

    const district = districtOptions.find((option) => option.id === myDistrictId);

    if (!district) {
      return null;
    }

    return {
        id: district.id,
        label: `Mitt distrikt (${district.label})`,
    };
  }, [districtOptions, myDistrictId]);

  const districtLabelById = React.useMemo(
    () =>
      districtOptions.reduce<Record<number, string>>((accumulator, option) => {
        accumulator[option.id] = option.label;
        return accumulator;
      }, {}),
    [districtOptions],
  );

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

  const handleSaveDefaultFilter = async () => {
    await setCalendarDefaultFilterTemplate(calendarDefaultDraft);
    Alert.alert('Standardfilter sparat', 'Det nya standardfiltret används i kalendern och i återställningen.');
  };

  const handleResetDefaultFilter = async () => {
    setCalendarDefaultDraft(createDefaultCalendarFilterTemplate());
    await setCalendarDefaultFilterTemplate(createDefaultCalendarFilterTemplate());
    Alert.alert('Standardfilter återställt', 'Standardfiltret är nu tillbaka på förvalda värden.');
  };

  const handleAddFilterPreset = async () => {
    const result = await addCalendarFilterPreset(presetName, calendarDefaultDraft);

    if (!result.ok) {
      if (result.reason === 'duplicate') {
        Alert.alert('Filtret finns redan', 'Ett förvalt filter med det namnet finns redan.');
      } else {
        Alert.alert('Namn saknas', 'Skriv ett namn innan du sparar filtret.');
      }

      return;
    }

    setPresetName('');
  };

  const canSaveDefaultFilter = calendarDefaultDraft.fromOffsetDays <= calendarDefaultDraft.toOffsetDays;

  const confirmLogout = () => {
    Alert.alert(
      'Logga ut?',
      'Dina inställningar sparas och kan hämtas tillbaka när du loggar in igen.',
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
    await signOut();
    await clearLogoutSensitivePreferences();
    Alert.alert('Utloggad', 'Du är nu utloggad.');
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <ScreenHeroHeader
          chips={[
            { icon: 'funnel-outline', label: 'Filter', value: `${calendarFilterPresets.length} sparade` },
            { icon: 'notifications-outline', label: 'Notiser', value: notificationSettings.pushOnStartList || notificationSettings.pushOnResultList ? 'Aktiva' : 'Av' },
            { icon: 'bookmark-outline', label: 'Favoritklasser', value: `${favoriteClasses.length}` },
          ]}
          eyebrow="Konton"
          subtitle="Kalenderfilter, notiser, tema och favoritklasser."
          title="Inställningar"
          topRightText="4 sektioner"
        />

        <ExpandableCard
          contentStyle={styles.calendarFilterContent}
          expanded={isCalendarFiltersExpanded}
          icon="funnel-outline"
          onPress={() => setIsCalendarFiltersExpanded((current) => !current)}
          title="Kalenderfilter"
          variant="compact"
        >
          <View style={styles.sectionContent}>
            <Text style={styles.helperText}>
              Ändra standardfiltret eller spara egna förvalda filter som sedan kan väljas i Tävlingskalenderns filtervy.
            </Text>

            <CalendarFilterTemplateEditor
              districtOptions={districtOptions}
              myDistrictOption={myDistrictOption}
              onChange={setCalendarDefaultDraft}
              template={calendarDefaultDraft}
            />

            {districtError ? <Text style={styles.errorText}>{districtError}</Text> : null}

            <AppButton disabled={!canSaveDefaultFilter} label="Spara standardfilter" onPress={() => void handleSaveDefaultFilter()} />
            <AppButton label="Återställ standardfilter" onPress={() => void handleResetDefaultFilter()} variant="secondary" />

            <View style={styles.presetNameBlock}>
              <AppTextField
                autoCapitalize="words"
                autoCorrect={false}
                label="Namn på förvalt filter"
                onChangeText={setPresetName}
                placeholder="Till exempel Mitt distrikt"
                value={presetName}
              />
              <AppButton disabled={!canSaveDefaultFilter} label="Spara som förvalt filter" onPress={() => void handleAddFilterPreset()} variant="secondary" />
            </View>

            {calendarFilterPresets.length === 0 ? (
              <Text style={styles.helperText}>Du har inga sparade filter ännu.</Text>
            ) : (
              <View style={styles.presetList}>
                {calendarFilterPresets.map((preset, index) => (
                  <View key={preset.id} style={styles.presetRow}>
                    <View style={styles.presetCopy}>
                      <Text style={styles.presetTitle}>
                        {index + 1}. {preset.name}
                      </Text>
                      <Text numberOfLines={2} style={styles.presetSummary}>
                        {describeCalendarFilterTemplate(preset.template, districtLabelById)}
                      </Text>
                    </View>

                    <View style={styles.presetActions}>
                      <Pressable
                        disabled={index === 0}
                        onPress={() => void moveCalendarFilterPreset(preset.id, 'up')}
                        style={[styles.iconButton, index === 0 ? styles.iconButtonDisabled : null]}
                      >
                        <Ionicons color={index === 0 ? colors.textMuted : colors.primaryDeep} name="chevron-up" size={18} />
                      </Pressable>
                      <Pressable
                        disabled={index === calendarFilterPresets.length - 1}
                        onPress={() => void moveCalendarFilterPreset(preset.id, 'down')}
                        style={[styles.iconButton, index === calendarFilterPresets.length - 1 ? styles.iconButtonDisabled : null]}
                      >
                        <Ionicons
                          color={index === calendarFilterPresets.length - 1 ? colors.textMuted : colors.primaryDeep}
                          name="chevron-down"
                          size={18}
                        />
                      </Pressable>
                      <Pressable onPress={() => void removeCalendarFilterPreset(preset.id)} style={styles.iconButton}>
                        <Ionicons color={colors.primaryDeep} name="close" size={18} />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ExpandableCard>

        <ExpandableCard
          expanded={isNotificationsExpanded}
          icon="notifications-outline"
          onPress={() => setIsNotificationsExpanded((current) => !current)}
          title="Notiser"
        >
          <View style={styles.sectionContent}>
                      <Text style={styles.helperText}>
                          Observera att notiser endast gäller tävlingar man favoritmarkerat.
                      </Text>
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
          icon="bookmark-outline"
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

        <ExpandableCard
          expanded={isThemeExpanded}
          icon="color-palette-outline"
          onPress={() => setIsThemeExpanded((current) => !current)}
          title="Tema"
        >
          <View style={styles.sectionContent}>
            <Text style={styles.helperText}>Välj utseende för appen.</Text>
            <View style={styles.themeToggleRow}>
              <Pressable
                onPress={() => void setThemeName('light')}
                style={[styles.themeOption, themeName === 'light' ? styles.themeOptionActive : null]}
              >
                <Ionicons color={themeName === 'light' ? colors.primaryDeep : colors.textSecondary} name="sunny-outline" size={20} />
                <Text style={[styles.themeOptionText, themeName === 'light' ? styles.themeOptionTextActive : null]}>Ljust</Text>
              </Pressable>
              <Pressable
                onPress={() => void setThemeName('dark')}
                style={[styles.themeOption, themeName === 'dark' ? styles.themeOptionActive : null]}
              >
                <Ionicons color={themeName === 'dark' ? colors.primaryDeep : colors.textSecondary} name="moon-outline" size={20} />
                <Text style={[styles.themeOptionText, themeName === 'dark' ? styles.themeOptionTextActive : null]}>Mörkt</Text>
              </Pressable>
              <Pressable
                onPress={() => void setThemeName('soft')}
                style={[styles.themeOption, themeName === 'soft' ? styles.themeOptionActive : null]}
              >
                <Image source={require('@/assets/soft-icon.png')} style={styles.softIcon} />
                <Text style={[styles.themeOptionText, themeName === 'soft' ? styles.themeOptionTextActive : null]}>SOFT</Text>
              </Pressable>
            </View>
          </View>
        </ExpandableCard>

        {user ? (
          <View style={styles.logoutFooter}>
            <Pressable onPress={() => router.push('/about')} style={styles.aboutButton}>
              <Ionicons color={colors.primary} name="information-circle-outline" size={20} />
              <Text style={styles.aboutButtonText}>Om OL-Kollen</Text>
              <Ionicons color={colors.textSecondary} name="chevron-forward" size={16} />
            </Pressable>
            <AppButton label="Logga ut" onPress={confirmLogout} variant="secondary" />
          </View>
        ) : (
          <View style={styles.logoutFooter}>
            <Pressable onPress={() => router.push('/about')} style={styles.aboutButton}>
              <Ionicons color={colors.primary} name="information-circle-outline" size={20} />
              <Text style={styles.aboutButtonText}>Om OL-Kollen</Text>
              <Ionicons color={colors.textSecondary} name="chevron-forward" size={16} />
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ExpandableCard({
  children,
  contentStyle,
  expanded,
  icon,
  onPress,
  title,
  variant = 'default',
}: {
  children: React.ReactNode;
  contentStyle?: object;
  expanded: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  title: string;
  variant?: 'default' | 'compact';
}) {
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.panel, variant === 'compact' ? styles.panelCompact : null]}>
      <Pressable onPress={onPress} style={styles.panelHeader}>
        <View style={styles.panelHeaderCopy}>
          <View style={styles.panelIconWrap}>
            <Ionicons color={colors.primaryDeep} name={icon} size={16} />
          </View>
          <Text style={styles.panelTitle}>{title}</Text>
        </View>
        <Ionicons color={colors.primaryDeep} name={expanded ? 'chevron-up' : 'chevron-down'} size={20} />
      </Pressable>
      {expanded ? <View style={contentStyle}>{children}</View> : null}
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  container: {
    gap: spacing.md,
    flexGrow: 1,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
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
    borderRadius: 22,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  panelCompact: {
    padding: spacing.sm,
  },
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  panelHeaderCopy: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minWidth: 0,
  },
  panelIconWrap: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  panelTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  sectionContent: {
    gap: spacing.md,
  },
  calendarFilterContent: {
    gap: spacing.sm,
  },
  presetNameBlock: {
    gap: spacing.sm,
  },
  presetList: {
    gap: spacing.sm,
  },
  presetRow: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  presetCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  presetTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  presetSummary: {
    ...typography.caption,
    color: colors.textMuted,
  },
  presetActions: {
    flexDirection: 'row',
    gap: spacing.xs,
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
  aboutButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  aboutButtonText: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flex: 1,
  },
  logoutFooter: {
    marginTop: 'auto',
    paddingBottom: spacing.xs,
    paddingTop: spacing.md,
  },
  themeToggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  themeOption: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  themeOptionActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.primary,
  },
  themeOptionText: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
  },
  themeOptionTextActive: {
    color: colors.primaryDeep,
  },
  softIcon: {
    borderRadius: 4,
    height: 20,
    width: 20,
  },
  errorText: {
    ...typography.captionStrong,
    color: colors.error,
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
}

