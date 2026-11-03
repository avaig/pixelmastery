const DISCOVERY_RADIUS_KM = Math.max(
  1,
  Math.min(50, Number(process.env.EXPO_PUBLIC_DISCOVERY_RADIUS_KM) || 15),
);

const SERVICE_AREA = {
  centre: { latitude: 25.382, longitude: 81.875 },
  radiusKm: 25,
  name: 'Naini, Prayagraj',
};

const THEME = {
  navy: '#132F55',
  ink: '#17233B',
  muted: '#667085',
  canvas: '#F6F7FB',
  white: '#FFFFFF',
  accent: '#247C78',
  warning: '#A35B00',
  border: '#E1E6EF',
  danger: '#B42318',
};

module.exports = { DISCOVERY_RADIUS_KM, SERVICE_AREA, THEME };
