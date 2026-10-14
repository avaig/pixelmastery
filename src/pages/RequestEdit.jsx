import { EntityFormPage } from '@/components/local/EntityPages';

export const route = { path: '/requests/:id/edit', layout: 'owner', access: "profile === 'Customer_c' || profile === 'Admin_c'" };

export default function RequestEdit() {
  return <EntityFormPage entity="requests" edit />;
}