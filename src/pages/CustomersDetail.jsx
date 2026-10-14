import { EntityDetailPage } from '@/components/local/EntityPages';

export const route = { path: '/customers/:id', layout: 'owner', access: "profile === 'Admin_c'" };

export default function CustomersDetail() {
  return <EntityDetailPage entity="customers" />;
}