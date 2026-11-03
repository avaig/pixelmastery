import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { AppButton, Card, Notice, PageTitle, Screen } from '../components/Screen';
import { postAction } from '../api/client';
import { DISCOVERY_RADIUS_KM, SERVICE_AREA, THEME } from '../config';

// Nearby providers are disabled for the first live milestone (the edge action answers 404 until per-IP and
// abuse protection exist). While false this screen makes NO network call and requests no location; the
// map/GPS/search code below is kept for a later release.
const NEARBY_PROVIDERS_ENABLED = false;
const DISABLED_MESSAGE = 'Nearby providers will be available in a later release.';

export default function NearbyScreen() {
  const [point, setPoint] = useState(null);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(NEARBY_PROVIDERS_ENABLED
    ? 'Tap below to check nearby Car Wash providers. Location access is requested only when you choose to use it.'
    : DISABLED_MESSAGE);

  async function findProviders() {
    if (!NEARBY_PROVIDERS_ENABLED) {
      // No location request and no API call while the feature is disabled.
      setMessage(DISABLED_MESSAGE);
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setMessage('Location permission was not granted. Nearby providers need a current location; your location is not requested until you tap this button.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const current = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setPoint(current);
      const result = await postAction('nearbyProviders', {
        ...current,
        serviceKey: 'car-wash',
        radiusKm: DISCOVERY_RADIUS_KM,
      });
      const safeProviders = Array.isArray(result.providers) ? result.providers.map((provider) => ({
        providerHash: String(provider.providerHash || ''),
        name: String(provider.name || 'Service Provider'),
        distanceKm: Number(provider.distanceKm),
        availability: String(provider.availability || ''),
      })).filter((provider) => provider.providerHash && Number.isFinite(provider.distanceKm)) : [];
      setProviders(safeProviders);
      setMessage(safeProviders.length ? '' : 'No eligible Car Wash providers are currently listed within this search radius.');
    } catch (error) {
      setMessage(error.message || 'Nearby providers are temporarily unavailable.');
      setProviders([]);
    } finally {
      setLoading(false);
    }
  }

  const mapRegion = point ? {
    ...point,
    latitudeDelta: Math.max(0.12, DISCOVERY_RADIUS_KM / 45),
    longitudeDelta: Math.max(0.12, DISCOVERY_RADIUS_KM / 45),
  } : {
    ...SERVICE_AREA.centre,
    latitudeDelta: 0.22,
    longitudeDelta: 0.22,
  };

  return (
    <Screen>
      <PageTitle eyebrow="Discovery" detail={NEARBY_PROVIDERS_ENABLED ? `Search for approved, available Car Wash providers within ${DISCOVERY_RADIUS_KM} km. The app does not display exact provider locations or phone numbers.` : null}>Nearby providers</PageTitle>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <MapView style={{ height: 300 }} region={mapRegion}>
          {point ? <>
            <Marker coordinate={point} title="Your current location" pinColor={THEME.navy} />
            <Circle center={point} radius={DISCOVERY_RADIUS_KM * 1000} strokeColor="rgba(36,124,120,0.8)" fillColor="rgba(36,124,120,0.10)" />
          </> : <Marker coordinate={SERVICE_AREA.centre} title="Naini · Prayagraj service area" pinColor={THEME.navy} />}
        </MapView>
        <View style={{ padding: 14, gap: 7 }}>
          {NEARBY_PROVIDERS_ENABLED ? <>
            <Text style={{ color: THEME.ink, fontWeight: '800' }}>Search radius · {DISCOVERY_RADIUS_KM} km</Text>
            <Text style={{ color: THEME.muted, lineHeight: 19 }}>The map shows your search area. Provider pins are intentionally not shown: the API returns only approximate distance and no provider coordinates.</Text>
          </> : <Text style={{ color: THEME.muted, lineHeight: 19 }}>The map shows the current Naini · Prayagraj service area. You can book a Car Wash from the Services tab.</Text>}
        </View>
      </Card>
      {NEARBY_PROVIDERS_ENABLED ? <AppButton title={loading ? 'Checking nearby providers…' : 'Use my location & search'} onPress={findProviders} disabled={loading} /> : null}
      {loading ? <ActivityIndicator color={THEME.navy} /> : null}
      {message ? <Notice>{message}</Notice> : null}
      {providers.map((provider) => (
        <Card key={provider.providerHash} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: THEME.ink, fontWeight: '800', fontSize: 16 }}>{provider.name}</Text>
            <Text style={{ color: THEME.muted }}>{provider.availability}</Text>
          </View>
          <Text style={{ color: THEME.navy, fontWeight: '800' }}>~{provider.distanceKm.toFixed(1)} km</Text>
        </Card>
      ))}
    </Screen>
  );
}
