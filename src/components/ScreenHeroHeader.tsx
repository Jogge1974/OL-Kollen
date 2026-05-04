import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { ColorPalette, useColors } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';

type HeroChip = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  flex?: number;
};

type ScreenHeroHeaderProps = {
  badge?: {
    icon?: keyof typeof Ionicons.glyphMap;
    text: string;
  };
  chips?: HeroChip[];
  eyebrow?: string;
  eyebrowContent?: React.ReactNode;
  subtitle?: string;
  title: string;
  titleRightContent?: React.ReactNode;
  topRightContent?: React.ReactNode;
  topRightText?: string;
};

export function ScreenHeroHeader({ badge, chips, eyebrow, eyebrowContent, subtitle, title, titleRightContent, topRightContent, topRightText }: ScreenHeroHeaderProps) {
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <LinearGradient colors={[colors.heroTop, colors.heroBottom]} style={styles.hero}>
      <View style={styles.heroTopRow}>
        {eyebrowContent ?? <Text style={styles.heroEyebrow}>{eyebrow ?? ''}</Text>}
        {topRightContent ?? (
          <Text numberOfLines={1} style={styles.heroTopRight}>
            {topRightText ?? ''}
          </Text>
        )}
      </View>

      <View style={styles.heroTitleRow}>
        <View style={styles.heroTitleWrap}>
          <Text numberOfLines={1} style={styles.heroTitle}>
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} style={styles.heroSubtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {titleRightContent}
        {badge ? (
          <View style={styles.heroBadge}>
            {badge.icon ? <Ionicons color={colors.primaryDeep} name={badge.icon} size={14} /> : null}
            <Text style={styles.heroBadgeText}>{badge.text}</Text>
          </View>
        ) : null}
      </View>

      {chips && chips.length > 0 ? (
        <View style={styles.heroMetaRow}>
          {chips.map((chip) => (
            <HeroChipView key={`${chip.label}-${chip.value}`} flex={chip.flex} icon={chip.icon} label={chip.label} value={chip.value} />
          ))}
        </View>
      ) : null}
    </LinearGradient>
  );
}

function HeroChipView({ icon, label, value, flex }: HeroChip) {
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.heroChip, flex ? { flex } : null]}>
      <Ionicons color={colors.heroText} name={icon} size={14} />
      <View style={styles.heroChipTextWrap}>
        <Text style={styles.heroChipLabel}>{label}</Text>
        <Text numberOfLines={1} style={styles.heroChipValue}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
  hero: {
    alignSelf: 'stretch',
    borderRadius: 24,
    gap: spacing.sm,
    padding: spacing.md,
    width: '100%',
  },
  heroBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  heroBadgeText: {
    ...typography.captionStrong,
    color: colors.heroText,
  },
  heroChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 18,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minWidth: 92,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  heroChipLabel: {
    color: colors.heroTextMuted,
    fontSize: 10,
    lineHeight: 12,
  },
  heroChipTextWrap: {
    flex: 1,
  },
  heroChipValue: {
    ...typography.captionStrong,
    color: colors.heroText,
    fontSize: 13,
    lineHeight: 15,
  },
  heroEyebrow: {
    ...typography.eyebrow,
    color: colors.heroEyebrow,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  heroMetaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  heroSubtitle: {
    ...typography.caption,
    color: colors.heroTextMuted,
  },
  heroTitle: {
    ...typography.sectionTitle,
    color: colors.heroText,
    fontSize: 22,
    lineHeight: 26,
  },
  heroTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  heroTitleWrap: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  heroTopRight: {
    ...typography.eyebrow,
    color: colors.heroEyebrow,
    fontSize: 11,
    letterSpacing: 0.8,
    textAlign: 'right',
  },
  heroTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
}
