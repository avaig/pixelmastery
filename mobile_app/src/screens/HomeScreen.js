import React from 'react';
import { Text, View } from 'react-native';
import { AppButton, Card, PageTitle, Screen, Notice } from '../components/Screen';
import { THEME } from '../config';

export default function HomeScreen({ navigation }) {
  return (
    <Screen>
      <PageTitle eyebrow="LOCAL · Prayagraj" detail="Trusted vehicle care, with clear prices and a Customer Care review before work begins.">Happy to help.</PageTitle>
      <Card style={{ backgroundColor: THEME.navy, borderColor: THEME.navy, padding: 20 }}>
        <Text style={{ color: '#D6E8F5', fontWeight: '700' }}>CAR CARE & ASSISTANCE</Text>
        <Text style={{ color: '#FFFFFF', fontSize: 23, fontWeight: '800' }}>Give your car a little care.</Text>
        <Text style={{ color: '#ECF3F8', lineHeight: 21 }}>Car wash booking is available now. Other mobile services are coming soon.</Text>
        <AppButton title="Explore car care" onPress={() => navigation.navigate('CarCare')} secondary />
      </Card>
      <Text style={{ color: THEME.ink, fontWeight: '800', fontSize: 19 }}>Service categories</Text>
      <Card>
        <Text style={{ fontSize: 21 }}>🚗  Car Care</Text>
        <Text style={{ color: THEME.muted }}>Car Wash is ready to book.</Text>
        <AppButton title="Open car care" onPress={() => navigation.navigate('CarCare')} />
      </Card>
      {['Bike Assistance', 'Home Services', 'Roadside Assistance'].map((service) => (
        <Card key={service} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}><Text style={{ color: THEME.ink, fontWeight: '800', fontSize: 16 }}>{service}</Text><Text style={{ color: THEME.muted, marginTop: 4 }}>Coming soon on mobile</Text></View>
          <Text style={{ color: THEME.muted, fontSize: 24 }}>›</Text>
        </Card>
      ))}
      <Notice>Service coverage is currently limited to Naini and nearby Prayagraj. GPS is used only if you tap “Use my location”.</Notice>
    </Screen>
  );
}
