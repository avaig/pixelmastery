import { createPermissions } from '@/services/permissions';

export const PROFILES = {
  Admin_c: {
    label: 'Admin',
    isDefault: false,
    isPublic: false,
    canManageTeam: true,
    reportsTo: null,
  },
  Customer_c: {
    label: 'Customer',
    isDefault: false,
    isPublic: true,
    canManageTeam: false,
    reportsTo: 'Admin_c',
  },
  ServiceProvider_c: {
    label: 'Service Provider',
    isDefault: true,
    isPublic: true,
    canManageTeam: false,
    reportsTo: 'Admin_c',
  },
};

export const TABLE_PERMISSIONS = {
  Admin_c: {
    service_categories_c: { access: 'Full' },
    customer_profiles_c: { access: 'Full' },
    technician_profiles_c: { access: 'Full' },
    service_requests_c: { access: 'Full' },
    technician_responses_c: { access: 'Full' },
    jobs_c: { access: 'Full' },
  },
  Customer_c: {
    service_categories_c: { access: 'Read' },
    customer_profiles_c: { access: 'Read,Update' },
    technician_profiles_c: { access: 'Read' },
    service_requests_c: { access: 'Full' },
    technician_responses_c: { access: 'Read,Create,Update' },
    jobs_c: { access: 'Read,Create,Update' },
  },
  ServiceProvider_c: {
    service_categories_c: { access: 'Read' },
    customer_profiles_c: { access: 'Read' },
    technician_profiles_c: { access: 'Read,Create,Update' },
    service_requests_c: { access: 'Read' },
    technician_responses_c: { access: 'Full' },
    jobs_c: { access: 'Read,Update' },
  },
};

export const { getProfileMeta, getTableAccess, getFieldAccess } = createPermissions(PROFILES, TABLE_PERMISSIONS);