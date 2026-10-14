import { EntityFormPage } from '@/components/local/EntityPages';

export const route = { path: '/customers/new', layout: 'owner', access: "profile === 'Admin_c'" };

export default function CustomersNew() {
  return <EntityFormPage entity="customers" />;
}