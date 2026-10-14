import { EntityFormPage } from '@/components/local/EntityPages';

export const route = { path: '/jobs/new', layout: 'owner', access: "profile === 'Admin_c'" };

export default function JobsNew() {
  return <EntityFormPage entity="jobs" />;
}