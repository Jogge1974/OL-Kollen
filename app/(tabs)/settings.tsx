import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import Checkbox from 'expo-checkbox';
import { router } from 'expo-router';
import { Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/src/components/AppButton';
import { AppTextField } from '@/src/components/AppTextField';
import { CalendarFilterTemplateEditor } from '@/src/components/CalendarFilterTemplateEditor';
import { ScreenHeroHeader } from '@/src/components/ScreenHeroHeader';
import { createDefaultCalendarFilterTemplate, describeCalendarFilterTemplate } from '@/src/features/calendar/calendarFilters';
import { useEventorDistricts } from '@/src/hooks/useEventorDistricts';
import { useAuthStore } from '@/src/store/authStore';
import { useFriendsStore } from '@/src/store/friendsStore';
import { usePreferencesStore } from '@/src/store/preferencesStore';
import { ColorPalette, useColors } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';

export default function SettingsScreen() {
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [className, setClassName] = React.useState('');
  const [presetName, setPresetName] = React.useState('');
  const [showPresetModal, setShowPresetModal] = React.useState(false);
  const [calendarDefaultDraft, setCalendarDefaultDraft] = React.useState(createDefaultCalendarFilterTemplate());
  const [isCalendarFiltersExpanded, setIsCalendarFiltersExpanded] = React.useState(false);
  const [isNotificationsExpanded, setIsNotificationsExpanded] = React.useState(false);
  const [showNotifInfoModal, setShowNotifInfoModal] = React.useState(false);
  const [showCalendarInfoModal, setShowCalendarInfoModal] = React.useState(false);
  const [showFavoriteClassesInfoModal, setShowFavoriteClassesInfoModal] = React.useState(false);
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
  const friends = useFriendsStore((state) => state.friends);
  const updateFriendPush = useFriendsStore((state) => state.updateFriendPush);
  const setAllFriendsPush = useFriendsStore((state) => state.setAllFriendsPush);
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
          headerAction={
            <Pressable
              accessibilityLabel="Om kalenderfilter"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setShowCalendarInfoModal(true)}
              style={styles.notifInfoBadge}
            >
              <Ionicons color={colors.primaryDeep} name="information" size={14} />
            </Pressable>
          }
          icon="funnel-outline"
          onPress={() => setIsCalendarFiltersExpanded((current) => !current)}
          title={calendarFilterPresets.length > 0 ? `Kalenderfilter (${calendarFilterPresets.length})` : 'Kalenderfilter'}
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

            <View style={styles.filterButtonRow}>
              <View style={styles.filterButtonHalf}>
                <AppButton disabled={!canSaveDefaultFilter} label="Spara standardfilter" onPress={() => void handleSaveDefaultFilter()} textStyle={styles.filterButtonText} />
              </View>
              <View style={styles.filterButtonHalf}>
                <AppButton disabled={!canSaveDefaultFilter} label="Spara som förvalt" onPress={() => setShowPresetModal(true)} textStyle={styles.filterButtonText} variant="secondary" />
              </View>
            </View>
            <AppButton label="Återställ standardfilter" onPress={() => void handleResetDefaultFilter()} variant="secondary" />

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
          headerAction={
            <Pressable
              accessibilityLabel="Om notiserna"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setShowNotifInfoModal(true)}
              style={styles.notifInfoBadge}
            >
              <Ionicons color={colors.primaryDeep} name="information" size={14} />
            </Pressable>
          }
          icon="notifications-outline"
          onPress={() => setIsNotificationsExpanded((current) => !current)}
          title="Notiser"
        >
          <View style={styles.sectionContent}>
            <Text style={styles.notifGroupLabel}>Favoritmarkerad tävling</Text>
            <View style={styles.compactSettingRow}>
              <Checkbox
                color={notificationSettings.pushOnStartList ? colors.primary : undefined}
                style={styles.checkbox}
                value={notificationSettings.pushOnStartList}
                onValueChange={(value) => void setNotificationSetting('pushOnStartList', value)}
              />
              <Text style={styles.compactSettingText}>Startlista publicerad</Text>
            </View>
            <View style={styles.compactSettingRow}>
              <Checkbox
                color={notificationSettings.pushOnResultList ? colors.primary : undefined}
                style={styles.checkbox}
                value={notificationSettings.pushOnResultList}
                onValueChange={(value) => void setNotificationSetting('pushOnResultList', value)}
              />
              <Text style={styles.compactSettingText}>Resultatlista publicerad</Text>
            </View>

            {friends.length > 0 ? (
              <>
                <Text style={[styles.notifGroupLabel, { marginTop: spacing.sm }]}>Vänner</Text>
                <View style={styles.friendMasterRow}>
                  <Text style={styles.friendMasterLabel}>Alla</Text>
                  <View style={styles.friendNotifToggles}>
                    <Pressable
                      onPress={() => {
                        const allOn = friends.every((f) => f.pushOnEntry);
                        void setAllFriendsPush('pushOnEntry', !allOn);
                      }}
                      style={[styles.friendNotifPill, friends.every((f) => f.pushOnEntry) ? styles.friendNotifPillActive : null]}
                    >
                      <Ionicons
                        color={friends.every((f) => f.pushOnEntry) ? colors.primaryDeep : colors.textMuted}
                        name={
                          friends.every((f) => f.pushOnEntry) ? 'checkbox' :
                          friends.some((f) => f.pushOnEntry) ? 'remove-outline' :
                          'square-outline'
                        }
                        size={14}
                      />
                      <Text style={[styles.friendNotifPillText, friends.every((f) => f.pushOnEntry) ? styles.friendNotifPillTextActive : null]}>Anm.</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        const allOn = friends.every((f) => f.pushOnStart);
                        void setAllFriendsPush('pushOnStart', !allOn);
                      }}
                      style={[styles.friendNotifPill, friends.every((f) => f.pushOnStart) ? styles.friendNotifPillActive : null]}
                    >
                      <Ionicons
                        color={friends.every((f) => f.pushOnStart) ? colors.primaryDeep : colors.textMuted}
                        name={
                          friends.every((f) => f.pushOnStart) ? 'checkbox' :
                          friends.some((f) => f.pushOnStart) ? 'remove-outline' :
                          'square-outline'
                        }
                        size={14}
                      />
                      <Text style={[styles.friendNotifPillText, friends.every((f) => f.pushOnStart) ? styles.friendNotifPillTextActive : null]}>Start</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        const allOn = friends.every((f) => f.pushOnResult);
                        void setAllFriendsPush('pushOnResult', !allOn);
                      }}
                      style={[styles.friendNotifPill, friends.every((f) => f.pushOnResult) ? styles.friendNotifPillActive : null]}
                    >
                      <Ionicons
                        color={friends.every((f) => f.pushOnResult) ? colors.primaryDeep : colors.textMuted}
                        name={
                          friends.every((f) => f.pushOnResult) ? 'checkbox' :
                          friends.some((f) => f.pushOnResult) ? 'remove-outline' :
                          'square-outline'
                        }
                        size={14}
                      />
                      <Text style={[styles.friendNotifPillText, friends.every((f) => f.pushOnResult) ? styles.friendNotifPillTextActive : null]}>Resultat</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        const allOn = friends.every((f) => f.pushOnLive);
                        void setAllFriendsPush('pushOnLive', !allOn);
                      }}
                      style={[styles.friendNotifPill, friends.every((f) => f.pushOnLive) ? styles.friendNotifPillActive : null]}
                    >
                      <Ionicons
                        color={friends.every((f) => f.pushOnLive) ? colors.primaryDeep : colors.textMuted}
                        name={
                          friends.every((f) => f.pushOnLive) ? 'checkbox' :
                          friends.some((f) => f.pushOnLive) ? 'remove-outline' :
                          'square-outline'
                        }
                        size={14}
                      />
                      <Text style={[styles.friendNotifPillText, friends.every((f) => f.pushOnLive) ? styles.friendNotifPillTextActive : null]}>Live</Text>
                    </Pressable>
                  </View>
                </View>
                {friends.map((friend) => (
                  <View key={friend.personId} style={styles.friendNotifRow}>
                    <View style={styles.friendNotifName}>
                      <Text numberOfLines={1} style={styles.compactSettingText}>{friend.name}</Text>
                    </View>
                    <View style={styles.friendNotifToggles}>
                      <Pressable
                        onPress={() => void updateFriendPush(friend.personId, 'pushOnEntry', !friend.pushOnEntry)}
                        style={[styles.friendNotifPill, friend.pushOnEntry ? styles.friendNotifPillActive : null]}
                      >
                        <Ionicons color={friend.pushOnEntry ? colors.primaryDeep : colors.textMuted} name="clipboard-outline" size={13} />
                        <Text style={[styles.friendNotifPillText, friend.pushOnEntry ? styles.friendNotifPillTextActive : null]}>Anm.</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void updateFriendPush(friend.personId, 'pushOnStart', !friend.pushOnStart)}
                        style={[styles.friendNotifPill, friend.pushOnStart ? styles.friendNotifPillActive : null]}
                      >
                        <Ionicons color={friend.pushOnStart ? colors.primaryDeep : colors.textMuted} name="time-outline" size={13} />
                        <Text style={[styles.friendNotifPillText, friend.pushOnStart ? styles.friendNotifPillTextActive : null]}>Start</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void updateFriendPush(friend.personId, 'pushOnResult', !friend.pushOnResult)}
                        style={[styles.friendNotifPill, friend.pushOnResult ? styles.friendNotifPillActive : null]}
                      >
                        <Ionicons color={friend.pushOnResult ? colors.primaryDeep : colors.textMuted} name="trophy-outline" size={13} />
                        <Text style={[styles.friendNotifPillText, friend.pushOnResult ? styles.friendNotifPillTextActive : null]}>Resultat</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void updateFriendPush(friend.personId, 'pushOnLive', !friend.pushOnLive)}
                        style={[styles.friendNotifPill, friend.pushOnLive ? styles.friendNotifPillActive : null]}
                      >
                        <Ionicons color={friend.pushOnLive ? colors.primaryDeep : colors.textMuted} name="radio-outline" size={13} />
                        <Text style={[styles.friendNotifPillText, friend.pushOnLive ? styles.friendNotifPillTextActive : null]}>Live</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </>
            ) : null}
          </View>
        </ExpandableCard>

        <ExpandableCard
          expanded={isFavoriteClassesExpanded}
          headerAction={
            <Pressable
              accessibilityLabel="Om favoritklasser"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setShowFavoriteClassesInfoModal(true)}
              style={styles.notifInfoBadge}
            >
              <Ionicons color={colors.primaryDeep} name="information" size={14} />
            </Pressable>
          }
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
            <View style={styles.themeToggleGrid}>
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
              </View>
              <View style={styles.themeToggleRow}>
                <Pressable
                  onPress={() => void setThemeName('soft')}
                  style={[styles.themeOption, themeName === 'soft' ? styles.themeOptionActive : null]}
                >
                  <Image source={require('@/assets/soft-icon.png')} style={styles.softIcon} />
                  <Text style={[styles.themeOptionText, themeName === 'soft' ? styles.themeOptionTextActive : null]}>SOFT</Text>
                </Pressable>
                <Pressable
                  onPress={() => void setThemeName('soft-dark')}
                  style={[styles.themeOption, themeName === 'soft-dark' ? styles.themeOptionActive : null]}
                >
                  <Image source={require('@/assets/soft-icon.png')} style={styles.softIcon} />
                  <Text style={[styles.themeOptionText, themeName === 'soft-dark' ? styles.themeOptionTextActive : null]}>SOFT mörkt</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </ExpandableCard>

        {user ? (
          <View style={styles.logoutFooter}>
            <Pressable onPress={() => router.push('/about')} style={styles.aboutButton}>
              <Ionicons color={colors.primary} name="information-circle-outline" size={20} />
              <Text style={styles.aboutButtonText}>Om Kontrollen</Text>
              <Ionicons color={colors.textSecondary} name="chevron-forward" size={16} />
            </Pressable>
            <AppButton label="Logga ut" onPress={confirmLogout} variant="secondary" />
          </View>
        ) : (
          <View style={styles.logoutFooter}>
            <Pressable onPress={() => router.push('/about')} style={styles.aboutButton}>
              <Ionicons color={colors.primary} name="information-circle-outline" size={20} />
              <Text style={styles.aboutButtonText}>Om Kontrollen</Text>
              <Ionicons color={colors.textSecondary} name="chevron-forward" size={16} />
            </Pressable>
          </View>
        )}
      </ScrollView>

      <Modal animationType="fade" onRequestClose={() => setShowCalendarInfoModal(false)} transparent visible={showCalendarInfoModal}>
        <View style={styles.presetModalOverlay}>
          <Pressable onPress={() => setShowCalendarInfoModal(false)} style={styles.presetModalBackdrop} />
          <View style={styles.notifInfoSheet}>
            <View style={styles.notifInfoHeader}>
              <Text style={styles.presetModalTitle}>Om kalenderfilter</Text>
              <Pressable hitSlop={8} onPress={() => setShowCalendarInfoModal(false)}>
                <Ionicons color={colors.textSecondary} name="close" size={22} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.notifInfoBody} showsVerticalScrollIndicator={false}>
              <NotifInfoItem
                styles={styles}
                iconColor={colors.primaryDeep}
                icon="options-outline"
                title="Standardfilter"
                body="Filtret som kalendern utgår från varje gång du öppnar den. Här väljer du distrikt, klassificeringar och andra villkor som bestämmer vilka tävlingar som visas som standard."
              />
              <NotifInfoItem
                styles={styles}
                iconColor={colors.primaryDeep}
                icon="bookmarks-outline"
                title="Förval (sparade filter)"
                body="Spara olika filterkombinationer som du snabbt kan växla mellan i kalendern, till exempel ”Mitt distrikt” eller ”Nationella tävlingar”."
              />
              <NotifInfoItem
                styles={styles}
                iconColor={colors.primaryDeep}
                icon="refresh-outline"
                title="Återställ"
                body="Nollställer standardfiltret tillbaka till appens förvalda värden."
              />
              <Text style={styles.notifInfoFootnote}>
                Ändringar sparas till ditt konto och används på alla dina enheter.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" onRequestClose={() => setShowFavoriteClassesInfoModal(false)} transparent visible={showFavoriteClassesInfoModal}>
        <View style={styles.presetModalOverlay}>
          <Pressable onPress={() => setShowFavoriteClassesInfoModal(false)} style={styles.presetModalBackdrop} />
          <View style={styles.notifInfoSheet}>
            <View style={styles.notifInfoHeader}>
              <Text style={styles.presetModalTitle}>Om favoritklasser</Text>
              <Pressable hitSlop={8} onPress={() => setShowFavoriteClassesInfoModal(false)}>
                <Ionicons color={colors.textSecondary} name="close" size={22} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.notifInfoBody} showsVerticalScrollIndicator={false}>
              <NotifInfoItem
                styles={styles}
                iconColor={colors.primaryDeep}
                icon="bookmark-outline"
                title="Vad är favoritklasser?"
                body="Klasser du ofta följer, till exempel din egen och dina barns. Skriv klassnamnet exakt som det heter i Eventor (till exempel ”H21” eller ”D14”)."
              />
              <NotifInfoItem
                styles={styles}
                iconColor={colors.primaryDeep}
                icon="arrow-up-outline"
                title="Prioritering"
                body="Matchande klasser flyttas överst i klassväljaren, i samma ordning som du lägger dem här. Då slipper du leta i en lång lista."
              />
              <NotifInfoItem
                styles={styles}
                iconColor={colors.primaryDeep}
                icon="swap-vertical-outline"
                title="Ordna listan"
                body="Flytta klasserna upp och ner för att styra vilken som hamnar högst upp."
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" onRequestClose={() => setShowNotifInfoModal(false)} transparent visible={showNotifInfoModal}>
        <View style={styles.presetModalOverlay}>
          <Pressable onPress={() => setShowNotifInfoModal(false)} style={styles.presetModalBackdrop} />
          <View style={styles.notifInfoSheet}>
            <View style={styles.notifInfoHeader}>
              <Text style={styles.presetModalTitle}>Om notiserna</Text>
              <Pressable hitSlop={8} onPress={() => setShowNotifInfoModal(false)}>
                <Ionicons color={colors.textSecondary} name="close" size={22} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.notifInfoBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.notifInfoSectionTitle}>Favoritmarkerad tävling</Text>
              <NotifInfoItem
                styles={styles}
                iconColor={colors.primaryDeep}
                icon="play-outline"
                title="Startlista publicerad"
                body="Du får en notis när startlistan för en tävling du favoritmarkerat har publicerats i Eventor."
              />
              <NotifInfoItem
                styles={styles}
                iconColor={colors.primaryDeep}
                icon="trophy-outline"
                title="Resultatlista publicerad"
                body="Du får en notis när resultatlistan för en favoritmarkerad tävling har publicerats i Eventor."
              />

              <Text style={[styles.notifInfoSectionTitle, { marginTop: spacing.md }]}>Vänner</Text>
              <NotifInfoItem
                styles={styles}
                iconColor={colors.primaryDeep}
                icon="clipboard-outline"
                title="Anm. – Anmälan"
                body="Notis när en vän anmäler sig till en kommande tävling."
              />
              <NotifInfoItem
                styles={styles}
                iconColor={colors.primaryDeep}
                icon="time-outline"
                title="Start"
                body="Notis strax innan en väns starttid på tävlingsdagen, så du vet när det drar igång."
              />
              <NotifInfoItem
                styles={styles}
                iconColor={colors.primaryDeep}
                icon="trophy-outline"
                title="Resultat"
                body="Notis när en väns officiella resultat har publicerats i Eventor efter avslutad tävling."
              />
              <NotifInfoItem
                styles={styles}
                iconColor={colors.primaryDeep}
                icon="radio-outline"
                title="Live"
                body={'Realtidsnotiser från liveresultat under loppet (titel ”LIVE-rapport”): när vännen startar, vid varje passerad kontroll med mellantid och placering, samt direkt vid målgång. Slås Live på får du alla tre; slås den av kommer inga live-notiser. Startnotisen samordnas med ”Start” ovan så att du aldrig får dubbla startnotiser.'}
              />
              <Text style={styles.notifInfoFootnote}>
                Vänners notiser ställs in per vän. Använd raden ”Alla” för att slå på eller av en typ för samtliga vänner samtidigt.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" onRequestClose={() => setShowPresetModal(false)} transparent visible={showPresetModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.presetModalOverlay}>
          <Pressable onPress={() => setShowPresetModal(false)} style={styles.presetModalBackdrop} />
          <View style={styles.presetModalSheet}>
            <Text style={styles.presetModalTitle}>Namn på förvalt filter</Text>
            <AppTextField
              autoCapitalize="words"
              autoCorrect={false}
              onChangeText={setPresetName}
              placeholder="Till exempel Mitt distrikt"
              value={presetName}
            />
            <View style={styles.presetModalButtons}>
              <View style={styles.filterButtonHalf}>
                <AppButton label="Avbryt" onPress={() => { setShowPresetModal(false); setPresetName(''); }} variant="secondary" />
              </View>
              <View style={styles.filterButtonHalf}>
                <AppButton label="Spara" onPress={() => { void handleAddFilterPreset(); setShowPresetModal(false); }} />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function NotifInfoItem({
  body,
  icon,
  iconColor,
  styles,
  title,
}: {
  body: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  styles: ReturnType<typeof createStyles>;
  title: string;
}) {
  return (
    <View style={styles.notifInfoItem}>
      <View style={styles.notifInfoItemIcon}>
        <Ionicons color={iconColor} name={icon} size={16} />
      </View>
      <View style={styles.notifInfoItemCopy}>
        <Text style={styles.notifInfoItemTitle}>{title}</Text>
        <Text style={styles.notifInfoItemBody}>{body}</Text>
      </View>
    </View>
  );
}

function ExpandableCard({
  children,
  contentStyle,
  expanded,
  headerAction,
  icon,  onPress,
  title,
  variant = 'default',
}: {
  children: React.ReactNode;
  contentStyle?: object;
  expanded: boolean;
  headerAction?: React.ReactNode;
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
        <View style={styles.panelHeaderRight}>
          {headerAction}
          <Ionicons color={colors.primaryDeep} name={expanded ? 'chevron-up' : 'chevron-down'} size={20} />
        </View>
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
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
  panelHeaderRight: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  notifInfoBadge: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    height: 24,
    justifyContent: 'center',
    width: 24,
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
  filterButtonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  filterButtonHalf: {
    flex: 1,
  },
  filterButtonText: {
    fontSize: 13,
  },
  presetModalOverlay: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  presetModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  presetModalSheet: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    width: '85%',
  },
  presetModalTitle: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
    fontSize: 17,
    textAlign: 'center',
  },
  notifInfoSheet: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    marginHorizontal: spacing.lg,
    maxHeight: '80%',
    padding: spacing.lg,
    width: '88%',
  },
  notifInfoHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  notifInfoBody: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  notifInfoSectionTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  notifInfoItem: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  notifInfoItemIcon: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  notifInfoItemCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  notifInfoItemTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  notifInfoItemBody: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  notifInfoFootnote: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: spacing.sm,
  },
  presetModalButtons: {
    flexDirection: 'row',
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
  notifGroupLabel: {
    ...typography.captionStrong,
    color: colors.primaryDeep,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  compactSettingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: 2,
  },
  compactSettingText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  friendNotifRow: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
  },
  friendMasterRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
    paddingBottom: spacing.sm,
  },
  friendMasterLabel: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  friendNotifName: {
    flex: 1,
    minWidth: 0,
  },
  friendNotifToggles: {
    flexDirection: 'row',
    gap: 6,
  },
  friendNotifPill: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  friendNotifPillActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.primary,
  },
  friendNotifPillText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 12,
  },
  friendNotifPillTextActive: {
    color: colors.primaryDeep,
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
  themeToggleGrid: {
    gap: spacing.sm,
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

