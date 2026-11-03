const config = require('./app.json');

// PLACEHOLDER identifiers are com.local.mobile until the production app IDs are assigned.
const mapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

module.exports = ({ config: dynamicConfig }) => ({
  ...config.expo,
  ...dynamicConfig,
  android: {
    ...config.expo.android,
    ...dynamicConfig.android,
    config: {
      ...dynamicConfig.android?.config,
      googleMaps: { apiKey: mapsKey || '' },
    },
  },
  ios: {
    ...config.expo.ios,
    ...dynamicConfig.ios,
    config: {
      ...dynamicConfig.ios?.config,
      googleMapsApiKey: mapsKey || '',
    },
  },
});
