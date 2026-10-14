import { EntityListPage } from '@/components/local/EntityPages';

export const route = { path: '/technicians', layout: 'owner', access: "profile === 'Admin_c'" };
export const nav = { to: '/technicians', label: 'Service Providers', icon: 'Wrench', order: 4, profiles: ['Admin_c'], section: 'People' };

export default function TechniciansList() {
  return <EntityListPage entity="technicians" />;
}