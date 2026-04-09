import * as React from 'react';

import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';

import { OrganisationLogo } from '@/src/components/OrganisationLogo';

type OrganisationLabelProps = {
  label?: string | null;
  logoSize?: number;
  textStyle?: StyleProp<TextStyle>;
  viewStyle?: StyleProp<ViewStyle>;
  withLogo?: boolean;
  organisationId?: string | null;
};

export function OrganisationLabel({
  label,
  logoSize = 14,
  organisationId,
  textStyle,
  viewStyle,
  withLogo = true,
}: OrganisationLabelProps) {
  return (
    <View style={[styles.row, viewStyle]}>
      {withLogo ? <OrganisationLogo label={label} organisationId={organisationId} size={logoSize} style={styles.logo} /> : null}
      <Text numberOfLines={1} style={textStyle}>
        {label ?? '-'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  logo: {
    flexShrink: 0,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    minWidth: 0,
  },
});
