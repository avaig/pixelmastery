import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/local/EntityPages';
import { toast } from 'sonner';
import { getCapabilityName } from '@/services/providerMatching';
import { getLanguage, tr } from '@/services/i18n';
import { getCapabilityCatalog } from '@/services/capabilityCatalog';

const { eq } = window.ApperSDK.CoreSDK;

const VEHICLE_CATEGORY = {
  car: 'Car Assistance',
  bike: 'Bike Assistance',
};

const CAR_WASH_OPTIONS = [
  {
    title: 'Complete Car Wash',
    description: 'Exterior wash and interior cleaning.',
    icon: 'Sparkles',
    image: 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=1200&q=85',
    prices: [
      { label: 'Small Car (Hatchback / Sedan)', price: 400 },
      { label: 'SUV / Big Car', price: 500 },
    ],
  },
  {
    title: 'Exterior Only',
    description: 'Choose the price that matches whether body polish is included.',
    icon: 'Droplets',
    image: 'https://images.unsplash.com/photo-1605164599901-7c6b7f4f7d3c?auto=format&fit=crop&w=1200&q=85',
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
    icon: 'CarFront',
    image: 'https://images.unsplash.com/photo-1601362840469-51e4d8d58785?auto=format&fit=crop&w=1200&q=85',
    prices: [
      { label: 'Small Car (Hatchback / Sedan)', price: 200 },
      { label: 'SUV / Big Car', price: 300 },
    ],
  },
  {
    title: 'Interior Deep Clean',
    description: 'Ceiling and complimentary exterior wash included. Seat removal and refitting is a separate priced option.',
    icon: 'Wind',
    image: 'https://images.unsplash.com/photo-1600320254374-ce2d293c324e?auto=format&fit=crop&w=1200&q=85',
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
    icon: 'WandSparkles',
    image: 'https://images.unsplash.com/photo-1613214150384-4a4e3d5f5c4b?auto=format&fit=crop&w=1200&q=85',
    prices: [
      { label: 'Small Car — Basic', price: 3000 },
      { label: 'Small Car — Premium', price: 8000 },
      { label: 'SUV / Big Car — Basic', price: 5000 },
      { label: 'SUV / Big Car — Premium', price: 10000 },
    ],
  },
];

const CAR_SERVICE_PACKAGES = [
  {
    title: 'Economy Service',
    checkup: '20-point checkup',
    image: 'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?auto=format&fit=crop&w=1200&q=85',
    prices: [
      { label: 'Hatchback / Sedan', price: 3999 },
      { label: 'SUV / Big Car', price: 6999 },
    ],
    covered: [
      'Engine oil — change (Included)',
      'Mobile filter — change (Included)',
      'Air filter — change (Included)',
      'Cabin filter — cleaning only',
      'Coolant — top-up up to 200 ml',
    ],
  },
  {
    title: 'Normal Service',
    checkup: '60-point checkup',
    image: 'https://images.unsplash.com/photo-1632823471565-1ecdf5c1b2a5?auto=format&fit=crop&w=1200&q=85',
    prices: [
      { label: 'Hatchback / Sedan', price: 1500 },
      { label: 'SUV / Big Car', price: 2000 },
    ],
    covered: [
      'Engine oil — change',
      'Mobile filter — change',
      'Air filter — change',
      'Cabin filter — change',
      'Coolant — change',
      'Brake pad — change if required',
      'Fuel filter — change if required',
      'Throttle body cleaning',
    ],
  },
  {
    title: 'Major Service',
    checkup: '62-point checkup',
    image: 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=1200&q=85',
    prices: [
      { label: 'Hatchback / Sedan', price: 5000 },
      { label: 'SUV / Big Car', price: 6000 },
    ],
    covered: [
      'Engine oil — change',
      'Mobile filter — change',
      'Air filter — change',
      'Cabin filter — change',
      'Coolant — change',
      'Brake pad — change if required',
      'Fuel filter — change if required',
      'Throttle body cleaning',
      'Belt replacement — if required',
      'Timing chain replacement — if required',
      'Suspension inspection and replacement — if required',
    ],
  },
];

function getCarEssentialsRequestNote() {
  try {
    const raw = window.sessionStorage.getItem('local_car_essentials_order_v1');
    if (!raw) return '';
    const order = JSON.parse(raw);
    const items = Array.isArray(order.items) ? order.items : [];
    if (!items.length) return '';
    const itemSummary = items.map((item) => `${item.title} × ${item.quantity}`).join('; ');
    return ` Car Essentials order details: ${itemSummary}. Vehicle: ${order.vehicle || 'Not specified'}. Requested delivery location: ${order.deliveryLocation || 'Not specified'}. Product compatibility, stock, final price and delivery charges must be confirmed by the Service Provider before fulfilment.`;
  } catch {
    return '';
  }
}

function getWashPrice(item) {
  const option = CAR_WASH_OPTIONS.find((entry) => entry.title === item?.title);
  const priceOption = option?.prices.find((entry) => entry.label === item?.variant);
  const basePrice = Number(item?.basePrice ?? priceOption?.price);
  const extrasTotal = Array.isArray(item?.addons) ? item.addons.reduce((sum, addon) => sum + (Number(addon.price) || 0), 0) : 0;
  return (Number.isFinite(basePrice) && basePrice > 0 ? basePrice : (Number(priceOption?.price) || 0)) + extrasTotal;
}

function normalizeWashCart(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const option = CAR_WASH_OPTIONS.find((entry) => entry.title === item?.title);
    const priceOption = option?.prices.find((entry) => entry.label === item?.variant);
    const addons = Array.isArray(item?.addons) ? item.addons.map((addon) => ({ id: String(addon.id || addon.label), label: String(addon.label || 'Optional extra'), price: Math.max(0, Number(addon.price) || 0) })) : [];
    const basePrice = Number(item?.basePrice ?? priceOption?.price) || 0;
    const price = basePrice + addons.reduce((sum, addon) => sum + addon.price, 0);
    const qty = Math.max(0, Number.parseInt(item?.qty, 10) || 0);
    return {
      ...item,
      id: item?.id || (item?.title + '::' + item?.variant),
      title: option?.title || String(item?.title || ''),
      variant: priceOption?.label || String(item?.variant || ''),
      basePrice,
      addons,
      price,
      qty,
    };
  }).filter((item) => item.title && item.variant && item.price > 0 && item.qty > 0);
}

export const route = {
  path: '/customer/request',
  layout: 'owner',
  access: "profile === 'Customer_c'",
};

export default function CustomerRequestStart() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const user = useSelector((state) => state.user.user);
  const vehicle = params.get('vehicle') ?? 'car';
  const requestedService = params.get('service') ?? '';
  const issue = params.get('issue') ?? '';
  const displayIssue = requestedService || issue;
  const isCarEssentialsDelivery = requestedService === 'Car Essentials Delivery';
  const isCarFlatPuncture = vehicle === 'car' && /flat tyre \/ puncture/i.test(issue || requestedService);
  const [creating, setCreating] = useState(false);
  const [driverDisclaimerAccepted, setDriverDisclaimerAccepted] = useState(false);
  const [punctureDispatchConsent, setPunctureDispatchConsent] = useState(false);
  const isProfessionalDriverService = ['Car Driver on Demand', 'Hourly Driver', 'Full-Day Driver', 'Full Day Driver', 'Outstation Driver', 'Emergency Driver', 'Scheduled Driver'].includes(requestedService);
  const [location, setLocation] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('local_service_location_c') || 'null');
      if (saved && Number.isFinite(Number(saved.latitude)) && Number.isFinite(Number(saved.longitude))) {
        return { text: saved.label || 'Confirmed service location', latitude: Number(saved.latitude), longitude: Number(saved.longitude), serviceable: saved.serviceable !== false };
      }
    } catch {
      // A fresh location can be confirmed from the location prompt.
    }
    return null;
  });
  const [locationLoading, setLocationLoading] = useState(false);
  const [manualServiceAddress, setManualServiceAddress] = useState('');
  const [problemDetails, setProblemDetails] = useState('');
  const [insuranceFiles, setInsuranceFiles] = useState([]);
  const isInsuranceClaim = vehicle === 'car' && requestedService === 'Insurance Claim Assistance';
  const [washCart, setWashCart] = useState(() => {
    try {
      const saved = window.sessionStorage.getItem('local_car_wash_cart_v2');
      return saved ? normalizeWashCart(JSON.parse(saved)) : [];
    } catch {
      return [];
    }
  });
  const [includePickupDrop, setIncludePickupDrop] = useState(() => window.sessionStorage.getItem('local_car_wash_pickup_v1') === 'true');
  const [washDecisions, setWashDecisions] = useState({});
  const [washAddonSelections, setWashAddonSelections] = useState({});
  const [serviceTiming, setServiceTiming] = useState('ASAP');
  const [scheduledAt, setScheduledAt] = useState('');
  const [selectedCarServicePackage, setSelectedCarServicePackage] = useState(null);
  const isCarWash = vehicle === 'car' && requestedService === 'Car Wash';
  const isCarService = vehicle === 'car' && requestedService === 'Car Service';
  const isDieselRequest = vehicle === 'car' && issue === 'Out of Fuel';
  const isUrgentService = ['Emergency Driver', 'Ambulance'].includes(requestedService) || /jump|battery|tyre|towing|fuel|roadside|breakdown|accident/i.test(issue + ' ' + requestedService);
  // Only classify Car Wash as fixed-price here because this screen currently has an explicit package rate card.
  // Driver rates must be configured before those services can honestly be presented as fixed-price bookings.
  const pricingMode = isUrgentService ? 'Urgent Dispatch' : (isCarWash ? 'Fixed Price' : (isProfessionalDriverService ? 'Driver Booking & Confirmation' : 'Provider Quote'));
  const pricingModeDescription = isCarFlatPuncture
    ? 'Prioritize nearby available help for faster assistance. No bidding.'
    : isProfessionalDriverService
      ? 'Submit your request. LOCAL Customer Care will confirm driver availability, your schedule and the applicable charges before confirming your booking.'
      : isCarWash
        ? 'Submit your selected menu quote. LOCAL Customer Care will call to confirm details and pickup/drop, then send any revised quote for your approval before work starts.'
        : pricingMode === 'Fixed Price'
        ? 'See the listed price and book without waiting for bids.'
        : pricingMode === 'Urgent Dispatch'
          ? 'Prioritize available nearby help, arrival time and transparent pricing. No bidding.'
          : 'LOCAL Customer Care will contact you and arrange a suitable provider. Any additional work is explained before you approve it.';
  const language = getLanguage();
  // Keep all cart calculations based on the same normalized item list.
  const normalizedWashCart = normalizeWashCart(washCart);
  // Derive every cart figure from this single normalized snapshot.
  const cartItemCount = normalizedWashCart.reduce((sum, item) => sum + item.qty, 0);
  const cartSubtotal = normalizedWashCart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const [carWashOffer, setCarWashOffer] = useState('');
  const [totalRefreshed, setTotalRefreshed] = useState(() => window.sessionStorage.getItem('local_car_wash_total_refreshed_v1') === 'true');
  const estimatedTotalValue = cartSubtotal + (includePickupDrop ? 100 : 0);
  const [showTotalBilling, setShowTotalBilling] = useState(false);

  // The highlighted Estimated Total Value control confirms and saves the latest cart total.
  function refreshEstimatedTotal() {
    const currentCart = normalizeWashCart(washCart);
    const nextSubtotal = currentCart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const nextTotal = nextSubtotal + (includePickupDrop ? 100 : 0);
    window.sessionStorage.setItem('local_car_wash_cart_v2', JSON.stringify(currentCart));
    window.sessionStorage.setItem('local_car_wash_pickup_v1', String(includePickupDrop));
    window.sessionStorage.setItem('local_car_wash_total_refreshed_v1', 'true');
    setTotalRefreshed(true);
    setShowTotalBilling(true);
    toast.success('Estimated total updated: ₹' + nextTotal.toLocaleString('en-IN'));
  }

  useEffect(() => {
    // A displayed calculation is valid only for the exact cart state that was reviewed.
    // Any add/remove or Pickup & Drop change invalidates the previous master calculation.
    window.sessionStorage.removeItem('local_car_wash_total_refreshed_v1');
    setTotalRefreshed(false);
    setShowTotalBilling(false);
  }, [washCart, includePickupDrop]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem('local_car_wash_cart_v2', JSON.stringify(normalizedWashCart));
      window.sessionStorage.setItem('local_car_wash_pickup_v1', String(includePickupDrop));
    } catch {
      // The cart still works for the current page if session storage is unavailable.
    }
  }, [normalizedWashCart, includePickupDrop]);

  function addWashItem(option, priceOption) {
    window.sessionStorage.removeItem('local_car_wash_total_refreshed_v1');
    setTotalRefreshed(false);
    const baseId = option.title + '::' + priceOption.label;
    const availableAddon = priceOption.extra
      ? option.title === 'Exterior Only'
        ? { id: 'body-polish', label: 'Body Polish', price: /SUV|Big Car/i.test(priceOption.label) ? 500 : 200 }
        : option.title === 'Interior Deep Clean'
          ? { id: 'seat-removal-refitting', label: 'Removal + Refitting of Seats', price: 500 }
          : null
      : null;
    const addons = availableAddon && washAddonSelections[baseId] ? [availableAddon] : [];
    const id = baseId + (addons.length ? '::addons:' + addons.map((addon) => addon.id).join(',') : '');
    const unitPrice = priceOption.price + addons.reduce((sum, addon) => sum + addon.price, 0);
    setWashCart((current) => {
      const existing = current.find((item) => item.id === id);
      return existing
        ? current.map((item) => item.id === id ? { ...item, qty: item.qty + 1 } : item)
        : [...current, { id, title: option.title, variant: priceOption.label, basePrice: priceOption.price, addons, price: unitPrice, qty: 1 }];
    });
    toast.success(option.title + (addons.length ? ' with ' + addons.map((addon) => addon.label).join(', ') : '') + ' added to cart.');
  }

  function changeWashQty(id, delta) {
    window.sessionStorage.removeItem('local_car_wash_total_refreshed_v1');
    setTotalRefreshed(false);
    setWashCart((current) => current
      .map((item) => item.id === id ? { ...item, qty: Math.max(0, item.qty + delta) } : item)
      .filter((item) => item.qty > 0));
  }

  const { data: customer } = useFetch(
    async () => {
      const email = String(user?.emailAddress ?? user?.email ?? '').trim().toLowerCase();
      if (!email) return null;

      const res = await sdk
        .table('customer_profiles_c')
        .select(['Id', 'Name', 'email_c', 'location_c', 'latitude_c', 'longitude_c'])
        .where(eq('email_c', user?.emailAddress ?? user?.email ?? ''))
        .page(1, 100)
        .fetch();

      if (!res.success) throw new Error(res.message || 'Could not look up your customer profile.');
      const exactMatch = (res.data ?? []).find((item) => String(item.email_c ?? '').trim().toLowerCase() === email);
      if (exactMatch) return exactMatch;

      // Fall back to a bounded lookup for legacy records whose email casing differs.
      const fallback = await sdk.table('customer_profiles_c')
        .select(['Id', 'Name', 'email_c', 'location_c', 'latitude_c', 'longitude_c'])
        .page(1, 1000)
        .fetch();
      if (!fallback.success) throw new Error(fallback.message || 'Could not look up your customer profile.');
      return (fallback.data ?? []).find((item) => String(item.email_c ?? '').trim().toLowerCase() === email) ?? null;
    },
    [user?.emailAddress, user?.email],
  );

  const isOtherIssue = issue === 'Other Issue' && !requestedService;
  const categoryName = VEHICLE_CATEGORY[vehicle] ?? 'Car Assistance';
  const { data: category } = useFetch(
    () => sdk.table('service_categories_c').select(['Id', 'Name', 'status_c']).where(eq('Name', categoryName)).page(1, 1).fetch().then((res) => res.data?.[0] ?? null),
    [categoryName],
  );
  const capabilityName = getCapabilityName(issue, vehicle, requestedService);
  const { data: capabilities } = useFetch(
    () => getCapabilityCatalog(),
    [],
  );
  const requiredCapability = capabilities?.find((item) => item.Name === capabilityName);

  useEffect(() => {
    if (!issue) navigate('/customer/vehicle/' + vehicle);
  }, [issue, vehicle, navigate]);

  function useDemoLocation() {
    try {
      const saved = JSON.parse(window.localStorage.getItem('local_service_location_c') || 'null');
      if (!saved || !Number.isFinite(Number(saved.latitude)) || !Number.isFinite(Number(saved.longitude))) {
        toast.error('Please confirm your current or manual service location from the location prompt first.');
        return;
      }
      setLocation({
        text: saved.label || 'Confirmed service location',
        latitude: Number(saved.latitude),
        longitude: Number(saved.longitude),
        serviceable: saved.serviceable !== false,
      });
      toast.success('Confirmed service location applied.');
    } catch {
      toast.error('Could not load your confirmed service location. Please try again.');
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      toast.error(tr('Browser location is not available. Enter the service address manually.', language));
      return;
    }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          text: 'Current location',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          source: 'device GPS',
        });
        setManualServiceAddress('');
        setLocationLoading(false);
      },
      () => {
        setLocationLoading(false);
        toast.error(tr('Location permission was not granted. You can enter the service address manually.', language));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }

  async function useManualServiceAddress(event) {
    event.preventDefault();
    const query = manualServiceAddress.trim();
    if (query.length < 3) {
      toast.error('Enter a complete locality or address to continue.');
      return;
    }
    setLocationLoading(true);
    try {
      // Prefer the LOCAL launch city for ambiguous locality names (e.g. "Civil Lines"),
      // but still accept a fully specified address in another city so coverage can be checked.
      const hasExplicitCity = /prayagraj|allahabad|delhi|kanpur|lucknow|varanasi|noida|ghaziabad|mumbai|kolkata|chennai|bengaluru|hyderabad|pune|jaipur|agra/i.test(query);
      const searchQueries = hasExplicitCity ? [query] : [query + ', Prayagraj, Uttar Pradesh, India', query + ', India'];
      let results = [];
      for (const searchQuery of searchQueries) {
        const response = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=in&q=' + encodeURIComponent(searchQuery));
        if (!response.ok) throw new Error('Address lookup unavailable');
        const candidates = await response.json();
        if (candidates.length) {
          results = candidates;
          break;
        }
      }
      if (!results.length) {
        toast.error('We could not find that address. Try adding the locality, city and state.');
        return;
      }
      const distanceFromLaunch = (candidate) => {
        const lat = Number(candidate.lat);
        const lon = Number(candidate.lon);
        const toRad = (value) => value * Math.PI / 180;
        const dLat = toRad(lat - 25.382);
        const dLon = toRad(lon - 81.875);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(25.382)) * Math.cos(toRad(lat)) * Math.sin(dLon / 2) ** 2;
        return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };
      const result = [...results].sort((a, b) => distanceFromLaunch(a) - distanceFromLaunch(b))[0];
      const latitude = Number(result.lat);
      const longitude = Number(result.lon);
      const distance = distanceFromLaunch(result);
      const confirmed = {
        text: result.display_name.split(',').slice(0, 4).join(', '),
        latitude,
        longitude,
        serviceable: distance <= 25,
        source: 'manual address',
      };
      setLocation(confirmed);
      toast.success(confirmed.serviceable ? 'Service address confirmed for this booking.' : 'Address found, but it appears outside the current Naini/Prayagraj launch area.');
    } catch {
      toast.error('Address lookup is temporarily unavailable. Please try again or use current location.');
    } finally {
      setLocationLoading(false);
    }
  }

  async function createRequest() {
    if (isCarFlatPuncture && !punctureDispatchConsent) {
      toast.error('Please accept the puncture pricing and cancellation policy before dispatch.');
      return;
    }
    if (isProfessionalDriverService && !driverDisclaimerAccepted) {
      toast.error('Please read and accept the Safety & Liability Disclaimer before continuing.');
      return;
    }
    if (!customer?.Id) {
      toast.error('Your LOCAL customer profile is missing or does not match your login email. Complete My Profile, save it, then retry your booking.');
      navigate('/customer/profile');
      return;
    }
    if (!category?.Id) {
      toast.error(tr('The selected service is not configured yet.', language));
      return;
    }
    if (!requiredCapability?.Id) {
      toast.error(tr('The selected problem is not yet mapped to a Service Provider capability.', language));
      return;
    }
    if (isCarWash && washCart.length === 0) {
      toast.error('Add at least one Car Wash service to your cart.');
      return;
    }
    const customerWashOffer = isCarWash ? estimatedTotalValue : null;
    if (isCarWash && (!Number.isFinite(customerWashOffer) || customerWashOffer <= 0)) {
      toast.error('Please select at least one valid priced wash option.');
      return;
    }
    if (isCarService && !selectedCarServicePackage) {
      toast.error('Please select a Car Service package and vehicle type.');
      return;
    }
    if (!location) {
      toast.error(tr('Please confirm your location first.', language));
      return;
    }
    if (location.serviceable === false) {
      toast.error('LOCAL bookings are not available at this location yet. Please choose a service location within the current Naini/Prayagraj coverage area.');
      return;
    }
    if (isOtherIssue && !isCarEssentialsDelivery && !problemDetails.trim()) {
      toast.error(tr('Please describe the problem before continuing.', language));
      return;
    }
    if (serviceTiming === 'Scheduled') {
      const selectedDate = new Date(scheduledAt);
      if (!scheduledAt || Number.isNaN(selectedDate.getTime()) || selectedDate.getTime() <= Date.now()) {
        toast.error('Choose a future date and time for the scheduled service.');
        return;
      }
    }

    setCreating(true);
    try {
      const res = await sdk.table('service_requests_c').create({
        Name: vehicle.toUpperCase() + ' • ' + (isCarWash ? 'Car Wash (' + washCart.reduce((sum, item) => sum + item.qty, 0) + ' items)' : isCarService && selectedCarServicePackage ? selectedCarServicePackage.title + ' — ' + selectedCarServicePackage.vehicleType : displayIssue),
        customer_c: customer.Id,
        service_category_c: category.Id,
        required_capability_c: requiredCapability.Id,
        problem_description_c: (requestedService
          ? (isCarWash ? 'Customer submitted this Car Wash quote for Customer Care review and a confirmation call. Selected options: ' + normalizedWashCart.map((item) => item.title + ' — ' + item.variant + ' × ' + item.qty + ' = ₹' + (item.price * item.qty).toLocaleString('en-IN')).join('; ') + (includePickupDrop ? '; Pickup & Drop requested — indicative menu charge ₹100, subject to Customer Care location confirmation' : '; Pickup & Drop not requested yet — Customer Care to ask during confirmation call') + '. Customer menu estimate: ₹' + estimatedTotalValue.toLocaleString('en-IN') + '. This is the customer-submitted menu quote, not a final confirmed bill. Customer Care must call, confirm vehicle/location and pickup/drop requirement, then issue a revised quote for customer approval if the total changes. Do not start work until the customer approves the final quote. CAR_WASH_DECISIONS_JSON:' + JSON.stringify(normalizedWashCart.map((item) => ({ id: item.id, title: item.title, variant: item.variant, quantity: item.qty, baseUnitPrice: item.basePrice, listedUnitPrice: item.price, decision: 'customer_selected', proposedUnitPrice: null })).concat(includePickupDrop ? [{ id: 'pickup-drop', title: 'Pickup & Drop', variant: 'Requested', quantity: 1, listedUnitPrice: 100, decision: 'customer_requested', proposedUnitPrice: null, fixed: true }] : [])) : isCarService && selectedCarServicePackage ? selectedCarServicePackage.title + ' (' + selectedCarServicePackage.checkup + ') — ' + selectedCarServicePackage.vehicleType + '. Listed package price: ₹' + selectedCarServicePackage.price.toLocaleString('en-IN') + '. Covered items: ' + selectedCarServicePackage.covered.join('; ') + '. Customer selected this package and requests provider availability/confirmation through the normal offer flow.' : requestedService) + ' for their car.'
          : isOtherIssue
            ? problemDetails.trim()
            : 'Customer selected ' + issue + ' for ' + vehicle.toUpperCase() + '.') + (isCarFlatPuncture ? '\\nLOCAL_PUNCTURE_DISPATCH_CONSENT_JSON:' + JSON.stringify({ accepted: true, acceptedAt: new Date().toISOString(), pricePerPuncture: 150, visitChargeWithin10Km: 200, platformFee: 25, cancellationPolicy: { beforeProviderAcceptance: 0, afterAcceptanceBeforeTravel: 0, afterTravelBeforeArrival: 0, afterArrivalOrQuoteDeclined: 200, providerFault: 0 }, policyVersion: 1 }) : '') + (requestedService === 'Car Essentials Delivery' ? getCarEssentialsRequestNote() : '') + (isInsuranceClaim && insuranceFiles.length ? ' Insurance copy files selected: ' + insuranceFiles.map((file) => file.name).join(', ') + '. Demo preview records file names only; files are not securely uploaded or stored.' : ''),
        location_c: location.text,
        // LOCAL's current demo rollout is Prayagraj; this city-level service area gates provider visibility.
        service_area_c: 'Prayagraj',
        latitude_c: Number(location.latitude),
        longitude_c: Number(location.longitude),
        status_c: 'Open',
        preferred_time_c: serviceTiming,
        requested_at_c: new Date().toISOString(),
        scheduled_at_c: serviceTiming === 'Scheduled' ? new Date(scheduledAt).toISOString() : null,
        service_mode_c: isUrgentService && serviceTiming === 'ASAP' ? 'Urgent' : 'Normal',
        pricing_mode_c: pricingMode,
        pricing_mode_description_c: pricingModeDescription,
      });
      if (!res.data?.length) {
        toast.error(res.messages?.[0] ?? 'Service request was not created.');
        return;
      }
      if (requestedService === 'Car Essentials Delivery') window.sessionStorage.removeItem('local_car_essentials_order_v1');
      toast.success(isCarWash ? 'Car Wash quote submitted for LOCAL Customer Care review.' : tr('Request shared with eligible nearby Service Providers.', language));
      navigate('/requests/' + res.data[0].Id);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      {isCarWash ? (
        <div className="mb-5 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="relative h-40 sm:h-56">
            <img src="https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=1800&q=90" alt="Professional car wash and detailing" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-950/45 to-transparent" />
            <div className="absolute inset-y-0 left-0 flex max-w-xl flex-col justify-center p-5 text-white sm:p-8">
              <span className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">LOCAL Car Care</span>
              <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">A cleaner car. A better drive.</h1>
              <p className="mt-2 max-w-md text-sm text-white/85 sm:text-base">Choose your wash, add the extras you need, and review your estimated total before LOCAL Customer Care confirms the final quote.</p>
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-border bg-background px-2 py-3 text-center sm:px-5">
            <div className="px-1"><ApperIcon name="Sparkles" size={19} className="mx-auto text-primary" /><p className="mt-1 text-xs font-semibold sm:text-sm">Quality care</p></div>
            <div className="px-1"><ApperIcon name="BadgeIndianRupee" size={19} className="mx-auto text-primary" /><p className="mt-1 text-xs font-semibold sm:text-sm">Clear prices</p></div>
            <div className="px-1"><ApperIcon name="Headset" size={19} className="mx-auto text-primary" /><p className="mt-1 text-xs font-semibold sm:text-sm">LOCAL support</p></div>
          </div>
        </div>
      ) : (
        <PageHeader
          eyebrow={vehicle.toUpperCase() + ' ' + tr('assistance', language)}
          title={tr(displayIssue, language)}
          description={tr('Confirm your location and we will share the request only with Service Providers who have the required capability.', language)}
          action={
            <Button asChild variant="outline">
              <span onClick={() => navigate(['Hourly Driver', 'Full-Day Driver', 'Full Day Driver', 'Outstation Driver', 'Emergency Driver', 'Scheduled Driver'].includes(requestedService) ? '/customer/car-driver' : requestedService === 'Car Wash' || requestedService === 'Car Service' || requestedService === 'Insurance Claim Assistance' ? '/customer/car-care' : '/customer/vehicle/' + vehicle)}>{tr('Change problem', language)}</span>
            </Button>
          }
        />
      )}
      {isCarService && (
        <section className="mx-auto mb-6 max-w-5xl space-y-5" aria-label="Car Service packages">
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="relative h-40 sm:h-52">
              <img src="https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?auto=format&fit=crop&w=1800&q=90" alt="Mechanic servicing a car in a workshop" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-950/45 to-transparent" />
              <div className="absolute inset-y-0 left-0 flex max-w-xl flex-col justify-center p-5 text-white sm:p-8">
                <span className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">LOCAL Car Care</span>
                <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Service with clarity.</h2>
                <p className="mt-2 max-w-md text-sm text-white/85 sm:text-base">Compare service packages and inclusions. Any additional repair must be explained and approved before work begins.</p>
              </div>
            </div>
            <div className="p-4 sm:p-5">
              <h2 className="text-xl font-bold sm:text-2xl">Choose your service package</h2>
              <p className="mt-1 text-sm text-muted-foreground">Compare package coverage and listed prices for your vehicle type. Final work and price are confirmed before service starts.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {CAR_SERVICE_PACKAGES.map((pkg) => (
              <Card key={pkg.title} className={'flex h-full flex-col overflow-hidden rounded-2xl border p-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg ' + (selectedCarServicePackage?.title === pkg.title ? 'border-primary ring-2 ring-primary/20' : 'border-border/70')}>
                <div className="relative h-40 sm:h-44">
                  <img src={pkg.image} alt={pkg.title + ' automotive service'} loading="lazy" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                    <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">{pkg.checkup}</p>
                    <h3 className="mt-1 text-xl font-bold">{pkg.title}</h3>
                  </div>
                </div>
                <div className="flex flex-1 flex-col p-4 sm:p-5">
                  <div className="mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-muted-foreground"><span>Select vehicle type</span><span>Listed price</span></div>
                  <div className="space-y-3">
                    {pkg.prices.map((price) => {
                      const isSelected = selectedCarServicePackage?.title === pkg.title && selectedCarServicePackage?.vehicleType === price.label;
                      return (
                        <div key={price.label} className={'rounded-lg border px-3 py-3 ' + (isSelected ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'bg-primary/5')}>
                          <div className="flex items-center justify-between gap-3">
                            <span className="flex items-center gap-2 text-sm font-semibold"><ApperIcon name={/SUV|Big Car/i.test(price.label) ? 'Truck' : 'CarFront'} size={18} className="text-primary" />{price.label}</span>
                            <span className="shrink-0 text-lg font-extrabold">₹{price.price.toLocaleString('en-IN')}</span>
                          </div>
                          <Button type="button" size="sm" variant={isSelected ? 'default' : 'outline'} className="mt-3 min-h-10 w-full rounded-xl" onClick={() => setSelectedCarServicePackage({ title: pkg.title, checkup: pkg.checkup, vehicleType: price.label, price: price.price, covered: pkg.covered })}>
                            <ApperIcon name={isSelected ? 'CheckCircle2' : 'ArrowRight'} size={16} />{isSelected ? 'Package selected' : 'Choose package'}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
                  <div className="mt-5 border-t border-border pt-4">
                    <h4 className="mb-3 flex items-center gap-2 text-sm font-bold"><ApperIcon name="ClipboardCheck" size={17} className="text-primary" />What's included</h4>
                    <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                      {pkg.covered.map((item) => <li key={item} className="flex items-start gap-2"><ApperIcon name="Check" size={15} className="mt-0.5 shrink-0 text-emerald-600" /><span>{item}</span></li>)}
                    </ul>
                  </div>
              </Card>
            ))}
          </div>
        </section>
      )}
      {isCarWash && (
        <section className="mx-auto mb-4 max-w-5xl space-y-3" aria-label="Car Wash service packages">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div><h2 className="text-xl font-bold sm:text-2xl">Pick your wash package</h2><p className="mt-1 text-sm text-muted-foreground">Select a package for your car and review the listed price before adding it.</p></div>
            <span className="rounded-full border border-emerald-600/20 bg-emerald-600/10 px-3 py-1.5 text-xs font-bold text-emerald-700">Transparent menu pricing</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {CAR_WASH_OPTIONS.map((option) => (
              <Card key={option.title} className="group flex flex-col self-start overflow-hidden rounded-2xl border border-border/70 bg-card p-0 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
                <div className="relative h-36 sm:h-44">
                  <img src={option.image} alt={option.title + ' car wash service'} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/10 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-3 sm:p-4">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/95 text-slate-900 shadow-sm"><ApperIcon name={option.icon} size={22} /></div>
                    <div className="min-w-0 text-white"><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300">LOCAL WASH PACKAGE</div><h3 className="text-lg font-bold leading-snug sm:text-xl">{option.title}</h3></div>
                  </div>
                </div>
                <div className="flex flex-col p-3 sm:p-4">
                  <p className="mb-3 text-sm leading-relaxed text-muted-foreground">{option.description}</p>
                  <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground"><span>Vehicle &amp; price</span><span>INR</span></div>
                  <div className="grid content-start gap-2">
                  {option.prices.map((priceOption) => {
                    const id = option.title + '::' + priceOption.label;
                    const qty = washCart.find((item) => item.id === id)?.qty ?? 0;
                    return (
                      <div key={priceOption.label} className={'rounded-xl border p-3 transition-colors ' + (qty ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border/80 bg-background hover:border-primary/30')}>
                        <div className="flex items-start gap-2">
                          <div className={'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ' + (/SUV|Big Car/i.test(priceOption.label) ? 'bg-sky-500/10 text-sky-700' : 'bg-primary/10 text-primary')}><ApperIcon name={/SUV|Big Car/i.test(priceOption.label) ? 'Truck' : 'CarFront'} size={17} /></div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold leading-snug sm:text-sm">{priceOption.label}</div>
                            <div className="mt-1 text-xl font-extrabold tracking-tight">₹{priceOption.price.toLocaleString('en-IN')}</div>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            className="min-h-10 shrink-0 rounded-xl px-3"
                            variant={qty ? 'outline' : 'default'}
                            onClick={() => {
                              if (qty) {
                                window.sessionStorage.removeItem('local_car_wash_total_refreshed_v1');
                                setTotalRefreshed(false);
                                setShowTotalBilling(false);
                                setWashCart((current) => current.filter((item) => !(item.title === option.title && item.variant === priceOption.label)));
                                toast.success(priceOption.label + ' removed from selection.');
                              } else {
                                addWashItem(option, priceOption);
                              }
                            }}
                          >
                            {qty ? 'Unselect' : 'Select'}
                          </Button>
                        </div>

                      </div>
                    );
                  })}
                  </div>
                </div>
              </Card>
            ))}
            <Card className={'flex flex-col self-start overflow-hidden rounded-2xl border p-0 shadow-sm ' + (includePickupDrop ? 'border-primary ring-2 ring-primary/20' : 'border-border/70')}>
              <div className="relative h-36 sm:h-44"><img src="https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=85" alt="Car ready for collection and return" loading="lazy" className="h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent" /><div className="absolute bottom-0 p-4 text-white"><div className="text-xs font-bold uppercase tracking-wider text-emerald-300">Optional convenience</div><h3 className="mt-1 text-xl font-bold">Pickup &amp; Drop</h3></div></div>
              <div className="flex flex-1 flex-col p-4"><p className="text-sm leading-relaxed text-muted-foreground">Have your car collected and returned. LOCAL Customer Care confirms the final charge after checking your location.</p><p className="mt-3 text-2xl font-extrabold">₹100 <span className="text-xs font-medium text-muted-foreground">indicative charge</span></p><Button type="button" className="mt-4 min-h-11 w-full rounded-xl" variant={includePickupDrop ? 'outline' : 'default'} onClick={() => { window.sessionStorage.removeItem('local_car_wash_total_refreshed_v1'); setTotalRefreshed(false); setIncludePickupDrop((value) => !value); }}>{includePickupDrop ? 'Remove Pickup & Drop' : 'Request Pickup & Drop'}</Button></div>
            </Card>
          </div>
          <Card className="overflow-hidden rounded-2xl border border-primary/20 p-0 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-primary/5 p-4 sm:p-5">
              <div className="flex items-center gap-3"><div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"><ApperIcon name="ShoppingBag" size={21} /></div><div><h3 className="text-lg font-bold">Your selected services</h3><p className="mt-0.5 text-sm text-muted-foreground">{cartItemCount} {cartItemCount === 1 ? 'item' : 'items'} · Subtotal ₹{cartSubtotal.toLocaleString('en-IN')}</p></div></div>
              <Button type="button" variant="outline" onClick={() => { setWashCart([]); setIncludePickupDrop(false); setTotalRefreshed(false); window.sessionStorage.removeItem('local_car_wash_total_refreshed_v1'); window.sessionStorage.removeItem('local_car_wash_cart_v1'); window.sessionStorage.removeItem('local_car_wash_pickup_v1'); }} disabled={!washCart.length && !includePickupDrop}>Clear cart</Button>
            </div>
            <div className="space-y-3 p-4 sm:p-5">
              {!washCart.length && !includePickupDrop ? <div className="rounded-xl border border-dashed border-border p-6 text-center"><div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><ApperIcon name="ShoppingCart" size={23} /></div><p className="mt-3 font-semibold">Your selection is empty</p><p className="mt-1 text-sm text-muted-foreground">Choose a wash package above to get started.</p></div> : <>
                {normalizedWashCart.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-background p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0 flex-1"><div className="font-medium">{item.title}</div><div className="text-sm text-muted-foreground">{item.variant}</div>{item.addons?.length > 0 && <div className="mt-1 text-xs font-medium text-primary">Extras: {item.addons.map((addon) => addon.label + ' +₹' + addon.price).join(', ')}</div>}</div><div className="flex items-center gap-4"><span className="whitespace-nowrap font-semibold">₹{(getWashPrice(item) * item.qty).toLocaleString('en-IN')}</span><Button type="button" size="sm" variant="ghost" onClick={() => { window.sessionStorage.removeItem('local_car_wash_total_refreshed_v1'); setTotalRefreshed(false); setWashCart((current) => current.filter((entry) => entry.id !== item.id)); }}>Remove</Button></div></div>
                    
                  </div>
                ))}
                {includePickupDrop && <div className="flex items-center justify-between rounded-lg border p-3"><div><div className="font-medium">Pickup &amp; Drop</div><div className="text-sm text-muted-foreground">Optional service</div></div><div className="flex items-center gap-3"><span className="font-semibold">₹100</span><Button type="button" size="sm" variant="ghost" onClick={() => { window.sessionStorage.removeItem('local_car_wash_total_refreshed_v1'); setTotalRefreshed(false); setIncludePickupDrop(false); }}>Remove</Button></div></div>}
              </>}
            </div>
            <div className="rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 to-transparent p-4">
              <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Estimated service subtotal</p><p className="mt-0.5 text-xs text-muted-foreground">Final quote is reviewed by LOCAL Customer Care</p></div><p className="text-2xl font-extrabold tracking-tight">₹{(cartSubtotal + (includePickupDrop ? 100 : 0)).toLocaleString('en-IN')}</p></div>
              <Button type="button" className="mt-4 w-full rounded-xl" onClick={() => { setShowTotalBilling(true); window.sessionStorage.setItem('local_car_wash_cart_v2', JSON.stringify(normalizedWashCart)); window.sessionStorage.setItem('local_car_wash_pickup_v1', String(includePickupDrop)); }} disabled={!normalizedWashCart.length && !includePickupDrop}><ApperIcon name="Calculator" size={17} /> Review estimated total</Button>
              {showTotalBilling && <div className="mt-3 flex items-center justify-between rounded-lg border border-primary/25 bg-background px-3 py-2"><span className="text-sm font-semibold">Total billing estimate</span><span className="text-lg font-extrabold">₹{(cartSubtotal + (includePickupDrop ? 100 : 0)).toLocaleString('en-IN')}</span></div>}
            </div>
          </Card>
        </section>
      )}
      <section className="mx-auto mb-4 max-w-4xl"><h2 className="text-xl font-semibold">Book Your Service with LOCAL</h2></section><div className="mx-auto grid max-w-4xl gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-2 border-primary/20 p-6">
          <div className="flex items-center gap-4">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ApperIcon name={vehicle === 'car' ? 'Car' : 'Bike'} size={34} />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Service Selected</div>
              <div className="mt-1 text-lg font-semibold">{tr(isDieselRequest ? 'Diesel on Demand' : displayIssue, language)}</div>
            </div>
          </div>
          {isDieselRequest ? (
            <div className="mt-5 rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center gap-2 font-semibold"><ApperIcon name="Fuel" size={18} />Diesel Cost &amp; Delivery Charges</div>
              <div className="mt-3 space-y-3 text-sm">
                <div><div className="font-semibold">Diesel Cost</div><p className="mt-1 text-muted-foreground">As per actual diesel price.</p></div>
                <div><div className="font-semibold">Delivery Charges</div><p className="mt-1 text-muted-foreground">Based on distance and delivery time.</p></div>
              </div>
              <p className="mt-3 border-t border-primary/15 pt-3 text-sm font-medium">Final amount = Actual diesel cost + Delivery charges</p>
            </div>
          ) : (
            <div className="mt-5 rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center gap-2 font-semibold"><ApperIcon name={pricingMode === 'Fixed Price' ? 'BadgeIndianRupee' : pricingMode === 'Urgent Dispatch' ? 'Zap' : 'MessagesSquare'} size={18} />{pricingMode}</div>
              <p className="mt-1 text-sm text-muted-foreground">{pricingModeDescription}</p>
            </div>
          )}
          {isCarFlatPuncture && (
            <section className="mt-5 rounded-xl border border-primary/25 bg-primary/5 p-4" aria-labelledby="puncture-pricing-title">
              <div className="flex items-center gap-2 font-semibold" id="puncture-pricing-title"><ApperIcon name="BadgeIndianRupee" size={18} /> Flat Tyre / Puncture — Transparent Pricing</div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3"><span>Puncture repair</span><strong>₹150 per puncture</strong></div>
                <div className="flex items-center justify-between gap-3"><span>Travel / visit charge</span><strong>₹200 within 10 km</strong></div>
                <div className="flex items-center justify-between gap-3"><span>LOCAL Platform Fee</span><strong>₹25 per booking</strong></div>
              </div>
              <div className="mt-3 border-t border-primary/15 pt-3 text-sm font-medium">Total = (₹150 × actual punctures repaired) + ₹200 visit charge + ₹25 Platform Fee.</div>
              <p className="mt-2 text-sm text-muted-foreground">The provider will inspect your tyre(s) on arrival and confirm the number of punctures. You will see the final itemized quote and must approve it before any repair begins. The ₹200 visit charge applies within 10 km; if your location is beyond 10 km, the applicable visit charge must be confirmed and shown before booking confirmation.</p>
              <p className="mt-2 text-sm">Cancellation policy: ₹0 before provider acceptance, before travel starts, or if the provider is at fault. If the provider has arrived and you cancel or decline the inspected quote, the ₹200 visit charge applies within 10 km. This is the same visit charge, not an extra fee. No charge is applied merely because the provider has started travelling in this initial version.</p>
              <p className="mt-2 text-xs text-muted-foreground">No advance or partial payment. Pay the approved final repair amount after the work is completed. Beyond 10 km, LOCAL must disclose and obtain acceptance of the applicable visit charge before dispatch.</p>
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border bg-background p-3 text-sm">
                <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-primary" checked={punctureDispatchConsent} onChange={(event) => setPunctureDispatchConsent(event.target.checked)} />
                <span>I agree to the displayed puncture pricing and cancellation policy. I authorize LOCAL to find and notify a service provider. I understand that repair work can begin only after I approve the final itemized quote.</span>
              </label>
            </section>
          )}
          {isProfessionalDriverService && (
            <section className="mt-6 rounded-xl border-2 border-amber-500/50 bg-amber-500/5 p-4" aria-labelledby="driver-safety-disclaimer-title">
              <h2 id="driver-safety-disclaimer-title" className="text-base font-bold">Safety &amp; Liability Disclaimer</h2>
              <div className="mt-3 space-y-3 text-sm leading-relaxed text-foreground">
                <p>LOCAL connects customers with professional drivers who drive the customer's own vehicle. The customer is responsible for ensuring that the vehicle is roadworthy and has valid insurance applicable to its intended use and the assigned driver.</p>
                <p>The driver must hold a valid driving licence and comply with applicable traffic laws. LOCAL facilitates the connection and does not guarantee accident-free travel.</p>
                <p>Any accident, injury, loss or damage will be handled according to applicable law and the relevant insurance policy. The driver and LOCAL are not exempt from liability that the law imposes, including liability arising from their own acts or omissions.</p>
                <p className="text-xs text-muted-foreground">This disclaimer does not remove any rights or responsibilities that cannot legally be excluded. Please read the full Professional Driver Service terms before booking.</p>
              </div>
              <label htmlFor="driver-disclaimer-accept" className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border bg-background p-3 font-semibold">
                <input id="driver-disclaimer-accept" type="checkbox" checked={driverDisclaimerAccepted} onChange={(event) => setDriverDisclaimerAccepted(event.target.checked)} className="mt-1 size-4 shrink-0 accent-primary" />
                <span>I have read and understood the Safety &amp; Liability Disclaimer and agree to proceed.</span>
              </label>
              {!driverDisclaimerAccepted && <p className="mt-2 text-xs font-medium text-amber-700">Required: tick the checkbox to continue with this driver booking.</p>}
            </section>
          )}
          {isInsuranceClaim && (
            <div className="mt-6 rounded-xl border-2 border-primary/20 bg-background p-4">
              <label htmlFor="insurance-copy-upload" className="text-sm font-semibold">Upload Insurance Copy</label>
              <p className="mt-1 text-sm text-muted-foreground">Select your insurance policy copy or related claim documents (PDF, JPG, or PNG; you may select multiple files).</p>
              <Input id="insurance-copy-upload" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" multiple onChange={(event) => setInsuranceFiles(Array.from(event.target.files ?? []))} className="mt-3 cursor-pointer" />
              {insuranceFiles.length > 0 && <ul className="mt-3 space-y-1 text-sm text-muted-foreground">{insuranceFiles.map((file, index) => <li key={file.name + '-' + index} className="flex items-center gap-2"><ApperIcon name="FileCheck" size={15} />{file.name} <span>({Math.max(1, Math.round(file.size / 1024))} KB)</span></li>)}</ul>}
              <p className="mt-2 text-xs text-muted-foreground">Document upload is a demo control; secure file storage will be connected when the backend is configured.</p>
            </div>
          )}
          {isOtherIssue && !isInsuranceClaim && !isCarEssentialsDelivery && (
            <div className="mt-6 rounded-xl border-2 border-primary/20 bg-background p-4">
              <label htmlFor="other-issue-details" className="text-sm font-semibold">
                {tr('Tell us what happened', language)}
              </label>
              <p className="mt-1 text-sm text-muted-foreground">
                {tr('Describe the problem so Service Providers can understand it and send you an accurate offer.', language)}
              </p>
              <Textarea
                id="other-issue-details"
                value={problemDetails}
                onChange={(event) => setProblemDetails(event.target.value)}
                placeholder={tr('Example: My car suddenly stopped and now it will not start.', language)}
                className="mt-3 min-h-32 resize-none"
                maxLength={500}
              />
              <div className="mt-1 text-right text-xs text-muted-foreground">
                {problemDetails.length}/500
              </div>
            </div>
          )}
        </Card>
        <Card className="p-6">
          <div className="text-sm font-semibold">When do you need the service?</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button type="button" variant={serviceTiming === 'ASAP' ? 'default' : 'outline'} onClick={() => setServiceTiming('ASAP')}><ApperIcon name="Zap" size={16} /> Book Now</Button>
            <Button type="button" variant={serviceTiming === 'Scheduled' ? 'default' : 'outline'} onClick={() => setServiceTiming('Scheduled')}><ApperIcon name="CalendarClock" size={16} /> Schedule for Later</Button>
          </div>
          {serviceTiming === 'Scheduled' && <div className="mt-3"><label htmlFor="requested-service-time" className="text-sm font-medium">Choose date and time</label><Input id="requested-service-time" type="datetime-local" min={new Date(Date.now() + 60000).toISOString().slice(0, 16)} value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="mt-2" /><p className="mt-1 text-xs text-muted-foreground">Your selected time is a request, not a confirmed appointment. A Service Provider must accept it.</p></div>}
          {!isCarEssentialsDelivery && <>
          <div className="mt-6 border-t border-border pt-5 text-sm font-semibold">Where do you need the service?</div>
          <div className="mt-2 text-sm text-muted-foreground">Choose the location for this booking. It can be different from your saved home or office address. GPS is optional.</div>
          {location && (
            <div className="mt-4 rounded-xl border border-success-border bg-success-muted p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-success"><ApperIcon name="MapPinCheck" size={18} /> Service location selected</div>
              <div className="mt-1 text-sm text-success">{location.text}</div>
              <div className="mt-1 text-xs text-success/80">{Number(location.latitude).toFixed(4)}, {Number(location.longitude).toFixed(4)}</div>
              {location.serviceable === false && <p className="mt-2 text-sm font-semibold text-amber-700">This location is outside LOCAL's current Naini/Prayagraj launch area. Bookings are not available here yet.</p>}
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setLocation(null)}>Change service location</Button>
            </div>
          )}
          <div className="mt-4 grid grid-cols-1 gap-3">
            <Button type="button" className="w-full whitespace-normal" onClick={useCurrentLocation} disabled={locationLoading}>
              <ApperIcon name="LocateFixed" size={17} />
              {locationLoading ? 'Checking location…' : 'Use current location'}
            </Button>
            <Button type="button" className="w-full whitespace-normal" variant="outline" onClick={useDemoLocation}>
              <ApperIcon name="MapPin" size={17} /> Use previously confirmed location
            </Button>
          </div>
          <form onSubmit={useManualServiceAddress} className="mt-4 space-y-2">
            <label htmlFor="booking-service-address" className="text-sm font-medium">Or enter another address</label>
            <Input id="booking-service-address" value={manualServiceAddress} onChange={(event) => setManualServiceAddress(event.target.value)} placeholder="e.g. Civil Lines, Prayagraj, Uttar Pradesh" autoComplete="street-address" />
            <Button type="submit" variant="outline" className="w-full" disabled={locationLoading || manualServiceAddress.trim().length < 3}>
              <ApperIcon name="Search" size={16} /> Confirm address for this booking
            </Button>
          </form>
          </>}
          {location && (
            <>
              {isCarEssentialsDelivery && <div className="mt-5 rounded-lg border bg-muted/30 p-3 text-sm"><div className="font-semibold">Delivery address confirmed</div><div className="mt-1 text-muted-foreground">{location.text}</div><p className="mt-1 text-xs text-muted-foreground">We’ll use this address for the delivery request. Availability and final price still need provider confirmation.</p></div>}
              <Button className="mt-5 w-full" onClick={createRequest} disabled={location.serviceable === false || creating || (isOtherIssue && !isCarEssentialsDelivery && !problemDetails.trim()) || (isCarWash && washCart.length === 0) || (isProfessionalDriverService && !driverDisclaimerAccepted) || (isCarFlatPuncture && !punctureDispatchConsent)}>
                <ApperIcon name="Send" size={17} />
                {creating ? tr('Sharing request…', language) : isCarFlatPuncture ? 'Find Nearby Help' : isCarEssentialsDelivery ? 'Submit Delivery Request' : isCarWash ? 'Submit Quote to Customer Care' : isInsuranceClaim ? 'Get Free Consultation' : /driver/i.test(requestedService) ? 'Find LOCAL Drivers' : pricingMode === 'Fixed Price' ? tr('Continue with listed price', language) : pricingMode === 'Urgent Dispatch' ? 'Find LOCAL Service Providers' : tr('Find LOCAL Service Providers', language)}
              </Button>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}