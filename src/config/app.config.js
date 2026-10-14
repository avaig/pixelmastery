export const APP_CONFIG = {
  name: 'LOCAL',
  tagline: 'Happy to Help — Services Wherever You Need Them',
  emoji: '🛠️',
  icon: 'MapPinned',
  defaultTheme: 'system',
  defaultLoginRoute: '/customer/login',
};

export const AUTH_PROFILES = [
  {
    key: 'customer',
    profileSlug: 'customer',
    redirectAfterAuth: '/customer/car-care',
    authPage: {
      loginTitle: 'Customer sign in',
      signupTitle: 'Create your customer account',
      loginDescription: 'Request help from nearby service providers and compare offers.',
      signupDescription: 'Tell LOCAL what you need. Nearby service providers will respond.',
    },
    altLinksLeadIn: 'Choose how you use LOCAL',
    altLinks: [
      { label: 'Service Provider', href: '/service-provider/login' },
    ],
  },
  {
    key: 'service-provider',
    profileSlug: 'service-provider',
    redirectAfterAuth: '/service-provider',
    authPage: {
      loginTitle: 'Service Provider Login',
      signupTitle: 'Join LOCAL as a Service Provider',
      loginDescription: 'View nearby service requests, send quotes, and manage your accepted jobs.',
      signupDescription: 'Choose the services you offer and start receiving local requests.',
    },
    altLinksLeadIn: 'Choose how you use LOCAL',
    altLinks: [
      { label: 'Customer', href: '/customer/login' },
    ],
  },
  {
    key: 'admin',
    profileSlug: 'admin',
    redirectAfterAuth: '/admin',
    authPage: {
      loginTitle: 'LOCAL admin',
      signupTitle: 'Admin account',
      loginDescription: 'Manage customers, service providers, categories, requests, offers, and jobs.',
      signupDescription: 'Administrative access to the LOCAL marketplace.',
    },
    altLinksLeadIn: 'Protected administration',
    altLinks: [],
    hiddenFromNormalAuth: true,
  },
];

export const GENERIC_AUTH = {
  loginTitle: 'Welcome to LOCAL',
  signupTitle: 'Create your LOCAL account',
  loginDescription: 'Connect with trusted local service providers.',
  signupDescription: 'Create an account to use LOCAL.',
  redirectAfterAuth: '/',
};