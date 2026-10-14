import { EntityListPage } from '@/components/local/EntityPages';

export const route = { path: '/responses', layout: 'owner', access: "profile === 'Customer_c' || profile === 'Technician_c' || profile === 'Admin_c'" };
export const nav = { to: '/responses', label: 'Service Provider Offers', icon: 'BadgeIndianRupee', order: 3, profiles: ['Technician_c', 'Admin_c'], section: 'Marketplace', count: { table: 'technician_responses_c' } };

export default function ResponsesList() {
  return <EntityListPage entity="responses" />;
}