import * as Crypto from 'expo-crypto';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE?.trim().replace(/\/$/, '');

export async function createIdempotencyKey() {
  return Crypto.randomUUID();
}

export async function postAction(action, payload) {
  if (!API_BASE || API_BASE.includes('YOUR-APPER-EDGE-FUNCTION-URL')) {
    throw new Error('Booking service is not configured yet. Please contact Customer Care.');
  }
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(payload.idempotencyKey ? { 'Idempotency-Key': payload.idempotencyKey } : {}),
    },
    body: JSON.stringify({ action, ...payload }),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('The service returned an unreadable response. Please retry.');
  }
  if (response.status === 202 || result?.pending === true) {
    // Booking outcome is not confirmed yet. Callers must not show success and must not resubmit automatically.
    return {
      pending: true,
      message: result?.message || 'Your booking is being confirmed. Please do not submit it again. Customer Care will confirm it.',
    };
  }
  if (!response.ok || result?.success !== true) {
    throw new Error(result?.message || 'The request could not be completed.');
  }
  return result;
}
