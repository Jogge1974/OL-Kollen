import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { colors } from '@/src/theme/colors';
import { typography } from '@/src/theme/typography';

const iconByRoute = {
  calendar: 'calendar-outline',
  index: 'home-outline',
  profile: 'person-outline',
} as const;

type TabRoute = keyof typeof iconByRoute;

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
          <Ionicons
            color={color}
            name={
              focused
                ? (iconByRoute[route.name as TabRoute].replace('-outline', '') as keyof typeof Ionicons.glyphMap)
                : iconByRoute[route.name as TabRoute]
            }
            size={size}
          />
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
    </Tabs>
  );
}
