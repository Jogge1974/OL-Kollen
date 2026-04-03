import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/src/components/AppButton';
import { colors } from '@/src/theme/colors';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';

export default function HomeScreen() {
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <LinearGradient colors={[colors.heroTop, colors.primary, colors.backgroundDeep]} style={styles.hero}>
        <View style={styles.sunGlow} />
        <View style={styles.leafGlowLeft} />
        <View style={styles.leafGlowRight} />

        <View style={styles.topBlock}>
          <Text style={styles.eyebrow}>Sommarläge</Text>
          <Text style={styles.title}>OL-Kollen</Text>
          <Text style={styles.description}>
            En ren startyta för tävlingar, inloggning och senare premiumfunktioner i samma gemensamma app.
          </Text>
        </View>

        <View style={styles.bottomBlock}>
          <View style={styles.actionPanel}>
            <AppButton label="Tävlingskalendern" onPress={() => router.push('/calendar')} />
            <AppButton label="Min sida" onPress={() => router.push('/profile')} variant="secondary" />
          </View>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  hero: {
    flex: 1,
    justifyContent: 'space-between',
    overflow: 'hidden',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.xl,
  },
  sunGlow: {
    backgroundColor: colors.accentGlow,
    borderRadius: 999,
    height: 260,
    position: 'absolute',
    right: -40,
    top: 10,
    width: 260,
  },
  leafGlowLeft: {
    backgroundColor: colors.secondaryGlow,
    borderRadius: 999,
    bottom: 120,
    height: 210,
    left: -60,
    position: 'absolute',
    width: 210,
  },
  leafGlowRight: {
    backgroundColor: colors.backgroundGlow,
    borderRadius: 999,
    bottom: -20,
    height: 180,
    position: 'absolute',
    right: 30,
    width: 180,
  },
  topBlock: {
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  bottomBlock: {
    gap: spacing.lg,
  },
  actionPanel: {
    backgroundColor: colors.surfaceOverlay,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 28,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  eyebrow: {
    ...typography.eyebrow,
    color: colors.heroEyebrow,
  },
  title: {
    ...typography.heroTitle,
    color: colors.heroText,
    fontSize: 42,
    lineHeight: 46,
  },
  description: {
    ...typography.body,
    color: colors.heroTextMuted,
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 330,
  },
});
