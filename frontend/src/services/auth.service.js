import { rawRequest, api, ApiError } from './api.js';
import { setSession, setAccessToken, clearSession } from './auth-store.js';

export async function login(email, password) {
  const { res, body } = await rawRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    throw new ApiError(res.status, body);
  }

  setSession(body.accessToken, body.user);
  localStorage.setItem('lastLogin', new Date().toISOString());
  return body;
}

export async function register(name, email, password) {
  const { res, body } = await rawRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });

  if (!res.ok) {
    throw new ApiError(res.status, body);
  }

  return body;
}

export async function logout() {
  try {
    await rawRequest('/auth/logout', { method: 'POST' });
  } finally {
    clearSession();
  }
}

export async function silentRefresh() {
  const { res, body } = await rawRequest('/auth/refresh', { method: 'POST' });

  if (res.status === 401) return null;
  if (!res.ok) throw new ApiError(res.status, body);

  setAccessToken(body.accessToken);

  const user = await api.get('/auth/me');
  setSession(body.accessToken, user);
  localStorage.setItem('lastLogin', new Date().toISOString());
  return user;
}
