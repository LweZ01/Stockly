import { getAccessToken, setAccessToken, clearSession } from './auth-store.js';

const BASE_URL = '';

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message ?? `Error ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

let refreshPromise = null;

export async function rawRequest(path, options = {}) {
  const { body, headers: extraHeaders, ...rest } = options;

  const headers = {};

  const token = getAccessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  if (body !== undefined) headers['Content-Type'] = 'application/json';

  Object.assign(headers, extraHeaders);

  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    credentials: 'include',
    headers,
    body,
  });

  const text = await res.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  return { res, body: parsed };
}

function tryRefresh() {
  if (!refreshPromise) {
    refreshPromise = rawRequest('/auth/refresh', { method: 'POST' })
      .then(({ res, body }) => {
        if (!res.ok) {
          throw new ApiError(res.status, body);
        }
        setAccessToken(body.accessToken);
        return body.accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function request(path, { method = 'GET', body, retry = true } = {}) {
  const serializedBody = body !== undefined ? JSON.stringify(body) : undefined;

  const { res, body: responseBody } = await rawRequest(path, {
    method,
    body: serializedBody,
  });

  const isAuthEndpoint = path === '/auth/refresh' || path === '/auth/login';

  if (res.status === 401 && retry && !isAuthEndpoint) {
    try {
      await tryRefresh();
    } catch {
      clearSession();
      throw new ApiError(401, { message: 'Sesión expirada' });
    }
    return request(path, { method, body, retry: false });
  }

  if (!res.ok) {
    throw new ApiError(res.status, responseBody);
  }

  return responseBody;
}

export const api = {
  get: (path) => request(path, { method: 'GET' }),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
};
