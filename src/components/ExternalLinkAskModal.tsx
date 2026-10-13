import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/src/components/AppButton';
import { useExternalLinkStore } from '@/src/store/externalLinkStore';
import { ColorPalette, useColors } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';

// Mounted once at the app root. Shown instead of Linking.openURL when the
// "Externa länkar" preference is 'ask' for a managed hostname. Tapping the
// backdrop or the close icon cancels without opening the link at all.
export function ExternalLinkAskModal() {
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const askUrl = useExternalLinkStore((state) => state.askUrl);
  const closeAsk = useExternalLinkStore((state) => state.closeAsk);

  const openInBrowser = () => {
    if (askUrl) void Linking.openURL(askUrl);
    closeAsk();
  };

  const openInApp = () => {
    if (askUrl) useExternalLinkStore.setState({ webViewUrl: askUrl });
    closeAsk();
  };

  return (
    <Modal animationType="fade" onRequestClose={closeAsk} transparent visible={Boolean(askUrl)}>
      <View style={styles.overlay}>
        <Pressable onPress={closeAsk} style={styles.backdrop} />
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Öppna länk</Text>
            <Pressable hitSlop={8} onPress={closeAsk}>
              <Ionicons color={colors.textSecondary} name="close" size={22} />
            </Pressable>
          </View>
          <Text style={styles.message}>Vill du öppna länken i appen eller i en extern webläsare?</Text>
          <View style={styles.actions}>
            <AppButton label="Webläsare" onPress={openInBrowser} variant="secondary" />
            <AppButton label="Öppna i appen" onPress={openInApp} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    actions: {
      gap: spacing.sm,
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
    },
    card: {
      backgroundColor: colors.background,
      borderRadius: 20,
      gap: spacing.md,
      maxWidth: 420,
      padding: spacing.lg,
      width: '85%',
    },
    header: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    message: {
      ...typography.body,
      color: colors.textSecondary,
    },
    overlay: {
      alignItems: 'center',
      backgroundColor: colors.overlay,
      flex: 1,
      justifyContent: 'center',
      padding: spacing.lg,
    },
    title: {
      ...typography.sectionTitle,
      color: colors.textPrimary,
    },
  });
}
