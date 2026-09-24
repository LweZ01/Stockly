// src/router.js

import { isAdmin, isAuthenticated } from './services/auth-store.js';
import { ApiError } from './services/api.js';

const routes = new Map();

let renderToken = 0;
let currentCleanup = null;

export function registerRoute(name, { title, render, adminOnly = false }) {
  routes.set(name, { title, render, adminOnly });
}

export function navigate(name) {
  const target = routes.has(name) ? name : 'dashboard';
  window.location.hash = `#/${target}`;
}

function getRouteFromHash() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  return routes.has(raw) ? raw : 'dashboard';
}

function runCleanup() {
  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }
}

async function renderCurrent() {
  if (!isAuthenticated()) return;

  const currentToken = ++renderToken;

  const name = getRouteFromHash();
  const route = routes.get(name);

  if (route.adminOnly && !isAdmin()) {
    navigate('dashboard');
    return;
  }

  document.querySelectorAll('.nav-link').forEach((link) => {
    link.classList.toggle('active', link.dataset.route === name);
  });

  runCleanup();

  const root = document.getElementById('view-root');
  try {
    const cleanup = await route.render(root);
    if (currentToken !== renderToken) {
      if (typeof cleanup === 'function') cleanup();
      return;
    }
    if (typeof cleanup === 'function') currentCleanup = cleanup;
  } catch (err) {
    if (currentToken !== renderToken) return;

    // Sesión expirada: tryRefresh ya la limpió y emitió 'auth:expired',
    // y main.js se encarga de mostrar el login.
    // Si la sesión sigue viva (un 401 que sobrevive al refresh), es un
    // error real de la vista y tiene que mostrarse como cualquier otro.
    if (err instanceof ApiError && err.status === 401 && !isAuthenticated()) {
      return;
    }

    console.error(`Error renderizando "${name}":`, err);
    root.innerHTML =
      '<p class="view-error">No se pudo cargar esta sección.</p>';
  }
}

export function refreshCurrentRoute() {
  renderCurrent();
}

export function resetRouter() {
  renderToken++;
  runCleanup();
  const root = document.getElementById('view-root');
  if (root) root.innerHTML = '';
}

export function startRouter() {
  window.addEventListener('hashchange', renderCurrent);
  renderCurrent();
}
