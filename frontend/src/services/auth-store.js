let accessToken = null;
let currentUser = null;
let sessionVersion = 0;

export function setSession(token, user) {
  accessToken = token;
  currentUser = user;
  sessionVersion++;
}

export function clearSession() {
  accessToken = null;
  currentUser = null;
  sessionVersion++;
}

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token) {
  accessToken = token;
}

export function getUser() {
  return currentUser;
}

export function isAuthenticated() {
  return Boolean(accessToken && currentUser);
}

export function isAdmin() {
  return currentUser?.role === 'admin';
}

export function getSessionVersion() {
  return sessionVersion;
}
