import { EntityFormPage } from '@/components/local/EntityPages';

export const route = { path: '/categories/:id/edit', layout: 'owner', access: "profile === 'Admin_c'" };

export default function CategoriesEdit() {
  return <EntityFormPage entity="service_categories" edit />;
}