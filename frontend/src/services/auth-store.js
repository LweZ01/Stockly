let accessToken = null;
let currentUser = null;

export function setSession(token, user) {
  accessToken = token;
  currentUser = user;
}

export function clearSession() {
  accessToken = null;
  currentUser = null;
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
