import { EntityFormPage } from '@/components/local/EntityPages';

export const route = { path: '/jobs/:id/edit', layout: 'owner', access: "profile === 'ServiceProvider_c' || profile === 'Admin_c'" };

export default function JobsEdit() {
  return <EntityFormPage entity="jobs" edit />;
}