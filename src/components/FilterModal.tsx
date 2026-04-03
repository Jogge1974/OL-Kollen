import * as React from 'react';

import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Checkbox from 'expo-checkbox';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/src/components/AppButton';
import { CLASSIFICATION_OPTIONS } from '@/src/features/calendar/calendarFilters';
import { formatApiDate, formatDisplayDate, isValidIsoDate } from '@/src/services/dateService';
import { colors } from '@/src/theme/colors';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { EventFilterValues } from '@/src/types/eventor';

type FilterModalProps = {
  onApply: (filters: EventFilterValues) => void;
  onClose: () => void;
  value: EventFilterValues;
  visible: boolean;
};

type DateField = 'fromDate' | 'toDate' | null;

export function FilterModal({ onApply, onClose, value, visible }: FilterModalProps) {
  const [draft, setDraft] = React.useState<EventFilterValues>(value);
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [activeDateField, setActiveDateField] = React.useState<DateField>(null);

  React.useEffect(() => {
    if (visible) {
      setDraft(value);
      setValidationError(null);
      setActiveDateField(null);
    }
  }, [value, visible]);

  const toggleClassification = (id: number) => {
    const nextIds = draft.classificationIds.includes(id)
      ? draft.classificationIds.filter((currentId) => currentId !== id)
      : [...draft.classificationIds, id].sort((a, b) => a - b);

    setDraft({
      ...draft,
      classificationIds: nextIds,
    });
  };

  const handleApply = () => {
    if (!isValidIsoDate(draft.fromDate) || !isValidIsoDate(draft.toDate)) {
      setValidationError('Datum måste vara giltiga.');
      return;
    }

    if (draft.classificationIds.length === 0) {
      setValidationError('Välj minst en tävlingstyp.');
      return;
    }

    setValidationError(null);
    onApply(draft);
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

  const leftColumnOptions = CLASSIFICATION_OPTIONS.slice(0, 3);
  const rightColumnOptions = CLASSIFICATION_OPTIONS.slice(3, 6);
  const activeDateValue = activeDateField ? parseIsoDate(draft[activeDateField]) : new Date();

  return (
    <Modal animationType="slide" transparent visible={visible}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.sheetContent}>
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.title}>Filter</Text>
                <Text style={styles.subtitle}>Ange datumintervall och tävlingstyper.</Text>
              </View>
              <Pressable onPress={onClose}>
                <Text style={styles.closeText}>Stäng</Text>
              </Pressable>
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
                {Platform.OS === 'ios' ? (
                  <AppButton label="Klar" onPress={() => setActiveDateField(null)} variant="secondary" />
                ) : null}
              </View>
            ) : null}

            <View style={styles.section}>
              <View style={styles.classificationCard}>
                <View style={styles.classificationColumn}>
                  <Text style={styles.classificationHeading}>Tävlingar</Text>
                  {leftColumnOptions.map((option) => (
                    <ClassificationOption
                      key={option.id}
                      checked={draft.classificationIds.includes(option.id)}
                      id={option.id}
                      label={option.label}
                      onPress={() => toggleClassification(option.id)}
                    />
                  ))}
                </View>
                <View style={styles.classificationColumn}>
                  {rightColumnOptions.map((option) => (
                    <ClassificationOption
                      key={option.id}
                      checked={draft.classificationIds.includes(option.id)}
                      id={option.id}
                      label={option.label}
                      onPress={() => toggleClassification(option.id)}
                    />
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

function parseIsoDate(value: string) {
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

const styles = StyleSheet.create({
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
  classificationCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  classificationColumn: {
    flex: 1,
    gap: spacing.xs,
  },
  classificationHeading: {
    ...typography.captionStrong,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  checkboxItem: {
    minHeight: 42,
    justifyContent: 'center',
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
