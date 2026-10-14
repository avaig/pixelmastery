import { EntityDetailPage } from '@/components/local/EntityPages';

export const route = { path: '/technicians/:id', layout: 'owner', access: "profile === 'Admin_c'" };

export default function TechniciansDetail() {
  return <EntityDetailPage entity="technicians" />;
}