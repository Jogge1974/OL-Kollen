import { Ionicons } from '@expo/vector-icons';
import { Tabs, router } from 'expo-router';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ColorPalette, useColors } from '@/src/theme/ThemeContext';
import { typography } from '@/src/theme/typography';
import { spacing } from '@/src/theme/spacing';

const iconByRoute = {
  calendar: 'calendar-outline',
  'event/[id]': 'ellipse-outline',
  friends: 'people-outline',
  index: 'home-outline',
  klubbaktiviteter: 'people-circle-outline',
  profile: 'person-outline',
  serier: 'list-outline',
  sverigelista: 'trophy-outline',
  settings: 'ellipsis-horizontal-outline',
} as const;

type MoreMenuOption = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  route: '/klubbaktiviteter' | '/serier' | '/settings';
};

const MORE_MENU_OPTIONS: MoreMenuOption[] = [
  { icon: 'list-outline', label: 'Serier', route: '/serier' },
  { icon: 'people-circle-outline', label: 'Klubbaktiviteter', route: '/klubbaktiviteter' },
  { icon: 'settings-outline', label: 'Inställningar', route: '/settings' },
];

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = React.useState(false);

  const tabBarHeight = 72 + insets.bottom;

  const handleSelectOption = React.useCallback((route: MoreMenuOption['route']) => {
    setIsMoreMenuOpen(false);
    router.navigate(route);
  }, []);

  return (
    <>
      <Tabs
        screenOptions={({ route }) => ({
          headerShown: false,
          sceneStyle: {
            backgroundColor: colors.background,
          },
          tabBarActiveTintColor: colors.tabActive,
          tabBarInactiveTintColor: colors.tabInactive,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons color={color} name={getTabIconName(route.name, focused)} size={size} />
          ),
          tabBarLabelStyle: {
            ...typography.tabLabel,
          },
          tabBarStyle: {
            backgroundColor: colors.tabBackground,
            borderTopColor: colors.border,
            height: tabBarHeight,
            paddingBottom: insets.bottom + 10,
            paddingTop: 10,
          },
        })}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Hem',
            tabBarLabel: 'Hem',
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: 'Tävlingskalendern',
            tabBarLabel: 'Kalender',
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Min sida',
            tabBarLabel: 'Min sida',
          }}
        />
        <Tabs.Screen
          name="sverigelista"
          options={{
            title: 'Sverigelistan',
            tabBarLabel: 'Sverigelistan',
          }}
        />
        <Tabs.Screen
          name="friends"
          options={{
            title: 'Vänner',
            tabBarLabel: 'Vänner',
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Mer',
            tabBarLabel: 'Mer',
          }}
          listeners={{
            tabPress: (event) => {
              // Navigera inte direkt till Inställningar – öppna drop-up-menyn i stället.
              event.preventDefault();
              setIsMoreMenuOpen(true);
            },
          }}
        />
        <Tabs.Screen
          name="klubbaktiviteter"
          options={{
            href: null,
            title: 'Klubbaktiviteter',
          }}
        />
        <Tabs.Screen
          name="klubbaktivitet/[id]"
          options={{
            href: null,
            title: 'Aktivitet',
          }}
        />
        <Tabs.Screen
          name="serier"
          options={{
            href: null,
            title: 'Serier',
          }}
        />
        <Tabs.Screen
          name="serie/[id]"
          options={{
            href: null,
            title: 'Serie',
          }}
        />
        <Tabs.Screen
          name="event/[id]"
          options={{
            href: null,
            title: 'Tävling',
          }}
        />
        <Tabs.Screen
          name="friend/[personId]"
          options={{
            href: null,
            title: 'Vän',
          }}
        />
      </Tabs>

      <Modal animationType="fade" onRequestClose={() => setIsMoreMenuOpen(false)} transparent visible={isMoreMenuOpen}>
        <Pressable style={styles.menuBackdrop} onPress={() => setIsMoreMenuOpen(false)} />
        <View style={[styles.menuCard, { bottom: tabBarHeight + spacing.sm }]}>
          {MORE_MENU_OPTIONS.map((option, index) => (
            <React.Fragment key={option.route}>
              {index > 0 ? <View style={styles.menuDivider} /> : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => handleSelectOption(option.route)}
                style={({ pressed }) => [styles.menuItem, pressed ? styles.menuItemPressed : null]}
              >
                <Ionicons color={colors.primary} name={option.icon} size={20} />
                <Text style={styles.menuItemText}>{option.label}</Text>
              </Pressable>
            </React.Fragment>
          ))}
        </View>
      </Modal>
    </>
  );
}

function getTabIconName(routeName: string, focused: boolean) {
  const icon = iconByRoute[routeName as keyof typeof iconByRoute] ?? 'ellipse-outline';

  if (!focused) {
    return icon as keyof typeof Ionicons.glyphMap;
  }

  return icon.replace('-outline', '') as keyof typeof Ionicons.glyphMap;
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    menuBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.overlay,
    },
    menuCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 18,
      borderWidth: 1,
      elevation: 8,
      minWidth: 220,
      overflow: 'hidden',
      paddingVertical: spacing.xs,
      position: 'absolute',
      right: spacing.lg,
      shadowColor: '#000',
      shadowOffset: { height: 4, width: 0 },
      shadowOpacity: 0.2,
      shadowRadius: 12,
    },
    menuDivider: {
      backgroundColor: colors.border,
      height: 1,
      marginHorizontal: spacing.md,
    },
    menuItem: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    menuItemPressed: {
      backgroundColor: colors.surfaceMuted,
    },
    menuItemText: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
    },
  });
}
