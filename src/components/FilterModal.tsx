import * as React from 'react';

import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Checkbox from 'expo-checkbox';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/src/components/AppButton';
import { CLASSIFICATION_OPTIONS, createDefaultCalendarFilters, resolveCalendarFilterTemplate } from '@/src/features/calendar/calendarFilters';
import { useEventorDistricts } from '@/src/hooks/useEventorDistricts';
import { formatApiDate, formatDisplayDate, isValidIsoDate } from '@/src/services/dateService';
import { useAuthStore } from '@/src/store/authStore';
import { usePreferencesStore } from '@/src/store/preferencesStore';
import { ColorPalette, useColors, useTheme } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { DistrictOption, EventFilterValues } from '@/src/types/eventor';

type FilterModalProps = {
  onApply: (filters: EventFilterValues) => void;
  onClose: () => void;
  value: EventFilterValues;
  visible: boolean;
};

type DateField = 'fromDate' | 'toDate' | null;

export function FilterModal({ onApply, onClose, value, visible }: FilterModalProps) {
  const { colors, isDark, themeName } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark, themeName), [colors, isDark, themeName]);
  const [draft, setDraft] = React.useState<EventFilterValues>(value);
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [activeDateField, setActiveDateField] = React.useState<DateField>(null);
  const user = useAuthStore((state) => state.user);
  const calendarDefaultFilterTemplate = usePreferencesStore((state) => state.calendarDefaultFilterTemplate);
  const calendarFilterPresets = usePreferencesStore((state) => state.calendarFilterPresets);
  const { districtOptions, error: districtError, organisationToDistrictId } = useEventorDistricts(visible);

  React.useEffect(() => {
    if (visible) {
      setDraft(value);
      setValidationError(null);
      setActiveDateField(null);
    }
  }, [value, visible]);

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
    } satisfies DistrictOption;
  }, [districtOptions, myDistrictId]);

  const visibleDistrictOptions = React.useMemo(
    () => (myDistrictId ? districtOptions.filter((option) => option.id !== myDistrictId) : districtOptions),
    [districtOptions, myDistrictId],
  );

  const districtColumns = React.useMemo(
    () => [
      visibleDistrictOptions.filter((_, index) => index % 3 === 0),
      visibleDistrictOptions.filter((_, index) => index % 3 === 1),
      visibleDistrictOptions.filter((_, index) => index % 3 === 2),
    ],
    [visibleDistrictOptions],
  );

  const classificationRows = React.useMemo(
    () => [
      [CLASSIFICATION_OPTIONS[0], CLASSIFICATION_OPTIONS[3]],
      [CLASSIFICATION_OPTIONS[1], CLASSIFICATION_OPTIONS[4]],
      [CLASSIFICATION_OPTIONS[2], CLASSIFICATION_OPTIONS[5]],
    ],
    [],
  );

  const activeDateValue = activeDateField ? parseIsoDate(draft[activeDateField]) : new Date();

  const toggleClassification = (id: number) => {
    const nextIds = draft.classificationIds.includes(id)
      ? draft.classificationIds.filter((currentId) => currentId !== id)
      : [...draft.classificationIds, id].sort((a, b) => a - b);

    setDraft({
      ...draft,
      classificationIds: nextIds,
    });
  };

  const toggleDistrict = (id: number) => {
    const nextIds = draft.districtIds.includes(id)
      ? draft.districtIds.filter((currentId) => currentId !== id)
      : [...draft.districtIds, id].sort((a, b) => a - b);

    setDraft({
      ...draft,
      districtIds: nextIds,
    });
  };

  const handleApply = () => {
    if (!isValidIsoDate(draft.fromDate) || !isValidIsoDate(draft.toDate)) {
      setValidationError('Datum måste vara giltiga.');
      return false;
    }

    setValidationError(null);
    onApply(draft);
    return true;
  };

  const handleApplyAndClose = () => {
    if (handleApply()) {
      onClose();
    }
  };

  const handleReset = () => {
    setDraft(createDefaultCalendarFilters(undefined, calendarDefaultFilterTemplate));
    setValidationError(null);
    setActiveDateField(null);
  };

  const applyTemplate = (template: typeof calendarDefaultFilterTemplate) => {
    setDraft(resolveCalendarFilterTemplate(template));
    setValidationError(null);
    setActiveDateField(null);
  };

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setActiveDateField(null);
    }

    if (event.type === 'dismissed' || !selectedDate || !activeDateField) {
      return;
    }

    setDraft((currentDraft) => ({
      ...currentDraft,
      [activeDateField]: formatApiDate(selectedDate),
    }));
  };

  const activePresetKey = React.useMemo(() => {
    const signature = JSON.stringify({
      classificationIds: [...draft.classificationIds].sort((a, b) => a - b),
      districtIds: [...draft.districtIds].sort((a, b) => a - b),
      fromDate: draft.fromDate,
      toDate: draft.toDate,
    });

    const defaultSignature = JSON.stringify(resolveCalendarFilterTemplate(calendarDefaultFilterTemplate));
    if (signature === defaultSignature) {
      return 'standard';
    }

    const foundPreset = calendarFilterPresets.find((preset) => JSON.stringify(resolveCalendarFilterTemplate(preset.template)) === signature);
    return foundPreset?.id ?? null;
  }, [calendarDefaultFilterTemplate, calendarFilterPresets, draft.classificationIds, draft.districtIds, draft.fromDate, draft.toDate]);

  return (
    <Modal animationType="slide" transparent visible={visible}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.sheetContent}>
            <View style={styles.headerRow}>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>Filter</Text>
                <Text style={styles.subtitle}>Ange datumintervall, distrikt och tävlingstyper.</Text>
              </View>
              <View style={styles.headerActions}>
                <Pressable onPress={handleReset} style={styles.resetChip}>
                  <Text style={styles.resetChipText}>Återställ</Text>
                </Pressable>
                <Pressable onPress={handleApplyAndClose} style={styles.closeChip}>
                  <Text style={styles.closeIcon}>×</Text>
                  <Text style={styles.closeText}>Stäng</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.presetHeaderRow}>
                <Text style={styles.filterHeading}>Förvalda:</Text>
              {calendarFilterPresets.length === 0 ? (
                <Text style={styles.helperText}>Du har inga sparade filter ännu.</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetScroll}>
                  {calendarFilterPresets.map((preset) => (
                    <PresetOptionRow
                      active={activePresetKey === preset.id}
                      key={preset.id}
                      label={preset.name}
                      onPress={() => applyTemplate(preset.template)}
                    />
                  ))}
                </ScrollView>
              )}
            </View>

            <View style={styles.dateRow}>
              <DateFieldCard label="Från" onPress={() => setActiveDateField('fromDate')} value={draft.fromDate} />
              <DateFieldCard label="Till" onPress={() => setActiveDateField('toDate')} value={draft.toDate} />
            </View>

            {activeDateField ? (
              <View style={styles.datePickerCard}>
                <Text style={styles.sectionTitle}>{activeDateField === 'fromDate' ? 'Välj Från' : 'Välj Till'}</Text>
                <DateTimePicker
                  accentColor={colors.accent}
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  mode="date"
                  themeVariant="dark"
                  value={activeDateValue}
                  onChange={handleDateChange}
                />
                {Platform.OS === 'ios' ? <AppButton label="Klar" onPress={() => setActiveDateField(null)} variant="secondary" /> : null}
              </View>
            ) : null}

            <View style={styles.section}>
              <View style={styles.filterCard}>
                <Text style={styles.filterHeading}>Distrikt</Text>

                {myDistrictOption ? (
                  <DistrictOptionRow checked={draft.districtIds.includes(myDistrictOption.id)} label={myDistrictOption.label} onPress={() => toggleDistrict(myDistrictOption.id)} />
                ) : null}

                {districtError ? <Text style={styles.errorText}>{districtError}</Text> : null}
                {!districtError && districtOptions.length === 0 ? <Text style={styles.helperText}>Laddar distrikt...</Text> : null}

                <View style={styles.districtColumnsRow}>
                  {districtColumns.map((column, index) => (
                    <View key={`district-column-${index}`} style={styles.districtColumn}>
                      {column.map((option) => (
                        <DistrictOptionRow
                          key={option.id}
                          checked={draft.districtIds.includes(option.id)}
                          label={option.label}
                          onPress={() => toggleDistrict(option.id)}
                        />
                      ))}
                    </View>
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.filterCard}>
                <Text style={styles.filterHeading}>Tävlingar</Text>
                <View style={styles.classificationRows}>
                  {classificationRows.map(([leftOption, rightOption]) => (
                    <View key={leftOption.id} style={styles.classificationRow}>
                      <View style={styles.classificationCell}>
                        <ClassificationOption
                          checked={draft.classificationIds.includes(leftOption.id)}
                          id={leftOption.id}
                          label={leftOption.label}
                          onPress={() => toggleClassification(leftOption.id)}
                        />
                      </View>
                      <View style={styles.classificationCell}>
                        <ClassificationOption
                          checked={draft.classificationIds.includes(rightOption.id)}
                          id={rightOption.id}
                          label={rightOption.label}
                          onPress={() => toggleClassification(rightOption.id)}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            {validationError ? <Text style={styles.errorText}>{validationError}</Text> : null}

            <View style={styles.footer}>
              <AppButton label="Uppdatera" onPress={handleApply} />
              <AppButton label="Avbryt" onPress={onClose} variant="secondary" />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function DateFieldCard({ label, onPress, value }: { label: string; onPress: () => void; value: string }) {
  const { colors, isDark, themeName } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark, themeName), [colors, isDark, themeName]);
  return (
    <Pressable onPress={onPress} style={styles.dateCard}>
      <Text style={styles.dateLabel}>{label}</Text>
      <Text style={styles.dateValue}>{formatDisplayDate(value)}</Text>
    </Pressable>
  );
}

function ClassificationOption({
  checked,
  id,
  label,
  onPress,
}: {
  checked: boolean;
  id: number;
  label: string;
  onPress: () => void;
}) {
  const { colors, isDark, themeName } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark, themeName), [colors, isDark, themeName]);
  return (
    <Pressable onPress={onPress} style={styles.checkboxItem}>
      <View style={styles.checkboxRow}>
        <Checkbox color={checked ? colors.primary : undefined} value={checked} onValueChange={onPress} />
        <Text style={styles.checkboxTitle}>{id}</Text>
        <Text numberOfLines={2} style={styles.checkboxDescription}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

function DistrictOptionRow({ checked, label, onPress }: { checked: boolean; label: string; onPress: () => void }) {
  const { colors, isDark, themeName } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark, themeName), [colors, isDark, themeName]);
  return (
    <Pressable onPress={onPress} style={styles.districtItem}>
      <View style={styles.districtRow}>
        <Checkbox color={checked ? colors.primary : undefined} value={checked} onValueChange={onPress} />
        <Text numberOfLines={2} style={styles.districtLabel}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

function PresetOptionRow({ active, label, onPress }: { active?: boolean; label: string; onPress: () => void }) {
  const { colors, isDark, themeName } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark, themeName), [colors, isDark, themeName]);
  return (
    <Pressable onPress={onPress} style={[styles.presetItem, active ? styles.presetItemActive : null]}>
      <View style={styles.presetRow}>
        <Text numberOfLines={1} style={[styles.presetLabel, active ? styles.presetLabelActive : null]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

function parseIsoDate(value: string) {
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function createStyles(colors: ColorPalette, isDark: boolean, themeName?: string) {
  const isSoft = themeName === 'soft' || themeName === 'soft-dark';
  return StyleSheet.create({
  overlay: {
    backgroundColor: colors.overlay,
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '88%',
    paddingTop: spacing.lg,
  },
  sheetContent: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: spacing.sm,
    marginLeft: spacing.sm,
  },
  resetChip: {
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  resetChipText: {
    ...typography.captionStrong,
    color: colors.primaryDeep,
  },
  title: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  closeText: {
    ...typography.buttonSmall,
    color: colors.primary,
    fontSize: 13,
    lineHeight: 16,
  },
  closeIcon: {
    color: colors.primaryDeep,
    fontSize: 15,
    lineHeight: 15,
  },
  closeChip: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  dateRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dateCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  dateLabel: {
    ...typography.captionStrong,
    color: colors.textPrimary,
  },
  dateValue: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
  datePickerCard: {
    backgroundColor: colors.heroTop,
    borderColor: colors.heroBottom,
    borderRadius: 18,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.captionStrong,
    color: colors.heroText,
  },
  filterCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  filterHeading: {
    ...typography.captionStrong,
    color: colors.textPrimary,
  },
  presetHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  presetScroll: {
    flexGrow: 1,
    gap: spacing.sm,
    paddingRight: spacing.xs,
  },
  presetItem: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  presetItemActive: {
    backgroundColor: isDark ? (isSoft ? '#0F347C' : '#1E4428') : colors.primaryDeep,
    borderColor: isDark ? (isSoft ? '#0F347C' : '#1E4428') : colors.primaryDeep,
  },
  presetRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 0,
  },
  presetLabel: {
    fontFamily: typography.bodyStrong.fontFamily,
    fontSize: 14,
    lineHeight: 17,
    color: colors.textPrimary,
  },
  presetLabelActive: {
    color: colors.heroText,
  },
  helperText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  districtColumnsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  districtColumn: {
    flex: 1,
    gap: 2,
  },
  districtItem: {
    justifyContent: 'center',
    minHeight: 40,
    paddingVertical: 2,
  },
  districtRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  districtLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 16,
  },
  classificationRows: {
    gap: spacing.xs,
  },
  classificationRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  classificationCell: {
    flex: 1,
  },
  checkboxItem: {
    justifyContent: 'center',
    minHeight: 42,
    paddingVertical: 4,
  },
  checkboxRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  checkboxTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    minWidth: 12,
  },
  checkboxDescription: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 16,
  },
  errorText: {
    ...typography.captionStrong,
    color: colors.error,
  },
  footer: {
    gap: spacing.sm,
  },
});
}




