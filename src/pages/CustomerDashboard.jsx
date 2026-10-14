import { Navigate } from 'react-router-dom';

export const route = {
  path: '/customer',
  layout: 'owner',
  access: "profile === 'Customer_c'",
};

export const nav = {
  to: '/customer',
  label: 'My Dashboard',
  icon: 'LayoutDashboard',
  order: 1,
  profiles: ['Customer_c'],
};

export default function CustomerDashboard() {
  // The dashboard is the stable customer entry point; return customers to the main home screen.
  return <Navigate to="/" replace />;
}