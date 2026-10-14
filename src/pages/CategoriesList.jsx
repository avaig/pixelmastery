import { EntityListPage } from '@/components/local/EntityPages';

export const route = { path: '/categories', layout: 'owner', access: "profile === 'Admin_c'" };
export const nav = { to: '/categories', label: 'Service Categories', icon: 'Layers3', order: 2, profiles: ['Admin_c'], section: 'Marketplace' };

export default function CategoriesList() {
  return <EntityListPage entity="service_categories" />;
}