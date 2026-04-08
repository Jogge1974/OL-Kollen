import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { colors } from '@/src/theme/colors';
import { typography } from '@/src/theme/typography';

const iconByRoute = {
  calendar: 'calendar-outline',
  'event/[id]': 'ellipse-outline',
  index: 'home-outline',
  profile: 'person-outline',
  settings: 'settings-outline',
} as const;

export default function TabsLayout() {
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
          height: 72,
          paddingBottom: 10,
          paddingTop: 10,
        },
      })}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarLabel: 'Home',
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
