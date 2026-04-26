import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/src/components/AppButton';
import { AppTextField } from '@/src/components/AppTextField';
import { useAuthStore } from '@/src/store/authStore';
import { getSupabaseClient } from '@/src/services/supabase';
import { colors } from '@/src/theme/colors';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';

export default function AboutScreen() {
  const user = useAuthStore((state) => state.user);
  const [feedbackName, setFeedbackName] = React.useState(user?.fullName ?? '');
  const [feedbackText, setFeedbackText] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);
  const scrollRef = React.useRef<ScrollView>(null);
  const feedbackCardY = React.useRef(0);

  const scrollToFeedback = () => {
    scrollRef.current?.scrollTo({ y: Math.max(0, feedbackCardY.current - 10), animated: true });
  };

  const handleSendFeedback = async () => {
    const name = feedbackName.trim();
    const text = feedbackText.trim();

    if (!name || !text) {
      Alert.alert('Fyll i alla fält', 'Både namn och meddelande behöver fyllas i.');
      return;
    }

    setIsSending(true);

    try {
      const client = getSupabaseClient();
      if (!client) {
        Alert.alert('Inte tillgängligt', 'Konfigurationen är felaktig. Meddela via Om Kontrollen / Synpunkter.');
        return;
      }

      const { error } = await client.from('feedback').insert({
        name,
        message: text,
        person_id: user?.personId ?? null,
        person_name: user?.fullName ?? null,
        organisation: user?.organisationName ?? null,
      });

      if (error) {
        Alert.alert('Något gick fel', 'Det gick inte att skicka synpunkten. Försök igen senare.');
        return;
      }

      setFeedbackText('');
      Alert.alert('Tack!', 'Din synpunkt har skickats.');
    } catch {
      Alert.alert('Något gick fel', 'Det gick inte att skicka synpunkten. Försök igen senare.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Om Kontrollen</Text>
        <Pressable onPress={() => router.back()} style={styles.closeChip}>
          <Ionicons color={colors.primary} name="close-circle-outline" size={16} />
          <Text style={styles.closeText}>Stäng</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex} keyboardVerticalOffset={0}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.titleRow}>
          <Ionicons color={colors.primary} name="information-circle-outline" size={28} />
          <Text style={styles.title}>Om appen</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.bodyText}>
            Kontrollen är en app som ska vara ett komplement till Eventor. All data som visas i appen hämtas från Eventor.
          </Text>
          <Text style={styles.bodyText}>
            Vi kan inte garantera att alla uppgifter är fullständigt korrekta. Det kan finnas data som inte hämtas på rätt sätt eller information som ändras i Eventor utan att appen uppdateras.
          </Text>
          <Text style={styles.disclaimerText}>
            Kontrollera alltid uppgifterna direkt i Eventor för att försäkra dig om att de stämmer.
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.titleRow}>
          <Ionicons color={colors.primary} name="chatbubble-ellipses-outline" size={24} />
          <Text style={styles.title}>Synpunkter</Text>
        </View>

        <View onLayout={(e) => { feedbackCardY.current = e.nativeEvent.layout.y; }} style={styles.card}>
          <Text style={styles.bodyText}>
            Har du feedback, förslag eller har hittat något som inte verkar stämma? Skicka gärna ett meddelande till oss.
          </Text>

          <AppTextField
            autoCapitalize="words"
            autoCorrect={false}
            label="Namn"
            onChangeText={setFeedbackName}
            onClearText={() => setFeedbackName('')}
            onFocus={() => scrollToFeedback()}
            placeholder="Ditt namn"
            value={feedbackName}
          />

          <AppTextField
            autoCapitalize="sentences"
            label="Meddelande"
            multiline
            numberOfLines={4}
            onChangeText={setFeedbackText}
            onClearText={() => setFeedbackText('')}
            onFocus={() => scrollToFeedback()}
            placeholder="Skriv din synpunkt/meddelande här"
            style={styles.feedbackTextInput}
            textAlignVertical="top"
            value={feedbackText}
          />

          <AppButton
            disabled={isSending}
                          label={isSending ? 'Skickar meddelande...' : 'Skicka meddelande'}
            onPress={() => void handleSendFeedback()}
          />
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    ...typography.headingMedium,
    color: colors.textPrimary,
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
  closeText: {
    ...typography.buttonSmall,
    color: colors.primary,
    fontSize: 13,
    lineHeight: 16,
  },
  content: {
    gap: spacing.lg,
    padding: spacing.md,
    paddingBottom: 60,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  title: {
    ...typography.headingMedium,
    color: colors.textPrimary,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  bodyText: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  disclaimerText: {
    ...typography.bodyStrong,
    color: colors.primaryDeep,
    lineHeight: 22,
  },
  divider: {
    backgroundColor: colors.border,
    height: 1,
  },
  feedbackTextInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  flex: {
    flex: 1,
  },
});
