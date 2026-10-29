import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useAuth } from '@/layouts/RootLayout';
import ApperIcon from '@/components/ApperIcon';
import { getLanguage, setLanguage, tr } from '@/services/i18n';
import { sdk } from '@/services/sdk';
import CustomerLocationGate from '@/components/local/CustomerLocationGate';
import { getManualInstallHint, hasInstallPrompt, promptInstall, subscribeInstall } from '@/services/pwa';

const LOCAL_LOGO = '/local-logo.svg';

export const route = {
  path: '/',
  layout: 'public',
  access: 'public',
};

const vehicleOptions = [
  {
    icon: 'Truck',
    label: 'Roadside Assistance (RSA)',
    href: '/customer/vehicle/car',
  },
  {
    icon: 'CarFront',
    label: 'Car Care & Assistance',
    href: '/customer/car-care',
  },
  {
    icon: 'Bike',
    label: 'Bike Care & Assistance',
    href: '/customer/bike-care',
  },
  {
    icon: 'CarTaxiFront',
    label: 'Car Driver',
    href: '/customer/car-driver',
  },
  {
    icon: 'House',
    label: 'Home Services',
    href: '/customer/home-services',
  },
];

const helpCatalog = [
  { vehicle: 'car', issue: 'Battery / Won’t Start', terms: ['car battery', 'car battery dead', 'car won’t start', 'car wont start', 'car start', 'battery', 'jump start', 'battery dead', 'gaadi start nahi ho rahi', 'car start nahi ho rahi', 'gaadi start nahi ho rahi hai', 'battery down', 'गाड़ी बैटरी', 'कार बैटरी', 'गाड़ी स्टार्ट', 'गाड़ी स्टार्ट नहीं हो रही', 'कार स्टार्ट नहीं हो रही', 'बैटरी डाउन', 'बैटरी खत्म', 'बैटरी'] },
  { vehicle: 'bike', issue: 'Battery / Won’t Start', terms: ['bike battery', 'bike won’t start', 'bike wont start', 'bike start', 'bike start nahi ho rahi', 'bike start nahi ho rahi hai', 'scooty start nahi ho rahi', 'bike battery down', 'बाइक बैटरी', 'बाइक स्टार्ट', 'बाइक स्टार्ट नहीं हो रही', 'स्कूटी स्टार्ट नहीं हो रही', 'बाइक की बैटरी खत्म'] },
  { vehicle: 'car', issue: 'Flat Tyre / Puncture', terms: ['car puncture', 'car flat tyre', 'car flat tire', 'puncture car', 'tyre puncture', 'gaadi puncture', 'car ka tyre puncture', 'car tyre flat', 'टायर पंचर', 'कार पंचर', 'गाड़ी पंचर', 'गाड़ी का टायर पंचर', 'टायर में हवा नहीं', 'टायर फट गया'] },
  { vehicle: 'bike', issue: 'Flat Tyre / Puncture', terms: ['bike puncture', 'bike flat tyre', 'bike flat tire', 'puncture bike', 'bike ka tyre puncture', 'scooty puncture', 'बाइक पंचर', 'बाइक का टायर पंचर', 'स्कूटी पंचर'] },
  { vehicle: 'car', issue: 'Engine Overheating', terms: ['car overheating', 'engine overheating', 'engine hot', 'car engine hot', 'कार गरम', 'इंजन गर्म', 'इंजन ओवरहीट'] },
  { vehicle: 'bike', issue: 'Engine Overheating', terms: ['bike overheating', 'bike engine hot', 'बाइक गरम', 'बाइक इंजन गर्म'] },
  { vehicle: 'car', issue: 'Mechanical Breakdown', terms: ['car breakdown', 'car mechanical problem', 'car mechanic', 'car repair', 'car broke down', 'कार खराब', 'गाड़ी खराब', 'कार बंद'] },
  { vehicle: 'bike', issue: 'Mechanical Breakdown', terms: ['bike breakdown', 'bike mechanical problem', 'bike mechanic', 'bike repair', 'bike broke down', 'बाइक खराब'] },
  { vehicle: 'car', issue: 'Electrical Problem', terms: ['car electrical', 'car wiring', 'car electrical problem', 'car electricity', 'कार इलेक्ट्रिकल', 'कार बिजली', 'इलेक्ट्रिकल समस्या'] },
  { vehicle: 'bike', issue: 'Electrical Problem', terms: ['bike electrical', 'bike wiring', 'bike electrical problem', 'बाइक इलेक्ट्रिकल', 'बाइक बिजली'] },
  { vehicle: 'car', issue: 'Out of Fuel', terms: ['car fuel', 'car petrol', 'car diesel', 'car out of fuel', 'petrol finished car', 'fuel finished car', 'petrol khatam', 'diesel khatam', 'gaadi mein petrol khatam', 'car mein petrol khatam', 'fuel khatam', 'कार में पेट्रोल खत्म', 'कार में डीजल खत्म', 'गाड़ी में पेट्रोल खत्म', 'गाड़ी में डीजल खत्म', 'पेट्रोल खत्म', 'डीजल खत्म', 'ईंधन खत्म'] },
  { vehicle: 'bike', issue: 'Out of Fuel', terms: ['bike fuel', 'bike petrol', 'bike out of fuel', 'petrol finished bike', 'bike mein petrol khatam', 'scooty petrol khatam', 'बाइक में पेट्रोल खत्म', 'बाइक में पेट्रोल खत्म हो गया', 'स्कूटी में पेट्रोल खत्म'] },
  { vehicle: 'car', issue: 'Key Locked / Lockout', terms: ['car key locked', 'car lockout', 'keys locked in car', 'car keys inside', 'कार की चाबी अंदर', 'कार लॉक हो गई', 'चाबी लॉक'] },
  { vehicle: 'car', issue: 'Towing Required', terms: ['car towing', 'tow car', 'towing required', 'car tow truck', 'कार टोइंग', 'गाड़ी टोइंग', 'टो ट्रक'] },
  { vehicle: 'bike', issue: 'Towing Required', terms: ['bike towing', 'tow bike', 'bike tow', 'बाइक टोइंग'] },
  { vehicle: 'bike', issue: 'Chain / Drive Problem', terms: ['bike chain', 'chain problem', 'bike drive problem', 'बाइक चेन', 'चेन खराब'] },
  { vehicle: 'bike', issue: 'Clutch / Gear Problem', terms: ['bike clutch', 'bike gear', 'clutch problem bike', 'gear problem bike', 'बाइक क्लच', 'बाइक गियर'] },
  { vehicle: 'ambulance', issue: 'Ambulance', terms: ['ambulance', 'medical emergency', 'emergency ambulance', 'need ambulance', 'ambulance chahiye', 'ambulance bhejo', 'medical help', 'एम्बुलेंस', 'एम्बुलेंस चाहिए', 'एम्बुलेंस भेजो', 'मेडिकल इमरजेंसी', 'आपातकालीन एम्बुलेंस'] },
];

function normalizeHelpText(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[.,!?;:()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const genericHelpTerms = [
  { issue: 'Flat Tyre / Puncture', terms: ['puncture', 'flat tyre', 'flat tire', 'tyre puncture', 'टायर पंचर'] },
  { issue: 'Battery / Won’t Start', terms: ['battery', 'dead battery', 'स्टार्ट नहीं', 'बैटरी'] },
  { issue: 'Out of Fuel', terms: ['fuel', 'petrol', 'diesel', 'out of fuel', 'ईंधन', 'पेट्रोल', 'डीजल'] },
  { issue: 'Mechanical Breakdown', terms: ['breakdown', 'broke down', 'mechanical problem', 'repair', 'खराब', 'ब्रेकडाउन'] },
  { issue: 'Towing Required', terms: ['towing', 'tow truck', 'टोइंग', 'टो ट्रक'] },
  { issue: 'Engine Overheating', terms: ['overheating', 'engine hot', 'गर्म', 'ओवरहीट'] },
  { issue: 'Electrical Problem', terms: ['electrical', 'electricity', 'wiring', 'इलेक्ट्रिकल', 'बिजली'] },
];

function hasVehicle(text, vehicle) {
  const normalized = normalizeHelpText(text);
  if (vehicle === 'car') {
    return ['car', 'auto', 'चार पहिया', 'कार', 'गाड़ी', 'गाडी'].some((term) => normalized.includes(normalizeHelpText(term)));
  }
  if (vehicle === 'bike') {
    return ['bike', 'motorcycle', 'scooter', 'two wheeler', '2 wheeler', 'दो पहिया', 'बाइक', 'स्कूटर'].some((term) => normalized.includes(normalizeHelpText(term)));
  }
  return false;
}

function findHelp(text) {
  const normalized = normalizeHelpText(text);
  if (!normalized) return null;

  const driverSearchTerms = [
    'car driver', 'driver on demand', 'professional car driver', 'hire a driver', 'book a driver',
    'hourly driver', 'full day driver', 'full-day driver', 'outstation driver', 'emergency driver',
    'driver for my car', 'need a driver', 'chauffeur', 'कार ड्राइवर', 'ड्राइवर चाहिए',
    'ड्राइवर बुक करें', 'प्रोफेशनल कार ड्राइवर', 'घंटे के लिए ड्राइवर', 'पूरे दिन का ड्राइवर',
    'आउटस्टेशन ड्राइवर', 'इमरजेंसी ड्राइवर',
  ];
  if (driverSearchTerms.some((term) => normalized.includes(normalizeHelpText(term)))) {
    return { vehicle: 'car-driver', issue: 'Professional Car Driver', destination: '/customer/car-driver' };
  }

  const serviceSearches = [
    { result: { vehicle: 'car', issue: 'Other Issue', service: 'Insurance Claim Assistance' }, terms: ['insurance claim assistance', 'insurance claim', 'claim my car insurance', 'car insurance claim', 'vehicle insurance claim', 'insurance for car accident', 'claim insurance', 'insurance help', 'accident insurance', 'इंश्योरेंस क्लेम', 'कार इंश्योरेंस क्लेम', 'बीमा क्लेम', 'गाड़ी का बीमा क्लेम', 'बीमा का पैसा', 'insurance claim karna hai'] },
    { result: { destination: '/customer/car-essentials', vehicle: 'car', issue: 'Other Issue' }, terms: ['car essentials', 'engine oil delivery', 'engine oil', 'car coolant', 'engine coolant', 'adblue', 'def fluid', 'diesel exhaust fluid', 'car fluids', 'car oil', 'engine oil chahiye', 'coolant chahiye', 'इंजन ऑयल', 'इंजन ऑयल चाहिए', 'इंजन कूलेंट', 'कूलेंट चाहिए', 'एडब्लू', 'कार का तेल'] },
    { result: { vehicle: 'car', issue: 'Other Issue', service: 'Car Wash' }, terms: ['car wash', 'wash my car', 'washing car', 'vehicle wash', 'car cleaning', 'car dhoni hai', 'gaadi dhoni hai', 'gaadi dhulwani hai', 'car saaf karni hai', 'कार वॉश', 'कार धोना', 'गाड़ी धोना', 'गाड़ी धुलवानी है', 'कार साफ करनी है', 'गाड़ी साफ करनी है'] },
    { result: { vehicle: 'car', issue: 'Other Issue', service: 'Car Service' }, terms: ['car service', 'car servicing', 'service my car', 'car maintenance', 'routine service', 'car repair service', 'gaadi ki service', 'car ki service karani hai', 'कार सर्विस', 'कार की सर्विस', 'गाड़ी की सर्विस', 'गाड़ी की सर्विस करानी है', 'कार मेंटेनेंस'] },
    { result: { destination: '/customer/bike-care', vehicle: 'bike', issue: 'Bike Care & Assistance' }, terms: ['bike maintenance', 'bike servicing', 'bike rsa', 'bike roadside assistance', 'bike repair', 'scooty repair', 'bike ki service', 'bike ki servicing', 'बाइक मेंटेनेंस', 'बाइक सर्विस', 'बाइक की सर्विस', 'बाइक रिपेयर', 'स्कूटी रिपेयर'] },
    { result: { destination: '/customer/home-services', vehicle: 'home-services', issue: 'AC Technician' }, terms: ['ac technician', 'ac repair', 'ac service', 'ac servicing', 'ac not cooling', 'ac not cooling properly', 'ac gas refill', 'split ac', 'window ac', 'ac thanda nahi kar raha', 'ac thanda nahi ho raha', 'ac ki cooling nahi hai', 'ac mein gas bharni hai', 'air conditioner repair', 'एसी टेक्नीशियन', 'एसी रिपेयर', 'एसी सर्विस', 'एसी ठंडा नहीं कर रहा', 'एसी ठंडा नहीं हो रहा', 'एसी की कूलिंग नहीं', 'एसी में गैस भरनी है', 'स्प्लिट एसी', 'विंडो एसी'] },
    { result: { destination: '/customer/home-services', vehicle: 'home-services', issue: 'Computer Services' }, terms: ['computer service', 'computer repair', 'laptop repair', 'desktop repair', 'computer not working', 'laptop not working', 'computer thik karna hai', 'laptop thik karna hai', 'computer kharab hai', 'laptop kharab hai', 'कंप्यूटर सर्विस', 'कंप्यूटर रिपेयर', 'लैपटॉप रिपेयर', 'लैपटॉप खराब है', 'कंप्यूटर खराब है'] },
    { result: { destination: '/customer/home-services', vehicle: 'home-services', issue: 'GST & Tax Filing' }, terms: ['gst filing', 'gst return', 'tax filing', 'income tax return', 'itr filing', 'file my itr', 'tax consultant', 'gst return bharna', 'income tax bharna', 'जीएसटी रिटर्न', 'टैक्स फाइलिंग', 'इनकम टैक्स रिटर्न', 'आईटीआर भरना', 'जीएसटी भरना'] },
    { result: { destination: '/customer/home-services', vehicle: 'home-services', issue: 'Home Appliances' }, terms: ['home appliance', 'appliance repair', 'geyser repair', 'ro repair', 'water purifier repair', 'fridge repair', 'refrigerator repair', 'washing machine repair', 'fan repair', 'mixer grinder repair', 'microwave repair', 'chimney repair', 'heater repair', 'cooler repair', 'inverter repair', 'led light repair', 'iron repair', 'geyser kharab', 'fridge kharab', 'washing machine kharab', 'घर का सामान ठीक करना', 'गीजर खराब', 'आरओ खराब', 'फ्रिज खराब', 'वॉशिंग मशीन खराब', 'पंखा खराब', 'मिक्सर खराब', 'माइक्रोवेव खराब', 'कूलर खराब', 'इन्वर्टर खराब', 'इस्त्री खराब'] },
    { result: { destination: '/customer/home-services', vehicle: 'home-services', issue: 'Home Services' }, terms: ['home services', 'home service', 'ghar par service', 'ghar ke liye technician', 'technician at home', 'घर की सर्विस', 'घर पर सर्विस', 'घर के लिए टेक्नीशियन'] },
  ];
  const requestedService = serviceSearches.find((entry) => entry.terms.some((term) => normalized.includes(normalizeHelpText(term))));
  if (requestedService) return requestedService.result;

  if (['car care', 'car care and assistance', 'roadside assistance', 'road side assistance', 'rsa', 'roadside help', 'roadside assistance chahiye', 'car help', 'गाड़ी की मदद', 'कार की मदद', 'रोडसाइड असिस्टेंस', 'रोड साइड हेल्प'].some((term) => normalized.includes(normalizeHelpText(term)))) {
    return { vehicle: 'car-care', issue: 'Car Care & Assistance', destination: '/customer/car-care' };
  }

  if (['bike care', 'bike care and assistance', 'bike help', 'बाइक की मदद', 'बाइक केयर'].some((term) => normalized.includes(normalizeHelpText(term)))) {
    return { vehicle: 'bike-care', issue: 'Bike Care & Assistance', destination: '/customer/bike-care' };
  }

  if (['police assistance', 'police help', 'need police', 'police chahiye', 'पुलिस सहायता', 'पुलिस मदद', 'पुलिस बुलाओ'].some((term) => normalized.includes(normalizeHelpText(term)))) {
    return { destination: '/police-assistance', vehicle: 'emergency', issue: 'Police Assistance' };
  }

  if (['emergency help', 'urgent help', 'emergency assistance', 'आपातकालीन मदद', 'इमरजेंसी मदद'].some((term) => normalized.includes(normalizeHelpText(term)))) {
    return { destination: '/emergency-help', vehicle: 'emergency', issue: 'Emergency Help' };
  }

  const explicitVehicle = hasVehicle(normalized, 'car') ? 'car' : hasVehicle(normalized, 'bike') ? 'bike' : null;
  if (!explicitVehicle) {
    for (const generic of genericHelpTerms) {
      if (generic.terms.some((term) => normalized.includes(normalizeHelpText(term)))) {
        const options = helpCatalog.filter((item) => item.issue === generic.issue && ['car', 'bike'].includes(item.vehicle));
        if (options.length === 2) {
          return { ambiguous: true, issue: generic.issue, options };
        }
      }
    }
  }

  const matches = helpCatalog
    .map((item) => ({
      item,
      score: item.terms.reduce(
        (score, term) => score + (normalized.includes(normalizeHelpText(term)) ? normalizeHelpText(term).length : 0),
        0,
      ),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  const best = matches[0]?.item;
  if (!best) return null;

  const vehicleItem = explicitVehicle ? matches.find(({ item }) => item.vehicle === explicitVehicle)?.item : best;
  return vehicleItem ?? best;
}

export default function Home() {
  const [city, setCity] = useState('Prayagraj');
  const session = useSelector((state) => state.user.user);
  const { logout } = useAuth();
  const [language, setLanguageState] = useState(getLanguage);
  const [installAvailable, setInstallAvailable] = useState(hasInstallPrompt);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);

  const [helpText, setHelpText] = useState('');
  const [helpResult, setHelpResult] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');

  const SpeechRecognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

  useEffect(() => {
    const updateInstallState = () => {
      const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
      setInstallAvailable(hasInstallPrompt());

    };
    updateInstallState();
    const unsubscribe = subscribeInstall(updateInstallState);
    window.addEventListener('appinstalled', updateInstallState);
    return () => {
      unsubscribe();
      window.removeEventListener('appinstalled', updateInstallState);
    };
  }, []);

  useEffect(() => {
    const removeAaravSeedRequests = async () => {
      const seededNames = new Set(['CAR • Emergency Car Rental', 'BIKE • Emergency Car Rental']);
      const seededIds = new Set(['r2000001-0000-4000-8000-000000000001', 'r2000001-0000-4000-8000-000000000002']);
      try {
        const result = await sdk.table('service_requests_c').select(['Id', 'Name']).page(1, 1000).fetch();
        if (!result.success) return;
        for (const request of result.data ?? []) {
          if (seededNames.has(String(request.Name ?? '')) || seededIds.has(request.Id)) {
            await sdk.table('service_requests_c').remove({ Id: request.Id });
          }
        }
      } catch (error) {
        console.warn('Aarav demo request cleanup skipped:', error);
      }
    };
    removeAaravSeedRequests();
  }, []);

  useEffect(() => {
    if (!('geolocation' in navigator)) return undefined;

    let active = true;
    let lastLookup = 0;

    const updateCity = async (position) => {
      const now = Date.now();
      if (now - lastLookup < 60000) return;
      lastLookup = now;

      try {
        const { latitude, longitude } = position.coords;
        const response = await fetch(
          'https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' +
            latitude +
            '&longitude=' +
            longitude +
            '&localityLanguage=en'
        );
        if (!response.ok) return;
        const data = await response.json();
        const resolvedCity = data.city || data.locality || data.principalSubdivision;
        if (active && resolvedCity) setCity(resolvedCity);
      } catch {
        // Keep the launch-city fallback when reverse geocoding is unavailable.
      }
    };

    navigator.geolocation.getCurrentPosition(updateCity, () => {}, {
      enableHighAccuracy: false,
      maximumAge: 300000,
      timeout: 10000,
    });

    const watchId = navigator.geolocation.watchPosition(updateCity, () => {}, {
      enableHighAccuracy: false,
      maximumAge: 300000,
      timeout: 15000,
    });

    return () => {
      active = false;
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  const isCustomer = session?.profile === 'Customer_c';
  const isProvider = session?.profile === 'ServiceProvider_c';
  const isAdmin = session?.profile === 'Admin_c';
  const customerDestination = (href = '/customer') => {
    if (isCustomer) return href;
    if (isProvider) return '/service-provider';
    return '/customer/login';
  };

  function searchHelp() {
    const result = findHelp(helpText);
    setHelpResult(result);
    setSearchMessage(result ? '' : helpText.trim() ? tr('We could not identify that exact help yet. Try words like “car puncture”, “bike battery”, “petrol finished”, or “ambulance”.', language) : '');
  }

  async function handleInstallClick() {
    if (hasInstallPrompt()) {
      await promptInstall();
      setInstallAvailable(hasInstallPrompt());
      return;
    }
    setInstallHelpOpen((open) => !open);
  }

  function openHelpResult(result = helpResult) {
    if (!result || result.ambiguous) return;
    if (result.destination) {
      window.location.assign(customerDestination(result.destination));
      return;
    }
    if (result.vehicle === 'ambulance') {
      window.location.assign(customerDestination('/customer/ambulance'));
      return;
    }
    const requestParams = { vehicle: result.vehicle, issue: result.issue };
    if (result.service) requestParams.service = result.service;
    const href = '/customer/request?' + new URLSearchParams(requestParams).toString();
    if (isCustomer) {
      window.location.assign(href);
    } else if (isProvider) {
      window.location.assign('/service-provider');
    } else {
      window.location.assign('/customer/login');
    }
  }

  function startVoiceSearch() {
    if (!SpeechRecognition) {
      setSearchMessage(tr('Voice search is not available in this browser. You can type your request instead.', language));
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = language === 'hi' ? 'hi-IN' : 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      setIsListening(true);
      setSearchMessage('');
    };
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript ?? '';
      setHelpText(transcript);
      setHelpResult(findHelp(transcript));
    };
    recognition.onerror = () => {
      setSearchMessage(tr('Voice search could not hear you. Please try again or type your request.', language));
    };
    recognition.onend = () => setIsListening(false);
    recognition.start();
  }
  return (
    <div className="min-h-svh bg-white text-[#102c4d]">
      <CustomerLocationGate required={!isProvider && !isAdmin} allowProviderBypass />
      <header className="relative z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-7xl flex-nowrap items-start justify-between gap-2 px-2 py-2 sm:h-20 sm:items-center sm:gap-3 sm:px-8 sm:py-0 lg:px-10">
          <Link to="/" className="shrink-0 self-start sm:self-auto">
            <img
              src={LOCAL_LOGO}
              alt="LOCAL — Happy to Help"
              className="h-10 w-auto max-w-[34vw] sm:h-12 sm:max-w-none"
            />
          </Link>

          <div className="flex min-w-0 shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
            <div className="flex items-center justify-end gap-1 sm:gap-2">
            <div className="flex items-center rounded-full border border-slate-200 bg-slate-50 p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  const next = setLanguage('en');
                  setLanguageState(next);
                }}
                className={'rounded-full px-2 py-1 transition ' + (language === 'en' ? 'bg-white text-[#102c4d] shadow-sm' : 'text-slate-500 hover:text-[#102c4d]')}
                aria-pressed={language === 'en'}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = setLanguage('hi');
                  setLanguageState(next);
                }}
                className={'rounded-full px-2 py-1 transition ' + (language === 'hi' ? 'bg-white text-[#102c4d] shadow-sm' : 'text-slate-500 hover:text-[#102c4d]')}
                aria-pressed={language === 'hi'}
              >
                हिन्दी
              </button>
            </div>
            {session ? (
              <>
                <Link
                  to={isAdmin ? '/admin' : isProvider ? '/service-provider' : '/customer'}
                  className="whitespace-nowrap rounded-full bg-[#102c4d] px-2.5 py-2 text-xs font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#183c64] sm:px-5 sm:py-2.5 sm:text-sm"
                >
                  {tr(isAdmin ? 'Admin Dashboard' : 'My Dashboard', language)}
                </Link>
              </>
            ) : (
              <Link
                to="/login"
                className="rounded-full bg-[#102c4d] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#183c64] sm:px-5 sm:py-2.5"
              >
                {tr('Sign In', language)}
              </Link>
            )}
            </div>
            {session && (
              <button
                type="button"
                onClick={logout}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold text-[#102c4d] transition hover:bg-slate-50 sm:px-5 sm:py-2.5 sm:text-sm"
              >
                {tr('Sign out', language)}
              </button>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="relative isolate overflow-hidden bg-white">
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <div className="absolute -left-32 top-12 h-80 w-80 rounded-full bg-[#f4b61a] blur-3xl" />
            <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-cyan-400 blur-3xl" />
          </div>

          <div className="absolute -right-20 top-32 h-64 w-64 rounded-full bg-emerald-100/70 blur-3xl pointer-events-none" />

          <div className="relative mx-auto max-w-5xl px-4 py-6 text-center sm:px-8 sm:py-16 lg:px-10 lg:py-20">
            <div className="mx-auto mb-4 max-w-md sm:mb-5">
              <button
                type="button"
                onClick={handleInstallClick}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#f4b61a] px-5 py-3 text-sm font-extrabold text-[#102c4d] shadow-md transition hover:-translate-y-0.5 hover:bg-[#ffc52e] focus:outline-none focus:ring-2 focus:ring-[#102c4d] focus:ring-offset-2 sm:text-base"
                aria-expanded={installHelpOpen}
              >
                <ApperIcon name="Download" size={20} />
                {tr('Install LOCAL App', language)}
              </button>
              {installHelpOpen && (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left text-sm leading-6 text-[#102c4d] shadow-sm" role="status">
                  <div className="flex items-start gap-2">
                    <ApperIcon name="Smartphone" size={20} className="mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-extrabold">{tr('Add LOCAL to your phone', language)}</p>
                      <p className="mt-1">{getManualInstallHint()}</p>
                      <p className="mt-2 text-xs font-medium text-slate-600">{tr('If you do not see an install option, open this link in Chrome on Android or Safari on iPhone.', language)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInstallHelpOpen(false)}
                      className="rounded-lg p-1 text-slate-600 hover:bg-amber-100"
                      aria-label={tr('Close installation instructions', language)}
                    >
                      <ApperIcon name="X" size={18} />
                    </button>
                  </div>
                </div>
              )}
              {installAvailable && !installHelpOpen && (
                <p className="mt-2 text-xs font-semibold text-slate-500">{tr('Install for quicker access from your home screen', language)}</p>
              )}
            </div>

            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-800 sm:px-4 sm:py-2 sm:text-xs">
              <span className="size-2 rounded-full bg-emerald-600" />
              {tr('LOCAL Help in', language)} {city}
            </div>

            <h1 className="mx-auto mt-4 max-w-3xl text-3xl font-black leading-none tracking-tight text-[#102c4d] sm:mt-6 sm:text-5xl lg:text-6xl">
              {tr('Happy to Help', language)}
              <span
                aria-hidden="true"
                className="ml-1 inline-flex size-12 shrink-0 items-center justify-center align-middle sm:ml-2 sm:size-16"
              >
                <svg viewBox="0 0 64 64" className="size-full" role="img" aria-label="smile">
                  <circle cx="32" cy="32" r="29" fill="#A89B68" stroke="#102C4D" strokeWidth="3" />
                  <circle cx="23" cy="25" r="2.5" fill="#102C4D" />
                  <circle cx="41" cy="25" r="2.5" fill="#102C4D" />
                  <path d="M18 35c3 13 25 18 30 0" fill="none" stroke="#102C4D" strokeWidth="3.5" strokeLinecap="round" />
                </svg>
              </span>
            </h1>

            <p className="mx-auto mt-3 max-w-2xl px-2 text-base font-semibold tracking-wide text-slate-600 sm:mt-4 sm:text-xl">
              {tr('Services At Your Doorstep', language)}
            </p>



            <div id="services" className="mx-auto mt-5 max-w-3xl sm:mt-8">
              <div className="rounded-3xl border border-slate-200 bg-white p-3 text-left shadow-lg shadow-slate-200/50 sm:p-4">
                <div className="px-2 pb-2 text-xs font-bold uppercase tracking-[0.12em] text-[#102c4d]/60 sm:px-3">
                  {tr('What do you need help with?', language)}
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative min-w-0 flex-1">
                    <ApperIcon name="Search" size={19} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={helpText}
                      onChange={(event) => {
                        const value = event.target.value;
                        setHelpText(value);
                        setHelpResult(value.trim() ? findHelp(value) : null);
                        setSearchMessage('');
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') searchHelp();
                      }}
                      placeholder={tr('Type your problem or tap the mic', language)}
                      aria-label={tr('Type your problem or tap the mic', language)}
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-11 text-sm font-medium text-[#102c4d] outline-none transition focus:border-[#f4b61a] focus:ring-2 focus:ring-[#f4b61a]/20 sm:text-base"
                    />
                    <button
                      type="button"
                      onClick={startVoiceSearch}
                      className={'absolute right-1.5 top-1.5 flex size-9 items-center justify-center rounded-xl transition ' + (isListening ? 'bg-red-100 text-red-600' : 'text-slate-500 hover:bg-slate-200 hover:text-[#102c4d]')}
                      aria-label={tr(isListening ? 'Listening…' : 'Speak your problem', language)}
                      title={tr('Speak your problem', language)}
                    >
                      <ApperIcon name={isListening ? 'Mic2' : 'Mic'} size={18} />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={searchHelp}
                    className="flex h-12 shrink-0 items-center justify-center rounded-2xl bg-[#f4b61a] px-4 text-sm font-extrabold text-[#102c4d] transition hover:bg-[#ffc52e]"
                  >
                    <ApperIcon name="ArrowRight" size={18} />
                    <span className="hidden sm:ml-2 sm:inline">{tr('Find help', language)}</span>
                  </button>
                </div>
                {helpText.trim() && (
                  <div className="mt-3 rounded-2xl bg-slate-50 p-3">
                    {helpResult?.ambiguous ? (
                      <div>
                        <div className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">{tr('We found', language)}</div>
                        <div className="mt-0.5 text-sm font-extrabold text-[#102c4d] sm:text-base">{tr(helpResult.issue, language)}</div>
                        <div className="mt-3 text-sm font-medium text-slate-600">{tr('Which vehicle needs help?', language)}</div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {helpResult.options.map((option) => (
                            <button
                              key={option.vehicle}
                              type="button"
                              onClick={() => openHelpResult(option)}
                              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-left transition hover:border-[#f4b61a] hover:bg-[#fffaf0]"
                            >
                              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#102c4d] text-white">
                                <ApperIcon name={option.vehicle === 'car' ? 'Car' : 'Bike'} size={19} />
                              </div>
                              <span className="text-sm font-extrabold text-[#102c4d]">
                                {tr(option.vehicle === 'car' ? 'Car' : 'Bike', language)}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : helpResult ? (
                      <button type="button" onClick={() => openHelpResult(helpResult)} className="flex w-full items-center gap-3 text-left">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#102c4d] text-white">
                          <ApperIcon name={helpResult.vehicle === 'car' ? 'Car' : helpResult.vehicle === 'bike' ? 'Bike' : 'Ambulance'} size={22} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">{tr('We found', language)}</div>
                          <div className="mt-0.5 text-sm font-extrabold text-[#102c4d] sm:text-base">{tr(helpResult.issue, language)}</div>
                        </div>
                        <ApperIcon name="ArrowRight" size={19} className="shrink-0 text-[#102c4d]" />
                      </button>
                    ) : searchMessage ? (
                      <div className="text-sm font-medium leading-6 text-slate-600">{searchMessage}</div>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-4">
                {vehicleOptions.map((option) => (
                  <Link
                    key={option.label}
                    to={customerDestination(option.href)}
                    className={'group relative flex min-h-[128px] flex-col gap-2 rounded-2xl border border-white/15 bg-white p-2.5 text-left shadow-xl transition hover:-translate-y-1 hover:border-[#f4b61a] sm:min-h-[128px] sm:gap-3 sm:p-4 ' + (['Roadside Assistance (RSA)', 'Car Care & Assistance'].includes(option.label) ? 'pr-2.5 sm:pr-4' : '')}
                  >
                    <div className="flex w-full min-w-0 flex-1 items-center gap-2 sm:gap-4">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#102c4d] text-white transition group-hover:bg-[#f4b61a] group-hover:text-[#102c4d] sm:size-12">
                        <ApperIcon name={option.icon} size={23} className="sm:size-[25px]" />
                      </div>
                      <div className={'min-w-0 flex-1 ' + (option.label === 'Roadside Assistance (RSA)' ? 'text-center' : '')}>
                        <div className="text-sm font-extrabold leading-snug text-[#102c4d] sm:text-base">
                          {tr(option.label, language)}
                        </div>
                      </div>
                      {!['Roadside Assistance (RSA)', 'Car Care & Assistance', 'Bike Care & Assistance', 'Car Driver', 'Home Services'].includes(option.label) && <ApperIcon name="ArrowRight" size={19} className="shrink-0 text-[#102c4d]" />}
                    </div>
                    {['Car Care & Assistance', 'Bike Care & Assistance', 'Car Driver', 'Home Services'].includes(option.label) && (
                      <div className="w-full px-1 text-center text-xs font-semibold leading-snug text-slate-500 sm:text-sm">
                        {tr(option.label === 'Car Care & Assistance' ? 'Wash • Service • Insurance Help' : option.label === 'Bike Care & Assistance' ? 'Quick fixes • Smooth rides' : option.label === 'Car Driver' ? 'A trusted driver, when you need one' : 'AC Service • Electricians • Plumber • Much More', language)}
                      </div>
                    )}
                    {option.label === 'Roadside Assistance (RSA)' && (
                      <span className="inline-flex max-w-full items-center justify-center gap-1.5 self-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-extrabold leading-tight text-emerald-800 shadow-sm sm:gap-2 sm:px-3.5 sm:text-sm">
                        <span className="size-2.5 shrink-0 rounded-full bg-emerald-500" />
                        {tr('24×7 Available', language)}
                      </span>
                    )}
                    {!['Roadside Assistance (RSA)', 'Car Care & Assistance', 'Bike Care & Assistance', 'Car Driver', 'Home Services'].includes(option.label) && <ApperIcon name="ArrowRight" size={19} className="shrink-0 text-[#102c4d]" />}
                  </Link>
                ))}
                <div
                  aria-disabled="true"
                  className="relative flex min-h-[112px] cursor-default items-center gap-2 rounded-2xl border border-red-100 bg-red-50 p-2.5 text-left shadow-xl sm:min-h-[112px] sm:gap-4 sm:p-4"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white sm:size-12">
                    <ApperIcon name="Siren" size={23} className="sm:size-[25px]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-extrabold leading-snug text-[#102c4d] sm:text-base">
                      {tr('Emergency Help', language)}
                    </div>
                    <div className="mt-1 text-xs font-medium leading-tight text-slate-500 sm:text-sm">
                      {tr('Ambulance & immediate assistance', language)}
                    </div>
                    <span className="mt-2 inline-flex rounded-full border border-red-200 bg-white/80 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-red-700 sm:text-xs">
                      {tr('Coming Soon', language)}
                    </span>
                  </div>
                </div>
              </div>
            </div>


          </div>
        </section>



      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl justify-center px-4 py-3 sm:px-8 sm:py-6 lg:px-10">
          <Link
            to="/"
            aria-label="LOCAL — Happy to Help"
            className="inline-flex shrink-0 cursor-pointer"
            onClick={(event) => {
              event.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            <img
              src={LOCAL_LOGO}
              alt="LOCAL — Happy to Help"
              className="h-9 w-auto sm:h-11"
            />
          </Link>
        </div>
      </footer>
    </div>
  );
}
