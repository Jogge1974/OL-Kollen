import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { useExternalLinkStore } from '@/src/store/externalLinkStore';
import { ColorPalette, useColors } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';

// Mounted once at the app root; shows whichever URL openExternalLink() put
// into the store when the user picked (or is set to always pick) "app".
export function ExternalLinkWebViewModal() {
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const webViewUrl = useExternalLinkStore((state) => state.webViewUrl);
  const closeWebView = useExternalLinkStore((state) => state.closeWebView);

  return (
    <Modal animationType="slide" onRequestClose={closeWebView} visible={Boolean(webViewUrl)}>
      <SafeAreaProvider>
        <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
          <View style={styles.header}>
            <Text numberOfLines={1} style={styles.title}>
              {webViewUrl}
            </Text>
            <Pressable hitSlop={8} onPress={closeWebView}>
              <Ionicons color={colors.textSecondary} name="close" size={22} />
            </Pressable>
          </View>
          {webViewUrl ? <WebView source={{ uri: webViewUrl }} startInLoadingState style={styles.webView} /> : null}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    header: {
      alignItems: 'center',
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
      flexDirection: 'row',
      gap: spacing.sm,
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    safeArea: {
      backgroundColor: colors.background,
      flex: 1,
    },
    title: {
      ...typography.captionStrong,
      color: colors.textSecondary,
      flex: 1,
    },
    webView: {
      flex: 1,
    },
  });
}
