const CAR_WASH_PLATFORM_FEE = 25;
const PICKUP_DROP_FEE = 100;
const CAR_WASH_OPTIONS = [
  {
    title: 'Complete Car Wash',
    description: 'Exterior wash + interior cleaning.',
    prices: [
      { label: 'Small Car (Hatchback / Sedan)', price: 400 },
      { label: 'SUV / Big Car', price: 500 },
    ],
  },
  {
    title: 'Exterior Only',
    description: '',
    prices: [
      { label: 'Small Car — Without Body Polish', price: 300 },
      { label: 'Small Car — With Body Polish', price: 500 },
      { label: 'SUV / Big Car — Without Body Polish', price: 400 },
      { label: 'SUV / Big Car — With Body Polish', price: 900 },
    ],
  },
  {
    title: 'Interior Only',
    description: 'Full vacuum cleaning and dashboard polishing included.',
    prices: [
      { label: 'Small Car (Hatchback / Sedan)', price: 200 },
      { label: 'SUV / Big Car', price: 300 },
    ],
  },
  {
    title: 'Interior Deep Clean',
    description: 'Ceiling and complimentary exterior wash included. Seat removal and refitting is a separate priced option.',
    prices: [
      { label: 'Small Car — Without Seat Removal & Refitting', price: 2500 },
      { label: 'Small Car — With Seat Removal & Refitting', price: 3000 },
      { label: 'SUV / Big Car — Without Seat Removal & Refitting', price: 4500 },
      { label: 'SUV / Big Car — With Seat Removal & Refitting', price: 5000 },
    ],
  },
  {
    title: 'Rubbing & Detailing',
    description: 'Choose Basic or Premium detailing for your vehicle size.',
    prices: [
      { label: 'Small Car — Basic', price: 3000 },
      { label: 'Small Car — Premium', price: 8000 },
      { label: 'SUV / Big Car — Basic', price: 5000 },
      { label: 'SUV / Big Car — Premium', price: 10000 },
    ],
  },
];

function getWashOption(title) {
  return CAR_WASH_OPTIONS.find((option) => option.title === title);
}

function getWashPrice(item) {
  const option = getWashOption(item?.title);
  const configured = option?.prices.find((price) => price.label === item?.variant)?.price;
  if (Number.isFinite(configured)) return configured;
  return 0;
}

function calculateWashTotals(items, pickupDropRequested) {
  const subtotal = items.reduce((sum, item) => sum + getWashPrice(item) * item.quantity, 0);
  const pickupDropCharge = pickupDropRequested ? PICKUP_DROP_FEE : 0;
  return {
    subtotal,
    platformFee: CAR_WASH_PLATFORM_FEE,
    pickupDropCharge,
    total: subtotal + pickupDropCharge + CAR_WASH_PLATFORM_FEE,
  };
}

function getDistanceKm(latitudeA, longitudeA, latitudeB, longitudeB) {
  const values = [latitudeA, longitudeA, latitudeB, longitudeB].map(Number);
  if (values.some((value) => !Number.isFinite(value))) return null;
  if (Math.abs(values[0]) > 90 || Math.abs(values[2]) > 90 || Math.abs(values[1]) > 180 || Math.abs(values[3]) > 180) return null;
  const [latA, lonA, latB, lonB] = values.map((value) => value * Math.PI / 180);
  const deltaLat = latB - latA;
  const deltaLon = lonB - lonA;
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)));
}

module.exports = {
  CAR_WASH_OPTIONS,
  CAR_WASH_PLATFORM_FEE,
  PICKUP_DROP_FEE,
  calculateWashTotals,
  getDistanceKm,
  getWashOption,
  getWashPrice,
};
