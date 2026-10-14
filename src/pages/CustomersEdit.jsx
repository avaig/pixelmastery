import { EntityFormPage } from '@/components/local/EntityPages';

export const route = { path: '/customers/:id/edit', layout: 'owner', access: "profile === 'Admin_c'" };

export default function CustomersEdit() {
  return <EntityFormPage entity="customers" edit />;
}