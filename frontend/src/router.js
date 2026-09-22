// src/router.js

import { isAdmin } from './services/auth-store.js';

const routes = new Map();

let renderToken = 0;

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

async function renderCurrent() {
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

  document.getElementById('view-title').textContent = route.title;

  const root = document.getElementById('view-root');
  try {
    await route.render(root);
    if (currentToken !== renderToken) return;
  } catch (err) {
    if (currentToken !== renderToken) return;
    console.error(`Error renderizando "${name}":`, err);
    root.innerHTML =
      '<p class="view-error">No se pudo cargar esta sección.</p>';
  }
}

export function startRouter() {
  window.addEventListener('hashchange', renderCurrent);
  renderCurrent();
}
