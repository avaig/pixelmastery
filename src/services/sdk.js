/**
 * sdk.js — the ONLY file in the app that touches an adapter.
 * Written by the platform at connect_database time. Do not edit.
 */
const adapter = window.ApperSDK.ApperAdapter({
  getClient: () => new window.ApperSDK.ApperClient({
    apperProjectId: import.meta.env.VITE_APPER_PROJECT_ID,
    apperPublicKey: import.meta.env.VITE_APPER_PUBLIC_KEY,
  }),
  ui: window.ApperSDK.ApperUI,
});

export const sdk = await window.ApperSDK.CoreSDK.createClient(adapter);

// Kept only for apps generated before 2026-09-28, whose AuthPage.jsx still imports it.
export const demoAccounts = [];
