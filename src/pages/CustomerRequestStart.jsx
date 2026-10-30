import { useEffect, useRef, useState } from 'react';
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

const CUSTOMER_CARE_PHONE = '';

const VEHICLE_CATEGORY = {
  car: 'Car Assistance',
  bike: 'Bike Assistance',
};

const CAR_WASH_OPTIONS = [
  {
    title: 'Complete Car Wash',
    description: 'Exterior wash + interior cleaning.',
    icon: 'Sparkles',
    image: 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=1200&q=85',
    prices: [
      { label: 'Small Car (Hatchback / Sedan)', price: 400 },
      { label: 'SUV / Big Car', price: 500 },
    ],
  },
  {
    title: 'Exterior Only',
    description: '',
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
    const itemSummary = items.map((item) => item.title).filter(Boolean).join('; ');
    return ` Car Essentials requirement. Selected products: ${itemSummary}. Vehicle: ${order.vehicle || 'Not specified'}. LOCAL Customer Care must call the customer to confirm quantity, brand/specification, availability, final price and delivery location before arranging fulfilment. Do not dispatch automatically.`;
  } catch {
    return '';
  }
}

function getWashPrice(item) {
  const option = CAR_WASH_OPTIONS.find((entry) => entry.title === item?.title);
  const priceOption = option?.prices.find((entry) => entry.label === item?.variant);
  // The configured menu price for the exact saved variant is authoritative.
  // Never trust a stored basePrice: it may have been persisted by an older build
  // or before the customer switched between Hatchback/Sedan and SUV/Big Car.
  const basePrice = Number(priceOption?.price);
  const fallbackPrice = Number(item?.basePrice);
  const extrasTotal = Array.isArray(item?.addons) ? item.addons.reduce((sum, addon) => sum + (Number(addon.price) || 0), 0) : 0;
  return (Number.isFinite(basePrice) && basePrice > 0 ? basePrice : (Number.isFinite(fallbackPrice) && fallbackPrice > 0 ? fallbackPrice : 0)) + extrasTotal;
}

function normalizeWashCart(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const option = CAR_WASH_OPTIONS.find((entry) => entry.title === item?.title);
    const priceOption = option?.prices.find((entry) => entry.label === item?.variant);
    const addons = Array.isArray(item?.addons) ? item.addons.map((addon) => ({ id: String(addon.id || addon.label), label: String(addon.label || 'Optional extra'), price: Math.max(0, Number(addon.price) || 0) })) : [];
    // The configured package price is authoritative whenever the package/variant is recognized.
    // Saved cart values are only a fallback for legacy entries, preventing stale prices from corrupting totals.
    const storedBasePrice = Number(item?.basePrice);
    const basePrice = Number(priceOption?.price) > 0 ? Number(priceOption.price) : (Number.isFinite(storedBasePrice) && storedBasePrice > 0 ? storedBasePrice : 0);
    const price = basePrice + addons.reduce((sum, addon) => sum + addon.price, 0);
    const qty = Math.max(0, Number.parseInt(item?.qty, 10) || 0);
    return {
      ...item,
      // Always derive a stable unique identity from the canonical service and variant; old session IDs may collide.
      id: (option?.title || String(item?.title || '')) + '::' + (priceOption?.label || String(item?.variant || '')),
      title: option?.title || String(item?.title || ''),
      variant: priceOption?.label || String(item?.variant || ''),
      basePrice,
      addons,
      price,
      qty,
    };
  }).filter((item) => item.title && item.variant && item.price > 0 && item.qty > 0)
    .reduce((unique, item) => {
      const previousIndex = unique.findIndex((entry) => entry.title === item.title);
      if (previousIndex >= 0) unique.splice(previousIndex, 1);
      unique.push(item);
      return unique;
    }, []);
}

// Enforce vehicle-category isolation even for carts saved by older app versions.
// A stale or legacy entry for the other vehicle type must never reach the quote or booking payload.
function normalizeWashCartForType(value, vehicleType) {
  const normalized = normalizeWashCart(value);
  return normalized.filter((item) => {
    const isSuvItem = /SUV|Big Car/i.test(item.variant);
    return vehicleType === 'suv' ? isSuvItem : !isSuvItem;
  });
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
  const carEssentialsAutoSubmitRef = useRef(false);
  const [creating, setCreating] = useState(false);
  const [submittedWashOrder, setSubmittedWashOrder] = useState(null);
  const [submittedBikeCareRequest, setSubmittedBikeCareRequest] = useState(null);
  const [driverDisclaimerAccepted, setDriverDisclaimerAccepted] = useState(false);
  const [driverPickupAddress, setDriverPickupAddress] = useState('');
  const [driverPickupPoint, setDriverPickupPoint] = useState(null);
  const [driverDropoffAddress, setDriverDropoffAddress] = useState('');
  const [driverDropoffPoint, setDriverDropoffPoint] = useState(null);
  const [driverTripType, setDriverTripType] = useState('One-way');
  const [driverTravelType, setDriverTravelType] = useState('Within city');
  const [driverStops, setDriverStops] = useState([]);
  const [driverStopDraft, setDriverStopDraft] = useState('');
  const [driverLocationBusy, setDriverLocationBusy] = useState('');
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
      const savedType = window.sessionStorage.getItem('local_car_wash_type_v1') || 'small';
      const typeSpecificKey = savedType === 'suv' ? 'local_car_wash_cart_suv_v1' : 'local_car_wash_cart_small_v1';
      const typeSpecificCart = window.sessionStorage.getItem(typeSpecificKey);
      if (typeSpecificCart !== null) return normalizeWashCartForType(JSON.parse(typeSpecificCart), savedType);
      // Legacy shared cart belongs to Hatchback/Sedan only. Never carry it into the SUV category.
      if (savedType === 'small') {
        const legacyCart = window.sessionStorage.getItem('local_car_wash_cart_v2');
        return legacyCart ? normalizeWashCartForType(JSON.parse(legacyCart), 'small') : [];
      }
      return [];
    } catch {
      return [];
    }
  });
  const [includePickupDrop, setIncludePickupDrop] = useState(() => window.sessionStorage.getItem('local_car_wash_pickup_v1') === 'true');
  const [washDecisions, setWashDecisions] = useState({});
  const [washAddonSelections, setWashAddonSelections] = useState({});
  const [washCarType, setWashCarType] = useState(() => window.sessionStorage.getItem('local_car_wash_type_v1') || 'small');
  const [washVehicleLocked, setWashVehicleLocked] = useState(() => window.sessionStorage.getItem('local_car_wash_vehicle_locked_v1') === 'true');
  const [showVehicleChangeConfirm, setShowVehicleChangeConfirm] = useState(false);
  const [carServiceVehicleLocked, setCarServiceVehicleLocked] = useState(false);
  const [serviceTiming, setServiceTiming] = useState('ASAP');
  const [scheduledAt, setScheduledAt] = useState('');
  const [selectedCarServicePackage, setSelectedCarServicePackage] = useState(() => {
    try {
      const savedPackage = window.sessionStorage.getItem('local_car_service_selected_package_v1');
      return savedPackage ? JSON.parse(savedPackage) : null;
    } catch {
      return null;
    }
  });
  const [carServiceCarType, setCarServiceCarType] = useState(() => {
    try {
      const savedPackage = JSON.parse(window.sessionStorage.getItem('local_car_service_selected_package_v1') || 'null');
      if (savedPackage?.vehicleType) return /SUV|Big Car/i.test(savedPackage.vehicleType) ? 'suv' : 'small';
      return window.sessionStorage.getItem('local_car_service_type_v1') || 'small';
    } catch { return 'small'; }
  });
  const [showCarServiceQuoteReview, setShowCarServiceQuoteReview] = useState(false);
  const isCarWash = vehicle === 'car' && requestedService === 'Car Wash';
  const isCarService = vehicle === 'car' && requestedService === 'Car Service';
  const isBikeCareRequest = vehicle === 'bike' && ['Bike Repair & Roadside Assistance', 'Bike Maintenance'].includes(requestedService);
  const selectedCarServiceVehicleType = selectedCarServicePackage
    ? (/SUV|Big Car/i.test(selectedCarServicePackage.vehicleType) ? 'suv' : 'small')
    : null;
  const isDieselRequest = vehicle === 'car' && issue === 'Out of Fuel';
  const isUrgentService = ['Emergency Driver', 'Ambulance'].includes(requestedService) || /jump|battery|tyre|towing|fuel|roadside|breakdown|accident/i.test(issue + ' ' + requestedService);
  // Only classify Car Wash as fixed-price here because this screen currently has an explicit package rate card.
  // Driver rates must be configured before those services can honestly be presented as fixed-price bookings.
  const pricingMode = isUrgentService ? 'Urgent Dispatch' : (isCarWash ? 'Fixed Price' : 'Provider Quote');
  const pricingModeDescription = isCarFlatPuncture
    ? 'Prioritize nearby available help for faster assistance. No bidding.'
    : isProfessionalDriverService
      ? 'Submit your request. LOCAL Customer Care will confirm driver availability, your schedule and the applicable charges before confirming your booking.'
      : isCarWash
        ? 'Submit your selected menu quote. LOCAL Customer Care will call to confirm details and pickup/drop, then send any revised quote for your approval before work starts.'
        : isBikeCareRequest
          ? 'Submit your request to LOCAL Central Dispatch. Customer Care will call to confirm availability, service charges and next steps. No bidding and no payment is collected at this stage.'
        : pricingMode === 'Fixed Price'
        ? 'See the listed price and book without waiting for bids.'
        : pricingMode === 'Urgent Dispatch'
          ? 'Prioritize available nearby help, arrival time and transparent pricing. No bidding.'
          : 'LOCAL Customer Care will contact you and arrange a suitable provider. Any additional work is explained before you approve it.';
  const language = getLanguage();
  // Single source of truth for every Car Wash cart display and submission calculation.
  const normalizedWashCart = normalizeWashCartForType(washCart, washCarType);
  const washCartSummary = normalizedWashCart.reduce((summary, item) => {
    const unitPrice = getWashPrice(item);
    const lineTotal = unitPrice * item.qty;
    const pricedItem = { ...item, basePrice: getWashPrice({ ...item, addons: [] }), price: unitPrice, lineTotal };
    return { items: summary.items.concat([pricedItem]), subtotal: summary.subtotal + lineTotal };
  }, { items: [], subtotal: 0 });
  // Count must come from the exact same list that is rendered, never a separately accumulated value.
  const cartItemCount = washCartSummary.items.length;
  const cartSubtotal = washCartSummary.subtotal;
  const [carWashOffer, setCarWashOffer] = useState('');
  const [totalRefreshed, setTotalRefreshed] = useState(() => window.sessionStorage.getItem('local_car_wash_total_refreshed_v1') === 'true');
  const CAR_WASH_PLATFORM_FEE = 25;
  const CAR_SERVICE_PLATFORM_FEE = 25;
  const pickupDropCharge = includePickupDrop ? 100 : 0;
  const estimatedTotalValue = washCartSummary.subtotal + pickupDropCharge + CAR_WASH_PLATFORM_FEE;
  const [showTotalBilling, setShowTotalBilling] = useState(false);
  const [showCarWashQuoteReview, setShowCarWashQuoteReview] = useState(false);

  // The highlighted Estimated Total Value control confirms and saves the latest cart total.
  function refreshEstimatedTotal() {
    const currentCart = normalizeWashCartForType(washCart, washCarType);
    const nextSubtotal = currentCart.reduce((sum, item) => sum + (getWashPrice(item) * item.qty), 0);
    const nextTotal = nextSubtotal + (includePickupDrop ? 100 : 0) + CAR_WASH_PLATFORM_FEE;
    const activeCartKey = washCarType === 'suv' ? 'local_car_wash_cart_suv_v1' : 'local_car_wash_cart_small_v1';
    window.sessionStorage.setItem(activeCartKey, JSON.stringify(currentCart));
    window.sessionStorage.setItem('local_car_wash_cart_v2', JSON.stringify(currentCart));
    window.sessionStorage.setItem('local_car_wash_pickup_v1', String(includePickupDrop));
    window.sessionStorage.setItem('local_car_wash_reviewed_total_v1', String(nextTotal));
    window.sessionStorage.setItem('local_car_wash_total_refreshed_v1', 'true');
    // Remember the selected-service card as the return point before reloading the persisted cart.
    window.sessionStorage.setItem('local_car_wash_restore_summary_scroll_v1', 'true');
    window.location.reload();
  }

  useEffect(() => {
    // After an Estimated total refresh, return the customer directly to the selected-service summary card.
    try {
      if (window.sessionStorage.getItem('local_car_wash_restore_summary_scroll_v1') === 'true') {
        window.sessionStorage.removeItem('local_car_wash_restore_summary_scroll_v1');
        window.requestAnimationFrame(() => {
          document.getElementById('car-wash-selected-summary')?.scrollIntoView({ behavior: 'auto', block: 'center' });
        });
      }
    } catch {
      // Keep normal page behaviour if session storage or scrolling is unavailable.
    }
  }, []);

  useEffect(() => {
    // A displayed calculation is valid only for the exact cart state that was reviewed.
    // Any add/remove or Pickup & Drop change invalidates the previous master calculation.
    window.sessionStorage.removeItem('local_car_wash_total_refreshed_v1');
    setTotalRefreshed(false);
    setShowTotalBilling(false);
  }, [washCart, includePickupDrop]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem('local_car_wash_type_v1', washCarType);
      window.sessionStorage.setItem('local_car_wash_vehicle_locked_v1', String(washVehicleLocked));
    } catch {
      // The car-type selection still works for this page if session storage is unavailable.
    }
  }, [washCarType, washVehicleLocked]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem('local_car_service_type_v1', carServiceCarType);
      if (selectedCarServicePackage) {
        window.sessionStorage.setItem('local_car_service_selected_package_v1', JSON.stringify(selectedCarServicePackage));
      } else {
        window.sessionStorage.removeItem('local_car_service_selected_package_v1');
      }
    } catch {
      // Keep the current selection usable even if session storage is unavailable.
    }
  }, [selectedCarServicePackage, carServiceCarType]);

  useEffect(() => {
    try {
      const typeSpecificKey = washCarType === 'suv' ? 'local_car_wash_cart_suv_v1' : 'local_car_wash_cart_small_v1';
      window.sessionStorage.setItem(typeSpecificKey, JSON.stringify(normalizedWashCart));
      // Keep the legacy key aligned to the active category for existing booking integrations.
      window.sessionStorage.setItem('local_car_wash_cart_v2', JSON.stringify(normalizedWashCart));
      window.sessionStorage.setItem('local_car_wash_pickup_v1', String(includePickupDrop));
    } catch {
      // The cart still works for the current page if session storage is unavailable.
    }
  }, [normalizedWashCart, includePickupDrop, washCarType]);

  function switchWashCarType(nextType) {
    if (washVehicleLocked) return;
    if (nextType !== washCarType) {
      try {
        const currentKey = washCarType === 'suv' ? 'local_car_wash_cart_suv_v1' : 'local_car_wash_cart_small_v1';
        window.sessionStorage.setItem(currentKey, JSON.stringify(normalizeWashCart(washCart)));
        const nextKey = nextType === 'suv' ? 'local_car_wash_cart_suv_v1' : 'local_car_wash_cart_small_v1';
        const savedNextCart = window.sessionStorage.getItem(nextKey);
        setWashCart(savedNextCart ? normalizeWashCartForType(JSON.parse(savedNextCart), nextType) : []);
      } catch {
        setWashCart([]);
      }
      setWashCarType(nextType);
    }
    setWashVehicleLocked(true);
    window.sessionStorage.setItem('local_car_wash_vehicle_locked_v1', 'true');
    window.sessionStorage.removeItem('local_car_wash_total_refreshed_v1');
    setTotalRefreshed(false);
    setShowTotalBilling(false);
  }

  function addWashItem(option, priceOption) {
    setWashVehicleLocked(true);
    window.sessionStorage.setItem('local_car_wash_vehicle_locked_v1', 'true');
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
    setWashCart((current) => [
      ...current.filter((item) => item.title !== option.title),
      { id, title: option.title, variant: priceOption.label, basePrice: priceOption.price, addons, price: unitPrice, qty: 1 },
    ]);
    toast.success(option.title + (addons.length ? ' with ' + addons.map((addon) => addon.label).join(', ') : '') + ' added to cart.');
  }

  function cancelCurrentVehicleDraft() {
    if (isCarWash) {
      setWashCart([]);
      setWashVehicleLocked(false);
      setIncludePickupDrop(false);
      setShowCarWashQuoteReview(false);
      setTotalRefreshed(false);
      setShowTotalBilling(false);
      [
        'local_car_wash_vehicle_locked_v1',
        'local_car_wash_cart_small_v1',
        'local_car_wash_cart_suv_v1',
        'local_car_wash_cart_v2',
        'local_car_wash_reviewed_total_v1',
        'local_car_wash_total_refreshed_v1',
        'local_car_wash_pickup_v1',
      ].forEach((key) => window.sessionStorage.removeItem(key));
    }
    if (isCarService) {
      setSelectedCarServicePackage(null);
      setCarServiceVehicleLocked(false);
      setShowCarServiceQuoteReview(false);
      window.sessionStorage.removeItem('local_car_service_selected_package_v1');
    }
    setShowVehicleChangeConfirm(false);
    toast.success('Current draft cleared. You can now choose another vehicle type.');
  }

  function changeWashQty(id, delta) {
    window.sessionStorage.removeItem('local_car_wash_total_refreshed_v1');
    setTotalRefreshed(false);
    setWashCart((current) => current
      .map((item) => item.id === id ? { ...item, qty: Math.max(0, item.qty + delta) } : item)
      .filter((item) => item.qty > 0));
  }

  const { data: customer, loading: customerLoading } = useFetch(
    async () => {
      if (!user?.userId) return null;
      const res = await sdk.table('customer_profiles_c')
        .select(['Id', 'Name', 'email_c', 'location_c', 'latitude_c', 'longitude_c', 'Owner'])
        .where(eq('Owner', user.userId))
        .page(1, 10)
        .fetch();
      if (!res.success) throw new Error(res.message || 'Could not look up your customer profile.');
      return (res.data ?? []).find((item) => String(item.Owner?.Id ?? item.Owner ?? '') === String(user.userId)) ?? null;
    },
    [user?.userId],
  );

  const isOtherIssue = issue === 'Other Issue' && !requestedService;
  const categoryName = VEHICLE_CATEGORY[vehicle] ?? 'Car Assistance';
  const { data: category, loading: categoryLoading } = useFetch(
    () => sdk.table('service_categories_c').select(['Id', 'Name', 'status_c']).where(eq('Name', categoryName)).page(1, 1).fetch().then((res) => res.data?.[0] ?? null),
    [categoryName],
  );
  const capabilityName = getCapabilityName(issue, vehicle, requestedService);
  const { data: capabilities, loading: capabilitiesLoading } = useFetch(
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

  async function resolveDriverAddress(address, kind) {
    const query = String(address || '').trim();
    if (query.length < 3) {
      toast.error('Enter a complete pickup or drop-off address.');
      return;
    }
    setDriverLocationBusy(kind);
    try {
      const queries = /prayagraj|allahabad|kanpur|lucknow|varanasi|noida|ghaziabad|delhi|mumbai|kolkata|chennai|bengaluru|hyderabad|pune|jaipur|agra/i.test(query)
        ? [query]
        : [query + ', Prayagraj, Uttar Pradesh, India', query + ', India'];
      let matches = [];
      for (const searchQuery of queries) {
        const response = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=3&countrycodes=in&q=' + encodeURIComponent(searchQuery));
        if (!response.ok) throw new Error('Address search is unavailable');
        matches = await response.json();
        if (matches.length) break;
      }
      if (!matches.length) {
        toast.error('Address not found. Add the locality and city, then try again.');
        return;
      }
      const match = matches[0];
      const point = { text: String(match.display_name).split(',').slice(0, 4).join(', '), latitude: Number(match.lat), longitude: Number(match.lon) };
      if (kind === 'pickup') {
        setDriverPickupPoint(point);
        setDriverPickupAddress(point.text);
      } else {
        setDriverDropoffPoint(point);
        setDriverDropoffAddress(point.text);
      }
      toast.success(kind === 'pickup' ? 'Pickup location confirmed.' : 'Drop-off location confirmed.');
    } catch {
      toast.error('Address search is temporarily unavailable. You can enter the full address and retry.');
    } finally {
      setDriverLocationBusy('');
    }
  }

  function useDriverPickupCurrentLocation() {
    if (!navigator.geolocation) {
      toast.error('Location is not available in this browser. Enter the pickup address manually.');
      return;
    }
    setDriverLocationBusy('gps');
    navigator.geolocation.getCurrentPosition(async (position) => {
      const point = { text: 'Current location', latitude: position.coords.latitude, longitude: position.coords.longitude };
      try {
        const response = await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=' + point.latitude + '&lon=' + point.longitude);
        if (response.ok) {
          const result = await response.json();
          if (result.display_name) point.text = String(result.display_name).split(',').slice(0, 4).join(', ');
        }
      } catch { /* GPS coordinates remain usable even if reverse geocoding is unavailable. */ }
      setDriverPickupPoint(point);
      setDriverPickupAddress(point.text);
      setDriverLocationBusy('');
      toast.success('Current location set as pickup.');
    }, () => {
      setDriverLocationBusy('');
      toast.error('Location permission was not granted. Enter the pickup address manually.');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }

  async function createRequest() {
    if (isCarFlatPuncture && !punctureDispatchConsent) {
      toast.error('Please accept the puncture pricing and cancellation policy before dispatch.');
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
    if (isCarWash && normalizedWashCart.length === 0) {
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
    if (!isProfessionalDriverService && !isInsuranceClaim && !isCarEssentialsDelivery && !location) {
      toast.error(tr('Please confirm your location first.', language));
      return;
    }
    if (!isProfessionalDriverService && !isInsuranceClaim && !isCarEssentialsDelivery && location?.serviceable === false) {
      toast.error('LOCAL bookings are not available at this location yet. Please choose a service location within the current Naini/Prayagraj coverage area.');
      return;
    }
    if (isOtherIssue && !isCarEssentialsDelivery && !problemDetails.trim()) {
      toast.error(tr('Please describe the problem before continuing.', language));
      return;
    }
    if (!isProfessionalDriverService && serviceTiming === 'Scheduled') {
      const selectedDate = new Date(scheduledAt);
      if (!scheduledAt || Number.isNaN(selectedDate.getTime()) || selectedDate.getTime() <= Date.now()) {
        toast.error('Choose a future date and time for the scheduled service.');
        return;
      }
    }

    setCreating(true);
    try {
      let essentialsGps = null;
      let essentialsAddress = '';
      if (isCarEssentialsDelivery) {
        // Reuse the location the customer already confirmed in LOCAL's location gate.
        // Do not request browser GPS a second time during submission: that can fail even
        // when the app already has a valid saved address and coordinates.
        let savedServiceLocation = null;
        try {
          savedServiceLocation = JSON.parse(window.localStorage.getItem('local_service_location_c') || 'null');
        } catch {
          savedServiceLocation = null;
        }
        const confirmedLocation = location
          && Number.isFinite(Number(location.latitude))
          && Number.isFinite(Number(location.longitude))
          ? location
          : savedServiceLocation;
        const latitude = Number(confirmedLocation?.latitude);
        const longitude = Number(confirmedLocation?.longitude);
        if (!confirmedLocation || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          toast.error('Please confirm your service location in LOCAL before submitting this requirement.');
          return;
        }
        essentialsGps = { latitude, longitude };
        const savedProfileAddress = String(customer?.location_c || '').trim();
        const savedServiceAddress = String(confirmedLocation?.label || confirmedLocation?.text || '').trim();
        const isUsefulAddress = (value) => value && !/^(confirmed service location|current location|saved customer address not available|to be confirmed)/i.test(value);
        essentialsAddress = isUsefulAddress(savedServiceAddress) ? savedServiceAddress : (isUsefulAddress(savedProfileAddress) ? savedProfileAddress : '');
        if (!essentialsAddress) {
          try {
            const response = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + encodeURIComponent(latitude) + '&longitude=' + encodeURIComponent(longitude) + '&localityLanguage=en');
            if (response.ok) {
              const result = await response.json();
              essentialsAddress = [result.locality, result.city || result.localityInfo?.administrative?.[0]?.name, result.principalSubdivision]
                .filter(Boolean)
                .filter((value, index, values) => values.indexOf(value) === index)
                .slice(0, 3)
                .join(', ');
            }
          } catch {
            // The confirmed coordinates are still saved and can open in Google Maps.
          }
        }
        if (!essentialsAddress) essentialsAddress = 'Address unavailable — use View Customer Location for the confirmed map pin.';
      }
      const res = await sdk.table('service_requests_c').create({
        Name: vehicle.toUpperCase() + ' • ' + (isCarWash ? 'Car Wash (' + washCart.reduce((sum, item) => sum + item.qty, 0) + ' items)' : isCarService && selectedCarServicePackage ? selectedCarServicePackage.title + ' — ' + selectedCarServicePackage.vehicleType : displayIssue),
        customer_c: customer.Id,
        service_category_c: category.Id,
        required_capability_c: requiredCapability.Id,
        problem_description_c: (requestedService
          ? (isProfessionalDriverService ? 'Customer requested a driver. LOCAL Customer Care must call the customer to understand trip requirements and share a quote for approval before assigning a driver.' : isCarWash ? 'Customer submitted this Car Wash quote for Customer Care review and a confirmation call. Selected options: ' + normalizedWashCart.map((item) => item.title + ' — ' + item.variant + ' × ' + item.qty + ' = ₹' + (item.price * item.qty).toLocaleString('en-IN')).join('; ') + '; LOCAL Platform Fee: ₹' + CAR_WASH_PLATFORM_FEE + ' (once per booking)' + (includePickupDrop ? '; Pickup & Drop requested — indicative menu charge ₹100, subject to Customer Care location confirmation' : '; Pickup & Drop not requested yet — Customer Care to ask during confirmation call') + '. Service subtotal: ₹' + washCartSummary.subtotal.toLocaleString('en-IN') + '. Customer menu estimate including platform fee' + (includePickupDrop ? ' and indicative Pickup & Drop' : '') + ': ₹' + estimatedTotalValue.toLocaleString('en-IN') + '. This is the customer-submitted menu quote, not a final confirmed bill. Customer Care must call, confirm vehicle/location and pickup/drop requirement, then issue a revised quote for customer approval if the total changes. Do not start work until the customer approves the final quote. CAR_WASH_DECISIONS_JSON:' + JSON.stringify(normalizedWashCart.map((item) => ({ id: item.id, title: item.title, variant: item.variant, quantity: item.qty, baseUnitPrice: item.basePrice, listedUnitPrice: item.price, decision: 'customer_selected', proposedUnitPrice: null })).concat(includePickupDrop ? [{ id: 'pickup-drop', title: 'Pickup & Drop', variant: 'Requested', quantity: 1, listedUnitPrice: 100, decision: 'customer_requested', proposedUnitPrice: null, fixed: true }] : [])) : isCarService && selectedCarServicePackage ? selectedCarServicePackage.title + ' (' + selectedCarServicePackage.checkup + ') — ' + selectedCarServicePackage.vehicleType + '. Listed package price: ₹' + selectedCarServicePackage.price.toLocaleString('en-IN') + '. LOCAL Platform Fee: ₹' + CAR_SERVICE_PLATFORM_FEE + ' (once per booking). Indicative total including platform fee: ₹' + (Number(selectedCarServicePackage.price) + CAR_SERVICE_PLATFORM_FEE).toLocaleString('en-IN') + '. Covered items: ' + selectedCarServicePackage.covered.join('; ') + '. Customer selected this package and requests provider availability/confirmation through the normal offer flow.' : isBikeCareRequest ? requestedService + '. Customer requested a callback from LOCAL Customer Care. No bike model details or bidding are required. Confirm availability and the full service price, including the ₹25 LOCAL Platform Fee, with the customer before confirming payment.' : requestedService) + (vehicle === 'bike' ? '.' : ' for their car.')
          : isOtherIssue
            ? problemDetails.trim()
            : 'Customer selected ' + issue + ' for ' + vehicle.toUpperCase() + '.') + (isProfessionalDriverService ? '\\nLOCAL_DRIVER_ROUTE_JSON:' + JSON.stringify({ pickup: driverPickupPoint, dropoff: driverDropoffPoint, tripType: driverTripType, travelType: driverTravelType, stops: driverStops, quoteWorkflow: 'Customer Care reviews route and trip details, sends quote for customer approval, and assigns a driver only after customer approval.' }) : '') + (isCarFlatPuncture ? '\\nLOCAL_PUNCTURE_DISPATCH_CONSENT_JSON:' + JSON.stringify({ accepted: true, acceptedAt: new Date().toISOString(), pricePerPuncture: 150, visitChargeWithin10Km: 200, platformFee: 25, cancellationPolicy: { beforeProviderAcceptance: 0, afterAcceptanceBeforeTravel: 0, afterTravelBeforeArrival: 0, afterArrivalOrQuoteDeclined: 200, providerFault: 0 }, policyVersion: 1 }) : '') + (requestedService === 'Car Essentials Delivery' ? getCarEssentialsRequestNote() : '') + (isInsuranceClaim && insuranceFiles.length ? ' Insurance copy files selected: ' + insuranceFiles.map((file) => file.name).join(', ') + '. Demo preview records file names only; files are not securely uploaded or stored.' : ''),
        location_c: isCarEssentialsDelivery ? essentialsAddress : isInsuranceClaim ? 'Not required — remote insurance claim assistance' : location.text,
        // LOCAL's current demo rollout is Prayagraj; this city-level service area gates provider visibility.
        service_area_c: 'Prayagraj',
        latitude_c: isCarEssentialsDelivery ? essentialsGps.latitude : isInsuranceClaim ? null : Number(location.latitude),
        longitude_c: isCarEssentialsDelivery ? essentialsGps.longitude : isInsuranceClaim ? null : Number(location.longitude),
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
        if (isCarEssentialsDelivery) navigate('/customer/car-essentials');
        return;
      }
      if (requestedService === 'Car Essentials Delivery') window.sessionStorage.removeItem('local_car_essentials_order_v1');
      if (!isCarEssentialsDelivery) toast.success(isInsuranceClaim ? 'Car Insurance Claim request sent to LOCAL Customer Care. We will contact you.' : isCarWash ? 'Car Wash quote submitted for LOCAL Customer Care review.' : isBikeCareRequest ? 'Bike service request sent to LOCAL Central Dispatch. Customer Care will call you.' : isProfessionalDriverService ? 'Driver request sent to LOCAL Customer Care. We will confirm driver availability, schedule and charges.' : tr('Request shared with eligible nearby Service Providers.', language));
      if (isCarWash) {
        setWashVehicleLocked(false);
        window.sessionStorage.removeItem('local_car_wash_vehicle_locked_v1');
        setSubmittedWashOrder({
          requestId: res.data[0].Id,
          items: normalizedWashCart.map((item) => ({ title: item.title, variant: item.variant, quantity: item.qty, unitPrice: item.price, lineTotal: item.price * item.qty })),
          subtotal: washCartSummary.subtotal,
          platformFee: CAR_WASH_PLATFORM_FEE,
          pickupDropRequested: includePickupDrop,
          pickupDropIndicative: includePickupDrop ? 100 : 0,
          locationText: location.text,
        });
        return;
      }
      if (isCarEssentialsDelivery) {
        navigate('/customer');
        return;
      }
      if (isCarService) {
        setSelectedCarServicePackage(null);
        window.sessionStorage.removeItem('local_car_service_selected_package_v1');
      }
      if (isBikeCareRequest) {
        setSubmittedBikeCareRequest({
          requestId: res.data[0].Id,
          service: requestedService,
          locationText: location.text,
        });
        return;
      }
      navigate('/requests/' + res.data[0].Id);
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    if (!isCarEssentialsDelivery || carEssentialsAutoSubmitRef.current) return;
    if (customerLoading || categoryLoading || capabilitiesLoading) return;
    carEssentialsAutoSubmitRef.current = true;
    if (!customer?.Id) {
      createRequest().catch((error) => {
        toast.error(error?.message || 'Could not submit the Car Essentials requirement.');
        navigate('/customer/car-essentials');
      });
      return;
    }
    if (!category?.Id || !requiredCapability?.Id) {
      toast.error('Car Essentials is not fully configured. Please try again later.');
      navigate('/customer/car-essentials');
      return;
    }
    createRequest().catch((error) => {
      toast.error(error?.message || 'Could not submit the Car Essentials requirement.');
      navigate('/customer/car-essentials');
    });
  }, [isCarEssentialsDelivery, customerLoading, categoryLoading, capabilitiesLoading, customer?.Id, category?.Id, requiredCapability?.Id, navigate]);

  if (isCarEssentialsDelivery) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center" role="status" aria-label="Submitting requirement">
        <ApperIcon name="LoaderCircle" size={28} className="animate-spin text-primary" />
      </div>
    );
  }

  if (submittedBikeCareRequest) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
        <Card className="overflow-hidden rounded-2xl border border-border p-0 shadow-sm">
          <div className="bg-primary px-5 py-5 text-primary-foreground sm:px-7">
            <div className="flex items-center gap-3">
              <ApperIcon name="CheckCircle2" size={28} />
              <div>
                <h1 className="text-xl font-extrabold sm:text-2xl">Request Sent to LOCAL</h1>
                <p className="mt-1 text-sm opacity-90">Your bike service request is now with Central Dispatch.</p>
              </div>
            </div>
          </div>
          <div className="space-y-5 p-5 sm:p-7">
            <div className="rounded-xl border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Request reference</p>
              <p className="mt-1 break-all text-sm font-bold">{submittedBikeCareRequest.requestId}</p>
              <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3">
                <span className="text-sm text-muted-foreground">Selected service</span>
                <strong className="text-right text-sm">{submittedBikeCareRequest.service}</strong>
              </div>
              <div className="mt-3 flex items-start justify-between gap-3">
                <span className="text-sm text-muted-foreground">Service location</span>
                <strong className="max-w-[60%] text-right text-sm">{submittedBikeCareRequest.locationText || 'Confirmed location'}</strong>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">Status</span>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">New Request</span>
              </div>
            </div>
            <div className="rounded-xl bg-muted/50 p-4 text-sm leading-relaxed text-muted-foreground">
              LOCAL Customer Care will call you to confirm service availability, the total price and the ₹25 LOCAL Platform Fee. No payment is due now. The booking and payment steps will be confirmed with you before the service is arranged.
            </div>
            <Button className="w-full" onClick={() => navigate('/customer/bike-care')}>Back to Bike Care & Assistance</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (submittedWashOrder) {
    const order = submittedWashOrder;
    const indicativeTotal = order.subtotal + order.platformFee + order.pickupDropIndicative;
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        <Card className="overflow-hidden rounded-2xl border border-border p-0 shadow-sm">
          <div className="bg-primary px-5 py-5 text-primary-foreground sm:px-7">
            <div className="flex items-center gap-3"><ApperIcon name="CheckCircle2" size={28} /><div><h1 className="text-xl font-extrabold sm:text-2xl">LOCAL Order Summary</h1><p className="mt-1 text-sm opacity-90">Your quote request has been submitted to Customer Care.</p></div></div>
          </div>
          <div className="space-y-5 p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Request reference</p><p className="mt-1 break-all text-sm font-bold">{order.requestId}</p></div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">Provisional — Not Final Invoice</span></div>
            <div><h2 className="mb-3 text-base font-bold">Selected services</h2><div className="divide-y rounded-xl border">{order.items.map((item, index) => <div key={item.title + item.variant + index} className="flex items-start justify-between gap-3 p-3 text-sm"><div className="min-w-0"><p className="font-semibold">{item.title}</p><p className="text-muted-foreground">{item.variant} · Qty {item.quantity} × ₹{item.unitPrice.toLocaleString('en-IN')}</p></div><p className="shrink-0 font-bold">₹{item.lineTotal.toLocaleString('en-IN')}</p></div>)}</div></div>
            <div className="space-y-3 text-sm"><div className="flex justify-between gap-3"><span>Selected services subtotal</span><strong>₹{order.subtotal.toLocaleString('en-IN')}</strong></div><div className="flex justify-between gap-3"><span>LOCAL Platform Fee (per booking)</span><strong>₹{order.platformFee}</strong></div>{order.pickupDropRequested && <div className="flex justify-between gap-3"><span>Pickup &amp; Drop (indicative; pending confirmation)</span><strong>₹{order.pickupDropIndicative}</strong></div>}<div className="flex justify-between gap-3 border-t pt-3 text-base"><strong>Indicative total</strong><strong>₹{indicativeTotal.toLocaleString('en-IN')}</strong></div></div>
            <div className="rounded-xl bg-muted/50 p-4 text-sm"><p className="font-semibold">Service location</p><p className="mt-1 text-muted-foreground">{order.locationText || 'Confirmed location'}</p><p className="mt-3 leading-relaxed text-muted-foreground">The ₹25 LOCAL Platform Fee is shown separately. Pickup &amp; Drop, if requested, is indicative until Customer Care confirms your location and final charge. This is not a payment request. Customer Care will review your order and confirm the final quotation before booking confirmation.</p></div>
            <div className="grid gap-3 sm:grid-cols-2"><Button variant="outline" className="w-full" onClick={() => navigate('/requests/' + order.requestId)}>View Request Status</Button><Button className="w-full" onClick={() => navigate('/customer/car-care')}>Back to Car Care</Button></div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      {isCarWash ? (
        <div className="mb-4" aria-hidden="true" />
      ) : isCarService ? (
        <div className="mx-auto mb-5 max-w-5xl px-4 pt-2 text-center" aria-label="Car Service heading">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Car Service</h1>
        </div>
      ) : (
        isInsuranceClaim ? (
          <div className="mb-7 border-b border-border pb-5 text-center">
            <h1 className="font-heading text-3xl font-semibold tracking-tight">Car Insurance Claim</h1>
          </div>
        ) : (
          <PageHeader
            eyebrow={vehicle.toUpperCase() + ' ' + tr('assistance', language)}
            title={tr(displayIssue, language)}
            description={tr('Confirm your location and we will share the request only with Service Providers who have the required capability.', language)}
            action={
              <Button asChild variant="outline">
                <span onClick={() => navigate(isBikeCareRequest ? '/customer/bike-care' : ['Hourly Driver', 'Full-Day Driver', 'Full Day Driver', 'Outstation Driver', 'Scheduled Driver', 'Emergency Driver'].includes(requestedService) ? '/customer/car-driver' : requestedService === 'Car Wash' || requestedService === 'Car Service' || requestedService === 'Insurance Claim Assistance' ? '/customer/car-care' : '/customer/vehicle/' + vehicle)}>{isBikeCareRequest ? 'Back to Bike Care' : tr('Change problem', language)}</span>
              </Button>
            }
          />
        )
      )}
      {isCarService && (
        <section className="mx-auto mb-6 max-w-5xl space-y-5" aria-label="Car Service packages">
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3 sm:p-4">
            <div className="mb-3 text-center"><h3 className="font-bold">Select Car Type</h3><p className="mt-1 text-sm text-muted-foreground">Choose your car type to see prices.</p></div>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" aria-pressed={carServiceCarType === 'small'} disabled={(carServiceVehicleLocked || Boolean(selectedCarServicePackage)) && carServiceCarType !== 'small'} onClick={() => { setCarServiceCarType('small'); setCarServiceVehicleLocked(true); }} className={'overflow-hidden rounded-xl border-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 ' + (carServiceCarType === 'small' ? 'border-primary bg-background shadow-md' : 'border-border bg-background/70 hover:border-primary/40')}>
                <div className="flex h-28 w-full items-center justify-center overflow-hidden bg-white p-1 sm:h-36"><img src="data:image/webp;base64,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" alt="White Hatchback / Sedan" loading="lazy" className="h-full w-full object-contain" /></div>
                <span className="block border-t border-border/70 px-2 py-3 text-sm font-bold leading-snug">Hatchback / Sedan</span>
                {carServiceCarType === 'small' && <span className="flex items-center justify-center gap-1 pb-2 text-xs font-semibold text-primary"><ApperIcon name="CheckCircle2" size={15} /> Selected</span>}
              </button>
              <button type="button" aria-pressed={carServiceCarType === 'suv'} disabled={(carServiceVehicleLocked || Boolean(selectedCarServicePackage)) && carServiceCarType !== 'suv'} onClick={() => { setCarServiceCarType('suv'); setCarServiceVehicleLocked(true); }} className={'overflow-hidden rounded-xl border-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 ' + (carServiceCarType === 'suv' ? 'border-primary bg-background shadow-md' : 'border-border bg-background/70 hover:border-primary/40')}>
                <div className="flex h-28 w-full items-center justify-center overflow-hidden bg-white p-1 sm:h-36"><img src="data:image/webp;base64,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" alt="White SUV / Big Car" loading="lazy" className="h-full w-full object-contain" /></div>
                <span className="block border-t border-border/70 px-2 py-3 text-sm font-bold leading-snug">SUV / Big Car</span>
                {carServiceCarType === 'suv' && <span className="flex items-center justify-center gap-1 pb-2 text-xs font-semibold text-primary"><ApperIcon name="CheckCircle2" size={15} /> Selected</span>}
              </button>
            </div>
            {(carServiceVehicleLocked || selectedCarServicePackage) && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-background/80 p-3 text-sm"><span className="text-muted-foreground">Vehicle type is locked for this Car Service booking.</span><Button type="button" variant="outline" size="sm" onClick={() => setShowVehicleChangeConfirm(true)}>Cancel Booking &amp; Change Vehicle</Button></div>}
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {CAR_SERVICE_PACKAGES.map((pkg) => (
              <Card key={pkg.title} className={'flex flex-col self-start overflow-hidden rounded-2xl border p-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg ' + (selectedCarServicePackage?.title === pkg.title ? 'border-primary ring-2 ring-primary/20' : 'border-border/70')}>
                <div className="border-b bg-primary/5 px-3 py-2 text-center sm:px-4">
                  <h3 className="text-xl font-bold text-foreground">{pkg.title}</h3>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-emerald-600">{pkg.checkup}</p>
                </div>
                <div className="flex flex-col p-2 sm:p-3">
                  <div className="space-y-1">
                    {pkg.prices.filter((price) => carServiceCarType === 'suv' ? /SUV|Big Car/i.test(price.label) : !/SUV|Big Car/i.test(price.label)).map((price) => {
                      const isSelected = selectedCarServicePackage?.title === pkg.title && selectedCarServicePackage?.vehicleType === price.label;
                      const blockedByVehicleLock = Boolean(selectedCarServiceVehicleType && selectedCarServiceVehicleType !== carServiceCarType);
                      return (
                        <div key={price.label} className={'-mx-3 w-[calc(100%+1.5rem)] rounded-none border-y px-4 py-3 transition-colors sm:-mx-4 sm:w-[calc(100%+2rem)] ' + (isSelected ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border/70 bg-background')}>
                          <div className="flex w-full items-center justify-between gap-3">
                            <span className="text-lg font-extrabold">₹{price.price.toLocaleString('en-IN')}</span>
                            <button type="button" aria-label={isSelected ? 'Unselect package' : 'Select package'} aria-pressed={isSelected} disabled={blockedByVehicleLock && !isSelected} onClick={() => { if (isSelected) { setSelectedCarServicePackage(null); } else { setCarServiceVehicleLocked(true); setSelectedCarServicePackage({ title: pkg.title, checkup: pkg.checkup, vehicleType: price.label, price: price.price, covered: pkg.covered }); } }} className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40 ' + (isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/50 bg-background hover:border-primary')}>
                              {isSelected && <ApperIcon name="Check" size={18} />}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                  <div className="mt-0 border-t border-border px-3 pb-3 pt-3">
                    <h4 className="mb-2 flex items-center gap-2 text-sm font-bold"><ApperIcon name="ClipboardCheck" size={17} className="text-primary" />What's included</h4>
                    <ul className="space-y-1.5 text-sm leading-snug text-muted-foreground">
                      {pkg.covered.map((item) => <li key={item} className="flex items-start gap-2"><ApperIcon name="Check" size={15} className="mt-0.5 shrink-0 text-emerald-600" /><span>{item}</span></li>)}
                    </ul>
                  </div>
              </Card>
            ))}
          </div>
        </section>
      )}
      {isCarWash && (
        <section className="mx-auto -mt-4 mb-4 max-w-5xl space-y-3" aria-label="Car Wash service packages">
          <div className="mb-2 text-center">
            <h2 className="text-xl font-bold sm:text-2xl">Car Wash Services</h2>
          </div>
          <div className="mb-5 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
            <div className="mb-3 text-center"><h3 className="font-bold">Select Car Type</h3><p className="mt-1 text-sm text-muted-foreground">Choose your car type to see prices.</p></div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                aria-pressed={washCarType === 'small'}
                disabled={washVehicleLocked && washCarType !== 'small'}
                onClick={() => switchWashCarType('small')}
                className={'overflow-hidden rounded-xl border-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 ' + (washCarType === 'small' ? 'border-primary bg-background shadow-md' : 'border-border bg-background/70 hover:border-primary/40')}
              >
                <div className="flex h-28 w-full items-center justify-center overflow-hidden bg-white p-1 sm:h-36">
                  <img
                    src="data:image/webp;base64,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"
                    alt="White Hatchback / Sedan"
                    loading="lazy"
                    className="h-full w-full object-contain"
                  />
                </div>
                <span className="block border-t border-border/70 px-2 py-3 text-sm font-bold leading-snug">Hatchback / Sedan</span>
                {washCarType === 'small' && <span className="flex items-center justify-center gap-1 pb-2 text-xs font-semibold text-primary"><ApperIcon name="CheckCircle2" size={15} /> Selected</span>}
              </button>
              <button
                type="button"
                aria-pressed={washCarType === 'suv'}
                disabled={washVehicleLocked && washCarType !== 'suv'}
                onClick={() => switchWashCarType('suv')}
                className={'overflow-hidden rounded-xl border-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 ' + (washCarType === 'suv' ? 'border-primary bg-background shadow-md' : 'border-border bg-background/70 hover:border-primary/40')}
              >
                <div className="flex h-28 w-full items-center justify-center overflow-hidden bg-white p-1 sm:h-36">
                  <img
                    src="data:image/webp;base64,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"
                    alt="White SUV / Big Car"
                    loading="lazy"
                    className="h-full w-full object-contain"
                  />
                </div>
                <span className="block border-t border-border/70 px-2 py-3 text-sm font-bold leading-snug">SUV / Big Car</span>
                {washCarType === 'suv' && <span className="flex items-center justify-center gap-1 pb-2 text-xs font-semibold text-primary"><ApperIcon name="CheckCircle2" size={15} /> Selected</span>}
              </button>
            </div>
            {washVehicleLocked && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-background/80 p-3 text-sm">
                <span className="text-muted-foreground">Vehicle type is locked for this Car Wash draft.</span>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowVehicleChangeConfirm(true)}>Cancel Booking &amp; Change Vehicle</Button>
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {CAR_WASH_OPTIONS.map((option) => (
              <Card key={option.title} className="group flex flex-col self-start overflow-hidden rounded-2xl border border-border/70 bg-card p-0 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
                <div className={'flex items-center gap-3 border-b border-border/70 bg-gradient-to-r from-primary/5 via-background to-sky-500/5 ' + (option.title === 'Interior Deep Clean' || option.title === 'Rubbing & Detailing' ? 'px-3 py-1.5 sm:px-3 sm:py-1.5' : option.title === 'Complete Car Wash' || option.title === 'Exterior Only' || option.title === 'Interior Only' ? 'p-3 sm:p-3' : 'min-h-28 p-4 sm:min-h-32 sm:p-5')}>
                  <div className={'flex shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ' + (option.title === 'Complete Car Wash' || option.title === 'Interior Deep Clean' || option.title === 'Rubbing & Detailing' ? 'size-10 sm:size-12' : 'size-12 sm:size-14')}><ApperIcon name={option.icon} size={option.title === 'Complete Car Wash' ? 22 : 26} /></div>
                  <div className="min-w-0">
                    <h3 className={'text-lg font-bold leading-snug text-foreground sm:text-xl ' + (option.title === 'Complete Car Wash' || option.title === 'Interior Only' || option.title === 'Interior Deep Clean' || option.title === 'Rubbing & Detailing' ? 'mt-0' : 'mt-1')}>{option.title}</h3>
                    {option.description && option.title !== 'Rubbing & Detailing' && option.title !== 'Interior Deep Clean' && <p className={'mt-1 ' + (option.title === 'Interior Only' ? 'leading-snug' : 'leading-relaxed') + ' text-muted-foreground ' + (option.title === 'Complete Car Wash' ? 'text-xs sm:text-sm' : 'text-sm')}>{option.description}</p>}
                  </div>
                </div>
                <div className={'flex flex-col ' + (option.title === 'Exterior Only' || option.title === 'Interior Only' || option.title === 'Interior Deep Clean' || option.title === 'Rubbing & Detailing' || option.title === 'Complete Car Wash' ? '-mt-4 px-2 pb-2 pt-0 sm:-mt-4 sm:px-2 sm:pb-2 sm:pt-0' : 'p-3 sm:p-4')}>
                  {option.title !== 'Exterior Only' && option.title !== 'Interior Only' && option.title !== 'Interior Deep Clean' && option.title !== 'Rubbing & Detailing' && !(option.title === 'Complete Car Wash' && washCarType === 'small') && <div className={'flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground ' + (option.title === 'Complete Car Wash' ? 'mb-1' : 'mb-2')}><span>{option.title === 'Complete Car Wash' && washCarType === 'small' ? 'Package price' : 'Vehicle &amp; price'}</span><span>INR</span></div>}
                  <div className="grid content-start gap-2">
                  {option.prices.filter((priceOption) => washCarType === 'suv' ? /SUV|Big Car/i.test(priceOption.label) : !/SUV|Big Car/i.test(priceOption.label)).map((priceOption) => {
                    const id = option.title + '::' + priceOption.label;
                    const selectedWashItem = washCart.find((item) => item.title === option.title);
                    const qty = selectedWashItem?.variant === priceOption.label ? selectedWashItem.qty : 0;
                    return (
                      <div key={priceOption.label} className={'rounded-xl border transition-colors ' + (option.title === 'Interior Only' || option.title === 'Interior Deep Clean' || option.title === 'Rubbing & Detailing' ? 'p-2' : option.title === 'Complete Car Wash' || option.title === 'Exterior Only' ? 'p-2' : 'p-3') + ' ' + (qty ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border/80 bg-background hover:border-primary/30')}>
                        <div className={'flex items-center gap-2 ' + (option.title === 'Interior Only' ? 'min-h-0' : 'items-start')}>
                          {option.title !== 'Exterior Only' && option.title !== 'Interior Only' && !(option.title === 'Complete Car Wash' && washCarType === 'small') && !(option.title === 'Interior Deep Clean' && washCarType === 'small') && !(option.title === 'Rubbing & Detailing' && washCarType === 'small') && <div className={'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ' + (/SUV|Big Car/i.test(priceOption.label) ? 'bg-sky-500/10 text-sky-700' : 'bg-primary/10 text-primary')}><ApperIcon name={/SUV|Big Car/i.test(priceOption.label) ? 'Truck' : 'CarFront'} size={17} /></div>}
                          <div className="min-w-0 flex-1">
                            {option.title !== 'Interior Only' && <div className="text-xs font-semibold leading-snug sm:text-sm">{option.title === 'Exterior Only' ? (washCarType === 'suv' ? priceOption.label.replace(/^SUV \/ Big Car — /, 'Exterior Car Wash ') : priceOption.label.replace(/^Small Car — /, 'Exterior Car Wash ')) : (option.title === 'Interior Deep Clean' || option.title === 'Rubbing & Detailing') ? priceOption.label.replace(/^(Small Car|SUV \/ Big Car) — /, '') : option.title === 'Complete Car Wash' ? (washCarType === 'small' ? '' : priceOption.label) : priceOption.label.replace(/^(Small Car \(Hatchback \/ Sedan\)|Small Car|SUV \/ Big Car) —? ?/, '')}</div>}
                            <div className={(option.title === 'Complete Car Wash' || option.title === 'Interior Only' ? 'mt-0' : 'mt-1') + ' text-xl font-extrabold tracking-tight'}>₹{priceOption.price.toLocaleString('en-IN')}</div>
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
            <Card className={'flex flex-col self-start rounded-2xl border p-4 text-center shadow-sm ' + (includePickupDrop ? 'border-primary ring-2 ring-primary/20' : 'border-border/70')}>
              <h3 className="w-full text-center text-lg font-bold">Pickup &amp; Drop On Request</h3>
            </Card>
          </div>
        </section>
      )}
      <div className="mx-auto grid max-w-4xl gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <Card id="car-wash-selected-summary" className={'border-2 border-primary/20 ' + (isInsuranceClaim ? 'p-2' : 'p-6')}>
          {!isInsuranceClaim && (
            <div className="flex items-center gap-4">
              <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <ApperIcon name={vehicle === 'car' ? 'Car' : 'Bike'} size={34} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Service Selected</div>
                <div className="mt-1 text-lg font-semibold">{tr(isDieselRequest ? 'Diesel on Demand' : displayIssue, language)}</div>
              </div>
            </div>
          )}
          {isDieselRequest ? (
            <div className="mt-5 rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center gap-2 font-semibold"><ApperIcon name="Fuel" size={18} />Diesel Cost &amp; Delivery Charges</div>
              <div className="mt-3 space-y-3 text-sm">
                <div><div className="font-semibold">Diesel Cost</div><p className="mt-1 text-muted-foreground">As per actual diesel price.</p></div>
                <div><div className="font-semibold">Delivery Charges</div><p className="mt-1 text-muted-foreground">Based on distance and delivery time.</p></div>
              </div>
              <p className="mt-3 border-t border-primary/15 pt-3 text-sm font-medium">Final amount = Actual diesel cost + Delivery charges</p>
            </div>
          ) : isCarWash ? (
            <div className="mt-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <div className="flex items-center gap-2 font-semibold"><ApperIcon name="ShoppingCart" size={16} />Selected Car Wash Packages</div>
              {washCartSummary.items.length ? (
                <div className="mt-3 space-y-2">
                  {washCartSummary.items.map((item) => (
                    <div key={item.title + '::' + item.variant} className="flex items-start justify-between gap-3 border-b border-primary/10 pb-2 text-sm last:border-b-0 last:pb-0">
                      <div className="min-w-0"><div className="font-medium">{item.title} — {item.variant.replace(/^Small Car — /, '').replace(/^SUV \/ Big Car — /, '')}</div>{item.addons?.length > 0 && <div className="mt-0.5 text-xs text-muted-foreground">{item.addons.map((addon) => addon.label).join(', ')}</div>}</div>
                      <div className="shrink-0 font-semibold">₹{item.lineTotal.toLocaleString('en-IN')}</div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-3 border-b border-primary/10 pb-2 text-sm"><span>LOCAL Platform Fee <span className="text-xs text-muted-foreground">(per booking)</span></span><span className="font-semibold">₹{CAR_WASH_PLATFORM_FEE}</span></div>
                  {includePickupDrop && <div className="flex items-center justify-between gap-3 border-b border-primary/10 pb-2 text-sm"><span>Pickup &amp; Drop <span className="text-xs text-muted-foreground">(indicative)</span></span><span className="font-semibold">₹100</span></div>}
                  <Button type="button" onClick={refreshEstimatedTotal} className="mt-3 flex w-full items-center justify-between rounded-lg border border-primary bg-primary px-3 py-3 text-primary-foreground shadow-sm hover:bg-primary/90"><span className="font-bold">Press For Total</span><span className="text-lg font-extrabold">₹{estimatedTotalValue.toLocaleString('en-IN')}</span></Button>
                </div>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">No package selected yet.</p>
              )}
            </div>
          ) : isCarService ? (
            <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
              {selectedCarServicePackage ? (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary"><ApperIcon name="CheckCircle2" size={15} /> Package selected</div>
                      <h3 className="mt-1 text-lg font-extrabold">{selectedCarServicePackage.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{selectedCarServicePackage.checkup}</p>
                    </div>
                    <strong className="shrink-0 text-xl">₹{Number(selectedCarServicePackage.price || 0).toLocaleString('en-IN')}</strong>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-primary/15 pt-3 text-sm">
                    <span className="text-muted-foreground">Vehicle type</span>
                    <span className="font-semibold">{selectedCarServicePackage.vehicleType}</span>
                  </div>
                  <div className="mt-3 border-t border-primary/15 pt-3">
                    <p className="text-sm font-semibold">What's included</p>
                    <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                      {(Array.isArray(selectedCarServicePackage.covered) ? selectedCarServicePackage.covered : []).map((item) => (
                        <li key={item} className="flex items-start gap-2"><ApperIcon name="Check" size={15} className="mt-0.5 shrink-0 text-emerald-600" /><span>{item}</span></li>
                      ))}
                    </ul>
                  </div>
                  <p className="mt-3 border-t border-primary/15 pt-3 text-xs leading-relaxed text-muted-foreground">Listed package price. Any additional work or revised amount must be explained by LOCAL Customer Care and approved by you before work begins.</p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 font-semibold"><ApperIcon name="ClipboardList" size={18} /> Choose a Car Service package</div>
                  <p className="mt-1 text-sm text-muted-foreground">Select Economy Service, Normal Service, or Major Service above. Your selected vehicle type, package, inclusions, and listed price will appear here.</p>
                </>
              )}
            </div>
          ) : isInsuranceClaim ? null : (
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
            <section className="mt-6 rounded-xl border-2 border-primary/25 bg-background p-4 sm:p-5" aria-labelledby="driver-route-title">
              <div className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><ApperIcon name="PhoneCall" size={23} /></div>
                <div>
                  <h2 id="driver-route-title" className="text-lg font-extrabold">Need a Driver?</h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Simply send your request. LOCAL Customer Care will call you to understand your journey, timing and other requirements, then share a clear quote for your approval. We will assign a driver only after you approve the quote.</p>
                </div>
              </div>
            </section>
          )}
          {isInsuranceClaim && (
            <div className="mt-0 rounded-lg border-2 border-primary/25 bg-background p-2">
              <input
                id="insurance-copy-upload"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                multiple
                onChange={(event) => setInsuranceFiles(Array.from(event.target.files ?? []))}
                className="sr-only"
              />
              <label
                htmlFor="insurance-copy-upload"
                className="inline-flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-center text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2"
              >
                <ApperIcon name="Upload" size={18} />
                Upload Car Insurance Copy
              </label>
              {insuranceFiles.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {insuranceFiles.map((file, index) => (
                    <li key={file.name + '-' + index} className="flex items-center gap-2">
                      <ApperIcon name="FileCheck" size={14} />
                      <span className="break-all">{file.name}</span>
                      <span className="shrink-0">({Math.max(1, Math.round(file.size / 1024))} KB)</span>
                    </li>
                  ))}
                </ul>
              )}
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
        <Card className={(isCarWash || isCarService) ? "p-3" : "p-6"}>
          {!isCarWash && !isCarService && !isProfessionalDriverService && !isInsuranceClaim && <>
            <div className="text-sm font-semibold">When do you need the service?</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button type="button" variant={serviceTiming === 'ASAP' ? 'default' : 'outline'} onClick={() => setServiceTiming('ASAP')}><ApperIcon name="Zap" size={16} /> Book Now</Button>
              <Button type="button" variant={serviceTiming === 'Scheduled' ? 'default' : 'outline'} onClick={() => setServiceTiming('Scheduled')}><ApperIcon name="CalendarClock" size={16} /> Schedule for Later</Button>
            </div>
            {serviceTiming === 'Scheduled' && <div className="mt-3"><label htmlFor="requested-service-time" className="text-sm font-medium">Choose date and time</label><Input id="requested-service-time" type="datetime-local" min={new Date(Date.now() + 60000).toISOString().slice(0, 16)} value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="mt-2" /><p className="mt-1 text-xs text-muted-foreground">Your selected time is a request, not a confirmed appointment. A Service Provider must accept it.</p></div>}
          </>}
          {!isCarEssentialsDelivery && !isCarWash && !isCarService && !isProfessionalDriverService && !isInsuranceClaim && <>
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
          {(location || isCarWash || isCarService || isProfessionalDriverService || isInsuranceClaim) && (
            <>
              {isCarEssentialsDelivery && location && <div className="mt-5 rounded-lg border bg-muted/30 p-3 text-sm"><div className="font-semibold">Delivery address confirmed</div><div className="mt-1 text-muted-foreground">{location.text}</div><p className="mt-1 text-xs text-muted-foreground">We’ll use this address for the delivery request. Availability and final price still need provider confirmation.</p></div>}
              <Button className="mt-2 w-full" onClick={isCarWash ? () => setShowCarWashQuoteReview(true) : isCarService ? () => setShowCarServiceQuoteReview(true) : createRequest} disabled={(!isProfessionalDriverService && !isInsuranceClaim && location?.serviceable === false) || ((isCarWash || isCarService) && !location) || creating || (isOtherIssue && !isCarEssentialsDelivery && !isProfessionalDriverService && !problemDetails.trim()) || (isCarWash && normalizedWashCart.length === 0) || (isCarService && !selectedCarServicePackage) || (isCarFlatPuncture && !punctureDispatchConsent)}>
                <ApperIcon name="Send" size={17} />
                {creating ? tr('Sharing request…', language) : isCarWash ? 'Book My Car Wash' : isCarService ? 'Book Your Car Service' : isBikeCareRequest ? 'Submit Request to LOCAL' : isCarFlatPuncture ? 'Find Nearby Help' : isCarEssentialsDelivery ? 'Submit Delivery Request' : isInsuranceClaim ? 'Get Free Consultation' : isProfessionalDriverService ? 'Request a Driver' : /driver/i.test(requestedService) ? 'Find LOCAL Drivers' : pricingMode === 'Fixed Price' ? tr('Continue with listed price', language) : pricingMode === 'Urgent Dispatch' ? 'Find LOCAL Service Providers' : tr('Find LOCAL Service Providers', language)}
              </Button>
              {(isCarWash || isCarService) && (CUSTOMER_CARE_PHONE ? <Button asChild type="button" variant="outline" className="mt-2 w-full"><a href={'tel:' + CUSTOMER_CARE_PHONE}><ApperIcon name="Phone" size={17} /> Call Customer Care</a></Button> : <Button type="button" variant="outline" className="mt-2 w-full" disabled title="Customer Care phone number has not been configured"><ApperIcon name="Phone" size={17} /> Call Customer Care</Button>)}
              {(isCarWash || isCarService) && !location && <p className="mt-2 text-center text-xs text-amber-700">Your saved location isn’t available. Please update your location in your profile before booking.</p>}
            </>
          )}
        </Card>
      </div>
      {isCarService && showCarServiceQuoteReview && selectedCarServicePackage && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setShowCarServiceQuoteReview(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="car-service-quote-title" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border bg-background p-5 shadow-xl sm:rounded-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">LOCAL · Car Service</p><h2 id="car-service-quote-title" className="mt-1 text-xl font-extrabold">Review Your Car Service Booking</h2><p className="mt-1 text-sm text-muted-foreground">Check your selected vehicle, package and listed price before submitting.</p></div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setShowCarServiceQuoteReview(false)} aria-label="Close quote review"><ApperIcon name="X" size={18} /></Button>
            </div>
            <div className="mt-5 rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Vehicle type</p><p className="mt-1 font-semibold">{selectedCarServicePackage.vehicleType}</p><p className="mt-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Selected package</p><p className="mt-1 text-lg font-bold">{selectedCarServicePackage.title}</p><p className="mt-1 text-sm text-muted-foreground">{selectedCarServicePackage.checkup}</p></div><strong className="shrink-0 text-xl">₹{selectedCarServicePackage.price.toLocaleString('en-IN')}</strong></div>
              <div className="mt-4 border-t pt-3 space-y-2 text-sm"><div className="flex items-center justify-between gap-3"><span>Package price</span><strong>₹{Number(selectedCarServicePackage.price).toLocaleString('en-IN')}</strong></div><div className="flex items-center justify-between gap-3"><span>LOCAL Platform Fee (per booking)</span><strong>₹{CAR_SERVICE_PLATFORM_FEE}</strong></div><div className="flex items-center justify-between gap-3 border-t pt-3 text-base"><strong>Indicative total</strong><strong className="text-lg">₹{(Number(selectedCarServicePackage.price) + CAR_SERVICE_PLATFORM_FEE).toLocaleString('en-IN')}</strong></div></div>
              <div className="mt-4 border-t pt-3"><p className="text-sm font-semibold">What's included</p><ul className="mt-2 space-y-2 text-sm text-muted-foreground">{selectedCarServicePackage.covered.map((item) => <li key={item} className="flex gap-2"><ApperIcon name="Check" size={15} className="mt-0.5 shrink-0 text-emerald-600" /><span>{item}</span></li>)}</ul></div>
            </div>
            <div className="mt-4 rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">The ₹25 LOCAL Platform Fee is charged once per booking and is included in the indicative total above. This is not a final invoice. LOCAL Customer Care will confirm availability and any additional work or revised price with you before service starts.</div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2"><Button type="button" variant="outline" onClick={() => setShowCarServiceQuoteReview(false)} disabled={creating}>Back to packages</Button><Button type="button" onClick={createRequest} disabled={creating || !selectedCarServicePackage || !location || location.serviceable === false}>{creating ? 'Sending request…' : 'Confirm & Book Your Car Service'}</Button></div>
          </section>
        </div>
      )}
      {isCarWash && showCarWashQuoteReview && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setShowCarWashQuoteReview(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="car-wash-quote-title" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border bg-background p-5 shadow-xl sm:rounded-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">LOCAL · Car Wash</p><h2 id="car-wash-quote-title" className="mt-1 text-xl font-extrabold">Review Your Car Wash Quote</h2><p className="mt-1 text-sm text-muted-foreground">Check your selected services and estimated charges before booking.</p></div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setShowCarWashQuoteReview(false)} aria-label="Close quote review"><ApperIcon name="X" size={18} /></Button>
            </div>
            <div className="mt-5 mb-4 rounded-lg border border-primary/25 bg-primary/5 p-3"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Car type selected</p><p className="mt-1 font-bold">{washCarType === 'suv' ? 'SUV / Big Car' : 'Hatchback / Sedan'}</p></div><div><h3 className="mb-2 text-sm font-bold">Selected services</h3><div className="divide-y rounded-xl border">
              {washCartSummary.items.map((item) => <div key={'quote-' + item.title + '::' + item.variant} className="flex items-start justify-between gap-3 p-3 text-sm"><div className="min-w-0"><p className="font-semibold">{item.title}</p><p className="mt-0.5 text-muted-foreground">{item.variant.replace(/^Small Car — /, '').replace(/^SUV \/ Big Car — /, '')}{item.qty > 1 ? ' · Qty ' + item.qty : ''}</p>{item.addons?.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Extras: {item.addons.map((addon) => addon.label).join(', ')}</p>}</div><p className="shrink-0 font-bold">₹{item.lineTotal.toLocaleString('en-IN')}</p></div>)}
            </div></div>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3"><span>Selected services subtotal</span><strong>₹{washCartSummary.subtotal.toLocaleString('en-IN')}</strong></div>
              {includePickupDrop && <div className="flex items-start justify-between gap-3"><div><p>Pickup &amp; Drop</p><p className="text-xs text-muted-foreground">Indicative charge, subject to Customer Care confirmation</p></div><strong>₹100</strong></div>}
              <div className="flex items-start justify-between gap-3"><div><p>LOCAL Platform Fee</p><p className="text-xs text-muted-foreground">Charged once per booking</p></div><strong>₹{CAR_WASH_PLATFORM_FEE}</strong></div>
              <div className="flex items-center justify-between gap-3 border-t pt-3 text-base"><strong>Estimated total</strong><strong className="text-xl">₹{estimatedTotalValue.toLocaleString('en-IN')}</strong></div>
            </div>
            <div className="mt-4 rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">This is an estimate, not a final invoice or payment request. LOCAL Customer Care will confirm the details and any revised quote with you before work begins. Any revised amount requires your approval.</div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2"><Button type="button" variant="outline" onClick={() => setShowCarWashQuoteReview(false)} disabled={creating}>Back to packages</Button><Button type="button" onClick={createRequest} disabled={creating || washCartSummary.items.length === 0 || !location || location.serviceable === false}>{creating ? 'Sending request…' : 'Confirm & Book My Car Wash'}</Button></div>
          </section>
        </div>
      )}
      {showVehicleChangeConfirm && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setShowVehicleChangeConfirm(false); }}>
          <section role="alertdialog" aria-modal="true" aria-labelledby="vehicle-change-confirm-title" className="w-full max-w-md rounded-t-2xl border bg-background p-5 shadow-xl sm:rounded-2xl sm:p-6">
            <h2 id="vehicle-change-confirm-title" className="text-lg font-extrabold">Cancel Booking &amp; Change Vehicle?</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Changing your vehicle will clear the current {isCarWash ? 'Car Wash selections and quote' : 'Car Service package and quote review'}. Nothing has been submitted to Customer Care yet. Do you want to continue?</p>
            <div className="mt-5 grid grid-cols-2 gap-3"><Button type="button" variant="outline" onClick={() => setShowVehicleChangeConfirm(false)}>Keep Current Booking</Button><Button type="button" onClick={cancelCurrentVehicleDraft}>Yes, Change Vehicle</Button></div>
          </section>
        </div>
      )}
    </div>
  );
}