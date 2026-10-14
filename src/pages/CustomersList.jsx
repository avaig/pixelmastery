import { EntityListPage } from '@/components/local/EntityPages';

export const route = { path: '/customers', layout: 'owner', access: "profile === 'Admin_c'" };
export const nav = { to: '/customers', label: 'Customers', icon: 'Users', order: 3, profiles: ['Admin_c'], section: 'People' };

export default function CustomersList() {
  return <EntityListPage entity="customers" />;
}