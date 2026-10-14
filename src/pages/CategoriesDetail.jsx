import { EntityDetailPage } from '@/components/local/EntityPages';

export const route = { path: '/categories/:id', layout: 'owner', access: "profile === 'Admin_c'" };

export default function CategoriesDetail() {
  return <EntityDetailPage entity="service_categories" />;
}