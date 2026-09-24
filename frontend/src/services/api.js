import {
  getAccessToken,
  setAccessToken,
  clearSession,
  getSessionVersion,
} from './auth-store.js';

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
    const version = getSessionVersion();

    refreshPromise = rawRequest('/auth/refresh', { method: 'POST' })
      .then(({ res, body }) => {
        // Hubo logout/login mientras el refresh estaba en vuelo: descartar
        if (getSessionVersion() !== version) {
          throw new ApiError(401, { message: 'Sesión cambiada' });
        }
        if (!res.ok) {
          throw new ApiError(res.status, body);
        }
        setAccessToken(body.accessToken);
        return body.accessToken;
      })
      .catch((err) => {
        if (err instanceof ApiError && getSessionVersion() === version) {
          clearSession();
          window.dispatchEvent(new Event('auth:expired'));
        }
        throw err;
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
    // Si el refresh falla, el error se propaga tal cual:
    // - ApiError: tryRefresh ya limpió la sesión y emitió 'auth:expired'.
    // - Error de red (TypeError): la sesión NO se toca, porque una red
    //   caída no significa que la sesión haya muerto.
    await tryRefresh();
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
