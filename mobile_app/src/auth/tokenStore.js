import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'local.auth.session-token';

export async function getToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function saveToken(token) {
  if (typeof token !== 'string' || !token.trim()) {
    throw new Error('A non-empty token is required.');
  }
  return SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken() {
  return SecureStore.deleteItemAsync(TOKEN_KEY);
}
