import * as React from 'react';

import { Image, ImageStyle, StyleProp, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { getOrganisationLogoUri } from '@/src/services/organisationLogoCache';
import { colors } from '@/src/theme/colors';

type OrganisationLogoProps = {
  organisationId?: string | null;
  label?: string | null;
  size?: number;
  style?: StyleProp<ImageStyle>;
};

export function OrganisationLogo({ organisationId, label, size = 16, style }: OrganisationLogoProps) {
  const [logoUri, setLogoUri] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(Boolean(organisationId));

  React.useEffect(() => {
    let active = true;

    if (!organisationId) {
      setLogoUri(null);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setLogoUri(null);

    void getOrganisationLogoUri(organisationId)
      .then((uri) => {
        if (active) {
          setLogoUri(uri);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [organisationId]);

  if (logoUri) {
    return <Image accessibilityIgnoresInvertColors source={{ uri: logoUri }} style={[styles.logo, { width: size, height: size }, style]} resizeMode="contain" />;
  }

  if (loading) {
    return <View style={[styles.placeholder, { width: size, height: size }, style]} />;
  }

  return (
    <View style={[styles.placeholder, { width: size, height: size }, style]}>
      <MaterialCommunityIcons color={colors.textMuted} name={label ? 'shield-outline' : 'shield-outline'} size={Math.max(10, Math.round(size * 0.72))} />
    </View>
  );
}

const styles = StyleSheet.create({
  logo: {
    flexShrink: 0,
  },
  placeholder: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 4,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
