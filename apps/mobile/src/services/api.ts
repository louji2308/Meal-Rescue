import axios from 'axios';

/**
 * Typed API client for the Meal Rescue backend.
 *
 * Base URL comes from EXPO_PUBLIC_API_BASE_URL. Note for local dev:
 * - iOS simulator: http://localhost:3000 works
 * - Android emulator: use http://10.0.2.2:3000 (host loopback alias)
 */
export const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000',
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});
