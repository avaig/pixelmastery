import React from 'react';
import { Text, View } from 'react-native';
import { AppButton, Card, PageTitle, Screen } from '../components/Screen';
import { THEME } from '../config';

const SERVICES = [
  { title: 'Car Wash', description: 'Exterior and interior car cleaning', available: true },
  { title: 'Car Service', description: 'Routine maintenance and servicing', available: false },
  { title: 'Car Essentials at Your Doorstep', description: 'Essential car fluids delivered to your location', available: false },
  { title: 'Car Insurance Claim', description: 'Help with next steps after car damage or an accident', available: false },
];

export default function CarCareScreen({ navigation }) {
  return (
    <Screen>
      <PageTitle eyebrow="Services" detail="Choose a car care service. We’ll be clear about what can be booked in the app.">Car Care & Assistance</PageTitle>
      {SERVICES.map((service, index) => (
        <Card key={service.title}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 27 }}>{['💧', '🔧', '📦', '🛡️'][index]}</Text>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: THEME.ink, fontSize: 17, fontWeight: '800' }}>{service.title}</Text>
              <Text style={{ color: THEME.muted, lineHeight: 19 }}>{service.description}</Text>
            </View>
          </View>
          {service.available
            ? <AppButton title="See wash options" onPress={() => navigation.navigate('CarWash')} />
            : <Text style={{ color: THEME.warning, fontWeight: '700', lineHeight: 19 }}>Coming soon on mobile. Please call Customer Care for this service.</Text>}
        </Card>
      ))}
      <AppButton title="Call Customer Care" secondary onPress={() => navigation.getParent()?.navigate('ComingSoon', { service: 'Customer Care phone number' })} />
    </Screen>
  );
}
