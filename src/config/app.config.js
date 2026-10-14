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
    key: 'admin',
    name: 'Admin_c',
    profileSlug: "|cPAqavYolBZFFPt1x3MJZk4q/d+vO+V+yG3xhUHvdR0=",
    redirectAfterAuth: '/',
    authPage: {
      loginTitle: 'Admin Sign In',
      signupTitle: 'Create Admin Account',
      loginDescription: null,
      signupDescription: null,
    },
    altLinksLeadIn: 'Go to the right portal',
    altLinks: [
      { href: '/customer/login', label: 'I am Customer' },
      { href: '/serviceprovider/login', label: 'I am Service Provider' }
    ],
    reportsTo: null,
    hasSignup: false,
  },
  {
    key: 'customer',
    name: 'Customer_c',
    profileSlug: "|cPAqavYolBZFFPt1x3MJZnO9E84jQcr7it6Qf2WTDmE=",
    redirectAfterAuth: '/',
    authPage: {
      loginTitle: 'Customer Sign In',
      signupTitle: 'Create Customer Account',
      loginDescription: null,
      signupDescription: null,
    },
    altLinksLeadIn: 'Go to the right portal',
    altLinks: [
      { href: '/admin/login', label: 'I am Admin' },
      { href: '/serviceprovider/login', label: 'I am Service Provider' }
    ],
    reportsTo: "Admin",
    hasSignup: true,
  },
  {
    key: 'serviceprovider',
    name: 'ServiceProvider_c',
    profileSlug: "|cPAqavYolBZFFPt1x3MJZrlxsY2SezR33UsrfqnpKQo=",
    redirectAfterAuth: '/',
    authPage: {
      loginTitle: 'Service Provider Sign In',
      signupTitle: 'Create Service Provider Account',
      loginDescription: null,
      signupDescription: null,
    },
    altLinksLeadIn: 'Go to the right portal',
    altLinks: [
      { href: '/admin/login', label: 'I am Admin' },
      { href: '/customer/login', label: 'I am Customer' }
    ],
    reportsTo: null,
    hasSignup: true,
  }
];

export const GENERIC_AUTH = {
  loginTitle: 'Welcome to LOCAL',
  signupTitle: 'Create your LOCAL account',
  loginDescription: 'Connect with trusted local service providers.',
  signupDescription: 'Create an account to use LOCAL.',
  redirectAfterAuth: '/',
};