import { EntityFormPage } from '@/components/local/EntityPages';

export const route = { path: '/responses/:id/edit', layout: 'owner', access: "profile === 'ServiceProvider_c' || profile === 'Admin_c' || profile === 'Customer_c'" };

export default function ResponsesEdit() {
  return <EntityFormPage entity="responses" edit />;
}