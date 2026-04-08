import * as React from 'react';

import Checkbox from 'expo-checkbox';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { CLASSIFICATION_OPTIONS } from '@/src/features/calendar/calendarFilters';
import { colors } from '@/src/theme/colors';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { CalendarFilterTemplate } from '@/src/types/preferences';
import { DistrictOption } from '@/src/types/eventor';

type CalendarFilterTemplateEditorProps = {
  districtOptions: DistrictOption[];
  myDistrictOption?: DistrictOption | null;
  template: CalendarFilterTemplate;
  onChange: (template: CalendarFilterTemplate) => void;
};

export function CalendarFilterTemplateEditor({ districtOptions, myDistrictOption, onChange, template }: CalendarFilterTemplateEditorProps) {
  const visibleDistrictOptions = React.useMemo(
    () => (myDistrictOption ? districtOptions.filter((option) => option.id !== myDistrictOption.id) : districtOptions),
    [districtOptions, myDistrictOption],
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

  const toggleDistrict = (id: number) => {
    const districtIds = template.districtIds.includes(id)
      ? template.districtIds.filter((currentId) => currentId !== id)
      : [...template.districtIds, id].sort((a, b) => a - b);

    onChange({
      ...template,
      districtIds,
    });
  };

  const toggleClassification = (id: number) => {
    const classificationIds = template.classificationIds.includes(id)
      ? template.classificationIds.filter((currentId) => currentId !== id)
      : [...template.classificationIds, id].sort((a, b) => a - b);

    onChange({
      ...template,
      classificationIds,
    });
  };

  const updateOffset = (field: 'fromOffsetDays' | 'toOffsetDays', value: string) => {
    const parsed = Number.parseInt(value, 10);

    onChange({
      ...template,
      [field]: Number.isFinite(parsed) ? parsed : 0,
    });
  };

  const toggleOffsetSign = (field: 'fromOffsetDays' | 'toOffsetDays') => {
    onChange({
      ...template,
      [field]: template[field] === 0 ? -1 : template[field] * -1,
    });
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.offsetRow}>
        <OffsetField
          label="Från (dagar)"
          onChangeText={(value) => updateOffset('fromOffsetDays', value)}
          onToggleSign={() => toggleOffsetSign('fromOffsetDays')}
          value={template.fromOffsetDays}
        />
        <OffsetField
          label="Till (dagar)"
          onChangeText={(value) => updateOffset('toOffsetDays', value)}
          onToggleSign={() => toggleOffsetSign('toOffsetDays')}
          value={template.toOffsetDays}
        />
      </View>

      <View style={styles.filterCard}>
        <Text style={styles.filterHeading}>Distrikt</Text>

        {myDistrictOption ? (
          <DistrictOptionRow checked={template.districtIds.includes(myDistrictOption.id)} label={myDistrictOption.label} onPress={() => toggleDistrict(myDistrictOption.id)} />
        ) : null}

        {districtOptions.length === 0 ? <Text style={styles.helperText}>Laddar distrikt...</Text> : null}

        <View style={styles.districtColumnsRow}>
          {districtColumns.map((column, index) => (
            <View key={`district-column-${index}`} style={styles.districtColumn}>
              {column.map((option) => (
                <DistrictOptionRow key={option.id} checked={template.districtIds.includes(option.id)} label={option.label} onPress={() => toggleDistrict(option.id)} />
              ))}
            </View>
          ))}
        </View>
      </View>

      <View style={styles.filterCard}>
        <Text style={styles.filterHeading}>Tävlingar</Text>
        <View style={styles.classificationRows}>
          {classificationRows.map(([leftOption, rightOption]) => (
            <View key={leftOption.id} style={styles.classificationRow}>
              <View style={styles.classificationCell}>
                <ClassificationOption
                  checked={template.classificationIds.includes(leftOption.id)}
                  id={leftOption.id}
                  label={leftOption.label}
                  onPress={() => toggleClassification(leftOption.id)}
                />
              </View>
              <View style={styles.classificationCell}>
                <ClassificationOption
                  checked={template.classificationIds.includes(rightOption.id)}
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
  );
}

function OffsetField({
  label,
  onChangeText,
  onToggleSign,
  value,
}: {
  label: string;
  onChangeText: (value: string) => void;
  onToggleSign: () => void;
  value: number;
}) {
  return (
    <View style={styles.offsetField}>
      <Text style={styles.offsetLabel}>{label}</Text>
      <View style={styles.offsetInputRow}>
        <Pressable onPress={onToggleSign} style={styles.offsetSignButton}>
          <Text style={styles.offsetSignText}>{value < 0 ? '−' : '+'}</Text>
        </Pressable>
        <View style={styles.offsetInputWrap}>
          <TextInput
            keyboardType="number-pad"
            onChangeText={onChangeText}
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            style={styles.offsetInput}
            value={String(Math.abs(value))}
          />
        </View>
      </View>
    </View>
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

function DistrictOptionRow({ checked, label, onPress }: { checked: boolean; label: string; onPress: () => void }) {
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

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.md,
  },
  offsetRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  offsetField: {
    flex: 1,
    gap: spacing.xs,
  },
  offsetLabel: {
    ...typography.captionStrong,
    color: colors.textPrimary,
  },
  offsetInputRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  offsetSignButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: 42,
    paddingHorizontal: spacing.sm,
  },
  offsetSignText: {
    ...typography.bodyStrong,
    color: colors.primaryDeep,
  },
  offsetInputWrap: {
    flex: 1,
  },
  offsetInput: {
    ...typography.body,
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    color: colors.textPrimary,
    minHeight: 54,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
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
    color: colors.primaryDeep,
  },
  districtColumnsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  districtColumn: {
    flex: 1,
    gap: spacing.xs,
  },
  districtItem: {
    borderRadius: 14,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  districtRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  districtLabel: {
    ...typography.caption,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  classificationRows: {
    gap: spacing.xs,
  },
  classificationRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  classificationCell: {
    flex: 1,
  },
  checkboxItem: {
    borderRadius: 14,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  checkboxRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  checkboxTitle: {
    ...typography.captionStrong,
    color: colors.primaryDeep,
    width: 20,
  },
  checkboxDescription: {
    ...typography.caption,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  helperText: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
