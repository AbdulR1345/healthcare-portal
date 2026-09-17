export const API_URL = import.meta.env.VITE_API_URL || '';

export function apiUrl(path) {
  const base = API_URL.replace(/\/$/, '');
  return `${base}${path}`;
}

export function socketUrl() {
  if (API_URL) return API_URL.replace(/\/$/, '');
  if (import.meta.env.DEV) return 'http://localhost:5000';
  return window.location.origin;
}
