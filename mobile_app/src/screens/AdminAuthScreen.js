import React from 'react';
import { Text } from 'react-native';
import { AppButton, Card, Notice, PageTitle, Screen } from '../components/Screen';
import { THEME } from '../config';

export default function AdminAuthScreen({ navigation }) {
  return (
    <Screen>
      <PageTitle eyebrow="Authentication" detail="No username or password form is active in this build.">Under investigation</PageTitle>
      <Card>
        <Text style={{ color: THEME.ink, fontSize: 17, fontWeight: '800' }}>Admin and Service Provider login is not yet implemented.</Text>
        <Text style={{ color: THEME.muted, lineHeight: 21 }}>We are investigating how existing LOCAL accounts can securely sign in from the mobile app. This screen does not accept or store credentials.</Text>
      </Card>
      <Notice tone="warning">Do not enter production credentials into a prototype or WebView test. Any future test must use dedicated test accounts and verify session handling first.</Notice>
      <AppButton title="Back to LOCAL" onPress={() => navigation.goBack()} />
    </Screen>
  );
}
