import React from 'react';
import { Alert, Linking, Text } from 'react-native';
import { AppButton, Card, Notice, PageTitle, Screen } from '../components/Screen';
import { THEME } from '../config';

const customerCarePhone = process.env.EXPO_PUBLIC_CUSTOMER_CARE_PHONE?.replace(/[^+\d]/g, '');

export default function ComingSoonScreen({ route, navigation }) {
  const service = route.params?.service || 'This service';
  async function callCustomerCare() {
    if (!customerCarePhone) {
      Alert.alert('Customer Care number unavailable', 'The Customer Care phone number has not been configured for this mobile build. Please use LOCAL’s published customer-care contact.');
      return;
    }
    const url = `tel:${customerCarePhone}`;
    if (await Linking.canOpenURL(url)) await Linking.openURL(url);
    else Alert.alert('Calling unavailable', 'This device cannot place phone calls.');
  }
  return (
    <Screen>
      <PageTitle eyebrow="Not available in app">Coming soon on mobile</PageTitle>
      <Card>
        <Text style={{ color: THEME.ink, fontWeight: '800', fontSize: 18 }}>{service}</Text>
        <Text style={{ color: THEME.muted, lineHeight: 21 }}>This service is not implemented in the mobile app. Contact Customer Care for help; no booking or fake service data was created.</Text>
        <AppButton title="Call Customer Care" onPress={callCustomerCare} />
      </Card>
      <Notice tone="warning">Customer Care phone number is configured by EXPO_PUBLIC_CUSTOMER_CARE_PHONE. If it is blank, the app will not dial an unverified number.</Notice>
      <AppButton title="Back" secondary onPress={() => navigation.goBack()} />
    </Screen>
  );
}
