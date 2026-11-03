import React from 'react';
import { Text } from 'react-native';
import { AppButton, Card, Notice, PageTitle, Screen } from '../components/Screen';
import { THEME } from '../config';

export default function AccountScreen({ navigation }) {
  return (
    <Screen>
      <PageTitle eyebrow="Your account" detail="Guest Car Wash bookings do not require an account or sign-in.">Account</PageTitle>
      <Card>
        <Text style={{ color: THEME.ink, fontSize: 18, fontWeight: '800' }}>Admin / Service Provider</Text>
        <Text style={{ color: THEME.muted, lineHeight: 20 }}>Their sign-in experience is not available in this mobile prototype. We’re investigating a secure integration and will not collect credentials here.</Text>
        <AppButton title="Authentication status" onPress={() => navigation.getParent()?.navigate('AdminAuth')} secondary />
      </Card>
      <Notice>Guest booking stores only the name, mobile number and service location needed to arrange the requested service.</Notice>
    </Screen>
  );
}
