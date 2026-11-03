import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text } from 'react-native';
import HomeScreen from './src/screens/HomeScreen';
import ServicesScreen from './src/screens/ServicesScreen';
import NearbyScreen from './src/screens/NearbyScreen';
import AccountScreen from './src/screens/AccountScreen';
import CarCareScreen from './src/screens/CarCareScreen';
import CarWashScreen from './src/screens/CarWashScreen';
import AdminAuthScreen from './src/screens/AdminAuthScreen';
import ComingSoonScreen from './src/screens/ComingSoonScreen';
import { THEME } from './src/config';

const Tabs = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function HomeTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: THEME.navy,
        tabBarInactiveTintColor: THEME.muted,
        tabBarStyle: { height: 64, paddingTop: 6, paddingBottom: 8, borderTopColor: THEME.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color }) => {
          const glyphs = { Home: '⌂', Services: '▦', Nearby: '⌖', Account: '◉' };
          return <Text style={{ color, fontSize: 22, lineHeight: 26 }}>{glyphs[route.name]}</Text>;
        },
      })}
    >
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Services" component={ServicesScreen} />
      <Tabs.Screen name="Nearby" component={NearbyScreen} />
      <Tabs.Screen name="Account" component={AccountScreen} />
    </Tabs.Navigator>
  );
}

const linking = {
  prefixes: ['localapp://'],
  config: {
    screens: {
      HomeTabs: {
        path: '',
        screens: { Home: 'home', Services: 'services', Nearby: 'nearby', Account: 'account' },
      },
      CarCare: 'car-care',
      CarWash: 'car-wash',
      AdminAuth: 'admin-provider-login',
      ComingSoon: 'coming-soon/:service',
    },
  },
};

export default function App() {
  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: THEME.canvas } }}>
        <Stack.Screen name="HomeTabs" component={HomeTabs} />
        <Stack.Screen name="CarCare" component={CarCareScreen} />
        <Stack.Screen name="CarWash" component={CarWashScreen} />
        <Stack.Screen name="AdminAuth" component={AdminAuthScreen} />
        <Stack.Screen name="ComingSoon" component={ComingSoonScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
