import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/src/theme/ThemeContext';
import { typography } from '@/src/theme/typography';

const iconByRoute = {
  calendar: 'calendar-outline',
  'event/[id]': 'ellipse-outline',
  friends: 'people-outline',
  index: 'home-outline',
  profile: 'person-outline',
  sverigelista: 'trophy-outline',
  settings: 'settings-outline',
} as const;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const colors = useColors();

  return (
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
          height: 72 + insets.bottom,
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
          title: 'Inställningar',
          tabBarLabel: 'Inställningar',
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
  );
}

function getTabIconName(routeName: string, focused: boolean) {
  const icon = iconByRoute[routeName as keyof typeof iconByRoute] ?? 'ellipse-outline';

  if (!focused) {
    return icon as keyof typeof Ionicons.glyphMap;
  }

  return icon.replace('-outline', '') as keyof typeof Ionicons.glyphMap;
}
