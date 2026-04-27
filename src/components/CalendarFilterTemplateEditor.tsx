import * as React from 'react';

import Checkbox from 'expo-checkbox';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { CLASSIFICATION_OPTIONS } from '@/src/features/calendar/calendarFilters';
import { ColorPalette, useColors } from '@/src/theme/ThemeContext';
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
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
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

  const classificationColumns = React.useMemo(
    () => [
      [CLASSIFICATION_OPTIONS[0], CLASSIFICATION_OPTIONS[1], CLASSIFICATION_OPTIONS[2]],
      [CLASSIFICATION_OPTIONS[3], CLASSIFICATION_OPTIONS[4], CLASSIFICATION_OPTIONS[5]],
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
        <View style={styles.classificationColumnsRow}>
          {classificationColumns.map((column, index) => (
            <View key={`classification-column-${index}`} style={styles.classificationColumn}>
              {column.map((option) => (
                <ClassificationOption
                  key={option.id}
                  checked={template.classificationIds.includes(option.id)}
                  id={option.id}
                  label={option.label}
                  onPress={() => toggleClassification(option.id)}
                />
              ))}
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
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
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
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable onPress={onPress} style={styles.classificationItem}>
      <View style={styles.classificationRow}>
        <Checkbox color={checked ? colors.primary : undefined} value={checked} onValueChange={onPress} />
        <Text style={styles.classificationTitle}>{id}</Text>
        <Text numberOfLines={2} style={styles.classificationDescription}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

function DistrictOptionRow({ checked, label, onPress }: { checked: boolean; label: string; onPress: () => void }) {
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
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

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
  wrapper: {
    gap: spacing.sm,
  },
  offsetRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  offsetField: {
    flex: 1,
    gap: 2,
  },
  offsetLabel: {
    ...typography.captionStrong,
    color: colors.textPrimary,
  },
  offsetInputRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: 4,
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
    minHeight: 46,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
  },
  filterCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.sm,
  },
  filterHeading: {
    ...typography.captionStrong,
    color: colors.primaryDeep,
  },
  districtColumnsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  districtColumn: {
    flex: 1,
    gap: 4,
  },
  districtItem: {
    borderRadius: 14,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  districtRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  districtLabel: {
    ...typography.caption,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  classificationColumnsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  classificationColumn: {
    flex: 1,
    gap: 4,
  },
  classificationItem: {
    borderRadius: 14,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  classificationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  classificationTitle: {
    ...typography.captionStrong,
    color: colors.primaryDeep,
    width: 20,
  },
  classificationDescription: {
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
}
