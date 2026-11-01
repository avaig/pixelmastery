import { sdk } from '@/services/sdk';

const { eq } = window.ApperSDK.CoreSDK;

/**
 * Resolve the current customer's profile by the authenticated Owner relation.
 * All customer-facing flows must use this function instead of scanning profiles by email.
 */
export async function getCustomerProfile(userId) {
  if (!userId) return null;

  let timeoutId;
  const lookup = sdk.table('customer_profiles_c')
    .select(['Id', 'Name', 'email_c', 'phone_c', 'location_c', 'notes_c', 'status_c', 'Owner'])
    .where(eq('Owner', userId))
    .page(1, 10)
    .fetch();

  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(
      () => reject(new Error('Customer profile lookup timed out. Please refresh and try again.')),
      10000,
    );
  });

  try {
    const result = await Promise.race([lookup, timeout]);
    if (!result?.success) {
      throw new Error(result?.message || 'Could not load your customer profile.');
    }

    const customer = (result.data ?? []).find(
      (item) => String(item.Owner?.Id ?? item.Owner ?? '') === String(userId),
    );

    if (!customer) {
      throw new Error('No customer profile is linked to this account. Please complete My Profile.');
    }

    return customer;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
