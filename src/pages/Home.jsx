import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useAuth } from '@/layouts/RootLayout';
import ApperIcon from '@/components/ApperIcon';
import { getLanguage, setLanguage, tr } from '@/services/i18n';
import { sdk } from '@/services/sdk';
import CustomerLocationGate from '@/components/local/CustomerLocationGate';

const LOCAL_LOGO = '/local-logo.svg';

export const route = {
  path: '/',
  layout: 'public',
  access: 'public',
};

const vehicleOptions = [
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
];

const helpCatalog = [
  { vehicle: 'car', issue: 'Battery / Won’t Start', terms: ['car battery', 'car battery dead', 'car won’t start', 'car wont start', 'car start', 'battery', 'गाड़ी बैटरी', 'कार बैटरी', 'गाड़ी स्टार्ट', 'बैटरी'] },
  { vehicle: 'bike', issue: 'Battery / Won’t Start', terms: ['bike battery', 'bike won’t start', 'bike wont start', 'bike start', 'बाइक बैटरी', 'बाइक स्टार्ट'] },
  { vehicle: 'car', issue: 'Flat Tyre / Puncture', terms: ['car puncture', 'car flat tyre', 'car flat tire', 'puncture car', 'tyre puncture', 'टायर पंचर', 'कार पंचर'] },
  { vehicle: 'bike', issue: 'Flat Tyre / Puncture', terms: ['bike puncture', 'bike flat tyre', 'bike flat tire', 'puncture bike', 'बाइक पंचर'] },
  { vehicle: 'car', issue: 'Engine Overheating', terms: ['car overheating', 'engine overheating', 'engine hot', 'car engine hot', 'कार गरम', 'इंजन गर्म', 'इंजन ओवरहीट'] },
  { vehicle: 'bike', issue: 'Engine Overheating', terms: ['bike overheating', 'bike engine hot', 'बाइक गरम', 'बाइक इंजन गर्म'] },
  { vehicle: 'car', issue: 'Mechanical Breakdown', terms: ['car breakdown', 'car mechanical problem', 'car mechanic', 'car repair', 'car broke down', 'कार खराब', 'गाड़ी खराब', 'कार बंद'] },
  { vehicle: 'bike', issue: 'Mechanical Breakdown', terms: ['bike breakdown', 'bike mechanical problem', 'bike mechanic', 'bike repair', 'bike broke down', 'बाइक खराब'] },
  { vehicle: 'car', issue: 'Electrical Problem', terms: ['car electrical', 'car wiring', 'car electrical problem', 'car electricity', 'कार इलेक्ट्रिकल', 'कार बिजली', 'इलेक्ट्रिकल समस्या'] },
  { vehicle: 'bike', issue: 'Electrical Problem', terms: ['bike electrical', 'bike wiring', 'bike electrical problem', 'बाइक इलेक्ट्रिकल', 'बाइक बिजली'] },
  { vehicle: 'car', issue: 'Out of Fuel', terms: ['car fuel', 'car petrol', 'car diesel', 'car out of fuel', 'petrol finished car', 'fuel finished car', 'कार में पेट्रोल खत्म', 'कार में डीजल खत्म', 'ईंधन खत्म'] },
  { vehicle: 'bike', issue: 'Out of Fuel', terms: ['bike fuel', 'bike petrol', 'bike out of fuel', 'petrol finished bike', 'बाइक में पेट्रोल खत्म'] },
  { vehicle: 'car', issue: 'Key Locked / Lockout', terms: ['car key locked', 'car lockout', 'keys locked in car', 'car keys inside', 'कार की चाबी अंदर', 'कार लॉक हो गई', 'चाबी लॉक'] },
  { vehicle: 'car', issue: 'Towing Required', terms: ['car towing', 'tow car', 'towing required', 'car tow truck', 'कार टोइंग', 'गाड़ी टोइंग', 'टो ट्रक'] },
  { vehicle: 'bike', issue: 'Towing Required', terms: ['bike towing', 'tow bike', 'bike tow', 'बाइक टोइंग'] },
  { vehicle: 'bike', issue: 'Chain / Drive Problem', terms: ['bike chain', 'chain problem', 'bike drive problem', 'बाइक चेन', 'चेन खराब'] },
  { vehicle: 'bike', issue: 'Clutch / Gear Problem', terms: ['bike clutch', 'bike gear', 'clutch problem bike', 'gear problem bike', 'बाइक क्लच', 'बाइक गियर'] },
  { vehicle: 'ambulance', issue: 'Ambulance', terms: ['ambulance', 'medical emergency', 'emergency ambulance', 'need ambulance', 'एम्बुलेंस', 'मेडिकल इमरजेंसी', 'आपातकालीन एम्बुलेंस'] },
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
    { service: 'Insurance Claim Assistance', terms: ['insurance claim assistance', 'insurance claim', 'claim my car insurance', 'car insurance claim', 'vehicle insurance claim', 'insurance for car accident', 'claim insurance', 'इंश्योरेंस क्लेम', 'कार इंश्योरेंस क्लेम', 'बीमा क्लेम', 'गाड़ी का बीमा क्लेम'] },
    { service: 'Car Wash', terms: ['car wash', 'wash my car', 'washing car', 'vehicle wash', 'कार वॉश', 'कार धोना', 'गाड़ी धोना'] },
    { service: 'Car Service', terms: ['car service', 'car servicing', 'service my car', 'car maintenance', 'routine service', 'कार सर्विस', 'कार की सर्विस', 'गाड़ी की सर्विस'] },
  ];
  const requestedService = serviceSearches.find((entry) => entry.terms.some((term) => normalized.includes(normalizeHelpText(term))));
  if (requestedService) return { vehicle: 'car', issue: 'Other Issue', service: requestedService.service };

  if (['car care', 'car care and assistance', 'roadside assistance', 'road side assistance', 'rsa', 'roadside help', 'रोडसाइड असिस्टेंस'].some((term) => normalized.includes(normalizeHelpText(term)))) {
    return { vehicle: 'car-care', issue: 'Car Care & Assistance', destination: '/customer/car-care' };
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
  const [helpText, setHelpText] = useState('');
  const [helpResult, setHelpResult] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');

  const SpeechRecognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

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
  const providerDestination = isProvider ? '/service-provider' : '/service-provider/signup';

  function searchHelp() {
    const result = findHelp(helpText);
    setHelpResult(result);
    setSearchMessage(result ? '' : helpText.trim() ? tr('We could not identify that exact help yet. Try words like “car puncture”, “bike battery”, “petrol finished”, or “ambulance”.', language) : '');
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
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:h-20 sm:px-8 lg:px-10">
          <Link to="/" className="shrink-0">
            <img
              src={LOCAL_LOGO}
              alt="LOCAL — Happy to Help"
              className="h-12 w-auto sm:h-12"
            />
          </Link>

          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-full border border-slate-200 bg-slate-50 p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  const next = setLanguage('en');
                  setLanguageState(next);
                }}
                className={'rounded-full px-2.5 py-1 transition ' + (language === 'en' ? 'bg-white text-[#102c4d] shadow-sm' : 'text-slate-500 hover:text-[#102c4d]')}
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
                className={'rounded-full px-2.5 py-1 transition ' + (language === 'hi' ? 'bg-white text-[#102c4d] shadow-sm' : 'text-slate-500 hover:text-[#102c4d]')}
                aria-pressed={language === 'hi'}
              >
                हिन्दी
              </button>
            </div>
            {session ? (
              <>
                <Link
                  to={isAdmin ? '/admin' : isProvider ? '/service-provider' : '/customer'}
                  className="rounded-full bg-[#102c4d] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#183c64] sm:px-5 sm:py-2.5"
                >
                  {tr(isAdmin ? 'Admin Dashboard' : 'My Dashboard', language)}
                </Link>
                <button
                  type="button"
                  onClick={logout}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-[#102c4d] transition hover:bg-slate-50 sm:px-5 sm:py-2.5"
                >
                  {tr('Sign out', language)}
                </button>
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
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-800 sm:px-4 sm:py-2 sm:text-xs">
              <span className="size-2 rounded-full bg-emerald-600" />
              {tr('LOCAL Help in', language)} {city}
            </div>

            <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-black leading-none tracking-tight text-[#102c4d] sm:mt-6 sm:text-6xl lg:text-7xl">
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
              {tr('Local Needs. Local Solutions.', language)}
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

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                {vehicleOptions.map((option) => (
                  <Link
                    key={option.label}
                    to={customerDestination(option.href)}
                    className="group flex min-h-[88px] items-center gap-3 rounded-2xl border border-white/15 bg-white p-3 text-left shadow-xl transition hover:-translate-y-1 hover:border-[#f4b61a] sm:min-h-[104px] sm:gap-4 sm:p-4"
                  >
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#102c4d] text-white transition group-hover:bg-[#f4b61a] group-hover:text-[#102c4d] sm:size-12">
                      <ApperIcon name={option.icon} size={25} />
                    </div>
                    <div className="min-w-0 flex-1 text-sm font-extrabold text-[#102c4d] sm:text-base">
                      {tr(option.label, language)}
                    </div>
                    <ApperIcon name="ArrowRight" size={19} className="shrink-0 text-[#102c4d]" />
                  </Link>
                ))}
                <Link
                  to={customerDestination('/customer/ambulance')}
                  className="group flex min-h-[88px] items-center gap-3 rounded-2xl border border-red-100 bg-red-50 p-3 text-left shadow-xl transition hover:-translate-y-1 hover:border-red-200 hover:bg-white sm:min-h-[104px] sm:gap-4 sm:p-4"
                >
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white transition group-hover:bg-red-700 sm:size-12">
                    <ApperIcon name="Siren" size={25} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-extrabold text-[#102c4d] sm:text-base">
                      {tr('Emergency Help', language)}
                    </div>
                    <div className="mt-1 text-xs font-medium leading-tight text-slate-500 sm:text-sm">
                      {tr('Ambulance & immediate assistance', language)}
                    </div>
                  </div>
                  <ApperIcon name="ArrowRight" size={19} className="shrink-0 text-red-600 transition group-hover:translate-x-1" />
                </Link>
              </div>
            </div>

            <Link
              to={customerDestination('/customer/home-services')}
              className="group mx-auto mt-4 flex max-w-3xl items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-left transition hover:-translate-y-1 hover:border-emerald-300 hover:bg-white sm:mt-6 sm:gap-4 sm:p-4"
            >
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white transition group-hover:bg-emerald-700 sm:size-12">
                <ApperIcon name="House" size={25} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-extrabold text-[#102c4d] sm:text-base">
                    {tr('Home Services', language)}
                  </div>
                </div>
              </div>
              <ApperIcon
                name="ArrowRight"
                size={20}
                className="shrink-0 text-emerald-700 transition group-hover:translate-x-1"
              />
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-8 sm:px-8 sm:pb-10 lg:px-10">
          <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white px-4 py-6 shadow-sm sm:px-7 sm:py-7">
            <div className="pointer-events-none absolute -right-10 -top-12 size-36 rounded-full bg-emerald-50" />
            <div className="relative">
              <div className="text-center">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-emerald-700 sm:text-xs">{tr('Local Needs. Local Solutions.', language)}</p>
                <h2 className="mt-1 text-xl font-black tracking-tight text-[#102c4d] sm:text-2xl">{tr('Why Choose LOCAL?', language)}</h2>
                <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-slate-500 sm:text-sm">{tr('Local help, clear information, and a simpler way to arrange a service.', language)}</p>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:mt-6 sm:grid-cols-4 sm:gap-4">
                {[
                  { icon: 'MapPin', title: 'Nearby Help', detail: 'Find services around your location' },
                  { icon: 'ShieldCheck', title: 'Provider Checks', detail: 'Know which providers are verified' },
                  { icon: 'IndianRupee', title: 'Clear Pricing', detail: 'Review charges before confirming' },
                  { icon: 'Clock3', title: 'Arrival Updates', detail: 'See the expected arrival time' },
                ].map((item) => (
                  <div key={item.title} className="flex min-w-0 flex-col items-center rounded-2xl border border-slate-100 bg-slate-50/70 px-3 py-4 text-center transition hover:border-emerald-100 hover:bg-emerald-50/50 sm:px-3 sm:py-5">
                    <div className="flex size-11 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-sm ring-1 ring-slate-100 sm:size-12">
                      <ApperIcon name={item.icon} size={23} />
                    </div>
                    <h3 className="mt-3 text-sm font-extrabold leading-5 text-[#102c4d]">{tr(item.title, language)}</h3>
                    <p className="mt-1.5 text-xs leading-5 text-slate-500">{tr(item.detail, language)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-5 sm:px-8 sm:pb-12 lg:px-10 lg:pb-16">
          <div className="rounded-3xl bg-[#102c4d] px-4 py-5 text-center shadow-xl sm:px-8 sm:py-9">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#f4b61a] sm:text-xs">
              {tr('For Professionals', language)}
            </p>
            <Link
              to={providerDestination}
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-[#f4b61a] px-6 py-3 text-sm font-extrabold text-[#102c4d] transition hover:-translate-y-0.5 hover:bg-[#ffc52e] sm:mt-5 sm:gap-3 sm:px-7 sm:py-3.5 sm:text-sm"
            >
              {isProvider ? tr('Open Service Provider Dashboard', language) : tr('Join LOCAL As Service Provider', language)}
              <ApperIcon name="ArrowRight" size={18} />
            </Link>
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
