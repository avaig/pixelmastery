import { EntityFormPage } from '@/components/local/EntityPages';

export const route = { path: '/technicians/:id/edit', layout: 'owner', access: "profile === 'Admin_c'" };

export default function TechniciansEdit() {
  return <EntityFormPage entity="technicians" edit />;
}