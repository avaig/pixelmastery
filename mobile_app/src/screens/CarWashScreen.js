import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';
import { AppButton, Card, Notice, PageTitle, Screen } from '../components/Screen';
import Field from '../components/Field';
import { CAR_WASH_OPTIONS, calculateWashTotals } from '../services/pricing';
import { postAction, createIdempotencyKey } from '../api/client';
import { checkServiceability } from '../utils/serviceArea';
import { SERVICE_AREA, THEME } from '../config';

const VEHICLE_TYPES = [
  { key: 'small', title: 'Small Car', detail: 'Hatchback / Sedan' },
  { key: 'suv', title: 'SUV / Big Car', detail: 'Larger car' },
];

function isSuvVariant(label) {
  return /SUV|Big Car/i.test(label);
}

function formatRupees(amount) {
  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

export default function CarWashScreen() {
  const [vehicleType, setVehicleType] = useState(null);
  const [cart, setCart] = useState([]);
  const [pickupDrop, setPickupDrop] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [locationText, setLocationText] = useState('');
  const [coordinates, setCoordinates] = useState(null);
  const [serviceable, setServiceable] = useState(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [geocodeBusy, setGeocodeBusy] = useState(false);
  const [showPinPicker, setShowPinPicker] = useState(false);
  const [pin, setPin] = useState(null);
  const [locationSource, setLocationSource] = useState(null);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const [pendingMessage, setPendingMessage] = useState('');
  const idempotencyRef = useRef({ fingerprint: '', key: '' });

  const visibleOptions = useMemo(() => CAR_WASH_OPTIONS.map((option) => ({
    ...option,
    prices: option.prices.filter((price) => vehicleType === 'suv' ? isSuvVariant(price.label) : !isSuvVariant(price.label)),
  })), [vehicleType]);
  const totals = useMemo(() => calculateWashTotals(cart, pickupDrop), [cart, pickupDrop]);

  function selectVehicle(type) {
    if (vehicleType && vehicleType !== type && cart.length) {
      Alert.alert('Change vehicle type?', 'Changing the car type clears your current wash selections.', [
        { text: 'Keep current', style: 'cancel' },
        { text: 'Clear and change', style: 'destructive', onPress: () => { setCart([]); setPickupDrop(false); setVehicleType(type); } },
      ]);
      return;
    }
    setVehicleType(type);
  }

  function toggleOption(title, variant) {
    setCart((current) => {
      const selected = current.find((item) => item.title === title);
      if (selected?.variant === variant) return current.filter((item) => item.title !== title);
      return [...current.filter((item) => item.title !== title), { title, variant, quantity: 1 }];
    });
    idempotencyRef.current = { fingerprint: '', key: '' };
  }

  function updateQuantity(title, delta) {
    setCart((current) => current.map((item) => item.title === title
      ? { ...item, quantity: Math.max(1, Math.min(5, item.quantity + delta)) }
      : item));
    idempotencyRef.current = { fingerprint: '', key: '' };
  }

  async function useMyLocation() {
    setGpsBusy(true);
    setError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setError('Location permission was not granted. You can enter a service address manually instead.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const point = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      const areaCheck = checkServiceability(point.latitude, point.longitude, SERVICE_AREA);
      setCoordinates(point);
      setLocationSource('GPS');
      setServiceable(areaCheck.serviceable);
      let address = '';
      try {
        const results = await Location.reverseGeocodeAsync(point);
        const place = results[0];
        address = place ? [place.name, place.street, place.district, place.city].filter(Boolean).filter((part, index, parts) => parts.indexOf(part) === index).slice(0, 3).join(', ') : '';
      } catch {
        address = '';
      }
      setLocationText(address || 'Current location · Prayagraj');
    } catch {
      setError('Could not read your location. Enter the service address manually or try again.');
    } finally {
      setGpsBusy(false);
    }
  }

  function editLocation(value) {
    setLocationText(value);
    setCoordinates(null);
    setPin(null);
    setLocationSource(null);
    setServiceable(null);
    idempotencyRef.current = { fingerprint: '', key: '' };
  }

  function usePoint(point, source) {
    const areaCheck = checkServiceability(point.latitude, point.longitude, SERVICE_AREA);
    setCoordinates(point);
    setServiceable(areaCheck.serviceable);
    setLocationSource(source);
    idempotencyRef.current = { fingerprint: '', key: '' };
    return areaCheck;
  }

  async function geocodeAddress(address) {
    setGeocodeBusy(true);
    try {
      if (Platform.OS === 'android') {
        const permission = await Location.getForegroundPermissionsAsync();
        if (!permission.granted) {
          const requested = await Location.requestForegroundPermissionsAsync();
          if (!requested.granted) return null;
        }
      }
      const results = await Location.geocodeAsync(address);
      const candidate = results.find((result) => Number.isFinite(result.latitude) && Number.isFinite(result.longitude));
      if (candidate) {
        const point = { latitude: candidate.latitude, longitude: candidate.longitude };
        usePoint(point, 'geocoded address');
        return point;
      }
    } catch {
      // Platform geocoding may be unavailable; a pin or manual-only address still works.
    } finally {
      setGeocodeBusy(false);
    }
    return null;
  }

  function choosePin(point) {
    setPin(point);
    usePoint(point, 'map pin');
  }

  async function submitBooking() {
    if (pendingMessage) return; // An unconfirmed booking exists; never resubmit from this screen.
    setError('');
    const cleanName = fullName.trim();
    const cleanMobile = mobile.replace(/\D/g, '');
    if (cleanName.length < 2 || cleanName.length > 80) {
      setError('Enter your full name (2–80 characters).');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
      setError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    if (locationText.trim().length < 5) {
      setError('Enter your service location (at least 5 characters).');
      return;
    }
    if (!vehicleType || cart.length === 0) {
      setError('Choose your vehicle type and at least one wash option.');
      return;
    }
    // Resolve a manual address on-device before deciding whether coordinates can be sent.
    const bookingPoint = coordinates || await geocodeAddress(locationText.trim());
    if (bookingPoint && !checkServiceability(bookingPoint.latitude, bookingPoint.longitude, SERVICE_AREA).serviceable) {
      setError(`This location is outside the current ${SERVICE_AREA.radiusKm} km service area around ${SERVICE_AREA.name}. Please contact Customer Care.`);
      return;
    }
    const serviceDetails = {
      vehicleType,
      items: cart,
      pickupDropRequested: pickupDrop,
      subtotal: totals.subtotal,
      platformFee: totals.platformFee,
      pickupDropCharge: totals.pickupDropCharge,
      total: totals.total,
    };
    const fingerprint = JSON.stringify({
      name: cleanName,
      mobile: cleanMobile,
      location: locationText.trim(),
      coordinates: bookingPoint,
      serviceDetails,
    });
    setSubmitting(true);
    try {
      if (idempotencyRef.current.fingerprint !== fingerprint || !idempotencyRef.current.key) {
        idempotencyRef.current = { fingerprint, key: await createIdempotencyKey() };
      }
      const result = await postAction('createBooking', {
        fullName: cleanName,
        mobile: cleanMobile,
        location: locationText.trim(),
        latitude: bookingPoint?.latitude,
        longitude: bookingPoint?.longitude,
        serviceKey: 'car-wash',
        serviceDetails,
        idempotencyKey: idempotencyRef.current.key,
      });
      if (result.pending) {
        // Keep the same idempotency key; no success confirmation and no automatic resubmission.
        setPendingMessage(result.message);
        return;
      }
      setPendingVerification(!bookingPoint);
      setSuccess(result.requestId || 'Submitted');
      setShowBooking(false);
    } catch (cause) {
      setError(cause.message || 'Your request could not be submitted. Please retry.');
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <Screen>
        <PageTitle eyebrow="Request submitted">Thanks, {fullName.trim().split(/\s+/)[0]}.</PageTitle>
        <Card>
          <Text style={{ fontSize: 40, textAlign: 'center' }}>✓</Text>
          <Text style={{ color: THEME.ink, fontSize: 20, fontWeight: '800', textAlign: 'center' }}>Your car wash request is with LOCAL Customer Care.</Text>
          <Text style={{ color: THEME.muted, lineHeight: 21, textAlign: 'center' }}>We’ll call to confirm your vehicle, location and pickup/drop details. This is an indicative menu quote, not a final bill. Do not start work until you approve any revised quote.</Text>
          {pendingVerification ? <Notice tone="warning">Your address has no verified coordinates. Customer Care will verify your location before dispatch or any provider offer.</Notice> : null}
          <Text style={{ color: THEME.ink, textAlign: 'center', fontWeight: '700' }}>Request reference: {success}</Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <PageTitle eyebrow="Car Care · fixed menu" detail="Choose one package from each wash category. LOCAL Customer Care will call to confirm your quote before work starts.">Car Wash</PageTitle>
      <Notice>Listed prices are menu estimates. Platform fee is ₹25 per booking. Pickup & Drop, if requested, is an indicative ₹100 and must be confirmed by Customer Care.</Notice>
      <Card>
        <Text style={{ color: THEME.ink, fontWeight: '800', fontSize: 17 }}>1. Choose your vehicle</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {VEHICLE_TYPES.map((type) => {
            const selected = type.key === vehicleType;
            return (
              <Pressable key={type.key} onPress={() => selectVehicle(type.key)} style={{ flex: 1, padding: 14, borderRadius: 13, borderWidth: 1.5, borderColor: selected ? THEME.navy : THEME.border, backgroundColor: selected ? '#EDF3FA' : '#FFFFFF', gap: 4 }}>
                <Text style={{ fontWeight: '800', color: THEME.ink }}>{type.title}</Text>
                <Text style={{ color: THEME.muted, fontSize: 12 }}>{type.detail}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>
      {vehicleType ? (
        <>
          <Text style={{ color: THEME.ink, fontWeight: '800', fontSize: 18 }}>2. Pick wash options</Text>
          {visibleOptions.map((option) => (
            <Card key={option.title}>
              <Text style={{ color: THEME.ink, fontWeight: '800', fontSize: 17 }}>{option.title}</Text>
              {option.description ? <Text style={{ color: THEME.muted, lineHeight: 19 }}>{option.description}</Text> : null}
              {option.prices.map((price) => {
                const selected = cart.some((item) => item.title === option.title && item.variant === price.label);
                return (
                  <Pressable key={price.label} onPress={() => toggleOption(option.title, price.label)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 11, borderTopWidth: 1, borderTopColor: THEME.border }}>
                    <View style={{ flex: 1 }}><Text style={{ color: THEME.ink, fontWeight: '600' }}>{price.label.replace(/^(Small Car|SUV \/ Big Car) — /, '')}</Text><Text style={{ color: THEME.ink, fontWeight: '800', marginTop: 4 }}>{formatRupees(price.price)}</Text></View>
                    <Text style={{ color: selected ? THEME.accent : THEME.navy, fontWeight: '800' }}>{selected ? 'Selected' : 'Add'}</Text>
                  </Pressable>
                );
              })}
            </Card>
          ))}
          <Card>
            <Text style={{ color: THEME.ink, fontWeight: '800', fontSize: 17 }}>Pickup & Drop On Request</Text>
            <Text style={{ color: THEME.muted, lineHeight: 19 }}>Indicative menu charge ₹100, subject to Customer Care location confirmation.</Text>
            <AppButton secondary title={pickupDrop ? 'Remove Pickup & Drop' : 'Request Pickup & Drop · ₹100'} onPress={() => { setPickupDrop(!pickupDrop); idempotencyRef.current = { fingerprint: '', key: '' }; }} />
          </Card>
          {cart.length > 0 ? (
            <Card>
              <Text style={{ color: THEME.ink, fontSize: 18, fontWeight: '800' }}>3. Your estimate</Text>
              {cart.map((item) => {
                const unit = visibleOptions.find((option) => option.title === item.title)?.prices.find((price) => price.label === item.variant)?.price || 0;
                return (
                  <View key={item.title} style={{ paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: THEME.border, gap: 7 }}>
                    <Text style={{ color: THEME.ink, fontWeight: '700' }}>{item.title} · {item.variant.replace(/^(Small Car|SUV \/ Big Car) — /, '')}</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
                        <Text accessibilityRole="button" onPress={() => updateQuantity(item.title, -1)} style={{ fontSize: 20, color: THEME.navy, padding: 3 }}>−</Text>
                        <Text style={{ color: THEME.ink, fontWeight: '700' }}>Qty {item.quantity}</Text>
                        <Text accessibilityRole="button" onPress={() => updateQuantity(item.title, 1)} style={{ fontSize: 20, color: THEME.navy, padding: 3 }}>+</Text>
                      </View>
                      <Text style={{ color: THEME.ink, fontWeight: '800' }}>{formatRupees(unit * item.quantity)}</Text>
                    </View>
                  </View>
                );
              })}
              <Line label="Service subtotal" value={formatRupees(totals.subtotal)} />
              <Line label="LOCAL Platform Fee · once per booking" value={formatRupees(totals.platformFee)} />
              {pickupDrop ? <Line label="Pickup & Drop · indicative" value={formatRupees(totals.pickupDropCharge)} /> : null}
              <Line label="Estimated total" value={formatRupees(totals.total)} strong />
              <Text style={{ color: THEME.muted, fontSize: 12, lineHeight: 18 }}>Customer Care will call to confirm. A changed total needs your approval before work begins.</Text>
              <AppButton title="Book Now" onPress={() => { setError(''); setShowBooking(true); }} />
            </Card>
          ) : <Notice>Select at least one wash option to see your estimate.</Notice>}
        </>
      ) : <Notice>Choose a vehicle to see the correct catalogue prices.</Notice>}

      <Modal visible={showBooking} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowBooking(false)}>
        <View style={{ flex: 1, backgroundColor: THEME.canvas }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}>
            <Text style={{ color: THEME.ink, fontSize: 24, fontWeight: '800' }}>Book your wash</Text>
            <Text style={{ color: THEME.muted, lineHeight: 20 }}>Only your name, mobile number and service location are needed. We’ll call to confirm the quote.</Text>
            <Field label="Full Name" value={fullName} onChangeText={(value) => { setFullName(value); idempotencyRef.current = { fingerprint: '', key: '' }; }} placeholder="Your full name" maxLength={80} />
            <Field label="Mobile Number" value={mobile} onChangeText={(value) => { setMobile(value.replace(/\D/g, '').slice(0, 10)); idempotencyRef.current = { fingerprint: '', key: '' }; }} placeholder="10-digit Indian mobile number" keyboardType="phone-pad" maxLength={10} />
            <Field label="Service Location" value={locationText} onChangeText={editLocation} placeholder="Area, street, landmark" multiline maxLength={220} />
            <AppButton title={gpsBusy ? 'Getting your location…' : 'Use my location'} onPress={useMyLocation} disabled={gpsBusy || submitting} secondary />
            <AppButton title={geocodeBusy ? 'Checking address…' : 'Check address on this device'} onPress={() => geocodeAddress(locationText.trim())} disabled={geocodeBusy || submitting || locationText.trim().length < 5} secondary />
            <AppButton title={showPinPicker ? 'Hide map pin picker' : 'Drop a pin on map'} onPress={() => setShowPinPicker(!showPinPicker)} secondary />
            {showPinPicker ? <View style={{ gap: 8 }}>
              <Text style={{ color: THEME.muted }}>Tap the map to place a pin, or drag the pin to your service location.</Text>
              <MapView style={{ height: 280 }} initialRegion={{ ...(coordinates || SERVICE_AREA.centre), latitudeDelta: 0.3, longitudeDelta: 0.3 }} onPress={(event) => choosePin(event.nativeEvent.coordinate)}>
                {pin ? <Marker coordinate={pin} draggable onDragEnd={(event) => choosePin(event.nativeEvent.coordinate)} title="Service location" /> : null}
              </MapView>
            </View> : null}
            {gpsBusy || geocodeBusy ? <ActivityIndicator color={THEME.navy} /> : null}
            {coordinates && serviceable === true ? <Notice>{locationSource} coordinates are within the current 25 km service area around Naini, Prayagraj. Customer Care will confirm the address.</Notice> : null}
            {coordinates && serviceable === false ? <Notice tone="error">This location is outside the current 25 km service area. We cannot accept this booking in the app.</Notice> : null}
            {!coordinates && locationText.trim().length > 0 ? <Notice tone="warning">Manual address entered without coordinates. We’ll try the device geocoder when you submit (Android may request location permission for this); you can decline and still book. If no coordinates are found, Customer Care must verify before dispatch or any provider offer. You can also drop a pin.</Notice> : null}
            {error ? <Notice tone="error">{error}</Notice> : null}
            {pendingMessage ? <Notice tone="warning">{pendingMessage}</Notice> : null}
            <AppButton title={submitting ? 'Submitting…' : `Submit request · ${formatRupees(totals.total)} est.`} onPress={submitBooking} disabled={submitting || gpsBusy || geocodeBusy || Boolean(pendingMessage)} />
            <AppButton title="Back to options" secondary onPress={() => setShowBooking(false)} />
          </ScrollView>
        </View>
      </Modal>
    </Screen>
  );
}

function Line({ label, value, strong }) {
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 3 }}><Text style={{ flex: 1, color: strong ? THEME.ink : THEME.muted, fontWeight: strong ? '800' : '500' }}>{label}</Text><Text style={{ color: THEME.ink, fontWeight: strong ? '800' : '700' }}>{value}</Text></View>;
}
