import React from 'react';
import { Text } from 'react-native';
import { AppButton, Card, PageTitle, Screen } from '../components/Screen';
import { THEME } from '../config';

export default function ServicesScreen({ navigation }) {
  return (
    <Screen>
      <PageTitle eyebrow="Browse" detail="Start with a service that's available in the mobile app.">Services</PageTitle>
      <Card>
        <Text style={{ fontSize: 22 }}>🚘</Text>
        <Text style={{ color: THEME.ink, fontWeight: '800', fontSize: 18 }}>Car Care & Assistance</Text>
        <Text style={{ color: THEME.muted }}>Wash, servicing, essentials and insurance support.</Text>
        <AppButton title="View car care" onPress={() => navigation.getParent()?.navigate('CarCare')} />
      </Card>
      {['Bike Assistance', 'Home Services', 'Emergency Roadside Help'].map((name) => (
        <Card key={name}>
          <Text style={{ color: THEME.ink, fontWeight: '800', fontSize: 17 }}>{name}</Text>
          <Text style={{ color: THEME.muted }}>Coming soon on mobile · contact Customer Care for help.</Text>
        </Card>
      ))}
    </Screen>
  );
}
