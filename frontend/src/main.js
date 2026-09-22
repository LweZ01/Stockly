// src/main.js

import './style.css';
import { silentRefresh, logout } from './services/auth.service.js';
import { initAuthView } from './views/auth.view.js';
import { registerRoute, navigate, startRouter } from './router.js';
import { initCategoriesView } from './views/categories.view.js';
import { initProductsView } from './views/products.view.js';
import { initInventoryView } from './views/inventory.view.js';

// ------------------------------------------------------------
// Referencias DOM
// ------------------------------------------------------------
const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');
const userName = document.getElementById('user-name');
const userRole = document.getElementById('user-role');
const logoutBtn = document.getElementById('logout-btn');

const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const topbarMenuBtn = document.getElementById('topbar-menu-btn');
const sidebarOverlay = document.getElementById('sidebar-overlay');

// ------------------------------------------------------------
// Placeholders temporales (Fases 5-10 los reemplazan)
// ------------------------------------------------------------
function placeholder(title) {
  return (root) => {
    root.innerHTML = `<p>Vista "${title}" — pendiente de implementar.</p>`;
  };
}

registerRoute('dashboard', {
  title: 'Dashboard',
  render: placeholder('Dashboard'),
});
registerRoute('products', {
  title: 'Productos',
  render: (root) => initProductsView(root),
});
registerRoute('categories', {
  title: 'Categorías',
  render: (root) => initCategoriesView(root),
});
registerRoute('inventory', {
  title: 'Inventario',
  render: (root) => initInventoryView(root),
  adminOnly: true,
});
registerRoute('users', {
  title: 'Usuarios',
  render: placeholder('Usuarios'),
  adminOnly: true,
});
registerRoute('profile', {
  title: 'Mi perfil',
  render: placeholder('Mi perfil'),
});

// ------------------------------------------------------------
// Pantallas
// ------------------------------------------------------------
function showAuthScreen() {
  appScreen.classList.add('hidden');
  authScreen.classList.remove('hidden');
}

let routerStarted = false;

function showAppScreen(user) {
  authScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');

  userName.textContent = user.name;
  userRole.textContent = user.role;

  if (!routerStarted) {
    startRouter();
    routerStarted = true;
  }
}

// ------------------------------------------------------------
// Toggle mobile de la sidebar
// ------------------------------------------------------------
function openSidebar() {
  sidebar.classList.add('sidebar--open');
  sidebarOverlay.classList.remove('hidden');
}

function closeSidebar() {
  sidebar.classList.remove('sidebar--open');
  sidebarOverlay.classList.add('hidden');
}

function toggleSidebar() {
  if (sidebar.classList.contains('sidebar--open')) {
    closeSidebar();
  } else {
    openSidebar();
  }
}

// ------------------------------------------------------------
// Wire estático (una sola vez, no depende de login/logout)
// ------------------------------------------------------------
initAuthView((user) => {
  showAppScreen(user);
});

document.querySelectorAll('.nav-link').forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    closeSidebar();
    navigate(link.dataset.route);
  });
});

logoutBtn.addEventListener('click', async () => {
  await logout();
  showAuthScreen();
});

sidebarToggle.addEventListener('click', toggleSidebar);
topbarMenuBtn.addEventListener('click', toggleSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);

// ------------------------------------------------------------
// Boot
// ------------------------------------------------------------
(async function boot() {
  try {
    const user = await silentRefresh();
    if (user) {
      showAppScreen(user);
    } else {
      showAuthScreen();
    }
  } catch {
    showAuthScreen();
  } finally {
    document.body.classList.remove('app-loading');
  }
})();
