/*
// -- Apper adapter --
const adapter = window.ApperSDK.ApperAdapter({
  getClient: () => new window.ApperSDK.ApperClient({
    apperProjectId: import.meta.env.VITE_APPER_PROJECT_ID,
    apperPublicKey: import.meta.env.VITE_APPER_PUBLIC_KEY,
  }),
  ui: window.ApperSDK.ApperUI
});
*/
// ── Memory adapter (tests & prototyping) ──
import { mockData, mockMeta } from './mockData';
import { policies } from './policies';
const { eq } = window.ApperSDK.CoreSDK;
const adapter = window.ApperSDK.MemoryAdapter({
  apperProjectId: import.meta.env.VITE_APPER_PROJECT_ID,
  apperPublicKey: import.meta.env.VITE_APPER_PUBLIC_KEY,
  seed: mockData,
  meta: mockMeta,
  policies, team:{}
});
export const sdk = await window.ApperSDK.CoreSDK.createClient(adapter);

const DEMO_RESET_KEY = 'local_demo_transaction_reset_20261006_v2';
const DEMO_CATEGORY_RESET_KEY = 'local_demo_category_reset_20261007_v2';
const DEMO_PROVIDER_CAPABILITY_RESET_KEY = 'local_demo_provider_capability_reset_20261011_v2';
const AARAV_REQUEST_RESET_KEY = 'local_aarav_request_reset_20261012_v2';

async function clearPersistedDemoTransactions() {
  if (window.localStorage.getItem(DEMO_RESET_KEY) === 'done') return;

  // Do not clear transaction tables during app startup. Each browser/device has
  // its own demo storage, and clearing here can erase requests before Admin sees them.
  const tables = [];

  for (const table of tables) {
    const result = await sdk.table(table).select(['Id']).page(1, 1000).fetch();
    if (!result.success) throw new Error(result.message ?? 'Could not load demo records.');
    for (const row of result.data ?? []) {
      const removeResult = await sdk.table(table).remove({ Id: row.Id });
      if (!removeResult.data?.length && removeResult.messages?.length) {
        throw new Error(removeResult.messages[0]);
      }
    }
  }

  window.localStorage.setItem(DEMO_RESET_KEY, 'done');
}

async function clearPersistedDemoCategories() {
  if (window.localStorage.getItem(DEMO_CATEGORY_RESET_KEY) === 'done') return;

  try {
    const categoryResult = await sdk.table('service_categories_c').select(['Id', 'Name']).page(1, 1000).fetch();
    if (!categoryResult.success) throw new Error(categoryResult.message ?? 'Could not load demo service categories.');

    const keep = new Set(['Car Assistance', 'Bike Assistance']);
    const keepRows = (categoryResult.data ?? []).filter((row) => keep.has(String(row.Name ?? '').trim()));
    const carCategory = keepRows.find((row) => String(row.Name ?? '').trim() === 'Car Assistance');

    if (carCategory) {
      const providerResult = await sdk.table('technician_profiles_c').select(['Id', 'primary_service_c', 'secondary_service_c']).page(1, 1000).fetch();
      if (providerResult.success) {
        const keepIds = new Set(keepRows.map((row) => row.Id));
        for (const provider of providerResult.data ?? []) {
          const primary = provider.primary_service_c && typeof provider.primary_service_c === 'object' ? provider.primary_service_c.Id : provider.primary_service_c;
          const secondary = provider.secondary_service_c && typeof provider.secondary_service_c === 'object' ? provider.secondary_service_c.Id : provider.secondary_service_c;
          const updates = {};
          if (primary && !keepIds.has(primary)) updates.primary_service_c = carCategory.Id;
          if (secondary && !keepIds.has(secondary)) updates.secondary_service_c = null;
          if (Object.keys(updates).length) await sdk.table('technician_profiles_c').update({ Id: provider.Id, ...updates });
        }
      }
    }

    for (const row of categoryResult.data ?? []) {
      if (!keep.has(String(row.Name ?? '').trim())) {
        const removeResult = await sdk.table('service_categories_c').remove({ Id: row.Id });
        if (!removeResult.data?.length && removeResult.messages?.length) {
          throw new Error(removeResult.messages[0]);
        }
      }
    }
  } catch (error) {
    console.warn('Demo category cleanup skipped:', error);
  } finally {
    window.localStorage.setItem(DEMO_CATEGORY_RESET_KEY, 'done');
  }
}

async function ensureDemoProviderCapabilities() {
  if (window.localStorage.getItem(DEMO_PROVIDER_CAPABILITY_RESET_KEY) === 'done') return;

  try {
    const [providerRes, capabilityRes, allLinksRes] = await Promise.all([
      sdk.table('technician_profiles_c').select(['Id', 'Name', 'email_c']).page(1, 1000).fetch(),
      sdk.table('service_capabilities_c').select(['Id', 'Name']).page(1, 1000).fetch(),
      sdk.table('service_provider_capabilities_c').select(['Id', 'technician_c', 'capability_c', 'status_c']).page(1, 1000).fetch(),
    ]);
    const providers = providerRes.data ?? [];
    const capabilities = capabilityRes.data ?? [];
    const allLinks = allLinksRes.data ?? [];
    const carElectrical = capabilities.find((item) => item.Name === 'Car Auto Electrical');
    const carService = capabilities.find((item) => item.Name === 'Car Service');
    const demoMechanics = providers.filter((item) => ['raj@local.demo', 'amit@local.demo', 'suresh@local.demo', 'imran@local.demo'].includes(String(item.email_c ?? '').toLowerCase()));

    const hasActiveLink = (providerId, capabilityId) => allLinks.some((item) => {
      const linkedProvider = item.technician_c?.Id ?? item.technician_c_id ?? item.technician_c;
      const linkedCapability = item.capability_c?.Id ?? item.capability_c_id ?? item.capability_c;
      return String(linkedProvider ?? '') === String(providerId) && String(linkedCapability ?? '') === String(capabilityId) && item.status_c === 'Active';
    });

    const createLink = async (provider, capability) => {
      if (!provider || !capability || hasActiveLink(provider.Id, capability.Id)) return;
      const result = await sdk.table('service_provider_capabilities_c').create({
        Name: 'Provider capability',
        technician_c: provider.Id,
        capability_c: capability.Id,
        status_c: 'Active',
      });
      if (!result.success && !result.data?.length) throw new Error(result.messages?.[0] ?? 'Could not seed demo provider capability.');
      allLinks.push({ technician_c: provider.Id, capability_c: capability.Id, status_c: 'Active' });
    };

    // Keep Raj's existing electrical-assistance demo and enable Car Service for all four mechanics.
    await createLink(providers.find((item) => item.email_c === 'raj@local.demo'), carElectrical);
    for (const provider of demoMechanics) await createLink(provider, carService);
  } catch (error) {
    console.warn('Demo provider capability sync skipped:', error);
  } finally {
    window.localStorage.setItem(DEMO_PROVIDER_CAPABILITY_RESET_KEY, 'done');
  }
}

async function clearAaravDemoRequests() {
  if (window.localStorage.getItem(AARAV_REQUEST_RESET_KEY) === 'done') return;

  try {
    const [customersResult, requestsResult] = await Promise.all([
      sdk.table('customer_profiles_c').select(['Id', 'Name', 'email_c']).page(1, 1000).fetch(),
      sdk.table('service_requests_c').select(['Id', 'Name', 'customer_c']).page(1, 1000).fetch(),
    ]);
    if (!customersResult.success) throw new Error(customersResult.message ?? 'Could not load customer profiles.');
    if (!requestsResult.success) throw new Error(requestsResult.message ?? 'Could not load service requests.');

    const aarav = (customersResult.data ?? []).find((customer) => String(customer.email_c ?? '').trim().toLowerCase() === 'aarav@local.demo');
    if (!aarav) {
      window.localStorage.setItem(AARAV_REQUEST_RESET_KEY, 'done');
      return;
    }

    const requestIds = (requestsResult.data ?? []).filter((request) => {
      const customerLookup = request.customer_c;
      const customerId = customerLookup?.Id ?? request.customer_c_id ?? (typeof customerLookup === 'object' ? null : customerLookup);
      const linkedEmail = String(customerLookup?.email_c ?? customerLookup?.Email ?? '').trim().toLowerCase();
      const linkedName = String(customerLookup?.Name ?? customerLookup?.name ?? '').trim().toLowerCase();
      return String(customerId ?? '') === String(aarav.Id)
        || linkedEmail === 'aarav@local.demo'
        || linkedName === 'aarav sharma';
    }).map((request) => request.Id).filter(Boolean);

    if (requestIds.length) {
      const responsesResult = await sdk.table('technician_responses_c').select(['Id', 'request_c']).page(1, 1000).fetch();
      if (!responsesResult.success) throw new Error(responsesResult.message ?? 'Could not load provider offers.');
      for (const response of responsesResult.data ?? []) {
        const requestId = response.request_c?.Id ?? response.request_c_id ?? response.request_c;
        if (requestIds.includes(String(requestId))) {
          const removeResponse = await sdk.table('technician_responses_c').remove({ Id: response.Id });
          if (!removeResponse.success && !removeResponse.data?.length) throw new Error(removeResponse.messages?.[0] ?? 'Could not remove a linked provider offer.');
        }
      }
      for (const requestId of requestIds) {
        const removeRequest = await sdk.table('service_requests_c').remove({ Id: requestId });
        if (!removeRequest.success && !removeRequest.data?.length) throw new Error(removeRequest.messages?.[0] ?? 'Could not remove an Aarav service request.');
      }
    }
    window.localStorage.setItem(AARAV_REQUEST_RESET_KEY, 'done');
  } catch (error) {
    console.warn('Aarav demo request reset skipped:', error);
  }
}

await clearPersistedDemoTransactions();
await clearPersistedDemoCategories();
await ensureDemoProviderCapabilities();
await clearAaravDemoRequests();
