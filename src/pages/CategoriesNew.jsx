import { EntityFormPage } from '@/components/local/EntityPages';

export const route = { path: '/categories/new', layout: 'owner', access: "profile === 'Admin_c'" };

export default function CategoriesNew() {
  return <EntityFormPage entity="service_categories" />;
}