import type { TokenResponse } from './types';

const configuredApiBaseUrl = import.meta.env.VITE_AGATHA_API_BASE_URL;
const useLocalDevProxy = import.meta.env.DEV
  && (!configuredApiBaseUrl || /^https?:\/\/(localhost|127\.0\.0\.1):8080\/api\/v1\/?$/i.test(configuredApiBaseUrl));
const apiBaseUrl = (import.meta.env.PROD || useLocalDevProxy
  ? '/api/v1'
  : configuredApiBaseUrl || 'http://localhost:8080/api/v1')
  .replace(/\/+$/, '');
const ACCESS_TOKEN_KEY = 'agatha_access_token';
const REFRESH_TOKEN_KEY = 'agatha_refresh_token';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function saveTokens(tokens: TokenResponse): void {
  sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
  sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
}

export function clearTokens(): void {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function hasSession(): boolean {
  return sessionStorage.getItem(ACCESS_TOKEN_KEY) !== null;
}

export async function logoutSession(): Promise<void> {
  const refreshToken = sessionStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) {
    clearTokens();
    return;
  }
  try {
    const response = await fetch(`${apiBaseUrl}/auth/logout`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    await parseResponse<void>(response);
  } finally {
    clearTokens();
  }
}

async function renewSession(): Promise<boolean> {
  const refreshToken = sessionStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return false;

  const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) {
    clearTokens();
    return false;
  }
  saveTokens(await response.json() as TokenResponse);
  return true;
}

async function requestResponse(
  path: string,
  method: string,
  body: unknown,
  companyId?: string,
  retry = true,
  extraHeaders?: HeadersInit,
): Promise<Response> {
  const headers = new Headers(extraHeaders);
  headers.set('Accept', 'application/json');
  const token = sessionStorage.getItem(ACCESS_TOKEN_KEY);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (body !== undefined && !(body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (companyId) headers.set('X-Company-Id', companyId);

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  if (response.status === 401 && retry && token && await renewSession()) {
    return requestResponse(path, method, body, companyId, false, extraHeaders);
  }
  return response;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `O pedido falhou (${response.status}).`;
    const text = await response.text();
    if (text) {
      try {
        const body: unknown = JSON.parse(text);
        if (typeof body === 'object' && body !== null && 'message' in body
          && typeof body.message === 'string') {
          message = body.message;
        } else {
          message = text;
        }
      } catch {
        message = text;
      }
    }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function request<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    companyId?: string;
    headers?: HeadersInit;
  } = {},
): Promise<T> {
  const response = await requestResponse(
    path,
    options.method || 'GET',
    options.body,
    options.companyId,
    true,
    options.headers,
  );
  return parseResponse<T>(response);
}

export async function requestBlob(path: string, companyId: string): Promise<Blob> {
  const response = await requestResponse(path, 'GET', undefined, companyId);
  if (!response.ok) {
    await parseResponse<void>(response);
    throw new ApiError(`O pedido falhou (${response.status}).`, response.status);
  }
  return response.blob();
}

export async function upload<T>(path: string, file: File, companyId: string): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const response = await requestResponse(path, 'POST', form, companyId);
  return parseResponse<T>(response);
}

export function mediaUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (useLocalDevProxy) return path.startsWith('/') ? path : `/${path}`;
  const origin = apiBaseUrl.startsWith('http') ? new URL(apiBaseUrl).origin : '';
  return `${origin}${path.startsWith('/') ? '' : '/'}${path}`;
}
