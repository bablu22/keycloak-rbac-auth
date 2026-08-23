import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

let csrfToken: string | null = null;
let csrfRefresh: Promise<string | null> | null = null;

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

export function getCsrfToken() {
  return csrfToken;
}

async function ensureCsrfToken(): Promise<string | null> {
  if (csrfToken) return csrfToken;
  if (!csrfRefresh) {
    csrfRefresh = axios
      .get<{ csrfToken?: string }>(`${API_URL}/auth/csrf`, {
        withCredentials: true,
      })
      .then((res) => {
        const token = res.data.csrfToken ?? null;
        csrfToken = token;
        return token;
      })
      .catch(() => null)
      .finally(() => {
        csrfRefresh = null;
      });
  }
  return csrfRefresh;
}

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

api.interceptors.request.use(async (config) => {
  const method = (config.method ?? 'get').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const token = await ensureCsrfToken();
    if (token) {
      config.headers['X-CSRF-Token'] = token;
    }
  }
  return config;
});

/** Cookie-session API client (credentials included). */
export function createApiClient() {
  return api;
}

export { API_URL };
