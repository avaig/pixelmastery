import { EntityFormPage } from '@/components/local/EntityPages';

export const route = { path: '/technicians/new', layout: 'owner', access: "profile === 'Admin_c'" };

export default function TechniciansNew() {
  return <EntityFormPage entity="technicians" />;
}